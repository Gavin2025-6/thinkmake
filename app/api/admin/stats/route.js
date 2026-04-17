import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

function checkAuth(request) {
  const pw = request.headers.get('x-admin-password')
  return pw === process.env.ADMIN_PASSWORD
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ stats: {}, leads: [], error: 'No database configured' })
  }

  const { searchParams } = new URL(request.url)
  const careerFilter = searchParams.get('career')
  const provinceFilter = searchParams.get('province')

  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - 7)

    const [totalLeads, todayLeads, weekLeads, totalConversations, leads] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.lead.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.conversation.count(),
      prisma.lead.findMany({
        where: {
          ...(provinceFilter ? { province: { contains: provinceFilter, mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

    // Filter by career in JS (JSON field)
    const filteredLeads = careerFilter
      ? leads.filter(l => {
          const careers = Array.isArray(l.recommendedCareers) ? l.recommendedCareers : []
          return careers.some(c => c.toLowerCase().includes(careerFilter.toLowerCase()))
        })
      : leads

    return NextResponse.json({
      stats: { totalLeads, todayLeads, weekLeads, totalConversations },
      leads: filteredLeads,
    })
  } catch (err) {
    console.error('[Admin] DB error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
