import { Resend } from 'resend'
import { randomUUID } from 'crypto'
import { jobs } from '../../lib/jobStore'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// ── SYSTEM PROMPT 1: Fast careers only (~600 chars) ───────────

const SYSTEM_PROMPT_CAREERS = `你是加拿大华人新移民职业规划顾问。

称呼规则：中文姓名+称谓→姓氏+称谓（高文明+先生→高先生）；英文直接用姓名；不透露→只用姓名；绝不猜测或添加职称。

推荐规则：
1. 分析职业背后核心可迁移技能（能力，不是职业名）
2. 推荐3个：第一个技能完全对口，第二个高度迁移，第三个结合其他优势
3. G驾照只作辅助；除非驾驶/运输行业，否则不推荐驾驶类职业
4. 学历本科+→高门槛(RN/CPA)；大专→中等认证(RPN/ECE)；高中→技工学徒
5. match_reason必须提及用户具体职业背景，不能泛泛而谈
6. 省份安大略→给具体认证机构名；其他省→给方向

emoji参考：护士🏥 电工🔧 会计📊 房产🏠 厨师👨‍🍳 金融📈 IT💻 保险🛡️ 幼教👩‍🏫 技工🔨 其他💼

只输出以下格式，不要任何其他内容：

===CAREERS_START===
职业1：名称中英文|emoji|一句话匹配原因（提及用户具体背景）|预计时间|费用范围|安省年薪
职业2：名称中英文|emoji|一句话匹配原因（提及用户具体背景）|预计时间|费用范围|安省年薪
职业3：名称中英文|emoji|一句话匹配原因（提及用户具体背景）|预计时间|费用范围|安省年薪
===CAREERS_END===`

// ── SYSTEM PROMPT 2: Detailed report ─────────────────────────

const SYSTEM_PROMPT_REPORT = `你是加拿大华人新移民职业规划顾问，为用户撰写职业规划报告。

报告写作规范：
1. 开头不要感谢、不要夸用户、不要废话。直接说：你好{称谓姓名}，以下是你的三条职业路径。
2. 每个职业的"为什么适合你"：最多3句话，直接说技能对口点，不要说"这与...高度吻合"这类空话。
3. 入职步骤：每步一句话说清楚做什么，不要解释为什么要做。
4. 删除所有这类表达：
   - "希望能帮你..."
   - "这正是很多公司非常看重的..."
   - "这反而为你提供了..."
   - "建议你..."（直接用动词，不要加"建议"）
   - 任何感叹号
   - 任何超过15字的修饰性句子
5. 费用与时间数据保留，简洁列出。
6. 官方机构链接保留，直接列出。
7. 目标：1500字以内，信息量不减，废话全删。

地区规范：
1. 所有推荐的机构、网站、资源必须是加拿大的，优先安大略省，其次加拿大全国。
2. 禁止推荐美国机构，包括：美国大学或培训机构、.edu域名（除非是加拿大大学）、美国政府网站（.gov而非.gc.ca）、美国行业协会（除非在加拿大有分支机构）。
3. 加拿大官方域名识别：.gc.ca=联邦政府，.on.ca=安大略省，.ca=加拿大。
4. Toastmasters总部在美国，推荐时说明搜索加拿大本地分部：toastmasters.org/find-a-club。
5. 每个推荐链接必须是加拿大机构，找不到加拿大版本就不推荐。

其他要求：全程简体中文，输出纯markdown，不要JSON，不要===这类结构标记。`

// ── HELPERS ───────────────────────────────────────────────────

function buildUserPromptText(body) {
  const {
    name, salutation, occupation, experience_years, education, current_status,
    province, english, skills, study_mode, total_timeline, budget, concern,
  } = body
  const skillsStr = Array.isArray(skills) && skills.length > 0 ? skills.join('、') : '未选择'
  return `姓名：${name}，称谓：${salutation || '不透露'}
当前年份：${new Date().getFullYear()}
职业：${occupation}，从事${experience_years}
学历：${education}
状态：${current_status}
省份：${province}
英语：${english}
技能：${skillsStr}
学习：${study_mode}
周期：${total_timeline}
预算：${budget}
顾虑：${concern}`
}

