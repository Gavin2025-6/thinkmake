import { Resend } from 'resend'
import { randomUUID } from 'crypto'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// ── SYSTEM PROMPT (concise) ────────────────────────────────

const SYSTEM_PROMPT = `你是加拿大华人新移民职业规划顾问。

推荐规则（严格执行）：
1. 先分析职业背后的核心可迁移技能（是能力，不是职业名称）
2. 推荐3个职业：第一个技能完全对口，第二个技能高度迁移，第三个结合其他优势
3. G驾照只作辅助说明；除非用户是驾驶/运输行业，否则不推荐驾驶类职业
4. match_reason必须说明具体技能匹配点，不能泛泛而谈

分析维度：
- 学历：本科+→高门槛职业(RN/CPA/工程师)；大专→中等认证(RPN/ECE)；高中→技工学徒
- 年限8年+：提示Trade Equivalency Assessment可免部分学徒时间
- 省份安大略：给具体认证机构+官网链接+费用；其他省：给方向+当地机构链接
- 英语基础：推中文考试选项；中等：说明英语要求；流利：说明英语优势
- 预算不足：给分阶段方案，说明第一步只需多少钱
- 顾虑：每一条都要在报告里直接回应

输出格式（严格按此结构，不要JSON，不要markdown代码块）：

===CAREERS_START===
职业1：名称中英文|emoji|匹配原因（必须提及用户具体背景）|预计时间|费用范围|安省年薪
职业2：名称中英文|emoji|匹配原因（必须提及用户具体背景）|预计时间|费用范围|安省年薪
职业3：名称中英文|emoji|匹配原因（必须提及用户具体背景）|预计时间|费用范围|安省年薪
===CAREERS_END===

===REPORT_START===
（完整markdown报告，包含：一、每个职业的认证机构+步骤+费用明细+年薪；二、英语建议；三、预算规划；四、顾虑回应；五、本周行动清单3条；六、免责声明）
===REPORT_END===

全程简体中文。`

// ── HELPERS ────────────────────────────────────────────────

function buildUserPrompt(body) {
  const {
    name, occupation, experience_years, education, current_status,
    province, english, skills, study_mode, total_timeline, budget, concern,
  } = body
  const skillsStr = Array.isArray(skills) && skills.length > 0 ? skills.join('、') : '未选择'
  return `用户背景：
- 姓名：${name}
- 职业：${occupation}，从事${experience_years}
- 学历：${education}
- 状态：${current_status}
- 省份：${province}
- 英语：${english}
- 技能：${skillsStr}
- 学习：${study_mode}
- 周期：${total_timeline}
- 预算：${budget}
- 顾虑：${concern}`
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

async function sendEmail(body, careers, full_report) {
  if (!resend) { console.log('[CareerPath] Resend未初始化'); return false }
  try {
    const { name, email } = body
    console.log('[CareerPath] 发送邮件到:', email)
    const result = await resend.emails.send({
      from: 'CareerPath <onboarding@resend.dev>',
      to: email,
      subject: `你好 ${name}，这是你的加拿大职业规划`,
      text: `你好 ${name}，感谢使用CareerPath职业规划工具。你的规划报告已生成，请查看HTML版本获取完整内容。`,
      html: buildEmailHtml({ name, careers, full_report }),
      headers: { 'X-Entity-Ref-ID': randomUUID() },
    })
    console.log('[CareerPath] 邮件结果:', JSON.stringify(result))
    return true
  } catch (err) {
    console.error('[CareerPath] 邮件失败:', err)
    return false
  }
}

// ── ROUTE HANDLER ──────────────────────────────────────────

export async function POST(request) {
  const body = await request.json()
  const { name, email, phone, occupation, province } = body

  console.log('[CareerPath]', JSON.stringify({
    timestamp: new Date().toISOString(),
    name, email, phone: phone || '', occupation, province,
  }))
  console.log('[CareerPath] System prompt长度:', SYSTEM_PROMPT.length)
  console.log('[CareerPath] User prompt长度:', buildUserPrompt(body).length)

  try {
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
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(body) }],
      }),
    })

    console.log('[CareerPath] API status:', response.status)

    if (!response.ok) {
      const errText = await response.text()
      console.error('[CareerPath] API error:', errText.slice(0, 300))
      throw new Error(errText.slice(0, 200))
    }

    const data = await response.json()
    const text = data.content[0].text
    console.log('[CareerPath] Response length:', text.length)

    // Parse careers
    const careersMatch = text.match(/===CAREERS_START===([\s\S]*?)===CAREERS_END===/)
    const reportMatch = text.match(/===REPORT_START===([\s\S]*?)===REPORT_END===/)

    const careersRaw = careersMatch?.[1]?.trim() || ''
    const full_report = reportMatch?.[1]?.trim() || text

    const careers = careersRaw.split('\n')
      .filter(line => line.trim() && line.includes('|'))
      .map(line => {
        const parts = line.replace(/^职业\d+[：:]\s*/, '').split('|')
        return {
          name: parts[0]?.trim() || '',
          emoji: parts[1]?.trim() || '🌟',
          match_reason: parts[2]?.trim() || '',
          time: parts[3]?.trim() || '',
          cost: parts[4]?.trim() || '',
          salary: parts[5]?.trim() || '',
        }
      })
      .filter(c => c.name)

    console.log('[CareerPath] 解析职业数:', careers.length)

    // Send email (non-blocking)
    const email_sent = await sendEmail(body, careers, full_report)

    return Response.json({ careers, email_sent })

  } catch (error) {
    console.error('[CareerPath] Error:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
