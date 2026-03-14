import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { supabase, UserRow, UserPublic } from '../lib/supabase'
import { sendPasswordResetEmail, sendWelcomeEmail } from '../lib/email'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-never-use-in-prod'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'
const SALT_ROUNDS = 12

export interface JwtPayload {
  userId: string
  email: string
  role: 'user' | 'admin'
}

function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

function toPublic(user: UserRow): UserPublic {
  const { password_hash, reset_token, reset_token_expires, ...pub } = user
  void password_hash; void reset_token; void reset_token_expires
  return pub
}

// ── Register ─────────────────────────────────────────────────────
export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<{ user: UserPublic; token: string }> {
  // Verifica se o email já existe
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single()

  if (existing) {
    throw new Error('Este e-mail já está cadastrado.')
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS)

  const { data, error } = await supabase
    .from('users')
    .insert({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash,
      role: 'user',
      is_active: true,
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error('Erro ao criar conta. Tente novamente.')
  }

  const user = data as UserRow

  // Envia e-mail de boas-vindas (sem bloquear o registro)
  sendWelcomeEmail(user.email, user.name).catch(() => {})

  const token = signToken({ userId: user.id, email: user.email, role: user.role })
  return { user: toPublic(user), token }
}

// ── Login ────────────────────────────────────────────────────────
export async function loginUser(
  email: string,
  password: string
): Promise<{ user: UserPublic; token: string }> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error || !data) {
    throw new Error('E-mail ou senha incorretos.')
  }

  const user = data as UserRow

  if (!user.is_active) {
    throw new Error('Conta desativada. Entre em contato com o administrador.')
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    throw new Error('E-mail ou senha incorretos.')
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role })
  return { user: toPublic(user), token }
}

// ── Forgot Password ──────────────────────────────────────────────
export async function forgotPassword(email: string): Promise<void> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single()

  // Não revela se o e-mail existe ou não (segurança)
  if (!data) return

  const user = data as UserRow
  const resetToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hora

  await supabase
    .from('users')
    .update({ reset_token: resetToken, reset_token_expires: expiresAt })
    .eq('id', user.id)

  await sendPasswordResetEmail(user.email, user.name, resetToken)
}

// ── Reset Password ───────────────────────────────────────────────
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('reset_token', token)
    .single()

  if (!data) {
    throw new Error('Token inválido ou expirado.')
  }

  const user = data as UserRow

  if (!user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
    throw new Error('Token expirado. Solicite um novo link de recuperação.')
  }

  const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS)

  await supabase
    .from('users')
    .update({ password_hash, reset_token: null, reset_token_expires: null })
    .eq('id', user.id)
}

// ── Seed Admin ───────────────────────────────────────────────────
export async function seedAdminIfNeeded(): Promise<void> {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME || 'Administrador'

  if (!email || !password) return

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single()

  if (existing) {
    console.log('✅ Admin já existe:', email)
    return
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS)

  await supabase.from('users').insert({
    name,
    email: email.toLowerCase(),
    password_hash,
    role: 'admin',
    is_active: true,
  })

  console.log('✅ Admin criado automaticamente:', email)
}
