import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const category   = searchParams.get('category') || ''
  const signalType = searchParams.get('type') || ''       // new/rising/persistent
  const sort       = searchParams.get('sort') || 'score'  // score | date | upvotes | velocity
  const days       = parseInt(searchParams.get('days') || '7', 10)

  try {
    const orderCol =
      sort === 'date'     ? '"date"' :
      sort === 'upvotes'  ? '"upvotes"' :
      sort === 'velocity' ? '"upvoteVelocity"' :
                            '"aiScore"'

    const conditions = [`"lastSeen" > NOW() - INTERVAL '${days} days'`]
    if (category)   conditions.push(`category = '${category.replace(/'/g, "''")}'`)
    if (signalType) conditions.push(`"signalType" = '${signalType.replace(/'/g, "''")}'`)
    const where = `WHERE ${conditions.join(' AND ')}`

    const signals = await prisma.$queryRawUnsafe(`
      SELECT id, "postId", source, subreddit, category, title, url, upvotes, date,
             "aiScore", "aiAnalysis", "signalType", "upvoteVelocity",
             "firstSeen", "lastSeen", "createdAt"
      FROM "Signal"
      ${where}
      ORDER BY ${orderCol} DESC NULLS LAST
      LIMIT 100
    `)

    const reports = await prisma.$queryRawUnsafe(`
      SELECT id, "reportType", "signalCount", "sentAt"
      FROM "SignalReport"
      ORDER BY "sentAt" DESC
      LIMIT 10
    `)

    const stats = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)                                                           AS total,
        COUNT(*) FILTER (WHERE "firstSeen" > NOW() - INTERVAL '24 hours') AS today,
        COUNT(*) FILTER (WHERE "signalType" = 'new')                      AS "countNew",
        COUNT(*) FILTER (WHERE "signalType" = 'rising')                   AS "countRising",
        COUNT(*) FILTER (WHERE "signalType" = 'persistent')               AS "countPersistent"
      FROM "Signal"
    `)

    return NextResponse.json({ signals, reports, stats: stats[0] })
  } catch (err) {
    console.error('[Signal/list]', err.message)
    return NextResponse.json({ signals: [], reports: [], stats: { total: 0, today: 0 } })
  }
}
