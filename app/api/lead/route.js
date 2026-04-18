import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { prisma } from '../../lib/prisma'

export async function POST(request) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const body = await request.json()
    const { email, wechat, sessionId, summaryText, consent } = body

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
        await prisma.lead.upsert({
          where: { email: normalizedEmail },
          update: {
            wechat: wechat || undefined,
            conversationId: sessionId || 'direct',
          },
          create: {
            email: normalizedEmail,
            wechat: wechat || null,
            conversationId: sessionId || 'direct',
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
      const html = buildSummaryEmail(normalizedEmail, summaryText)
      const result = await resend.emails.send({
        from: 'ThinkMake CareerPath <onboarding@resend.dev>',
        to: normalizedEmail,
        subject: '你的加拿大职业规划报告 — ThinkMake CareerPath',
        html,
      })
      if (result.error) {
        console.error('[Lead] Email error:', result.error)
      } else {
        emailSent = true
      }
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

function buildSummaryEmail(email, summaryText) {
  // Convert markdown to basic HTML
  const html = summaryText
    .replace(/^## (.+)$/gm, '<h2 style="color:#1a1a1a;margin:24px 0 8px">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="color:#2563eb;margin:16px 0 6px">$1</h3>')
    .replace(/^\*\*(.+)\*\*$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin:4px 0"><strong>$1.</strong> $2</li>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0">')
    .replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a">
  <div style="border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:24px">
    <span style="font-size:22px;font-weight:800">ThinkMake</span>
    <span style="color:#2563eb;font-size:22px;font-weight:800">CareerPath</span>
    <div style="color:#666;font-size:13px;margin-top:4px">加拿大华人职业规划</div>
  </div>

  <div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:12px 16px;margin-bottom:24px;border-radius:0 8px 8px 0">
    你好！这是你的专属职业规划报告，基于我们的对话内容生成。
  </div>

  <div style="line-height:1.7">
    <p style="margin:8px 0">${html}</p>
  </div>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">
    <div style="background:#1a1a2e;color:white;padding:20px;border-radius:12px;text-align:center">
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">需要一对一深度指导？</div>
      <div style="color:#93c5fd;font-size:13px">加微信获取个性化职业规划服务</div>
      <div style="font-size:18px;font-weight:700;margin-top:8px;color:#60a5fa">
        微信号：${process.env.WECHAT_CONTACT || 'thinkmake_ca'}
      </div>
    </div>
  </div>

  <div style="margin-top:24px;color:#9ca3af;font-size:11px;text-align:center">
    © ThinkMake CareerPath · thinkmake.ai<br>
    如不希望接收邮件，请回复 STOP
  </div>
</body>
</html>`
}
