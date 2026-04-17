import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { randomUUID } from 'crypto'
import { jobs } from '../../lib/jobStore'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// ── SYSTEM PROMPT (single call) ────────────────────────────

const SYSTEM_PROMPT = `你是专门帮助中国新移民规划加拿大职业路径的顾问。
数据来源：Skilled Trades Ontario、CNO、CPA Ontario、FSRA、RECO、Job Bank Canada。

【推荐逻辑 — 严格执行】
第一步：分析用户职业背后的核心可迁移技能（是能力，不是职业名称）
  例如：汽车销售 → 大额谈判、客户关系管理、销售成交
  例如：护士 → 医疗护理、患者沟通、应急处置
  例如：厨师 → 食品制作、食品安全管理、团队协调
  例如：会计 → 财务分析、数据处理、合规意识

第二步：基于核心技能推荐恰好3个职业：
  - 第一个：技能完全匹配，入行最快
  - 第二个：核心技能高度可迁移，发展空间更大
  - 第三个：部分技能迁移，结合学历/预算/英语优势

第三步：禁止规则
  - 禁止推荐与核心技能完全无关的职业
  - G驾照是辅助条件，不是推荐依据；除非用户职业本身是运输/驾驶相关，否则不推荐驾驶类职业；其他职业背景的G驾照只作补充说明（如"有G驾照方便带客户看房"）
  - match_reason必须说明具体技能匹配点，不能泛泛而谈

【分析规则】
1. 学历：硕士/本科→RN、CPA、工程师；大专→RPN、ECE；高中→技工学徒
2. 工作年限：8年以上→提示Trade Equivalency Assessment
3. 目前状态：还没来→来之前准备清单；刚到6个月→立即行动方案；已在1年+→直接进阶建议
4. 学习+周期：全职+1年内→只推短认证；兼职+1-3年→弹性课程；极度有限→在线碎片化
5. 省份：安大略→详细机构+步骤+费用+链接；其他省→方向性建议+当地机构链接
6. 英语：基础→推中文考试选项；中等→提示哪些环节需英语；流利→说明额外机会
7. 预算：不够→分阶段方案；够→说明备选路径
8. 顾虑：每个顾虑都在报告里直接回应

【返回格式】
只返回以下JSON，不要markdown代码块，不要其他任何内容：
{
  "summary": {
    "careers": [
      {
        "name": "职业名（中英文，如：保险经纪人 Insurance Broker）",
        "emoji": "一个相关emoji",
        "match_reason": "一句话说明核心技能匹配，例如：你8年的大额谈判和客户关系技能直接对口，LLQP支持中文应考",
        "time": "预计认证时间",
        "cost": "总费用范围",
        "salary": "安省年薪范围"
      }
    ]
  },
  "full_report": "完整markdown报告内容（包含以下六部分）：\\n一、推荐职业方向（每个详细展开：为什么推荐/认证机构+官网链接/步骤/时间线/费用/年薪）\\n二、针对你的英语水平的建议\\n三、针对你的预算的规划\\n四、关于你的顾虑\\n五、第一步行动清单（3条这周可以执行的具体行动）\\n六、免责声明"
}

语气：专业但亲切，像在加拿大生活多年的过来人。全程简体中文。`

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

// ── BACKGROUND: email only (no second Claude call) ─────────

async function sendEmail({ name, email, careers, full_report, requestId }) {
  try {
    console.log('[CareerPath] 准备发送邮件到:', email)
    console.log('[CareerPath] Resend key存在:', !!process.env.RESEND_API_KEY)
    if (resend) {
      const emailResult = await resend.emails.send({
        from: 'CareerPath <onboarding@resend.dev>',
        to: email,
        subject: `你好 ${name}，这是你的加拿大职业规划`,
        text: `你好 ${name}，感谢使用CareerPath职业规划工具。你的规划报告已生成，请查看HTML版本获取完整内容。`,
        html: buildEmailHtml({ name, careers, full_report }),
        headers: { 'X-Entity-Ref-ID': randomUUID() },
      })
      console.log('[CareerPath] 邮件发送结果:', JSON.stringify(emailResult))
      jobs.set(requestId, 'sent')
    } else {
      console.log('[CareerPath] Resend未初始化，跳过发送')
      jobs.set(requestId, 'failed')
    }
  } catch (err) {
    console.error('[CareerPath] email error:', err)
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

    // ── Single Claude call ──
    const rawText = await callClaude(SYSTEM_PROMPT, userPrompt, 3000)
    console.log('[CareerPath] raw response (first 300):', rawText.slice(0, 300))

    let careers = []
    let full_report = ''
    try {
      const parsed = parseJSON(rawText)
      careers = parsed.summary?.careers || []
      full_report = parsed.full_report || ''
      console.log('[CareerPath] parsed careers count:', careers.length)
    } catch (err) {
      console.error('[CareerPath] parse error:', err.message)
    }

    const requestId = randomUUID()
    jobs.set(requestId, 'pending')

    // ── Background: send email only ──
    sendEmail({ name, email, careers, full_report, requestId })

    return NextResponse.json({ careers, requestId })
  } catch (err) {
    console.error('[CareerPath] error:', err)
    return NextResponse.json({ error: '分析失败，请稍后重试' }, { status: 500 })
  }
}
