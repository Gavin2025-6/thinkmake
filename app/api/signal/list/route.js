import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || ''
  const sort = searchParams.get('sort') || 'score' // 'score' | 'date' | 'upvotes'
  const days = parseInt(searchParams.get('days') || '7', 10)

  try {
    const orderCol = sort === 'date' ? '"date"' : sort === 'upvotes' ? '"upvotes"' : '"aiScore"'

    const where = category
      ? `WHERE "createdAt" > NOW() - INTERVAL '${days} days' AND category = '${category.replace(/'/g, "''")}'`
      : `WHERE "createdAt" > NOW() - INTERVAL '${days} days'`

    const signals = await prisma.$queryRawUnsafe(`
      SELECT id, source, subreddit, category, title, url, upvotes, date, "aiScore", "aiAnalysis", "createdAt"
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
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '24 hours') AS today
      FROM "Signal"
    `)

    return NextResponse.json({ signals, reports, stats: stats[0] })
  } catch (err) {
    console.error('[Signal/list]', err.message)
    return NextResponse.json({ signals: [], reports: [], stats: { total: 0, today: 0 } })
  }
}
