import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const category   = searchParams.get('category')   || ''
  const platform   = searchParams.get('platform')   || ''
  const signalType = searchParams.get('type')        || ''
  const sort       = searchParams.get('sort')        || 'score'
  const days       = Math.min(parseInt(searchParams.get('days') || '7', 10), 30)
  const search     = searchParams.get('q')           || ''
  const reportDate = searchParams.get('reportDate')  || ''

  try {
    const orderCol = { date: '"date"', upvotes: '"upvotes"', velocity: '"upvoteVelocity"' }[sort] || '"aiScore"'

    const conds = [`"lastSeen" > NOW() - INTERVAL '${days} days'`]
    if (category)   conds.push(`category = '${category.replace(/'/g, "''")}'`)
    if (platform)   conds.push(`platform = '${platform.replace(/'/g, "''")}'`)
    if (signalType) conds.push(`"signalType" = '${signalType.replace(/'/g, "''")}'`)
    if (search)     conds.push(`(title ILIKE '%${search.replace(/'/g, "''")}%' OR content ILIKE '%${search.replace(/'/g, "''")}%')`)

    const signals = await prisma.$queryRawUnsafe(`
      SELECT s.id, s."postId", s.platform, s.source, s.subreddit, s."appName", s.rating,
             s.category, s.title, s.url, s.upvotes, s.date, s."aiScore", s."aiAnalysis",
             s."clusterId", s."signalType", s."upvoteVelocity", s."firstSeen", s."lastSeen"
      FROM "Signal" s
      WHERE ${conds.join(' AND ')}
      ORDER BY ${orderCol} DESC NULLS LAST
      LIMIT 150
    `)

    // Report list (optionally filter by date)
    const reportCond = reportDate ? `WHERE DATE("sentAt") = '${reportDate}'` : ''
    const reports = await prisma.$queryRawUnsafe(`
      SELECT id, "reportType", content, "signalCount", "sentAt"
      FROM "SignalReport" ${reportCond}
      ORDER BY "sentAt" DESC LIMIT 20
    `)

    // Stats
    const [stats] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(*) FILTER (WHERE "firstSeen" > NOW() - INTERVAL '24 hours')   AS today,
        COUNT(*) FILTER (WHERE "signalType" = 'new')                         AS "countNew",
        COUNT(*) FILTER (WHERE "signalType" = 'rising')                      AS "countRising",
        COUNT(*) FILTER (WHERE "signalType" = 'persistent')                  AS "countPersistent",
        COUNT(DISTINCT platform)                                              AS platforms
      FROM "Signal" WHERE "lastSeen" > NOW() - INTERVAL '7 days'
    `)

    // Top clusters
    const clusters = await prisma.$queryRawUnsafe(`
      SELECT id, name, category, "clusterSize", "totalSignalStrength", "sourcesCount",
             platforms, "dayStreak"
      FROM "SignalCluster"
      WHERE "lastSeen" > NOW() - INTERVAL '7 days'
      ORDER BY "totalSignalStrength" DESC LIMIT 10
    `).catch(() => [])

    return NextResponse.json({ signals, reports, stats, clusters })
  } catch (err) {
    console.error('[Signal/list]', err.message)
    return NextResponse.json({ signals: [], reports: [], stats: {}, clusters: [] })
  }
}
