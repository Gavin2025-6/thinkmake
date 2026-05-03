import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { scrapeReddit } from '../../../lib/reddit'
import { scrapeHackerNews } from '../../../lib/hackernews'
import { scrapeAppStore } from '../../../lib/appstore'
import { scrapeGooglePlay } from '../../../lib/googleplay'
import { scrapeYouTube } from '../../../lib/youtube'
import { scrapeProductHunt } from '../../../lib/producthunt'
import { clusterSignals } from '../../../lib/cluster'
import { validateWithGitHub, applyScoreAdjustment } from '../../../lib/github'
import { sendTelegram } from '../../../lib/telegram'

// ─── Ensure tables + columns ──────────────────────────────────
async function ensureTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Signal" (
      "id" TEXT NOT NULL, "postId" TEXT, "platform" TEXT NOT NULL DEFAULT 'reddit',
      "source" TEXT NOT NULL, "subreddit" TEXT, "appName" TEXT, "rating" INTEGER,
      "category" TEXT, "title" TEXT NOT NULL, "url" TEXT NOT NULL, "content" TEXT,
      "upvotes" INTEGER NOT NULL DEFAULT 0, "date" TIMESTAMP(3) NOT NULL,
      "aiScore" DOUBLE PRECISION, "aiAnalysis" JSONB, "clusterId" TEXT,
      "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "upvotesHistory" JSONB, "signalType" TEXT NOT NULL DEFAULT 'new',
      "upvoteVelocity" DOUBLE PRECISION, "lastPushedType" TEXT,
      "githubExists" BOOLEAN, "githubStars" INTEGER, "githubUrl" TEXT,
      "freeSolutionScore" DOUBLE PRECISION, "validationStatus" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
    )`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Signal_url_key" ON "Signal"("url")`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Signal_postId_key" ON "Signal"("postId") WHERE "postId" IS NOT NULL`)
  for (const [col, type] of [
    ['"platform"',          `TEXT NOT NULL DEFAULT 'reddit'`],
    ['"appName"',           'TEXT'], ['"rating"', 'INTEGER'], ['"clusterId"', 'TEXT'],
    ['"firstSeen"',         'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['"lastSeen"',          'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['"upvotesHistory"',    'JSONB'],
    ['"signalType"',        `TEXT NOT NULL DEFAULT 'new'`],
    ['"upvoteVelocity"',    'DOUBLE PRECISION'],
    ['"lastPushedType"',    'TEXT'],
    ['"githubExists"',      'BOOLEAN'],
    ['"githubStars"',       'INTEGER'],
    ['"githubUrl"',         'TEXT'],
    ['"freeSolutionScore"', 'DOUBLE PRECISION'],
    ['"validationStatus"',  'TEXT'],
  ]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Signal" ADD COLUMN IF NOT EXISTS ${col} ${type}`)
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SignalCluster" (
      "id" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT,
      "clusterSize" INTEGER NOT NULL DEFAULT 1,
      "totalSignalStrength" INTEGER NOT NULL DEFAULT 0,
      "sourcesCount" INTEGER NOT NULL DEFAULT 0, "platforms" JSONB,
      "dayStreak" INTEGER NOT NULL DEFAULT 1, "lastStreakDate" TEXT,
      "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "trendAlerted" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SignalCluster_pkey" PRIMARY KEY ("id")
    )`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SignalReport" (
      "id" TEXT NOT NULL, "reportType" TEXT NOT NULL, "content" TEXT NOT NULL,
      "signalCount" INTEGER NOT NULL,
      "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SignalReport_pkey" PRIMARY KEY ("id")
    )`)
}

// ─── Rule-based scoring (zero API cost) ──────────────────────
const CATEGORY_RULES = [
  { cat: '🛠 工具类', words: ['tool','tools','software','plugin','extension','utility',
      'editor','converter','manager','tracker','scanner','reader','parser','automation','workflow'] },
  { cat: '🎨 创意类', words: ['image','video','audio','photo','music','design','art',
      'creative','edit','record','draw','animation','render','podcast','stream','color','font'] },
  { cat: '💰 金融类', words: ['money','finance','budget','tax','invoice','payment',
      'accounting','expense','cost','billing','subscription','revenue','salary','bank','crypto'] },
  { cat: '🏥 健康类', words: ['health','fitness','workout','diet','sleep','medical',
      'wellness','exercise','calories','weight','yoga','therapy','mental','nutrition'] },
]

