import { NextResponse } from 'next/server'
import { jobs } from '../../../lib/jobStore'

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ status: 'unknown' })
  const status = jobs.get(id) || 'unknown'
  return NextResponse.json({ status })
}
