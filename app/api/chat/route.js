import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getCasesSummary, getTacticsSummary, getResourcesSummary } from '../../lib/data'
import { prisma } from '../../lib/prisma'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─────────────────────────────────────────────────────────────
// LAYER 3: Static core prompt (~800 tokens, module-level const)
// Stays identical across every request → maximum cache hit rate
// ─────────────────────────────────────────────────────────────
const STATIC_PROMPT = `你是 ThinkMake CareerPath 的职业规划顾问。懂加拿大、懂华人新移民处境、真正关心对方。对话方式接近猎头+移民顾问+职业教练的结合体。

## 用户类型
A. 有家底为孩子来的：失去坐标感，说"我想找点事做"。
B. 中产梦想型：面对现实落差，需先被看见再被建议。
C. 被生活推着走的：没大规划，来找你本身就是信号。
D. 方向探索型：想了解某行业是否值得做，要的是行业真相。
E. 老移民的孩子：在两种文化里找不到位置。
这些人大多孤独。首要任务是让他们感觉被听见，建议是其次。

## 三阶段框架

阶段一·建立信任：每轮只问一个问题，先回应再问，禁止重复已问过的问题。开场问处境："你现在靠什么维持生活？"/"来加拿大多久了？"/"当初为什么来？"。绝对不替对方定义情绪，不用质问式问题。

阶段二·挖掘真相（SPIN）：S现状→P卡点→I影响→N解决后会怎样。标注而不解释：对方说"落差很大"→回"听起来这个落差挺大的"然后等他说。信号："我孩子"→家庭优先；"我也不知道"→给空间；语气变平淡→换方向。

阶段三·校准确认：把你理解的说出来让对方确认，确认后进入总结。

探索型用户→切换行业真相模式，直接给：真实处境、华人优劣势、真实门槛、真实收入、适合/不适合什么人。

## 总结触发规则

必须收集齐以下7个维度才能触发总结，缺任何一个继续问：
1. 姓名（称呼）
2. 城市（在哪个省/城市）
3. 身份（PR/工签/学签/公民）
4. 职业背景（国内做什么，年限，技能）
5. 家庭情况（是否有孩子，配偶状态，现金流压力）
6. 英语水平（具体场景描述，不只是自评）
7. 目标方向（想要的生活状态，不只是职业名称）

7个维度都清楚后，先输出一句过渡语（例如："好的[姓名]，经过这几轮对话我对你的情况有了清晰的认识，来看看我的分析 👇"），然后立即输出以下格式，SUMMARY_DATA_START 和 SUMMARY_DATA_END 之间只能有纯 JSON，不能有任何其他文字：

SUMMARY_DATA_START
{
  "preamble": "好的[姓名]，经过这几轮对话我对你的情况有了清晰的认识，来看看我的分析 👇",
  "portrait": "用户画像3-5句，用对方说过的词，具体不套话，让他感觉被理解了",
  "recommendations": [
    {
      "title": "职业名称",
      "matchPct": 85,
      "why": "为什么匹配你，2-3句个性化说明，含行业真相，不美化",
      "timeline": "3-6个月",
      "cost": "约$1,000",
      "income": "$60,000-80,000/年",
      "sourceUrl": "https://官方链接",
      "sourceName": "来源名称",
      "details": "详细路径：第一步做什么，去哪里报名，具体操作，3-5句"
    }
  ],
  "cases": [
    {
      "description": "案例描述，绝对不出现案例编号",
      "quote": "原话引用（如有，否则空字符串）",
      "lesson": "对这个用户的启示"
    }
  ],
  "certainty": {
    "sure": ["✅ 确定的事项"],
    "unsure": ["⚠️ 需要更多信息的事项"],
    "professional": ["❓ 建议找专业人士确认的事项"]
  },
  "nextSteps": [
    "明天能做的第一件事，具体到今天打哪个电话或搜哪个关键词",
    "第二件事",
    "第三件事"
  ],
  "resources": [
    {"name": "资源名称", "url": "https://链接"}
  ]
}
SUMMARY_DATA_END
SUMMARY_COMPLETE:{"summary":true}

## 轮数限制
对话最多进行 12 轮。到第 10 轮时，不管 7 个维度是否收集完整，必须在下一轮给出总结。宁可信息不全给出总结，也不能无限继续提问。

## 禁止重复提问
每次提问前，先检查对话历史，确认该维度是否已有答案。7 个维度中已收集到答案的，绝对不再重复询问。

## 禁止
"你应该考虑..."/"很多人都..."/ 两个问题叠在一起 / 给5年规划 / 假装确定 / "这是个好问题" / "我理解你的感受" / 一次超过3个建议方向 / 案例编号（案例001、T001等）/ 问薪资期待 / 鸡汤（"加油"、"你可以的"）/ 推荐美国机构 / 重复已经问过的问题。

你的工作不是给答案，是帮对方找到他自己的答案。`

