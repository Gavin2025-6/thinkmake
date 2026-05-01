import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { scrapeReddit } from '../../../lib/reddit'
import { scrapeHackerNews } from '../../../lib/hackernews'
import { scrapeAppStore } from '../../../lib/appstore'
import { scrapeGooglePlay } from '../../../lib/googleplay'
import { scrapeYouTube } from '../../../lib/youtube'
import { clusterSignals } from '../../../lib/cluster'
import { sendTelegram } from '../../../lib/telegram'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Ensure tables + columns ──────────────────────────────────
async function ensureTables() {
  // Signal table
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
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
    )`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Signal_url_key" ON "Signal"("url")`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Signal_postId_key" ON "Signal"("postId") WHERE "postId" IS NOT NULL`)
  // Add any missing columns idempotently
  for (const [col, type] of [
    ['"platform"', `TEXT NOT NULL DEFAULT 'reddit'`],
    ['"appName"', 'TEXT'], ['"rating"', 'INTEGER'], ['"clusterId"', 'TEXT'],
    ['"firstSeen"', 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['"lastSeen"', 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['"upvotesHistory"', 'JSONB'], ['"signalType"', `TEXT NOT NULL DEFAULT 'new'`],
    ['"upvoteVelocity"', 'DOUBLE PRECISION'], ['"lastPushedType"', 'TEXT'],
  ]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Signal" ADD COLUMN IF NOT EXISTS ${col} ${type}`)
  }

  // SignalCluster table
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

  // SignalReport table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SignalReport" (
      "id" TEXT NOT NULL, "reportType" TEXT NOT NULL, "content" TEXT NOT NULL,
      "signalCount" INTEGER NOT NULL,
      "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SignalReport_pkey" PRIMARY KEY ("id")
    )`)
}

// ─── AI scoring ───────────────────────────────────────────────
const CATEGORIES = ['🛠 工具类', '🎨 创意类', '💰 金融类', '🏥 健康类', '📱 生活类', '🔧 其他']

async function scoreSignals(signals) {
  if (!signals.length) return []
  const items = signals.map((s, i) =>
    `${i + 1}. [${s.platform}] ${s.title}\n   ${(s.content || '').slice(0, 150)}`
  ).join('\n\n')

  const prompt = `产品机会分析师。分析这些来自不同平台的用户需求信号。

${items}

每条输出JSON：id(1开始), category(${CATEGORIES.join('/')}), market(1-10), feasibility(1-10), competition(1-10,越低竞争越少), monetization(1-10), total(1-10), advice(中文≤30字)

只输出JSON数组。`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    const match = (res.content[0]?.text || '').match(/\[[\s\S]*\]/)
    if (!match) throw new Error('no JSON')
    const scores = JSON.parse(match[0])
    return signals.map((s, i) => {
      const sc = scores.find(x => x.id === i + 1) || {}
      return { ...s, category: sc.category || '🔧 其他', aiScore: sc.total || null,
        aiAnalysis: sc.total ? { market: sc.market, feasibility: sc.feasibility, competition: sc.competition, monetization: sc.monetization, total: sc.total, advice: sc.advice } : null }
    })
  } catch (e) {
    console.error('[Score]', e.message)
    return signals.map(s => ({ ...s, aiScore: null, aiAnalysis: null, category: '🔧 其他' }))
  }
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
    `SELECT id, name, category, "clusterSize", "totalSignalStrength", "sourcesCount", platforms, "dayStreak", "lastStreakDate"
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
        sig.upvotes || 0,
        JSON.stringify([sig.platform]),
        today
      )
      if (sig.url) {
        await prisma.$executeRawUnsafe(
          `UPDATE "Signal" SET "clusterId" = $1 WHERE url = $2`, clusterId, sig.url
        )
      }
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
      if (sig.url) {
        await prisma.$executeRawUnsafe(
          `UPDATE "Signal" SET "clusterId" = $1 WHERE url = $2`, a.clusterId, sig.url
        )
      }
    }
  }
}

// ─── Trend alerts ─────────────────────────────────────────────
async function checkTrendAlerts() {
  const alerts = await prisma.$queryRawUnsafe(`
    SELECT * FROM "SignalCluster"
    WHERE "dayStreak" >= 7 AND "trendAlerted" = false
    AND "totalSignalStrength" > 20
  `)
  const messages = []
  for (const c of alerts) {
    messages.push(
      `⚠️ 趋势预警：${c.name}\n` +
      `连续 ${c.dayStreak} 天出现，累计 ${c.clusterSize} 条信号\n` +
      `来自 ${c.sourcesCount} 个平台，总热度 ${c.totalSignalStrength}\n` +
      `建议：值得认真考虑`
    )
    await prisma.$executeRawUnsafe(
      `UPDATE "SignalCluster" SET "trendAlerted" = true WHERE id = $1`, c.id
    )
  }
  return messages
}

// ─── Report format ────────────────────────────────────────────
const PLATFORM_ICON = { reddit: '👾', hackernews: '🟠', appstore: '🍎', googleplay: '🤖', youtube: '▶️' }

function fmtSignal(s, tag = '') {
  const a = s.aiAnalysis || {}
  const icons = [s.platform].map(p => PLATFORM_ICON[p] || '📡').join('')
  const vel = s.upvoteVelocity > 0 ? ` ↑${Math.round(s.upvoteVelocity)}/天` : ''
  const validity = a.competition != null
    ? a.competition < 4 ? '✅空白' : a.competition < 7 ? '⚠️有竞品' : '❌已有免费'
    : ''
  return [
    tag ? `[${tag}] ${s.title}` : s.title,
    `${icons} 来源 | 热度：${s.upvotes}${vel} | ${validity}`,
    a.advice ? `💡 ${a.advice}` : '',
    `🔗 ${s.url}`,
  ].filter(Boolean).join('\n')
}

