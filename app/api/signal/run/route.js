import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { scrapeReddit } from '../../../lib/reddit'
import { sendTelegram } from '../../../lib/telegram'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Ensure tables + columns exist (idempotent) ───────────────
async function ensureTables() {
  // Create Signal table
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
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Signal_url_key" ON "Signal"("url")`
  )
  // Freshness columns — safe to run every time
  const newCols = [
    [`"postId"`,          `TEXT`],
    [`"firstSeen"`,       `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`],
    [`"lastSeen"`,        `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`],
    [`"upvotesHistory"`,  `JSONB`],
    [`"signalType"`,      `TEXT NOT NULL DEFAULT 'new'`],
    [`"upvoteVelocity"`,  `DOUBLE PRECISION`],
    [`"lastPushedType"`,  `TEXT`],
  ]
  for (const [col, type] of newCols) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Signal" ADD COLUMN IF NOT EXISTS ${col} ${type}`
    )
  }
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Signal_postId_key" ON "Signal"("postId") WHERE "postId" IS NOT NULL`
  )
  // SignalReport table
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

  const prompt = `你是产品机会分析师。分析以下Reddit需求信号。

需求列表：
${items}

对每条输出JSON，字段：
- id: 序号(1开始)
- category: 必须是以下之一: ${CATEGORIES.join(', ')}
- market: 市场规模1-10
- feasibility: 技术可行性1-10
- competition: 竞争程度1-10（越低=竞争越少=越好）
- monetization: 变现潜力1-10
- total: 综合总分1-10
- advice: 一句话建议（中文，不超过30字）

只输出JSON数组。`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0]?.text || '[]'
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in response')
    const scores = JSON.parse(match[0])
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

// ─── Freshness helpers ────────────────────────────────────────
function calcVelocity(history, now) {
  if (!history || history.length < 2) return 0
  const nowMs = now.getTime()
  const last24 = history.filter(h => nowMs - new Date(h.t).getTime() < 86_400_000)
  if (last24.length < 2) return 0
  const oldest = last24[0]
  const newest = last24[last24.length - 1]
  const hours = (new Date(newest.t) - new Date(oldest.t)) / 3_600_000
  if (hours < 0.5) return 0
  return ((newest.v - oldest.v) / hours) * 24
}

function calcSignalType(firstSeen, aiScore, velocity) {
  const ageHours = (Date.now() - new Date(firstSeen).getTime()) / 3_600_000
  if (ageHours < 24) return 'new'
  if (velocity > 50) return 'rising'
  if (ageHours > 72 && (aiScore || 0) >= 7) return 'persistent'
  return 'new'
}

// ─── Format report ────────────────────────────────────────────
function fmtSignal(s, tag = '') {
  const a = s.aiAnalysis || {}
  const typeTag = tag ? `[${tag}] ` : ''
  const vel = s.upvoteVelocity ? ` | ↑${Math.round(s.upvoteVelocity)}/天` : ''
  return [
    `📌 ${typeTag}${s.title}`,
    `来源：r/${s.subreddit || s.source} | 综合分：${s.aiScore ? s.aiScore + '/10' : 'N/A'} | 👍${s.upvotes}${vel}`,
    a.advice ? `💡 ${a.advice}` : '',
    `🔗 ${s.url}`,
  ].filter(Boolean).join('\n')
}

function formatReport(allSignals, reportType) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const label = reportType === 'morning' ? '早报' : '晚报'

  const newSigs       = allSignals.filter(s => s.signalType === 'new')
  const risingSigs    = allSignals.filter(s => s.signalType === 'rising').sort((a, b) => (b.upvoteVelocity || 0) - (a.upvoteVelocity || 0))
  const persistSigs   = allSignals.filter(s => s.signalType === 'persistent').sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0))
  const verified      = allSignals.filter(s => s.aiAnalysis?.competition < 4 && s.aiScore > 7)

  const section = (header, signals, tag = '', limit = 5) => {
    if (!signals.length) return []
    return [
      '',
      header,
      ...signals.slice(0, limit).map(s => `\n${fmtSignal(s, tag)}`),
    ]
  }

  return [
    `═══════════════════════════`,
    `📊 SignalHunt ${label}`,
    `生成时间：${now}`,
    `本期信号总数：${allSignals.length} 条`,
    `═══════════════════════════`,
    ...section(`🆕 今日新信号 [${newSigs.length}条]\n过去24小时新出现的需求`, newSigs),
    ...section(`🔥 热度上升 [${risingSigs.length}条]\n今日 upvote 暴涨，市场正在关注`, risingSigs),
    ...section(`📊 持续热门 [${persistSigs.length}条]\n连续多天高分，长期真实需求`, persistSigs),
    ...section(`✅ 已验证空白（竞争分<4，综合>7）`, verified),
    '',
    `═══════════════════════════`,
  ].join('\n')
}

