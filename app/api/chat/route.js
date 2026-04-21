import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getCasesSummary, getTacticsSummary, getResourcesSummary } from '../../lib/data'
import { prisma } from '../../lib/prisma'
import { INDUSTRY_DATA, detectIndustries } from '../../lib/industry-data'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─────────────────────────────────────────────────────────────
// Static core prompt — identical every request → max cache hit rate
// Target: ~400 tokens. Industry data injected separately on demand.
// ─────────────────────────────────────────────────────────────
const STATIC_PROMPT = `你是 ThinkMake 职业规划助手，帮助加拿大华人找到职业方向。
你的对话方式是：先共情，再收集信息，最后给判断。

对话规则：
- 每轮只问一个问题
- 先用一句话回应用户说的，再问下一个问题
- 不主动给出收入、费用、时间线等数据
- 禁止重复已问过的问题
- 收集够7个维度后触发总结：姓名、城市、身份、职业背景、家庭、英语、目标

触发总结后输出（SUMMARY_DATA_START 和 SUMMARY_DATA_END 之间只能有纯 JSON）：

SUMMARY_DATA_START
{
  "preamble": "好的[姓名]，来看看我的分析 👇",
  "portrait": "用户画像3-5句，具体不套话",
  "recommendations": [{"title":"职业名称","matchPct":85,"why":"匹配原因2-3句不美化","timeline":"3-6个月","cost":"约$1,000","income":"$60k-80k/年","sourceUrl":"https://链接","sourceName":"来源","details":"具体步骤3-5句"}],
  "cases": [{"description":"案例描述","quote":"原话或空字符串","lesson":"对该用户的启示"}],
  "certainty": {"sure":["✅确定事项"],"unsure":["⚠️需更多信息"],"professional":["❓建议专业确认"]},
  "nextSteps": ["第一件具体的事","第二件","第三件"],
  "resources": [{"name":"资源名","url":"https://链接"}]
}
SUMMARY_DATA_END
SUMMARY_COMPLETE:{"summary":true}

禁止：
- 禁止问"你为什么选这个"类动机问题
- 禁止超过12轮不触发总结
- 禁止在对话阶段给具体数字`

// ─────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────
const ipMap = new Map()
function checkRateLimit(ip) {
  const now = Date.now()
  const entry = ipMap.get(ip)
  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 })
    return true
  }
  if (entry.count >= 20) return false
  entry.count++
  return true
}

// ─────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || 'unknown'

    const body = await request.json()
    const { messages, sessionId, userName, userGender } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: '无效请求' }, { status: 400 })
    }
    if (messages.length === 1 && !checkRateLimit(ip)) {
      return NextResponse.json({ error: '今日对话次数已达上限（20次），请明天再试' }, { status: 429 })
    }

    // ── LAYER 2: Model routing + turn counting ────────────────
    const userTurns = messages.filter(m => m.role === 'user').length
    const isSummaryTurn = userTurns >= 8
    const model = 'claude-sonnet-4-6'
    const maxTokens = isSummaryTurn ? 4000 : 1200

    // ── Build dynamic context ─────────────────────────────────
    const detectedIndustries = detectIndustries(messages)
    const industryBlocks = [...detectedIndustries].map(k => INDUSTRY_DATA[k]).join('\n\n')

    // Include full data asset only on summary turns (quality matters more there)
    const dataContext = isSummaryTurn
      ? `\n## 案例库\n${getCasesSummary()}\n## 策略库\n${getTacticsSummary()}\n## 资源库\n${getResourcesSummary()}`
      : ''

    const dynamicParts = [
      `用户：${userName || '用户'} | 性别：${userGender || '未透露'}`,
      industryBlocks ? `\n${industryBlocks}` : '',
      dataContext,
      userTurns >= 12
        ? '\n\n【最终强制指令】对话已达12轮上限。立即停止提问，必须现在输出完整的 SUMMARY_DATA_START...SUMMARY_DATA_END 总结块，这是最后一轮。'
        : userTurns >= 10
          ? '\n\n【强制指令】你已经问了超过10轮问题。不能再问任何新问题，必须立即输出 SUMMARY_DATA_START 格式的总结，信息不全也要输出。'
          : '',
    ].filter(Boolean).join('\n')

    // ── LAYER 1: Prompt caching ───────────────────────────────
    // Static prompt cached for 1h; dynamic context appended uncached
    const systemBlocks = [
      { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
      ...(dynamicParts ? [{ type: 'text', text: dynamicParts }] : []),
    ]

    const response = await anthropic.beta.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages,
      betas: ['extended-cache-ttl-2025-04-11'],
    })

    const assistantText = response.content[0]?.text || ''
    console.log(`[Chat] model=${model} turns=${userTurns} industries=[${[...detectedIndustries].join(',')}]`)
    console.log('Cache read:', response.usage?.cache_read_input_tokens || 0)
    console.log('Cache write:', response.usage?.cache_creation_input_tokens || 0)
    console.log('Total input:', response.usage?.input_tokens || 0)
    console.log('[Chat] SUMMARY_START found:', assistantText.includes('SUMMARY_DATA_START'))
    if (assistantText.includes('SUMMARY_DATA_START')) {
      console.log('[Chat] AI raw summary block:', assistantText.slice(0, 500))
    }

    // ── Parse summary JSON ────────────────────────────────────
    let summaryData = null
    let isSummaryComplete = false
    let cleanedText = assistantText

    const summaryMatch = assistantText.match(/SUMMARY_DATA_START\s*([\s\S]*?)\s*SUMMARY_DATA_END/)
    if (summaryMatch) {
      try {
        summaryData = JSON.parse(summaryMatch[1])
        isSummaryComplete = true
        cleanedText = assistantText
          .replace(/\s*SUMMARY_DATA_START[\s\S]*?SUMMARY_DATA_END\s*/g, '\n')
          .replace(/SUMMARY_COMPLETE:\{[^}]+\}\s*$/m, '')
          .trim()
      } catch (e) {
        console.error('[Chat] JSON parse failed:', e.message)
        console.error('[Chat] Raw block:', summaryMatch[1].slice(0, 400))
        isSummaryComplete = true
        cleanedText = assistantText
          .replace(/\s*SUMMARY_DATA_START[\s\S]*?SUMMARY_DATA_END\s*/g, '\n')
          .replace(/SUMMARY_COMPLETE:\{[^}]+\}\s*$/m, '')
          .trim()
      }
    } else if (assistantText.includes('SUMMARY_COMPLETE:')) {
      isSummaryComplete = true
      cleanedText = assistantText.replace(/\s*SUMMARY_COMPLETE:\{[^}]+\}\s*$/m, '').trim()
    }

    // ── Persist to DB ─────────────────────────────────────────
    if (sessionId && process.env.DATABASE_URL) {
      try {
        const allMessages = [...messages, { role: 'assistant', content: assistantText }]
        await prisma.conversation.upsert({
          where: { sessionId },
          update: { conversationHistory: allMessages, ipAddress: ip, updatedAt: new Date() },
          create: { sessionId, conversationHistory: allMessages, ipAddress: ip, userAgent: request.headers.get('user-agent') || '' },
        })
      } catch (dbErr) {
        console.error('[Chat] DB error (non-fatal):', dbErr.message)
      }
    }

    return NextResponse.json({ message: cleanedText, summaryData, isSummaryComplete })
  } catch (err) {
    console.error('[Chat] Error:', err)
    return NextResponse.json({ error: err.message || '服务暂时不可用' }, { status: 500 })
  }
}