function formatReport(signals, reportType, trendAlerts) {
  const nowCN  = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const nowCA  = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' })
  const label  = reportType === 'morning' ? '早报' : '晚报'

  const byType = type => signals.filter(s => s.signalType === type)
  const newSigs    = byType('new').sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0)).slice(0, 5)
  const risingSigs = byType('rising').sort((a, b) => (b.upvoteVelocity || 0) - (a.upvoteVelocity || 0)).slice(0, 3)
  const persSigs   = byType('persistent').sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)).slice(0, 3)
  const verified   = signals.filter(s => s.aiAnalysis?.competition < 4 && s.aiScore > 7)
    .sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)).slice(0, 3)

  const sec = (header, list, tag = '') => {
    if (!list.length) return []
    return ['', header, ...list.map(s => `\n${fmtSignal(s, tag)}`)]
  }

  const lines = [
    `═══════════════════════════`,
    `📊 SignalHunt ${label}`,
    `🕐 多伦多 ${nowCA} / 北京 ${nowCN}`,
    `本期信号：${signals.length} 条`,
    `═══════════════════════════`,
    ...sec(`🆕 今日新信号 [${newSigs.length}条]\n过去24小时新出现的需求`, newSigs),
    ...sec(`🔥 热度上升 [${risingSigs.length}条]\n今日 upvote 暴涨`, risingSigs),
    ...sec(`📊 持续热门 [${persSigs.length}条]\n连续多天高分，长期真实需求`, persSigs),
    ...sec(`✅ 已验证空白 — 最高价值\n无免费方案 + 高热度 [${verified.length}条]`, verified),
  ]

  if (trendAlerts?.length) {
    lines.push('', `─────────────────────────`)
    lines.push(`⚠️ 本周趋势预警`)
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
    const [reddit, hn, appstore, gplay, yt] = await Promise.allSettled([
      scrapeReddit(), scrapeHackerNews(), scrapeAppStore(), scrapeGooglePlay(), scrapeYouTube(),
    ])
    const raw = [
      ...(reddit.value   || []),
      ...(hn.value       || []),
      ...(appstore.value || []),
      ...(gplay.value    || []),
      ...(yt.value       || []),
    ]
    const srcCounts = {
      reddit: reddit.value?.length   || 0,
      hn: hn.value?.length           || 0,
      appstore: appstore.value?.length || 0,
      gplay: gplay.value?.length     || 0,
      youtube: yt.value?.length      || 0,
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
          upvoteVelocity: velocity, signalType: calcSignalType(ex.firstSeen, ex.aiScore, velocity) })
      }
    }

    // ── 3. Score new signals (batch=5) ────────────────────────
    const BATCH = 5
    const scored = []
    for (let i = 0; i < toScore.length; i += BATCH) {
      scored.push(...await scoreSignals(toScore.slice(i, i + BATCH)))
    }

    // ── 4. Insert new ─────────────────────────────────────────
    for (const s of scored) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Signal"
          (id,"postId",platform,source,subreddit,"appName",rating,category,title,url,content,
           upvotes,date,"aiScore","aiAnalysis","firstSeen","lastSeen","upvotesHistory","signalType","upvoteVelocity","createdAt")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,NOW(),NOW(),$15::jsonb,'new',0,NOW())
        ON CONFLICT (url) DO NOTHING`,
        s.postId||null, s.platform||'reddit', s.source, s.subreddit||null,
        s.appName||null, s.rating||null, s.category||null, s.title, s.url, s.content||null,
        s.upvotes, s.date, s.aiScore||null,
        s.aiAnalysis ? JSON.stringify(s.aiAnalysis) : null,
        JSON.stringify([{ t: now.toISOString(), v: s.upvotes }])
      )
    }

    // ── 5. Update existing ────────────────────────────────────
    for (const s of toUpdate) {
      await prisma.$executeRawUnsafe(`
        UPDATE "Signal" SET upvotes=$1,"lastSeen"=NOW(),"upvotesHistory"=$2::jsonb,
          "upvoteVelocity"=$3,"signalType"=$4 WHERE url=$5`,
        s.upvotes, JSON.stringify(s.upvotesHistory), s.upvoteVelocity, s.signalType, s.url
      )
    }

    // ── 6. Cluster new signals ────────────────────────────────
    if (scored.length) await runClustering(scored)

    // ── 7. Check trend alerts ─────────────────────────────────
    const trendAlerts = await checkTrendAlerts()

    // ── 8. Build report ───────────────────────────────────────
    const active = await prisma.$queryRawUnsafe(`
      SELECT * FROM "Signal" WHERE "lastSeen" > NOW() - INTERVAL '48 hours'
      ORDER BY "aiScore" DESC NULLS LAST LIMIT 100`)

    const toPush = active.filter(s => !s.lastPushedType || s.signalType !== s.lastPushedType)
    if (!toPush.length && !trendAlerts.length) {
      console.log('[Signal] Nothing to push')
      return NextResponse.json({ ok: true, newSignals: scored.length, pushed: 0 })
    }

    const report = formatReport(active, reportType, trendAlerts)
    await sendTelegram(report)

    // ── 9. Mark pushed + save report ─────────────────────────
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
