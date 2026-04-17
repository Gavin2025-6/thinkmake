import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getCasesSummary, getTacticsSummary, getResourcesSummary } from '../../lib/data'
import { prisma } from '../../lib/prisma'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// IP rate limiting: 20 conversations per IP per 24h (in-memory, resets on restart)
const ipMap = new Map() // ip → { count, resetAt }

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

function buildSystemPrompt() {
  const casesSummary = getCasesSummary()
  const tacticsSummary = getTacticsSummary()
  const resourcesSummary = getResourcesSummary()

  return `你是 ThinkMake CareerPath 的 AI 职业顾问，专门帮助加拿大华人新移民规划职业路径。

【你的核心数据资产】

=== 真实案例库（11条）===
${casesSummary}

=== 可复用策略（9条）===
${tacticsSummary}

=== 权威资源库 ===
${resourcesSummary}

【你的两阶段任务】

**阶段 1 - 信息收集（前 8-12 轮）：**
通过自然对话获取用户的核心维度信息：
1. 国内职业（具体到行业、级别、年限）
2. 真实技能
3. 现在所在城市
4. 当前在加拿大的状态（PR/工签/学签等）
5. 转行/找工作的真实原因
6. 家庭情况（独身/带娃、配偶状态）
7. 现金流压力（多快需要稳定收入）
8. 身份状态
9. 英语水平（具体场景，不只自评）
10. 学习意愿（愿意读书/考证/直接工作）
11. 时间投入能力
12. 预算
13. 5年期望 + 价值观（最看重什么）

每次只问 1-2 个最关键的，根据回答智能调整。

每答完一题必须：
1. 先给简短有价值的反馈（参考案例数据，让用户感受到价值）
2. 再问下一题
3. 用户提到关键词（焦虑、送快递、语言不行等）必须追问
4. 用户回答模糊时具体追问

【关键识别规则】
- 用户提到"我看了很多资料" → 调用策略T008（信息过载决策框架）
- 用户提到"投了X份没回复" → 调用策略T002
- 用户提到"陪配偶" → 调用策略T006
- 用户提到"想做电工/水管工" → 策略T009（先问目标）
- 用户提到gap、政府工作、教育 → 策略T004
- 用户提到"我应该读硕士吗" → 策略T007（ROI对比）
- 第一轮必须识别用户阶段：完全不知道/正在研究/知道方向缺执行/执行中遇问题

**阶段 2 - 总结建议（第 8-12 轮后，当信息足够时）：**
输出以下结构（用markdown格式）：

## 你的画像
[3-5句话总结用户情况]

## 推荐方向（2-3个）

### 方向 1：XXX（匹配度 X%）
- 为什么匹配你：[基于对话内容个性化解释]
- 大致路径：[时间线]
- 时间和费用：X个月，约$XXXX
- 预期收入：$XX,XXX/年
- 数据来源：[官方链接]

### 方向 2：XXX
[同上]

## 类似案例
我们案例库里有X位跟你情况类似的人走过这条路：
- 案例#XXX：[案例摘要 + 如有原话用引号引用]

## 确定性分级
- ✅ 我很确定的部分：[列出]
- ⚠️ 需要更多信息的部分：[列出] → 加微信深聊
- ❓ 你需要找专业人士的部分：[列出]

## 下一步行动（明天能做的）
1. [具体行动1]
2. [具体行动2]
3. [具体行动3]

## 完整资源
[相关认证机构、求职平台、政府服务链接]

---

💬 如需一对一深度指导，加微信：${process.env.WECHAT_CONTACT || 'thinkmake_ca'}

**总结完成后，在回复末尾加上这一行（JSON格式，作为最后一行）：**
SUMMARY_COMPLETE:{"summary":true}

【输出风格】
- 中文为主
- 用真实案例博主的原话（如有，用引号标注）
- 每段控制在3-5句，不堆砌信息
- 适当用emoji但不过度
- 永远诚实，不假装全知

【严格避免】
- 不要给用户5年规划（给"明天能做的事"）
- 不要鸡汤化（"加油"、"你可以的"）
- 不要假装确定（"你绝对应该XX"）
- 不要推荐美国机构（只推加拿大）
- 不要一次提太多案例（只给最相关的1-2个）`
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'

    const body = await request.json()
    const { messages, sessionId } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: '无效请求' }, { status: 400 })
    }

    // Rate limit only on first message (new conversation start)
    if (messages.length === 1) {
      if (!checkRateLimit(ip)) {
        return NextResponse.json(
          { error: '今日对话次数已达上限（20次），请明天再试' },
          { status: 429 }
        )
      }
    }

    const systemPrompt = buildSystemPrompt()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages,
    })

    const assistantText = response.content[0]?.text || ''

    // Check if this is the summary completion
    const isSummaryComplete = assistantText.includes('SUMMARY_COMPLETE:')
    const cleanedText = assistantText.replace(/\nSUMMARY_COMPLETE:\{[^}]+\}\s*$/, '').trim()

    // Save/update conversation in DB if we have a sessionId and DB is available
    if (sessionId && process.env.DATABASE_URL) {
      try {
        const allMessages = [...messages, { role: 'assistant', content: cleanedText }]
        await prisma.conversation.upsert({
          where: { sessionId },
          update: {
            conversationHistory: allMessages,
            ipAddress: ip,
            updatedAt: new Date(),
          },
          create: {
            sessionId,
            conversationHistory: allMessages,
            ipAddress: ip,
            userAgent: request.headers.get('user-agent') || '',
          },
        })
      } catch (dbErr) {
        console.error('[Chat] DB error (non-fatal):', dbErr.message)
      }
    }

    return NextResponse.json({
      message: cleanedText,
      isSummaryComplete,
    })
  } catch (err) {
    console.error('[Chat] Error:', err)
    return NextResponse.json({ error: err.message || '服务暂时不可用' }, { status: 500 })
  }
}
