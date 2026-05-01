import crypto from 'crypto'

const SECRET = process.env.JWT_SECRET || 'signalhunt_jwt_secret_change_in_prod'
const SALT   = process.env.HASH_SALT  || 'signalhunt_hash_salt_change_in_prod'

export function hashPassword(password) {
  return crypto.pbkdf2Sync(password, SALT, 10000, 64, 'sha512').toString('hex')
}

export function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig  = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyToken(token) {
  if (!token) return null
  const [data, sig] = (token || '').split('.')
  if (!data || !sig) return null
  const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  if (sig !== expected) return null
  try { return JSON.parse(Buffer.from(data, 'base64url').toString()) } catch { return null }
}

export function getTokenFromRequest(request) {
  const auth = request.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : null
}
