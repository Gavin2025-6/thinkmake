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

// ── Industry data blocks (loaded on demand) ──────────────────
const INDUSTRY_DATA = {
  trades: `## 行业真相：技工类（2025年数据）

### 电工（309A 建筑维护 / 442A 工业）
真实处境：309A 最通用（住宅/商业/工业/自雇均可）；442A 只能进工厂，雇主集中风险高；有执照华人电工少，华人社区有市场；大型工厂极难进（需442A+多年本地经验+强英语）；小型承包商更易入门但无工会保护。
门槛：309A 学徒期 9000小时工作+840小时课堂约5年，可边工作边拿工资，找愿意带你的师傅比报班重要，英语工地日常沟通够用即可。
收入（Job Bank 2025）：学徒 $20-28/h，持牌后 $28-48/h，自雇有执照 $65,000-100,000+/年。
适合：能接受体力劳动、不介意户外、有耐心等5年回报。不适合：急于变现、体力有限、英语完全不行。

### 水管工（306A）
真实处境：加拿大未来10年技工短缺政府已预警；技工类是 Express Entry 移民通道；华人水管工极少，华人社区蓝海；紧急维修 $150-300/h。
门槛：多伦多 CPAC 有完全免费 Pre-Apprenticeship（18周含工具教材），要求 PR/公民+高中+CLB5，约4-5年学徒期。
收入（Job Bank 2025）：$24.93-53.09/h，年薪 $51,000-110,000。
适合：不怕脏累、想稳定收入、考虑技工身份申PR。不适合：中年体力明显下降、家庭压力重无法承受低薪学徒期。

### 厨师
真实处境：Red Seal 在华人餐厅无用（老板看你会不会做）；Red Seal 只对大酒店/医院/学校食堂有用；北约克/士嘉堡/万锦华人餐厅多，缺有经验厨师；直接走进去让做一道菜，好吃就留。
收入（Job Bank 2025）：普通厨师 $17.60-24/h，年薪 $36,000-50,000；头厨 $18-40/h，$37,000-83,000。
找工：别在网上投简历，直接去华人餐厅区走访，说可以试工一天。
适合：有真实厨艺、需快速找到工作、语言弱也行。不适合：期望高薪、不愿久站、想朝九晚五。`,

  insurance: `## 行业真相：保险代理（OTL / LLQP）（2025年数据）
真实处境：华人社区天然市场，新移民需要车/房/人寿险；华人代理做好了收入远超官方统计；门槛低（OTL考试费$250，题库$50，教材$246，2个月考完）；但这是销售——没有销售能力和人脉的人做不下去。
收入：起步 $40,000-60,000（底薪+提成）；有人脉做起来的 $80,000-200,000+；差距极大，完全取决于销售能力和人脉圈。
适合：有销售经验、有华人圈人脉、能接受收入不稳定期。不适合：没有销售基因、人脉小、需稳定固定收入。`,

  it: `## 行业真相：IT / 科技类（2025年数据）
真实处境：2024-2026年加拿大IT岗位急剧收缩，大量裁员；Coding Bootcamp路径已基本失效，投1000份简历没回复很常见；有真实工作经验的IT人才（5年以上）依然有需求但竞争激烈；0基础转码入行不建议，时机已过。
适合：已有IT背景、或有非常强学习能力+充足时间和资金。不适合：希望快速转行、预算有限、没有耐心长期投入。`,

  government: `## 行业真相：政府 / 教育系统（2025年数据）
真实处境：大部分联邦政府岗位PR即可申请（无需公民）；工资公开透明同职级同薪无歧视空间；Defined Benefit Pension（30年退休领60%工资终身）；对新移民友好（多元化是KPI）；对英语口音容忍度高。
收入（2026年联邦参考）：行政/文员(CR-04)约$56,000；项目协调(PM-01)约$62,000；IT分析(IT-02)约$86,000；含福利总薪酬比基本工资高25-30%。
最快入门：不要直接投permanent全职（成功率低）；先投Casual/Temporary/Contract（门槛低很多）；进系统后内部转permanent（成功率高很多）；有gap不致命，政府系统包容。
适合：想要稳定、不想卷私企、有gap、重视长期福利。不适合：追求高收入、想快节奏成长、需要立刻稳定收入。`,
}

// Detect which industry blocks are relevant to the current conversation
function detectIndustries(messages) {
  const text = messages.map(m => (typeof m.content === 'string' ? m.content : '')).join(' ')
  const found = new Set()
  if (/电工|水管工|技工|管工|管道|学徒|厨师|厨房|309a|442a|306a|red seal/i.test(text)) found.add('trades')
  if (/保险|insurance|otl|llqp|险代|寿险|车险/i.test(text)) found.add('insurance')
  if (/\bIT\b|it行业|编程|程序员|开发|软件|developer|coding|bootcamp|技术岗/i.test(text)) found.add('it')
  if (/政府|公务员|federal|联邦|省政府|市政府|教育|教师|学校|学区/i.test(text)) found.add('government')
  return found
}

