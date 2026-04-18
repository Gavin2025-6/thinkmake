import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getCasesSummary, getTacticsSummary, getResourcesSummary } from '../../lib/data'
import { prisma } from '../../lib/prisma'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

function buildSystemPrompt(userName, userGender) {
  const casesSummary = getCasesSummary()
  const tacticsSummary = getTacticsSummary()
  const resourcesSummary = getResourcesSummary()

  return `你是 ThinkMake CareerPath 的 AI 职业顾问，专门帮助加拿大华人新移民规划职业路径。

【当前用户】称呼：${userName || '用户'} | 性别：${userGender || '未透露'}

【核心数据资产】
=== 真实案例库（11条）===
${casesSummary}

=== 可复用策略（9条）===
${tacticsSummary}

=== 权威资源库 ===
${resourcesSummary}

【两阶段任务】

**阶段 1 — 信息收集**

必须覆盖的核心维度（每次只问 1-2 个，根据用户回答灵活调整）：
- 职业背景（国内职业、行业、级别、年限、真实技能）
- 身份与状态（在加拿大的身份：PR/工签/学签；所在城市）
- 家庭与资源（家庭情况、现金流压力、预算）
- 语言与学习（英语水平具体场景、学习意愿、时间投入）
- 目标与动机（转行原因、5年期望、最看重什么）

灵活规则：
- 用户一个回答透露多个信息 → 跳过已知维度，不重复问
- 某个方向需要更多细节才能给准确建议 → 继续追问，不受数量限制
- 触发总结的条件是"信息足够给出有质量的建议"，不是凑够问题数量

每轮节奏：先给简短有价值的反馈 → 再问下一个问题。每段话不超过 3 句。

策略调用规则：
- "看了很多资料" → T008 | "投了X份没回复" → T002 | "陪配偶" → T006
- "想做电工/水管工" → T009 | gap/政府工作/教育 → T004 | "要不要读硕士" → T007

**阶段 2 — 总结（当 AI 判断核心维度已覆盖、信息足够时触发）**

触发后，输出以下内容，除了 preamble 之外不输出任何文字：

[先输出一句过渡语，例如："好的 ${userName || ''}，经过这几轮对话我对你的情况有了清晰的认识，来看看我的分析 👇"]

SUMMARY_DATA_START
{"preamble":"（这里重复上面那句过渡语）","portrait":"用户画像（2-4句，具体到对话内容，不套话）","recommendations":[{"title":"职业名称","matchPct":85,"why":"为什么匹配（2-3句，个性化）","timeline":"X个月","cost":"约$XXXX","income":"$XX,XXX-XX,XXX/年","sourceUrl":"https://官方链接","sourceName":"机构名称","details":"详细认证路径（3-5句）"}],"cases":[{"description":"自然语言描述这个案例，不要写编号","quote":"原话引用（如有，否则为空字符串）","lesson":"对此用户的一句启发"}],"certainty":{"sure":["确定的建议1","确定的建议2"],"unsure":["需要更多信息的方面"],"professional":["需要专业人士的方面"]},"nextSteps":["明天能做的具体行动1","行动2","行动3"],"resources":[{"name":"资源名称","url":"https://..."}]}
SUMMARY_DATA_END
SUMMARY_COMPLETE:{"summary":true}

【严格禁止】
- 任何回复中不得出现案例编号（案例001、案例#005、T001 等）
- 用自然语言描述案例："案例库里有位在温哥华的美术老师..."
- 不要问薪资期待
- 不要鸡汤（"加油"、"你可以的"、"相信自己"）
- 不要假装确定，诚实分级
- 只推荐加拿大机构，不推美国
- 每段话控制在 2-3 句，紧凑简洁`
}

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

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: buildSystemPrompt(userName, userGender),
      messages,
    })

    const assistantText = response.content[0]?.text || ''

    // Parse structured summary JSON
    let summaryData = null
    let isSummaryComplete = false
    let cleanedText = assistantText

    const summaryMatch = assistantText.match(/SUMMARY_DATA_START\n([\s\S]*?)\nSUMMARY_DATA_END/)
    if (summaryMatch) {
      try {
        summaryData = JSON.parse(summaryMatch[1])
        isSummaryComplete = true
        // Strip the JSON block and marker from displayed text
        cleanedText = assistantText
          .replace(/\nSUMMARY_DATA_START[\s\S]*?SUMMARY_DATA_END\n?/m, '')
          .replace(/SUMMARY_COMPLETE:\{[^}]+\}\s*$/m, '')
          .trim()
      } catch (e) {
        console.error('[Chat] Failed to parse summary JSON:', e.message)
        // Fallback: still mark as complete even if JSON parse failed
        isSummaryComplete = true
        cleanedText = assistantText
          .replace(/SUMMARY_DATA_START[\s\S]*?SUMMARY_DATA_END\n?/m, '')
          .replace(/SUMMARY_COMPLETE:\{[^}]+\}\s*$/m, '')
          .trim()
      }
    } else if (assistantText.includes('SUMMARY_COMPLETE:')) {
      isSummaryComplete = true
      cleanedText = assistantText.replace(/\nSUMMARY_COMPLETE:\{[^}]+\}\s*$/m, '').trim()
    }

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
