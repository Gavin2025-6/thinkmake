import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'
import { hashPassword, signToken } from '../../../lib/auth'

async function ensureUserTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id"           TEXT NOT NULL,
      "email"        TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "plan"         TEXT NOT NULL DEFAULT 'free',
      "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "User_pkey" PRIMARY KEY ("id")
    )`)
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`
  )
}

export async function POST(request) {
  try {
    const { email, password } = await request.json()
    if (!email?.includes('@') || !password || password.length < 6) {
      return NextResponse.json({ error: '邮箱或密码无效（密码至少6位）' }, { status: 400 })
    }

    if (process.env.DATABASE_URL) await ensureUserTable()

    const exists = await prisma.$queryRawUnsafe(
      `SELECT id FROM "User" WHERE email = $1`, email.toLowerCase()
    )
    if (exists.length) {
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 })
    }

    const id = crypto.randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id, email, "passwordHash") VALUES ($1, $2, $3)`,
      id, email.toLowerCase(), hashPassword(password)
    )

    const token = signToken({ id, email: email.toLowerCase(), plan: 'free' })
    return NextResponse.json({ token, plan: 'free' })
  } catch (err) {
    console.error('[Auth/register]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
