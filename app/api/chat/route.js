import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getCasesSummary, getResourcesSummary } from '../../lib/data'
import { prisma } from '../../lib/prisma'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─────────────────────────────────────────────────────────────────────
// LAYER 1: Conversation prompt — ~500 tokens, module-level const
// Cached with extended-TTL; never changes between requests
// ─────────────────────────────────────────────────────────────────────
const CORE_PROMPT = `你是 ThinkMake 职业规划助手，帮助加拿大华人找到职业方向。懂移民处境，不走套路，真正关心对方。

## 对话规则
- 每次只问一个问题，先回应（1-2句让对方感觉被听见）再问
- 禁止问动机类问题（"你为什么..."/"你怎么想..."/"你什么感受..."）
- 禁止重复已在画像里有值的字段
- 禁止主动说出收入/费用/时间线/行业统计数字——如被问到回答："这个在后面的分析里会具体给你，要结合你的情况来说"
- 对话阶段唯一任务：了解这个人。不是教育，不是展示知识

## 用户类型（识别后调整语气）
A. 有家底为孩子来的：说"我想找点事做"→ 失去坐标感
B. 中产梦想型：面对落差 → 先被看见再被建议
C. 被生活推着走的：没大规划 → 来找你本身就是信号
D. 方向探索型：想了解某行业真相

## 必须收集的 7 个字段
1. 姓名（称呼）
2. 城市（省/市）
3. 身份（PR/工签/学签/公民）
4. 职业背景（国内做什么、年限、技能）
5. 家庭情况（孩子/配偶/现金流压力）
6. 英语水平（具体场景，不只是自评）
7. 目标方向（想要的生活状态）

## 每轮回复格式（严格执行）
第一部分：回应用户说的话，然后问下一个还没收集到的字段（自然对话，不超过3句）
最后一行（用户看不见）：PROFILE_UPDATE:{"姓名":"","城市":"","身份":"","职业背景":"","家庭":"","英语":"","目标":""}

填写规则：保留上一轮已有的值，只更新新收集到的字段，空字段保持空字符串。

## 总结触发
当所有 7 个字段都不为空时：
输出过渡语："好的 [姓名]，我已经对你的情况有了清晰的了解，来看看我的分析 👇"
最后一行：READY_TO_SUMMARIZE`

// ─────────────────────────────────────────────────────────────────────
// LAYER 3: Summary prompt — ~400 tokens, cached separately
// ─────────────────────────────────────────────────────────────────────
const SUMMARY_PROMPT = `你是加拿大华人职业规划报告生成器。根据用户画像生成完整报告。

## 要求
- 2-3 个推荐方向，必须符合用户的身份/城市/英语/家庭情况
- 数据真实（加拿大 2025 年）：收入范围、时间线、费用来自实际情况
- 不美化，含行业真相，让对方感觉被理解了
- 案例描述用用户自己说过的词

## 输出格式
先输出一句过渡语，然后立即输出 JSON 块。
SUMMARY_DATA_START 和 SUMMARY_DATA_END 之间只能有纯 JSON，不含任何其他文字：

SUMMARY_DATA_START
{
  "preamble": "好的[姓名]，经过这几轮对话我对你的情况有了清晰的认识，来看看我的分析 👇",
  "portrait": "用户画像3-5句，用对方说过的词，具体不套话",
  "recommendations": [
    {
      "title": "职业名称",
      "matchPct": 85,
      "why": "为什么匹配，2-3句个性化，含行业真相，不美化",
      "timeline": "3-6个月",
      "cost": "约$1,000",
      "income": "$60,000-80,000/年",
      "sourceUrl": "https://官方链接",
      "sourceName": "来源名称",
      "details": "详细路径：第一步做什么，去哪里报名，具体操作，3-5句"
    }
  ],
  "cases": [{"description": "案例描述", "quote": "", "lesson": "对这个用户的启示"}],
  "certainty": {
    "sure": ["✅ 确定事项"],
    "unsure": ["⚠️ 需要更多信息"],
    "professional": ["❓ 建议找专业人士确认"]
  },
  "nextSteps": ["明天能做的第一件事，具体到打哪个电话或搜哪个关键词", "第二件事", "第三件事"],
  "resources": [{"name": "资源名称", "url": "https://链接"}]
}
SUMMARY_DATA_END`