function detectCategory(text) {
  const lower = text.toLowerCase()
  for (const { cat, words } of CATEGORY_RULES) {
    if (words.some(w => lower.includes(w))) return cat
  }
  return '📱 生活类'
}

// Returns null for low-signal noise (upvotes < 5)
function ruleScore(signal) {
  const u = signal.upvotes || 0
  if (u < 5) return null

  let score
  if (u > 100)     score = 10
  else if (u > 50) score = 8
  else if (u > 20) score = 6
  else             score = 4

  const text = `${signal.title} ${signal.content || ''}`
  return { ...signal, aiScore: score, category: detectCategory(text), aiAnalysis: null }
}

// Build advice text after GitHub validation result is known
const ADVICE = {
  blank:   '市场空白，无成熟免费方案，值得考虑',
  weak:    '有竞品但存在差异化空间',
  covered: '市场已有成熟方案，慎入',
  none:    '市场信号真实，竞争情况待验证',
}

function buildAnalysis(signal) {
  const advice = ADVICE[signal.validationStatus || 'none']
  return { ...signal, aiAnalysis: { total: signal.aiScore, advice } }
}

// ─── GitHub validation ────────────────────────────────────────
const DELAY = ms => new Promise(r => setTimeout(r, ms))

async function runGitHubValidation(signals) {
  // Only validate high-score new signals; max 10 per run to stay within rate limits
  const toValidate = signals.filter(s => (s.aiScore || 0) >= 6).slice(0, 10)
  if (!toValidate.length) return signals

  const delayMs = process.env.GITHUB_TOKEN ? 200 : 700
  const resultMap = new Map()

  for (const sig of toValidate) {
    const result = await validateWithGitHub(sig.title)
    if (result) resultMap.set(sig.url, result)
    await DELAY(delayMs)
  }

  return signals.map(s => {
    const v = resultMap.get(s.url)
    if (!v) return s
    return applyScoreAdjustment({ ...s, ...v })
  })
}

// ─── Freshness helpers ────────────────────────────────────────
function calcVelocity(history, now) {
  if (!history || history.length < 2) return 0
  const last24 = history.filter(h => now - new Date(h.t) < 86_400_000)
  if (last24.length < 2) return 0
  const h = (new Date(last24.at(-1).t) - new Date(last24[0].t)) / 3_600_000
  return h < 0.5 ? 0 : ((last24.at(-1).v - last24[0].v) / h) * 24
}

function calcSignalType(firstSeen, aiScore, velocity) {
  const ageH = (Date.now() - new Date(firstSeen)) / 3_600_000
  if (ageH < 24) return 'new'
  if (velocity > 50) return 'rising'
  if (ageH > 72 && (aiScore || 0) >= 7) return 'persistent'
  return 'new'
}