// ─── Route handler ────────────────────────────────────────────
export async function POST(request) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reportType = 'morning' } = await request.json().catch(() => ({}))

  try {
    if (process.env.DATABASE_URL) await ensureTables()

    // ── 1. Scrape ─────────────────────────────────────────────
    console.log('[Signal] Scraping Reddit...')
    const raw = await scrapeReddit()
    console.log(`[Signal] Fetched ${raw.length} raw posts`)

    // ── 2. Load existing records ──────────────────────────────
    const urls = raw.map(r => r.url)
    const existing = urls.length
      ? await prisma.$queryRawUnsafe(
          `SELECT * FROM "Signal" WHERE url = ANY($1::text[])`,
          urls
        )
      : []
    const existingByUrl = Object.fromEntries(existing.map(e => [e.url, e]))

    const now = new Date()
    const toScore = []   // brand-new, need AI scoring
    const toUpdate = []  // existing, update freshness only

    for (const post of raw) {
      const ex = existingByUrl[post.url]
      if (!ex) {
        toScore.push(post)
      } else {
        const history = Array.isArray(ex.upvotesHistory) ? ex.upvotesHistory : []
        history.push({ t: now.toISOString(), v: post.upvotes })
        const velocity = calcVelocity(history, now)
        const signalType = calcSignalType(ex.firstSeen, ex.aiScore, velocity)
        toUpdate.push({ ...ex, upvotes: post.upvotes, upvotesHistory: history, upvoteVelocity: velocity, signalType })
      }
    }

    // ── 3. Score new signals ──────────────────────────────────
    const BATCH = 5
    const scored = []
    for (let i = 0; i < toScore.length; i += BATCH) {
      const result = await scoreSignals(toScore.slice(i, i + BATCH))
      scored.push(...result)
    }

    // ── 4. Insert new ─────────────────────────────────────────
    for (const s of scored) {
      const hist = JSON.stringify([{ t: now.toISOString(), v: s.upvotes }])
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Signal"
          (id, "postId", source, subreddit, category, title, url, content, upvotes, date,
           "aiScore", "aiAnalysis", "firstSeen", "lastSeen",
           "upvotesHistory", "signalType", "upvoteVelocity", "createdAt")
        VALUES
          (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11::jsonb, NOW(), NOW(),
           $12::jsonb, 'new', 0, NOW())
        ON CONFLICT (url) DO NOTHING`,
        s.postId || null, s.source, s.subreddit || null, s.category || null,
        s.title, s.url, s.content || null, s.upvotes, s.date,
        s.aiScore || null, s.aiAnalysis ? JSON.stringify(s.aiAnalysis) : null,
        hist
      )
    }

    // ── 5. Update existing ────────────────────────────────────
    for (const s of toUpdate) {
      await prisma.$executeRawUnsafe(`
        UPDATE "Signal"
        SET upvotes = $1, "lastSeen" = NOW(),
            "upvotesHistory" = $2::jsonb,
            "upvoteVelocity" = $3,
            "signalType" = $4
        WHERE url = $5`,
        s.upvotes,
        JSON.stringify(s.upvotesHistory),
        s.upvoteVelocity,
        s.signalType,
        s.url
      )
    }

    // ── 6. Decide what to push ────────────────────────────────
    // Push: new (never pushed) + upgraded signals
    const allActive = await prisma.$queryRawUnsafe(`
      SELECT * FROM "Signal"
      WHERE "lastSeen" > NOW() - INTERVAL '48 hours'
      ORDER BY "aiScore" DESC NULLS LAST
      LIMIT 100
    `)

    const toPush = allActive.filter(s => {
      if (!s.lastPushedType) return true           // never pushed
      if (s.signalType !== s.lastPushedType) return true  // upgraded
      return false
    })

    if (!toPush.length) {
      console.log('[Signal] Nothing new to push')
      return NextResponse.json({ ok: true, newSignals: scored.length, pushed: 0 })
    }

    // Mark upgrade signals
    const withTag = toPush.map(s => ({
      ...s,
      pushTag: s.lastPushedType && s.signalType !== s.lastPushedType ? '信号升级' : '',
    }))

    // ── 7. Format + send report ───────────────────────────────
    const report = formatReport(withTag, reportType)
    await sendTelegram(report)

    // ── 8. Mark as pushed ─────────────────────────────────────
    for (const s of toPush) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Signal" SET "lastPushedType" = $1 WHERE id = $2`,
        s.signalType, s.id
      )
    }

    // ── 9. Save report ────────────────────────────────────────
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SignalReport" (id, "reportType", content, "signalCount", "sentAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())`,
      reportType, report, toPush.length
    )

    console.log(`[Signal] Done — ${scored.length} new, ${toUpdate.length} updated, ${toPush.length} pushed`)
    return NextResponse.json({ ok: true, newSignals: scored.length, updated: toUpdate.length, pushed: toPush.length })
  } catch (err) {
    console.error('[Signal] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

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
