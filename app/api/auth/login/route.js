import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { hashPassword, signToken } from '../../../lib/auth'

export async function POST(request) {
  try {
    const { email, password } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: '请填写邮箱和密码' }, { status: 400 })
    }

    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, email, "passwordHash", plan FROM "User" WHERE email = $1`,
      email.toLowerCase()
    ).catch(() => [])

    const user = rows[0]
    if (!user || user.passwordHash !== hashPassword(password)) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 })
    }

    const token = signToken({ id: user.id, email: user.email, plan: user.plan })
    return NextResponse.json({ token, plan: user.plan })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