// ─────────────────────────────────────────────────────────────────────
// Industry data — injected into summary call only (based on profile)
// ─────────────────────────────────────────────────────────────────────
const INDUSTRY_DATA = {
  trades: `技工类（2025）：电工309A最通用（住宅/商业/工业/自雇），学徒$20-28/h，持牌$28-48/h，自雇$65k-100k+，约5年学徒期；水管工306A政府预警10年短缺，$51k-110k/年，CPAC免费18周Pre-Apprenticeship（PR+高中+CLB5）；厨师Red Seal华人餐厅无用，直接走访北约克/士嘉堡，$36k-83k/年。`,
  insurance: `保险代理OTL/LLQP（2025）：华人社区天然市场，门槛低（OTL考$250+题库$50，2个月考完），纯销售——没有人脉做不下去。收入$40k-200k+差距极大，取决于销售力和人脉圈。`,
  it: `IT科技（2025）：2024-2026岗位大幅收缩，Bootcamp路径失效，0基础转码不建议。有5年+真实经验者有需求但竞争激烈。`,
  government: `政府/教育（2025）：PR可申请，工资公开透明，DB Pension。CR-04约$56k，PM-01约$62k，IT-02约$86k。入门：先投Casual/Temporary再内转Permanent（成功率高）。`,
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function emptyProfile() {
  return { 姓名: '', 城市: '', 身份: '', 职业背景: '', 家庭: '', 英语: '', 目标: '' }
}

function isProfileComplete(p) {
  return p && Object.values(p).every(v => typeof v === 'string' && v.trim() !== '')
}

function detectIndustriesFromText(text) {
  const t = (text || '').toLowerCase()
  const found = new Set()
  if (/电工|水管工|技工|管工|管道|学徒|厨师|厨房|309a|442a|306a|red seal/.test(t)) found.add('trades')
  if (/保险|insurance|otl|llqp|险代|寿险|车险/.test(t)) found.add('insurance')
  if (/\bit\b|it行业|编程|程序员|开发|软件|developer|coding|bootcamp|技术岗/.test(t)) found.add('it')
  if (/政府|公务员|federal|联邦|省政府|市政府|教育|教师|学校|学区/.test(t)) found.add('government')
  return found
}

// Find balanced JSON object starting at a known position
function extractJsonAt(str, fromIdx) {
  const openIdx = str.indexOf('{', fromIdx)
  if (openIdx === -1) return null
  let depth = 0
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '{') depth++
    else if (str[i] === '}') { depth--; if (depth === 0) return str.substring(openIdx, i + 1) }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────
async function loadSession(sessionId) {
  if (!sessionId || !process.env.DATABASE_URL) return { profile: emptyProfile(), recentTurns: [] }
  try {
    const conv = await prisma.conversation.findUnique({ where: { sessionId } })
    return {
      profile: conv?.userProfile || emptyProfile(),
      recentTurns: Array.isArray(conv?.recentTurns) ? conv.recentTurns : [],
    }
  } catch {
    return { profile: emptyProfile(), recentTurns: [] }
  }
}

async function saveSession(sessionId, profile, recentTurns, ip, ua) {
  if (!sessionId || !process.env.DATABASE_URL) return
  try {
    await prisma.conversation.upsert({
      where: { sessionId },
      update: { userProfile: profile, recentTurns, ipAddress: ip, updatedAt: new Date() },
      create: {
        sessionId,
        userProfile: profile,
        recentTurns,
        conversationHistory: [],
        ipAddress: ip,
        userAgent: ua || '',
      },
    })
  } catch (e) {
    console.error('[Chat] DB save error:', e.message)
  }
}

// ─────────────────────────────────────────────────────────────────────
// LAYER 3: Independent summary generation
// Only called once, when profile is complete (~500 input tokens total)
// ─────────────────────────────────────────────────────────────────────
async function generateSummary(profile) {
  const profileText = JSON.stringify(profile)
  const industries = detectIndustriesFromText(profileText)
  const industryBlocks = [...industries].map(k => INDUSTRY_DATA[k]).join('\n')
  const casesText = getCasesSummary()
  const resourcesText = getResourcesSummary()

  const contextParts = [
    industryBlocks && `## 行业参考数据\n${industryBlocks}`,
    casesText && `## 案例库\n${casesText}`,
    resourcesText && `## 资源库\n${resourcesText}`,
  ].filter(Boolean).join('\n\n')

  const summarySystem = [
    { type: 'text', text: SUMMARY_PROMPT, cache_control: { type: 'ephemeral' } },
    ...(contextParts ? [{ type: 'text', text: contextParts }] : []),
  ]

  const res = await anthropic.beta.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: summarySystem,
    messages: [{
      role: 'user',
      content: `用户画像：\n${profileText}\n\n请生成完整的职业规划报告，按 SUMMARY_DATA_START...SUMMARY_DATA_END 格式输出。`,
    }],
    betas: ['extended-cache-ttl-2025-04-11'],
  })

  const u = res.usage
  console.log(`[Summary] cache_read=${u.cache_read_input_tokens ?? 0} created=${u.cache_creation_input_tokens ?? 0} input=${u.input_tokens} output=${u.output_tokens}`)
  return res.content[0]?.text || ''
}