// ─── Clustering ───────────────────────────────────────────────
async function runClustering(newSignals) {
  if (!newSignals.length) return

  const existingClusters = await prisma.$queryRawUnsafe(
    `SELECT id, name, category, "clusterSize", "totalSignalStrength", "sourcesCount",
             platforms, "dayStreak", "lastStreakDate"
     FROM "SignalCluster" ORDER BY "lastSeen" DESC LIMIT 50`
  )

  const assignments = await clusterSignals(newSignals, existingClusters)
  if (!assignments.length) return

  const today = new Date().toISOString().slice(0, 10)

  for (const a of assignments) {
    const sig = newSignals[a.idx - 1]
    if (!sig) continue

    if (a.action === 'new' && a.clusterName) {
      const clusterId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      await prisma.$executeRawUnsafe(`
        INSERT INTO "SignalCluster"
          (id, name, category, "clusterSize", "totalSignalStrength", "sourcesCount",
           platforms, "dayStreak", "lastStreakDate", "firstSeen", "lastSeen", "createdAt")
        VALUES ($1,$2,$3,1,$4,1,$5::jsonb,1,$6,NOW(),NOW(),NOW())`,
        clusterId, a.clusterName, sig.category || null,
        sig.upvotes || 0, JSON.stringify([sig.platform]), today
      )
      if (sig.url) await prisma.$executeRawUnsafe(
        `UPDATE "Signal" SET "clusterId" = $1 WHERE url = $2`, clusterId, sig.url
      )
    } else if (a.action === 'match' && a.clusterId) {
      const cluster = existingClusters.find(c => c.id === a.clusterId)
      if (!cluster) continue
      const platforms = [...new Set([...(Array.isArray(cluster.platforms) ? cluster.platforms : []), sig.platform])]
      const lastStreak = cluster.lastStreakDate
      const newStreak = lastStreak === today ? cluster.dayStreak
        : lastStreak === new Date(Date.now() - 86400000).toISOString().slice(0, 10)
          ? cluster.dayStreak + 1 : 1
      await prisma.$executeRawUnsafe(`
        UPDATE "SignalCluster" SET
          "clusterSize" = "clusterSize" + 1,
          "totalSignalStrength" = "totalSignalStrength" + $1,
          "sourcesCount" = $2,
          platforms = $3::jsonb,
          "dayStreak" = $4,
          "lastStreakDate" = $5,
          "lastSeen" = NOW()
        WHERE id = $6`,
        sig.upvotes || 0, platforms.length,
        JSON.stringify(platforms), newStreak, today, a.clusterId
      )
      if (sig.url) await prisma.$executeRawUnsafe(
        `UPDATE "Signal" SET "clusterId" = $1 WHERE url = $2`, a.clusterId, sig.url
      )
    }
  }
}

// ─── Trend alerts ─────────────────────────────────────────────
async function checkTrendAlerts() {
  const alerts = await prisma.$queryRawUnsafe(`
    SELECT * FROM "SignalCluster"
    WHERE "dayStreak" >= 7 AND "trendAlerted" = false AND "totalSignalStrength" > 20
  `)
  const messages = []
  for (const c of alerts) {
    messages.push(
      `⚠️ 趋势预警：${c.name}\n` +
      `连续 ${c.dayStreak} 天出现，累计 ${c.clusterSize} 条信号\n` +
      `来自 ${c.sourcesCount} 个平台，总热度 ${c.totalSignalStrength}`
    )
    await prisma.$executeRawUnsafe(
      `UPDATE "SignalCluster" SET "trendAlerted" = true WHERE id = $1`, c.id
    )
  }
  return messages
}

// ─── Report format ────────────────────────────────────────────
const PLATFORM_ICON = {
  reddit: '👾', hackernews: '🟠', appstore: '🍎',
  googleplay: '🤖', youtube: '▶️', producthunt: '🐱',
}

const VALIDATION_LABEL = {
  blank:   '✅ 验证空白',
  weak:    '⚠️ 有竞品',
  covered: '❌ 已有免费',
}

function fmtSignal(s) {
  const a = s.aiAnalysis || {}
  const icon = PLATFORM_ICON[s.platform] || '📡'
  const vel = s.upvoteVelocity > 0 ? ` ↑${Math.round(s.upvoteVelocity)}/天` : ''
  const validation = s.validationStatus
    ? VALIDATION_LABEL[s.validationStatus]
    : a.competition != null
      ? a.competition < 4 ? '✅ 空白' : a.competition < 7 ? '⚠️ 有竞品' : '❌ 已有免费'
      : ''
  const github = s.githubExists && s.githubUrl ? ` | ⭐${s.githubStars} ${s.githubUrl}` : ''
  return [
    s.title,
    `${icon} 来源 | 热度：${s.upvotes}${vel} | ${validation}${github}`,
    a.advice ? `💡 ${a.advice}` : '',
    `🔗 ${s.url}`,
  ].filter(Boolean).join('\n')
}

