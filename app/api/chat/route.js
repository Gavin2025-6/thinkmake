import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getCasesSummary, getTacticsSummary, getResourcesSummary } from '../../lib/data'
import { prisma } from '../../lib/prisma'
import { INDUSTRY_DATA, detectIndustries } from '../../lib/industry-data'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─────────────────────────────────────────────────────────────
// Static core prompt — cached per request, stays identical → max cache hits
// ─────────────────────────────────────────────────────────────
const STATIC_PROMPT = `你是 ThinkMake CareerPath 的职业规划顾问。懂加拿大、懂华人新移民处境、真正关心对方。用户大多孤独，首要任务是让他们感觉被听见，建议是其次。

## 三阶段框架
阶段一·信任：每轮只问一个问题，先回应再问。开场问处境（"靠什么维持生活"/"来多久了"/"当初为什么来"）。不替对方定义情绪，不用质问式问题。
阶段二·挖掘SPIN：现状→卡点→影响→解决后。标注不解释："落差大"→回"这个落差挺大的"然后等。信号："我孩子"→家庭优先；"我也不知道"→给空间。
阶段三·校准：把理解说出来让对方确认，确认后进入总结。
探索型用户→切换行业真相模式，直接给：真实处境、华人优劣势、门槛、收入、适合谁。

## 总结触发
必须收集7个维度才触发总结，缺任何一个继续问：
1. 姓名 2. 城市 3. 身份（PR/工签/学签/公民）4. 职业背景 5. 家庭情况 6. 英语水平 7. 目标方向
最多12轮。第10轮后不管维度是否齐全，必须立即输出总结。

7个维度齐全后，先输出过渡语，然后输出（SUMMARY_DATA_START 和 SUMMARY_DATA_END 之间只能有纯 JSON）：

SUMMARY_DATA_START
{
  "preamble": "好的[姓名]，经过这几轮对话我对你的情况有了清晰的认识，来看看我的分析 👇",
  "portrait": "用户画像3-5句，用对方说过的词，具体不套话",
  "recommendations": [{"title":"职业名称","matchPct":85,"why":"匹配原因2-3句，含行业真相不美化","timeline":"3-6个月","cost":"约$1,000","income":"$60k-80k/年","sourceUrl":"https://官方链接","sourceName":"来源名称","details":"具体步骤：第一步做什么，去哪报名，3-5句"}],
  "cases": [{"description":"案例描述，不出现案例编号","quote":"原话或空字符串","lesson":"对该用户的启示"}],
  "certainty": {"sure":["✅确定事项"],"unsure":["⚠️需更多信息"],"professional":["❓建议专业确认"]},
  "nextSteps": ["明天能做的第一件事，具体到打哪个电话或搜哪个词","第二件","第三件"],
  "resources": [{"name":"资源名称","url":"https://链接"}]
}
SUMMARY_DATA_END
SUMMARY_COMPLETE:{"summary":true}

## 禁止
对话中禁止给出具体收入/费用/时间线数字——只在总结卡片里给。被问时回："这个在后面分析里给你，要结合你的情况说。"
禁止重复问已收集的维度。禁止追问动机感受（"为什么选"/"怎么想"/"有什么感受"）。
禁止：两问叠一次 / "应该考虑" / "很多人都" / 鸡汤（"加油""你可以的"）/ 案例编号 / 推荐美国机构 / 5年规划 / "这是个好问题"。
你的工作不是给答案，是帮对方找到他自己的答案。`

// ─────────────────────────────────────────────────────────────
// LAYER 4: History compression (Haiku, ~150-token output)
// Fires when messages.length > 6; compresses oldest turns
// ─────────────────────────────────────────────────────────────
async function compressHistory(messages) {
  const toCompress = messages.slice(0, messages.length - 3)
  const recent = messages.slice(messages.length - 3)
  const dialogue = toCompress.map(m => `${m.role === 'user' ? 'U' : 'A'}: ${String(m.content).slice(0, 300)}`).join('\n')

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 250,
      system: '从对话提炼用户信息，只输出紧凑JSON，字段：姓名、城市、身份、职业背景、家庭、英语、当前状态、目标。',
      messages: [{ role: 'user', content: dialogue }],
    })
    return { summary: res.content[0]?.text || '', trimmed: recent }
  } catch {
    return { summary: null, trimmed: recent }
  }
}

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

    // ── LAYER 4: History compression ─────────────────────────
    let workingMessages = messages
    let historySummary = null
    if (messages.length > 6) {
      const { summary, trimmed } = await compressHistory(messages)
      workingMessages = trimmed
      historySummary = summary
    }

    // ── LAYER 3: Build dynamic context ───────────────────────
    const detectedIndustries = detectIndustries(messages)
    const industryBlocks = [...detectedIndustries].map(k => INDUSTRY_DATA[k]).join('\n\n')

    // Include full data asset only on summary turns (quality matters more there)
    const dataContext = isSummaryTurn
      ? `\n## 案例库\n${getCasesSummary()}\n## 策略库\n${getTacticsSummary()}\n## 资源库\n${getResourcesSummary()}`
      : ''

    const dynamicParts = [
      `用户：${userName || '用户'} | 性别：${userGender || '未透露'}`,
      historySummary ? `\n前期对话摘要：${historySummary}` : '',
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
      messages: workingMessages,
      betas: ['extended-cache-ttl-2025-04-11'],
    })

    const assistantText = response.content[0]?.text || ''
    const u = response.usage
    console.log(`[Chat] model=${model} msgs=${messages.length} userTurns=${userTurns} industries=[${[...detectedIndustries].join(',')}] compressed=${historySummary != null}`)
    console.log(`[Chat] Cache usage: ${u.cache_read_input_tokens ?? 0} cached, ${u.cache_creation_input_tokens ?? 0} created, ${u.input_tokens} input, ${u.output_tokens} output`)
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
