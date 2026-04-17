import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { randomUUID } from 'crypto'
import { jobs } from '../../lib/jobStore'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// ── SYSTEM PROMPTS ─────────────────────────────────────────

// Fast prompt: returns only careers summary, ~3-5s
const SUMMARY_PROMPT = `你是加拿大职业规划顾问，专门帮助中国新移民。
只返回以下JSON格式，不要任何其他内容，不要markdown代码块标记：
{
  "careers": [
    {
      "name": "职业名（中英文，如：保险经纪人 Insurance Broker）",
      "emoji": "一个相关emoji",
      "match_reason": "一句话说明为什么匹配，必须提到用户的具体背景（年限/技能/学历）",
      "time": "预计认证时间（如：4–6个月）",
      "cost": "总费用范围（如：$500–$2,000）",
      "salary": "安省年薪范围（如：$55,000–$90,000）"
    }
  ]
}
推荐2–3个最匹配的职业。`

// Full prompt: used for email report only
const FULL_REPORT_PROMPT = `你是专门帮助中国新移民规划加拿大职业路径的顾问。
数据来源于以下权威机构：
- Skilled Trades Ontario (skilledtradesontario.ca)
- College of Nurses of Ontario (cno.org)
- CPA Ontario (cpaontario.ca)
- CTCMPAO (ctcmpao.on.ca)
- FSRA (fsrao.ca) — 金融/保险/房产监管
- RECO (reco.on.ca) — 安省房地产经纪
- Job Bank Canada (jobbank.gc.ca)

分析规则：
1. 学历判断：硕士/本科→RN、CPA、工程师；大专→RPN、ECE；高中→技工学徒
2. 工作年限：8年以上→提示Trade Equivalency Assessment
3. 目前状态：还没来→来之前准备清单；刚到6个月→立即行动方案；已在1年+→直接进阶建议
4. 学习+周期：全职+1年内→只推短认证；兼职+1-3年→弹性课程；极度有限→在线碎片化
5. 省份：安大略→详细机构+步骤+费用+链接；其他省→方向性建议+当地机构链接
6. 英语：基础→推中文考试选项；中等→提示哪些环节需英语；流利→说明额外机会
7. 预算：不够→分阶段方案，说明第一步只需多少；够→说明可考虑备选路径
8. 顾虑：每个顾虑都在报告里直接回应

完整报告结构：
一、推荐职业方向（每个职业详细展开）
   - 为什么推荐（结合用户具体背景）
   - 认证机构名称 + 官网链接
   - 认证步骤（分点列出）
   - 预计时间线
   - 费用明细
   - 年薪范围
二、针对你的英语水平的建议
三、针对你的预算的规划
四、关于你的顾虑：[直接回应]
五、第一步行动清单（3条这周可以执行的具体行动）
六、免责声明：以上信息仅供参考，具体要求请以各认证机构官方网站最新公告为准。

语气：专业但亲切，像在加拿大生活多年的过来人。全程简体中文。
只返回markdown格式报告内容，不要JSON包装。`

// ── HELPERS ────────────────────────────────────────────────

async function callClaude(systemPrompt, userPrompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(data))
  return data.content[0].text
}

function parseJSON(text) {
  const cleaned = text
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end !== -1) {
      return JSON.parse(cleaned.slice(start, end + 1))
    }
    throw new Error('JSON parse failed: ' + cleaned.slice(0, 200))
  }
}