// ─────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || 'unknown'

    const body = await request.json()
    const { message, sessionId, userName, userGender } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: '无效请求' }, { status: 400 })
    }
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: '今日对话次数已达上限（20次），请明天再试' }, { status: 429 })
    }

    // ── Load session state from DB ────────────────────────────
    const { profile, recentTurns } = await loadSession(sessionId)

    // Seed name from onboarding if profile is still blank
    if (!profile.姓名 && userName) profile.姓名 = userName

    // ── Build messages: recent context + current user message ─
    // recentTurns is always [user,asst,...] so appending user keeps alternation valid
    const messagesPayload = [
      ...recentTurns,
      { role: 'user', content: message },
    ]

    // ── Build system: cached CORE_PROMPT + uncached per-request context ──
    const profileContext = [
      `用户：${userName || profile.姓名 || '用户'} | 性别：${userGender || '未透露'}`,
      `当前用户画像：${JSON.stringify(profile)}`,
    ].join('\n')

    const systemBlocks = [
      { type: 'text', text: CORE_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: profileContext },
    ]

    // ── Conversation API call (~300-450 tokens input) ─────────
    const response = await anthropic.beta.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemBlocks,
      messages: messagesPayload,
      betas: ['extended-cache-ttl-2025-04-11'],
    })

    const rawText = response.content[0]?.text || ''
    const u = response.usage
    console.log(`[Chat] session=${sessionId?.slice(-6)} cache_read=${u.cache_read_input_tokens ?? 0} created=${u.cache_creation_input_tokens ?? 0} input=${u.input_tokens} output=${u.output_tokens}`)

    // ── Parse PROFILE_UPDATE ──────────────────────────────────
    const profileMarker = 'PROFILE_UPDATE:'
    const profileIdx = rawText.indexOf(profileMarker)
    if (profileIdx !== -1) {
      const jsonStr = extractJsonAt(rawText, profileIdx + profileMarker.length)
      if (jsonStr) {
        try {
          const updated = JSON.parse(jsonStr)
          // Merge: only overwrite with non-empty values from AI
          for (const [k, v] of Object.entries(updated)) {
            if (typeof v === 'string' && v.trim()) profile[k] = v.trim()
          }
        } catch (e) {
          console.error('[Chat] Profile parse error:', e.message)
        }
      }
    }

    // ── Strip machine-readable markers from display text ──────
    const displayText = (profileIdx !== -1 ? rawText.substring(0, profileIdx) : rawText)
      .replace(/READY_TO_SUMMARIZE/g, '')
      .trim()

    // ── Detect summary trigger ────────────────────────────────
    const isReady = rawText.includes('READY_TO_SUMMARIZE') || isProfileComplete(profile)

    // ── Update recent turns: keep last 4 messages (2 turns) ───
    const newRecentTurns = [
      ...recentTurns,
      { role: 'user', content: message },
      { role: 'assistant', content: displayText },
    ].slice(-4)

    // ── Persist session ───────────────────────────────────────
    await saveSession(sessionId, profile, newRecentTurns, ip, request.headers.get('user-agent'))

    // ── Generate summary if all 7 fields collected ────────────
    if (isReady) {
      console.log(`[Chat] Profile complete for "${profile.姓名}", generating summary...`)
      try {
        const summaryRaw = await generateSummary(profile)

        // Parse summary JSON with indexOf (more robust than regex)
        let summaryData = null
        const sStart = summaryRaw.indexOf('SUMMARY_DATA_START')
        const sEnd = summaryRaw.indexOf('SUMMARY_DATA_END')
        if (sStart !== -1 && sEnd !== -1) {
          const jsonStr = summaryRaw.substring(sStart + 'SUMMARY_DATA_START'.length, sEnd).trim()
          try {
            summaryData = JSON.parse(jsonStr)
          } catch (e) {
            console.error('[Chat] Summary JSON parse failed:', e.message)
            console.error('[Chat] Failed JSON (first 300):', jsonStr.slice(0, 300))
          }
        }

        const summaryPreamble = summaryRaw
          .replace(/SUMMARY_DATA_START[\s\S]*?SUMMARY_DATA_END/, '')
          .trim()

        return NextResponse.json({
          message: displayText || summaryPreamble,
          summaryData,
          isSummaryComplete: true,
        })
      } catch (e) {
        console.error('[Chat] Summary generation failed:', e.message)
        // Fall through to return conversation message; user can retry
      }
    }

    return NextResponse.json({ message: displayText, summaryData: null, isSummaryComplete: false })
  } catch (err) {
    console.error('[Chat] Error:', err)
    return NextResponse.json({ error: err.message || '服务暂时不可用' }, { status: 500 })
  }
}
