import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { scrapeReddit } from '../../../lib/reddit'
import { sendTelegram } from '../../../lib/telegram'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Ensure tables exist (idempotent) ────────────────────────
async function ensureTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Signal" (
      "id"         TEXT NOT NULL,
      "source"     TEXT NOT NULL,
      "subreddit"  TEXT,
      "category"   TEXT,
      "title"      TEXT NOT NULL,
      "url"        TEXT NOT NULL,
      "content"    TEXT,
      "upvotes"    INTEGER NOT NULL DEFAULT 0,
      "date"       TIMESTAMP(3) NOT NULL,
      "aiScore"    DOUBLE PRECISION,
      "aiAnalysis" JSONB,
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Signal_url_key" ON "Signal"("url")
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SignalReport" (
      "id"          TEXT NOT NULL,
      "reportType"  TEXT NOT NULL,
      "content"     TEXT NOT NULL,
      "signalCount" INTEGER NOT NULL,
      "sentAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SignalReport_pkey" PRIMARY KEY ("id")
    )
  `)
}

// ─── AI: classify + score batch of signals ───────────────────
const CATEGORIES = ['🛠 工具类', '🎨 创意类', '💰 金融类', '🏥 健康类', '📱 生活类', '🔧 其他']

async function scoreSignals(signals) {
  if (!signals.length) return []

  const items = signals
    .map((s, i) => `${i + 1}. 标题: ${s.title}\n   内容: ${(s.content || '').slice(0, 200)}`)
    .join('\n\n')

  const prompt = `你是一个产品机会分析师。分析以下来自Reddit的需求信号，判断每条是否值得做成产品。

需求列表：
${items}

对每条需求输出JSON，字段：
- id: 序号(1开始)
- category: 必须是以下之一: ${CATEGORIES.join(', ')}
- market: 市场规模评分1-10
- feasibility: 技术可行性1-10
- competition: 竞争程度1-10（分越低=竞争越少=越好）
- monetization: 广告/变现潜力1-10
- total: 综合总分1-10
- advice: 一句话建议（中文，不超过30字）

只输出JSON数组，不要其他文字。`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0]?.text || '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return signals.map(s => ({ ...s, aiScore: null, aiAnalysis: null, category: '🔧 其他' }))

    const scores = JSON.parse(jsonMatch[0])
    return signals.map((s, i) => {
      const sc = scores.find(x => x.id === i + 1) || {}
      return {
        ...s,
        category: sc.category || '🔧 其他',
        aiScore: sc.total || null,
        aiAnalysis: sc.total
          ? { market: sc.market, feasibility: sc.feasibility, competition: sc.competition, monetization: sc.monetization, total: sc.total, advice: sc.advice }
          : null,
      }
    })
  } catch (e) {
    console.error('[Score] Claude error:', e.message)
    return signals.map(s => ({ ...s, aiScore: null, aiAnalysis: null, category: '🔧 其他' }))
  }
}

// ─── Format report ────────────────────────────────────────────
function formatReport(signals, reportType) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const label = reportType === 'morning' ? '早报' : '晚报'
  const scored = signals.filter(s => s.aiScore).sort((a, b) => b.aiScore - a.aiScore)

  const top3 = scored.slice(0, 3)
  const lowComp = scored.filter(s => s.aiAnalysis?.competition < 4 && s.aiScore > 7)

  const fmtSignal = s => {
    const analysis = s.aiAnalysis || {}
    return [
      `📌 ${s.title}`,
      `来源：r/${s.subreddit || s.source} | 综合分：${s.aiScore}/10 | 👍${s.upvotes}`,
      analysis.advice ? `💡 ${analysis.advice}` : '',
      `🔗 ${s.url}`,
    ].filter(Boolean).join('\n')
  }

  const byCat = {}
  for (const cat of CATEGORIES) {
    const catSignals = scored.filter(s => s.category === cat).slice(0, 3)
    if (catSignals.length) byCat[cat] = catSignals
  }

  const lines = [
    `═══════════════════════════`,
    `📊 SignalHunt ${label}`,
    `生成时间：${now}`,
    `本期信号总数：${signals.length} 条`,
    `═══════════════════════════`,
    '',
    `🏆 今日 TOP ${top3.length} 机会`,
    ...top3.map((s, i) => `\n[${i + 1}]\n${fmtSignal(s)}`),
    '',
    `─────────────────────────`,
    `按分类展示（每类 TOP 3）`,
    `─────────────────────────`,
  ]

  for (const [cat, catSignals] of Object.entries(byCat)) {
    lines.push(`\n${cat}`)
    catSignals.forEach(s => lines.push(`\n${fmtSignal(s)}`))
  }

  if (lowComp.length) {
    lines.push('')
    lines.push(`─────────────────────────`)
    lines.push(`⚡ 低竞争高潜力（竞争分<4，总分>7）`)
    lowComp.forEach(s => lines.push(`\n${fmtSignal(s)}`))
  }

  lines.push('')
  lines.push(`═══════════════════════════`)

  return lines.join('\n')
}

// ─── Route handler ────────────────────────────────────────────
export async function POST(request) {
  // Verify cron secret
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reportType = 'morning' } = await request.json().catch(() => ({}))

  try {
    if (process.env.DATABASE_URL) await ensureTables()

    // 1. Scrape
    console.log('[Signal] Scraping Reddit...')
    const raw = await scrapeReddit()
    console.log(`[Signal] Fetched ${raw.length} raw posts`)

    // 2. Dedup against DB
    const existingUrls = new Set(
      (await prisma.$queryRawUnsafe(`SELECT url FROM "Signal"`)).map(r => r.url)
    )
    const newSignals = raw.filter(s => !existingUrls.has(s.url))
    console.log(`[Signal] ${newSignals.length} new (${raw.length - newSignals.length} dupes skipped)`)

    // 3. Score new signals in batches of 5
    const BATCH = 5
    const scored = []
    for (let i = 0; i < newSignals.length; i += BATCH) {
      const batch = newSignals.slice(i, i + BATCH)
      const result = await scoreSignals(batch)
      scored.push(...result)
    }

    // 4. Save to DB
    for (const s of scored) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Signal" (id, source, subreddit, category, title, url, content, upvotes, date, "aiScore", "aiAnalysis", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
         ON CONFLICT (url) DO NOTHING`,
        s.source, s.subreddit || null, s.category || null, s.title, s.url,
        s.content || null, s.upvotes, s.date,
        s.aiScore || null, s.aiAnalysis ? JSON.stringify(s.aiAnalysis) : null
      )
    }

    // 5. Query today's top signals for report
    const todaySignals = await prisma.$queryRawUnsafe(`
      SELECT * FROM "Signal"
      WHERE "createdAt" > NOW() - INTERVAL '24 hours'
      ORDER BY "aiScore" DESC NULLS LAST
      LIMIT 50
    `)

    // 6. Generate and push report
    const report = formatReport(todaySignals.length ? todaySignals : scored, reportType)
    await sendTelegram(report)

    // 7. Save report
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SignalReport" (id, "reportType", content, "signalCount", "sentAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())`,
      reportType, report, todaySignals.length || scored.length
    )

    console.log(`[Signal] Done — ${scored.length} new signals, report sent`)
    return NextResponse.json({ ok: true, newSignals: scored.length, total: todaySignals.length })
  } catch (err) {
    console.error('[Signal] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Allow GET for manual test trigger (with secret in query)
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const reportType = searchParams.get('type') || 'morning'
  const fakeReq = new Request(request.url, {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportType }),
  })
  return POST(fakeReq)
}