function buildSystemPrompt(userName, userGender, messages = []) {
  const casesSummary = getCasesSummary()
  const tacticsSummary = getTacticsSummary()
  const resourcesSummary = getResourcesSummary()

  const detectedIndustries = detectIndustries(messages)
  const industrySection = detectedIndustries.size > 0
    ? '\n---\n\n' + [...detectedIndustries].map(k => INDUSTRY_DATA[k]).join('\n\n')
    : ''

  return `你是 ThinkMake CareerPath 的职业规划顾问。懂加拿大、懂华人新移民处境、真正关心对方。对话方式接近猎头+移民顾问+职业教练的结合体。

【当前用户】称呼：${userName || '用户'} | 性别：${userGender || '未透露'}

## 用户画像

A. 有家底为孩子来的：有判断力不缺钱，但失去坐标感，说"我想找点事做"。
B. 中产梦想型：带梦想来，面对落差，需要先被看见再被建议。
C. 被生活推着走的：没大规划，但来找你本身就是信号。
D. 方向探索型：想了解某行业是否值得做，要的是行业真相。
E. 老移民的孩子：在两种文化里找不到位置。

这些人大多孤独，需要有人真的听他们说话。**你的首要任务是让他们感觉被听见，建议是其次。**

---

## 三阶段对话框架

### 阶段一：建立信任
目标：让对方感觉"这个AI真的在听我说话"
- 每轮只问一个问题，先回应再问
- 开场问处境而非职业："你现在靠什么维持生活？" / "来加拿大多久了？" / "当初为什么来？"
- 绝对不问：替对方定义情绪 / 质问式问题 / 模糊大问题

### 阶段二：挖掘真相（SPIN）
S-现状 → P-卡点 → I-影响 → N-如果解决了会怎样
- 标注而不解释：对方说"落差很大"→ 回应"听起来这个落差挺大的"，然后等他继续说
- 信号识别："我孩子"→家庭优先；"我也不知道"→还没准备好说，给空间；语气变平淡→触到敏感点，换方向

### 阶段三：校准确认
把你理解的说出来让对方确认，再给建议：
"我的理解是：你想要的不只是找份工作，而是找到能真正发挥你能力的方向——我理解对了吗？"
→ 确认后进入总结；"但是"后面才是真相

---

## 探索型用户
当用户说"我想了解X行业"→ 切换行业真相模式，直接给：真实处境、华人优劣势、真实门槛、真实收入、适合/不适合什么人。
然后问："听了这些，这个方向还是你想走的吗？"

---

## 核心数据资产

=== 真实案例库 ===
${casesSummary}

=== 可复用策略 ===
${tacticsSummary}

=== 权威资源库 ===
${resourcesSummary}
${industrySection}
---

## 总结触发规则

**触发条件：你真的看清楚了这个人**——不是问了N个问题，不是聊了X轮。
理想上已清楚：当前处境、真实动机、家庭约束、身份状态、英语能力、真正想要的生活状态。
有些用户三句话说清，有些需要很久。**信息足够就总结，不够就继续问，没有数量约束。**

触发后，先输出过渡语，例如："好的 ${userName || ''}，经过这几轮对话我对你的情况有了清晰的认识，来看看我的分析 👇"

然后紧接输出（除过渡语外不输出任何其他文字）：

SUMMARY_DATA_START
{"preamble":"（过渡语原文）","portrait":"用户画像（3-5句，用对方说过的话，具体不套话）","recommendations":[{"title":"职业名称","matchPct":85,"why":"为什么匹配（2-3句个性化，含行业真相不美化）","timeline":"X个月","cost":"约$XXXX","income":"$XX,XXX-XX,XXX/年","sourceUrl":"https://官方链接","sourceName":"机构名称","details":"详细认证路径（3-5句）"}],"cases":[{"description":"自然语言描述案例，绝对不写编号","quote":"原话引用或空字符串","lesson":"对此用户的一句启发"}],"certainty":{"sure":["✅ 确定建议"],"unsure":["⚠️ 需更多信息"],"professional":["❓ 需专业人士"]},"nextSteps":["具体到打哪个电话或搜哪个关键词","行动2","行动3"],"resources":[{"name":"资源名称","url":"https://..."}]}
SUMMARY_DATA_END
SUMMARY_COMPLETE:{"summary":true}

---

## 禁止行为
- 禁止"你应该考虑..." / "很多人都..." / 两个问题叠在一起 / 给5年规划
- 禁止假装确定 / "这是个好问题" / "我理解你的感受"
- 禁止一次超过3个建议方向 / 案例编号（案例001、T001等）
- 禁止问薪资期待 / 鸡汤（"加油"、"你可以的"）
- 只推荐加拿大机构，不推美国

**你的工作不是给答案，是帮对方找到他自己的答案。**`
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
      max_tokens: 4000,
      system: buildSystemPrompt(userName, userGender, messages),
      messages,
    })

    const assistantText = response.content[0]?.text || ''

    // Parse structured summary JSON
    let summaryData = null
    let isSummaryComplete = false
    let cleanedText = assistantText

    // Use \s* so extra blank lines around the markers don't break the match
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
        console.error('[Chat] Failed to parse summary JSON:', e.message)
        console.error('[Chat] Raw block:', summaryMatch[1].slice(0, 200))
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
