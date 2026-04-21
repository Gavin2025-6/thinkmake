import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { prisma } from '../../lib/prisma'

// Ensure name/phone columns exist (idempotent, safe to run every cold start)
async function ensureLeadColumns() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "name" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "phone" TEXT`)
  } catch {}
}

export async function POST(request) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    if (process.env.DATABASE_URL) await ensureLeadColumns()
    const body = await request.json()
    const { email, wechat, sessionId, summaryText, consent, userName, phone } = body

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: '请输入有效的邮箱地址' }, { status: 400 })
    }
    if (!consent) {
      return NextResponse.json({ error: '请勾选同意条款' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Save lead to DB if available
    if (process.env.DATABASE_URL) {
      try {
        let summaryJson = null
        try { summaryJson = summaryText ? JSON.parse(summaryText) : null } catch {}

        await prisma.lead.upsert({
          where: { email: normalizedEmail },
          update: {
            name: userName || undefined,
            phone: phone || undefined,
            wechat: wechat || undefined,
            conversationId: sessionId || 'direct',
            recommendedCareers: summaryJson || undefined,
          },
          create: {
            email: normalizedEmail,
            name: userName || null,
            phone: phone || null,
            wechat: wechat || null,
            conversationId: sessionId || 'direct',
            recommendedCareers: summaryJson || null,
            source: 'v2_chat',
          },
        })

        // Update conversation with email
        if (sessionId) {
          await prisma.conversation.update({
            where: { sessionId },
            data: { email: normalizedEmail },
          }).catch(() => {})
        }
      } catch (dbErr) {
        console.error('[Lead] DB error (non-fatal):', dbErr.message)
      }
    }

    // Send email with summary
    let emailSent = false
    if (process.env.RESEND_API_KEY && summaryText) {
      // summaryText is JSON.stringify(summaryData) from frontend
      let summaryData = null
      try { summaryData = JSON.parse(summaryText) } catch {}

      const html = buildSummaryEmail(userName || '', summaryData)
      const subject = userName
        ? `你好 ${userName}，你的加拿大职业规划报告来了 🍁`
        : '你的加拿大职业规划报告来了 🍁'

      console.log('[Lead] Sending email to:', normalizedEmail, '| userName:', userName, '| hasPortrait:', !!summaryData?.portrait)
      const result = await resend.emails.send({
        from: 'ThinkMake CareerPath <onboarding@resend.dev>',
        to: normalizedEmail,
        subject,
        html,
      })
      if (result.error) {
        console.error('[Lead] Email error:', result.error)
      } else {
        emailSent = true
        console.log('[Lead] Email sent OK, id:', result.data?.id)
      }
    } else {
      console.log('[Lead] Email skipped — RESEND_API_KEY present:', !!process.env.RESEND_API_KEY, '| summaryText length:', summaryText?.length || 0)
    }

    const wechatContact = process.env.WECHAT_CONTACT || 'thinkmake_ca'
    return NextResponse.json({
      success: true,
      emailSent,
      fallbackMessage: !process.env.RESEND_API_KEY
        ? `报告已保存，请添加微信 ${wechatContact} 获取完整报告`
        : null,
    })
  } catch (err) {
    console.error('[Lead] Error:', err)
    return NextResponse.json({ error: err.message || '提交失败' }, { status: 500 })
  }
}

function buildSummaryEmail(userName, data) {
  const wechat = process.env.WECHAT_CONTACT || 'thinkmake_ca'
  const greeting = userName ? `你好 ${userName}，` : '你好，'

  // ── Recommendations (full: includes details) ─────────────────
  const recsHtml = (data?.recommendations || []).map(rec => {
    const matchColor = rec.matchPct >= 80 ? '#065f46' : '#92400e'
    const matchBg    = rec.matchPct >= 80 ? '#d1fae5' : '#fef3c7'
    return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:18px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <span style="font-size:17px;font-weight:800;color:#1a1a1a">${esc(rec.title)}</span>
        <span style="background:${matchBg};color:${matchColor};border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700">匹配度 ${rec.matchPct}%</span>
      </div>
      <p style="margin:0 0 10px;color:#374151;font-size:14px;line-height:1.6">${esc(rec.why)}</p>
      <table style="border-collapse:collapse;font-size:13px;color:#6b7280;margin-bottom:10px">
        <tr>
          <td style="padding:2px 16px 2px 0">⏱ ${esc(rec.timeline)}</td>
          <td style="padding:2px 16px 2px 0">💰 ${esc(rec.cost)}</td>
          <td style="padding:2px 0">📈 ${esc(rec.income)}</td>
        </tr>
      </table>
      ${rec.sourceUrl ? `<p style="margin:0 0 10px"><a href="${rec.sourceUrl}" style="color:#7c3aed;font-size:12px">数据来源：${esc(rec.sourceName || rec.sourceUrl)}</a></p>` : ''}
      ${rec.details ? `
      <div style="background:#f9fafb;border-left:3px solid #7c3aed;border-radius:0 6px 6px 0;padding:10px 14px;margin-top:4px">
        <div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">详细路径</div>
        <p style="margin:0;font-size:13px;color:#374151;line-height:1.7">${esc(rec.details)}</p>
      </div>` : ''}
    </div>`
  }).join('')

  // ── Cases ─────────────────────────────────────────────────────
  const casesHtml = (data?.cases || []).map(c => `
    <div style="border-left:3px solid #e5e7eb;padding:8px 14px;margin-bottom:10px">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;line-height:1.6">${esc(c.description)}</p>
      ${c.quote ? `<p style="margin:4px 0;font-size:13px;color:#6b7280;font-style:italic">"${esc(c.quote)}"</p>` : ''}
      ${c.lesson ? `<p style="margin:4px 0 0;font-size:13px;color:#7c3aed">→ ${esc(c.lesson)}</p>` : ''}
    </div>`).join('')

  // ── Certainty ─────────────────────────────────────────────────
  const certaintyHtml = (() => {
    const c = data?.certainty
    if (!c) return ''
    const rows = [
      ...(c.sure || []).map(s => `<div style="padding:3px 0;font-size:13px;color:#374151">${esc(s)}</div>`),
      ...(c.unsure || []).map(s => `<div style="padding:3px 0;font-size:13px;color:#374151">${esc(s)}</div>`),
      ...(c.professional || []).map(s => `<div style="padding:3px 0;font-size:13px;color:#374151">${esc(s)}</div>`),
    ]
    return rows.join('')
  })()

  // ── Next Steps ───────────────────────────────────────────────
  const stepsHtml = (data?.nextSteps || []).map((s, i) => `
    <tr>
      <td style="padding:5px 12px 5px 0;vertical-align:top">
        <span style="display:inline-block;width:22px;height:22px;background:#7c3aed;color:#fff;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700">${i + 1}</span>
      </td>
      <td style="padding:5px 0;font-size:14px;color:#374151;line-height:1.5">${esc(s)}</td>
    </tr>`).join('')

  // ── Resources ────────────────────────────────────────────────
  const resourcesHtml = (data?.resources || []).map(r =>
    `<a href="${r.url}" style="display:inline-block;background:#f3f0ff;color:#7c3aed;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:500;text-decoration:none;margin:3px">${esc(r.name)}</a>`
  ).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px 16px">

  <!-- Header -->
  <div style="background:#ffffff;border-radius:12px;padding:20px 24px;margin-bottom:16px;border:1px solid #e5e7eb">
    <div style="font-size:20px;font-weight:800;color:#1a1a1a">Think<span style="color:#7c3aed">Make</span> CareerPath</div>
    <div style="color:#9ca3af;font-size:12px;margin-top:2px">加拿大华人职业规划 · 完整报告</div>
  </div>

  <!-- Greeting -->
  <div style="background:#f3f0ff;border-left:4px solid #7c3aed;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#374151;line-height:1.6">
    ${greeting}这是你的加拿大职业规划完整报告，包含详细路径和行动清单。
  </div>

  <!-- Portrait -->
  ${data?.portrait ? `
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:8px">你的画像</div>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">${esc(data.portrait)}</p>
  </div>` : ''}

  <!-- Recommendations -->
  ${recsHtml ? `
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px">
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:14px">推荐方向</div>
    ${recsHtml}
  </div>` : ''}

  <!-- Cases -->
  ${casesHtml ? `
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px">
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:12px">📚 真实案例参考</div>
    ${casesHtml}
  </div>` : ''}

  <!-- Certainty -->
  ${certaintyHtml ? `
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px">
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:10px">确定性分级</div>
    ${certaintyHtml}
  </div>` : ''}

  <!-- Next Steps -->
  ${stepsHtml ? `
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px">
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:12px">🎯 明天能做的第一件事</div>
    <table style="border-collapse:collapse;width:100%">${stepsHtml}</table>
  </div>` : ''}

  <!-- Resources -->
  ${resourcesHtml ? `
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px">
    <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:10px">🔗 相关资源</div>
    <div>${resourcesHtml}</div>
  </div>` : ''}

  <!-- WeChat CTA -->
  <div style="background:#1a1a2e;border-radius:12px;padding:22px;text-align:center;margin-bottom:16px">
    <div style="color:#ffffff;font-size:15px;font-weight:700;margin-bottom:6px">想要一对一深度指导？</div>
    <div style="color:#a78bfa;font-size:13px;margin-bottom:10px">加微信获取个性化职业规划服务</div>
    <div style="color:#60a5fa;font-size:18px;font-weight:800">微信：${wechat}</div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;color:#9ca3af;font-size:11px;line-height:1.8">
    ThinkMake CareerPath · thinkmake.ai<br>
    如不希望接收邮件，请回复 STOP
  </div>

</div>
</body>
</html>`
}

// Escape HTML special characters to prevent XSS in email
function esc(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