function mdToEmailHtml(md) {
  if (!md) return ''
  return md.split('\n').map(line => {
    const h = line
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" style="color:#7C3AED;text-decoration:underline">$1</a>')
    if (/^### /.test(line)) return `<h4 style="color:#374151;font-size:14px;font-weight:600;margin:14px 0 4px">${h.slice(4)}</h4>`
    if (/^## /.test(line))  return `<h3 style="color:#111827;font-size:16px;font-weight:700;margin:18px 0 6px">${h.slice(3)}</h3>`
    if (/^# /.test(line))   return `<h2 style="color:#7C3AED;font-size:18px;font-weight:700;margin:22px 0 8px">${h.slice(2)}</h2>`
    if (/^[-•] /.test(line)) return `<div style="padding-left:14px;margin:3px 0;color:#374151;font-size:14px">• ${h.slice(2)}</div>`
    if (/^\d+\. /.test(line)) return `<div style="padding-left:14px;margin:3px 0;color:#374151;font-size:14px">${h}</div>`
    if (line.trim() === '') return '<div style="height:8px"></div>'
    return `<p style="margin:6px 0;color:#374151;font-size:14px;line-height:1.7">${h}</p>`
  }).join('')
}

function buildEmailHtml({ name, careers, full_report }) {
  const careerHtml = careers.map(c => `
    <div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin-bottom:10px;border:1px solid #e5e7eb">
      <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:5px">${c.emoji || ''} ${c.name}</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:10px;line-height:1.5">${c.match_reason}</div>
      <div style="font-size:13px;color:#374151">
        <span style="margin-right:16px">⏱ ${c.time}</span>
        <span style="margin-right:16px">💰 ${c.cost}</span>
        <span>📈 ${c.salary}</span>
      </div>
    </div>`).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;margin:0;padding:20px;background:#f3f4f6">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
  <div style="background:linear-gradient(135deg,#7C3AED,#a855f7);padding:28px 32px;text-align:center">
    <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px">ThinkMake</div>
    <div style="color:#e9d5ff;font-size:13px;margin-top:4px">CareerPath · 加拿大职业规划</div>
  </div>
  <div style="padding:32px">
    <p style="font-size:16px;color:#111827;margin:0 0 8px">你好 <strong>${name}</strong>，</p>
    <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 28px">感谢使用 CareerPath 职业规划工具。以下是根据你的背景生成的专属规划报告。</p>
    <div style="font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">推荐职业方向</div>
    ${careerHtml}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0"/>
    <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px">完整规划报告</div>
    <div>${mdToEmailHtml(full_report)}</div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0"/>
    <p style="font-size:12px;color:#9ca3af;line-height:1.7;margin:0">
      本报告仅供参考，具体认证要求请以各官方机构最新公告为准。<br>
      信息来源：Skilled Trades Ontario、CNO、CPA Ontario、FSRA、Job Bank Canada
    </p>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center">
    <p style="font-size:13px;color:#6b7280;margin:0">
      © ThinkMake · <a href="https://thinkmake.ai" style="color:#7C3AED;text-decoration:none">thinkmake.ai</a>
    </p>
  </div>
</div>
</body>
</html>`
}

// ── BACKGROUND: full report + email ────────────────────────

async function generateAndSend({ userPrompt, name, email, careers, requestId }) {
  try {
    const full_report = await callClaude(FULL_REPORT_PROMPT, userPrompt, 3000)
    console.log('[CareerPath] 准备发送邮件到:', email)
    console.log('[CareerPath] Resend key存在:', !!process.env.RESEND_API_KEY)
    if (resend) {
      const emailResult = await resend.emails.send({
        from: 'CareerPath <onboarding@resend.dev>',
        to: email,
        subject: `${name}，你的加拿大职业规划报告 🍁`,
        html: buildEmailHtml({ name, careers, full_report }),
      })
      console.log('[CareerPath] 邮件发送结果:', JSON.stringify(emailResult))
      jobs.set(requestId, 'sent')
    } else {
      console.log('[CareerPath] Resend未初始化，跳过发送')
      jobs.set(requestId, 'failed')
    }
  } catch (err) {
    console.error('[CareerPath] background error:', err)
    jobs.set(requestId, 'failed')
  }
}

// ── ROUTE HANDLER ──────────────────────────────────────────

export async function POST(request) {
  try {
    const body = await request.json()
    const {
      occupation, experience_years, education, current_status,
      province, english, skills, study_mode, total_timeline,
      budget, concern, name, email, phone,
    } = body

    const skillsStr = Array.isArray(skills) && skills.length > 0
      ? skills.join('、') : '未选择'

    console.log('[CareerPath]', JSON.stringify({
      timestamp: new Date().toISOString(),
      name, email, phone: phone || '未填写', occupation, experience_years, education,
      current_status, province, english, skills: skillsStr,
      study_mode, total_timeline, budget, concern,
    }))

    const userPrompt = `用户背景：
- 姓名：${name}
- 在中国的职业：${occupation}
- 从事年限：${experience_years}
- 最高学历：${education}
- 目前状态：${current_status}
- 所在省份：${province}
- 英语水平：${english}
- 相关技能经验：${skillsStr}
- 学习方式：${study_mode}
- 可接受总周期：${total_timeline}
- 可用预算：${budget}
- 最大顾虑：${concern}

请分析以上背景，生成职业规划报告。`

    // ── Step 1: Fast summary (3-5s) ──
    const rawSummary = await callClaude(SUMMARY_PROMPT, userPrompt, 800)
    console.log('[CareerPath] raw summary:', rawSummary.slice(0, 300))

    let careers = []
    try {
      const parsed = parseJSON(rawSummary)
      careers = parsed.careers || []
      console.log('[CareerPath] parsed careers count:', careers.length)
    } catch (err) {
      console.error('[CareerPath] summary parse error:', err.message)
    }

    const requestId = randomUUID()
    jobs.set(requestId, 'pending')

    // ── Step 2: Background full report + email ──
    generateAndSend({ userPrompt, name, email, careers, requestId })

    return NextResponse.json({ careers, requestId })
  } catch (err) {
    console.error('[CareerPath] error:', err)
    return NextResponse.json({ error: '分析失败，请稍后重试' }, { status: 500 })
  }
}