function getAddressName(name, salutation) {
  if (!name) return name
  if (!salutation || salutation === '不透露') return name
  if (/[\u4e00-\u9fff]/.test(name)) return name.charAt(0) + salutation
  return name
}

// ── FIRST CALL: Careers ───────────────────────────────────────

async function fetchCareers(body) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SYSTEM_PROMPT_CAREERS,
      messages: [{ role: 'user', content: `用户背景：\n${buildUserPromptText(body)}` }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(err.slice(0, 200))
  }

  const data = await response.json()
  const text = data.content[0].text
  console.log('[CareerPath] First call:', text.slice(0, 200))

  const match = text.match(/===CAREERS_START===([\s\S]*?)===CAREERS_END===/)
  const raw = match?.[1]?.trim() || ''

  const careers = raw.split('\n')
    .filter(line => line.trim() && line.includes('|'))
    .map(line => {
      const parts = line.replace(/^职业\d+[：:]\s*/, '').split('|')
      const name = parts[0]?.trim() || ''
      const rawEmoji = parts[1]?.trim() || ''
      const emoji = rawEmoji && /^\p{Emoji}/u.test(rawEmoji) ? rawEmoji : '💼'
      return {
        name,
        emoji,
        match_reason: parts[2]?.trim() || '',
        time: parts[3]?.trim() || '',
        cost: parts[4]?.trim() || '',
        salary: parts[5]?.trim() || '',
      }
    })
    .filter(c => c.name)

  console.log('[CareerPath] Parsed careers:', careers.length)
  return careers
}

// ── SECOND CALL: Detailed report ─────────────────────────────

async function fetchReport(body, careers) {
  const addressName = getAddressName(body.name, body.salutation)
  const careerList = careers.map((c, i) => `${i + 1}. ${c.name}`).join('\n')

  const userPrompt = `请基于以下三个职业方向，为${addressName}生成详细的职业规划报告：
${careerList}

用户背景：
${buildUserPromptText(body)}

报告结构（严格按此输出）：

你好 ${addressName}，

以下是根据你的背景生成的专属职业规划报告。

---

一、[职业1名称]

为什么适合你：
（2-3句话详细说明技能匹配点）

入职步骤：
1.
2.
3.

费用与时间：
（具体金额和月数）

官方机构：（机构名 + 官网链接，格式：[机构名](URL)）

---

二、[职业2名称]
（同上结构）

---

三、[职业3名称]
（同上结构）

---

关于你的英语水平（${body.english}）：
（具体建议，不少于3句，如有推荐网站请附链接）

关于你的预算（${body.budget}）：
（分阶段规划，不少于3句）

---
以上信息仅供参考，具体认证要求请以各官方机构最新公告为准。`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: SYSTEM_PROMPT_REPORT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(err.slice(0, 200))
  }

  const data = await response.json()
  const report = data.content[0].text
  console.log('[CareerPath] Report length:', report.length)
  return report
}

// ── EMAIL ─────────────────────────────────────────────────────