function formatReport(signals, reportType, trendAlerts) {
  const nowCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const nowCA = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })
  const label = reportType === 'morning' ? '早报' : '晚报'

  const byType = type => signals.filter(s => s.signalType === type)
  const newSigs    = byType('new').sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0)).slice(0, 5)
  const risingSigs = byType('rising').sort((a, b) => (b.upvoteVelocity || 0) - (a.upvoteVelocity || 0)).slice(0, 3)
  const persSigs   = byType('persistent').sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)).slice(0, 3)
  // verified blank = validationStatus blank OR competition < 4, and high score
  const verified = signals.filter(s =>
    (s.validationStatus === 'blank' || (!s.validationStatus && (s.aiAnalysis?.competition ?? 10) < 4)) &&
    (s.aiScore || 0) > 7
  ).sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)).slice(0, 3)

  const sec = (header, list) => {
    if (!list.length) return []
    return ['', header, ...list.map(s => `\n${fmtSignal(s)}`)]
  }

  const lines = [
    `═══════════════════════════`,
    `📊 SignalHunt ${label}`,
    `🕐 多伦多 ${nowCA} / 北京 ${nowCN}`,
    `本期信号：${signals.length} 条`,
    `═══════════════════════════`,
    ...sec(`🆕 今日新信号 [${newSigs.length}条]\n过去24小时新出现的需求`, newSigs),
    ...sec(`🔥 热度上升 [${risingSigs.length}条]\n今日 upvote 暴涨`, risingSigs),
    ...sec(`📊 持续热门 [${persSigs.length}条]\n连续多天高分`, persSigs),
    ...sec(`✅ 已验证空白 — 最高价值 [${verified.length}条]\n无免费方案 + 高热度`, verified),
  ]

  if (trendAlerts?.length) {
    lines.push('', `─────────────────────────`, `⚠️ 本周趋势预警`)
    trendAlerts.forEach(a => lines.push(`\n${a}`))
  }

  lines.push('', `═══════════════════════════`)
  return lines.join('\n')
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

    // ── 1. Scrape all sources in parallel ─────────────────────
    console.log('[Signal] Scraping all sources...')
    const [reddit, hn, appstore, gplay, yt, ph] = await Promise.allSettled([
      scrapeReddit(), scrapeHackerNews(), scrapeAppStore(),
      scrapeGooglePlay(), scrapeYouTube(), scrapeProductHunt(),
    ])
    const raw = [
      ...(reddit.value    || []),
      ...(hn.value        || []),
      ...(appstore.value  || []),
      ...(gplay.value     || []),
      ...(yt.value        || []),
      ...(ph.value        || []),
    ]
    const srcCounts = {
      reddit:       reddit.value?.length    || 0,
      hn:           hn.value?.length        || 0,
      appstore:     appstore.value?.length  || 0,
      gplay:        gplay.value?.length     || 0,
      youtube:      yt.value?.length        || 0,
      producthunt:  ph.value?.length        || 0,
    }
    console.log('[Signal] Raw:', srcCounts)

    // ── 2. Dedup ──────────────────────────────────────────────
    const urls = raw.map(r => r.url)
    const existing = urls.length
      ? await prisma.$queryRawUnsafe(`SELECT * FROM "Signal" WHERE url = ANY($1::text[])`, urls)
      : []
    const existingByUrl = Object.fromEntries(existing.map(e => [e.url, e]))

    const now = new Date()
    const toScore = [], toUpdate = []

    for (const post of raw) {
      const ex = existingByUrl[post.url]
      if (!ex) {
        toScore.push(post)
      } else {
        const history = Array.isArray(ex.upvotesHistory) ? ex.upvotesHistory : []
        history.push({ t: now.toISOString(), v: post.upvotes })
        const velocity = calcVelocity(history, now)
        toUpdate.push({ ...ex, upvotes: post.upvotes, upvotesHistory: history,
          upvoteVelocity: velocity,
          signalType: calcSignalType(ex.firstSeen, ex.aiScore, velocity) })
      }
    }

    // ── 3. Rule-based scoring (zero API cost) ────────────────
    let scored = toScore.map(ruleScore).filter(Boolean)
    console.log(`[Signal] Rule-scored: ${scored.length}/${toScore.length} (${toScore.length - scored.length} discarded, upvotes<5)`)

    // ── 4. GitHub validation + build advice ───────────────────
    if (scored.length) {
      console.log('[Signal] Running GitHub validation...')
      scored = await runGitHubValidation(scored)
      scored = scored.map(buildAnalysis)
    }

    // ── 5. Insert new ─────────────────────────────────────────
    for (const s of scored) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Signal"
          (id,"postId",platform,source,subreddit,"appName",rating,category,title,url,content,
           upvotes,date,"aiScore","aiAnalysis","firstSeen","lastSeen","upvotesHistory","signalType",
           "upvoteVelocity","githubExists","githubStars","githubUrl","freeSolutionScore",
           "validationStatus","createdAt")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,
                NOW(),NOW(),$15::jsonb,'new',0,$16,$17,$18,$19,$20,NOW())
        ON CONFLICT (url) DO NOTHING`,
        s.postId||null, s.platform||'reddit', s.source, s.subreddit||null,
        s.appName||null, s.rating||null, s.category||null, s.title, s.url, s.content||null,
        s.upvotes, s.date, s.aiScore||null,
        s.aiAnalysis ? JSON.stringify(s.aiAnalysis) : null,
        JSON.stringify([{ t: now.toISOString(), v: s.upvotes }]),
        s.githubExists ?? null, s.githubStars ?? null, s.githubUrl || null,
        s.freeSolutionScore ?? null, s.validationStatus || null
      )
    }

    // ── 6. Update existing ────────────────────────────────────
    for (const s of toUpdate) {
      await prisma.$executeRawUnsafe(`
        UPDATE "Signal" SET upvotes=$1,"lastSeen"=NOW(),"upvotesHistory"=$2::jsonb,
          "upvoteVelocity"=$3,"signalType"=$4 WHERE url=$5`,
        s.upvotes, JSON.stringify(s.upvotesHistory), s.upvoteVelocity, s.signalType, s.url
      )
    }

    // ── 7. Cluster new signals ────────────────────────────────
    if (scored.length) await runClustering(scored)

    // ── 8. Trend alerts ───────────────────────────────────────
    const trendAlerts = await checkTrendAlerts()

    // ── 9. Build + push report ────────────────────────────────
    const active = await prisma.$queryRawUnsafe(`
      SELECT * FROM "Signal" WHERE "lastSeen" > NOW() - INTERVAL '48 hours'
      ORDER BY "aiScore" DESC NULLS LAST LIMIT 100`)

    const toPush = active.filter(s => !s.lastPushedType || s.signalType !== s.lastPushedType)
    console.log(`[Signal] active:${active.length} toPush:${toPush.length} trendAlerts:${trendAlerts.length}`)
    if (!toPush.length && !trendAlerts.length) {
      console.log('[Signal] Nothing to push')
      return NextResponse.json({ ok: true, sources: srcCounts, newSignals: scored.length, pushed: 0 })
    }

    const report = formatReport(active, reportType, trendAlerts)
    console.log('[Signal] Sending Telegram report...')
    await sendTelegram(report)

    for (const s of toPush) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Signal" SET "lastPushedType"=$1 WHERE id=$2`, s.signalType, s.id
      )
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SignalReport" (id,"reportType",content,"signalCount","sentAt")
       VALUES (gen_random_uuid()::text,$1,$2,$3,NOW())`,
      reportType, report, active.length
    )

    console.log(`[Signal] Done — new:${scored.length} updated:${toUpdate.length} pushed:${toPush.length}`)
    console.log('[Cost] API调用：0次，费用：$0.00')
    return NextResponse.json({ ok: true, sources: srcCounts, newSignals: scored.length, updated: toUpdate.length, pushed: toPush.length })
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
  const fakeReq = new Request(request.url, {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportType: searchParams.get('type') || 'morning' }),
  })
  return POST(fakeReq)
}