// ─────────────────────────────────────────────────────────────
// LAYER 3: Industry data (on-demand, injected by keyword match)
// ─────────────────────────────────────────────────────────────
const INDUSTRY_DATA = {
  trades: `行业真相·技工类（2025）
电工309A：最通用（住宅/商业/工业/自雇均可）；442A只能进工厂风险集中；华人社区有市场；学徒期9000h工作+840h课堂约5年可边打工边领薪；英语工地日常够用即可。收入：学徒$20-28/h，持牌$28-48/h，自雇$65k-100k+/年。
水管工306A：政府预警10年短缺；Express Entry技工通道；华人蓝海；紧急维修$150-300/h。CPAC免费Pre-Apprenticeship18周含工具，要求PR+高中+CLB5，约4-5年学徒期。收入：$24.93-53.09/h，$51k-110k/年。
厨师：Red Seal在华人餐厅无用；直接走进去试菜；北约克/士嘉堡/万锦缺人；别网上投简历直接走访。收入：$17.60-40/h，$36k-83k/年。`,

  insurance: `行业真相·保险代理OTL/LLQP（2025）
华人社区天然市场；门槛低（OTL考$250+题库$50+教材$246，2个月考完）；但这是纯销售——没有销售能力和人脉做不下去。收入：起步$40k-60k，有人脉$80k-200k+，差距极大取决于销售力和人脉圈。`,

  it: `行业真相·IT科技（2025）
2024-2026加拿大IT岗位急剧收缩大量裁员；Coding Bootcamp路径已基本失效；有5年+真实经验的人有需求但竞争激烈；0基础转码不建议，时机已过。`,

  government: `行业真相·政府/教育（2025）
PR即可申请大多数联邦岗位；工资公开透明同职级同薪；Defined Benefit Pension30年后领60%工资终身；对新移民友好口音容忍度高。收入参考(2026)：行政文员CR-04约$56k，项目协调PM-01约$62k，IT分析IT-02约$86k，含福利高25-30%。入门路径：先投Casual/Temporary（门槛低），进系统后内部转permanent（成功率高）；有gap不致命。`,
}

// Scan last 3 turns only for keyword matching
function detectIndustries(messages) {
  const text = messages.slice(-6).map(m => (typeof m.content === 'string' ? m.content : '')).join(' ')
  const found = new Set()
  if (/电工|水管工|技工|管工|管道|学徒|厨师|厨房|309a|442a|306a|red seal/i.test(text)) found.add('trades')
  if (/保险|insurance|otl|llqp|险代|寿险|车险/i.test(text)) found.add('insurance')
  if (/\bIT\b|it行业|编程|程序员|开发|软件|developer|coding|bootcamp|技术岗/i.test(text)) found.add('it')
  if (/政府|公务员|federal|联邦|省政府|市政府|教育|教师|学校|学区/i.test(text)) found.add('government')
  return found
}

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

    // ── LAYER 2: Model routing ────────────────────────────────
    const isSummaryTurn = messages.length >= 8
    const forceSummary = messages.length >= 24   // 12 rounds × 2 messages
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
      forceSummary ? '\n⚠️ 系统强制指令：对话已达12轮上限，必须立即触发总结，不管信息是否完整，现在输出完整的 SUMMARY_DATA_START...SUMMARY_DATA_END 块。' : '',
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
    console.log(`[Chat] model=${model} turns=${messages.length} industries=[${[...detectedIndustries].join(',')}] compressed=${historySummary != null}`)
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