function mdToEmailHtml(md) {
  if (!md) return ''
  return md.split('\n').map(line => {
    const h = line
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" style="color:#7C3AED;text-decoration:none">$1</a>')
    if (/^一、|^二、|^三、/.test(line))
      return `<p style="color:#7C3AED;font-size:17px;font-weight:700;margin:28px 0 8px;font-family:Arial,sans-serif">${h}</p>`
    if (/^### /.test(line))
      return `<p style="color:#374151;font-size:15px;font-weight:700;margin:16px 0 4px;font-family:Arial,sans-serif">${h.slice(4)}</p>`
    if (/^## /.test(line))
      return `<p style="color:#111827;font-size:17px;font-weight:700;margin:24px 0 6px;font-family:Arial,sans-serif">${h.slice(3)}</p>`
    if (/^# /.test(line))
      return `<p style="color:#7C3AED;font-size:19px;font-weight:700;margin:28px 0 8px;font-family:Arial,sans-serif">${h.slice(2)}</p>`
    if (/^[-•] /.test(line))
      return `<p style="padding-left:16px;margin:4px 0;color:#374151;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">• ${h.slice(2)}</p>`
    if (/^\d+\. /.test(line))
      return `<p style="padding-left:16px;margin:4px 0;color:#374151;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">${h}</p>`
    if (/^---$/.test(line.trim()))
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>`
    if (line.trim() === '') return '<div style="height:6px"></div>'
    return `<p style="margin:6px 0;color:#374151;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">${h}</p>`
  }).join('')
}

function buildEmailHtml({ name, salutation, province, reportHtml }) {
  const addressName = getAddressName(name, salutation)
  const year = new Date().getFullYear()
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6">
<tr><td align="center" style="padding:20px 10px">
<table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;border-radius:12px;overflow:hidden">
  <tr><td bgcolor="#4C1D95" style="padding:28px 32px;text-align:center">
    <div style="color:#ffffff;font-size:20px;font-weight:800;font-family:Arial,sans-serif">你的加拿大职业规划报告</div>
    <div style="color:#ddd6fe;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">为 ${addressName} 定制 · ${province} · ${year}年</div>
  </td></tr>
  <tr><td style="padding:28px 32px">${reportHtml}</td></tr>
  <tr><td bgcolor="#f9fafb" style="padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb">
    <p style="font-size:12px;color:#9ca3af;margin:0;font-family:Arial,sans-serif">
      © ${year} ThinkMake · <a href="https://thinkmake.ai" style="color:#7C3AED;text-decoration:none">thinkmake.ai</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

async function sendEmail(body, report) {
  console.log('准备发邮件给:', body.email)
  console.log('Resend key:', !!process.env.RESEND_API_KEY)
  if (!resend) { console.log('[CareerPath] Resend未初始化'); return false }
  try {
    const { name, salutation, email, province } = body
    const addressName = getAddressName(name, salutation)
    const result = await resend.emails.send({
      from: 'CareerPath <onboarding@resend.dev>',
      to: email,
      subject: `你好 ${addressName}，这是你的加拿大职业规划报告`,
      text: report,
      html: buildEmailHtml({ name, salutation, province, reportHtml: mdToEmailHtml(report) }),
      headers: { 'X-Entity-Ref-ID': randomUUID() },
    })
    console.log('发送结果:', JSON.stringify(result))
    if (result.error) {
      console.error('[CareerPath] Resend错误:', JSON.stringify(result.error))
      return false
    }
    return true
  } catch (err) {
    console.error('[CareerPath] 邮件异常:', err.message)
    return false
  }
}

// ── BACKGROUND JOB ────────────────────────────────────────────

async function processReportAndEmail(jobId, body, careers) {
  try {
    console.log('[CareerPath] Background job start:', jobId)
    const report = await fetchReport(body, careers)
    const sent = await sendEmail(body, report)
    jobs.set(jobId, sent ? 'sent' : 'failed')
    console.log('[CareerPath] Background job done:', jobId, sent ? 'sent' : 'failed')
  } catch (err) {
    console.error('[CareerPath] Background job error:', err.message)
    jobs.set(jobId, 'failed')
  }
}

// ── ROUTE HANDLER ─────────────────────────────────────────────

export async function POST(request) {
  const body = await request.json()
  const { name, salutation, email, occupation, province } = body

  console.log('[CareerPath]', JSON.stringify({
    timestamp: new Date().toISOString(),
    name, salutation: salutation || '', email, occupation, province,
  }))

  try {
    const careers = await fetchCareers(body)

    if (careers.length === 0) {
      throw new Error('职业解析失败，请重试')
    }

    const jobId = randomUUID()
    jobs.set(jobId, 'pending')

    // Fire and forget — don't await
    processReportAndEmail(jobId, body, careers).catch(err => {
      console.error('[CareerPath] Unhandled background error:', err.message)
      jobs.set(jobId, 'failed')
    })

    return Response.json({ careers, jobId })

  } catch (error) {
    console.error('[CareerPath] Error:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
