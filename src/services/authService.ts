import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { supabase, UserRow, UserPublic } from '../lib/supabase'
import { sendPasswordResetEmail, sendWelcomeEmail } from '../lib/email'

const JWT_SECRET =
  process.env.JWT_SECRET || 'fallback-dev-secret-never-use-in-prod'

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'
const SALT_ROUNDS = 12

export interface JwtPayload {
  userId: string
  email: string
  role: 'user' | 'admin'
}

function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

function toPublic(user: UserRow): UserPublic {
  const { password_hash, reset_token, reset_token_expires, ...pub } = user

  void password_hash
  void reset_token
  void reset_token_expires

  return pub
}

// ── Register ─────────────────────────────────────────────────────
export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<{ user: UserPublic; token: string }> {
  const normalizedEmail = email.toLowerCase().trim()

  // Verifica se o e-mail já existe
  const { data: existing, error: existingError } = await supabase
    .from('users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingError) {
    console.error('❌ Erro ao consultar e-mail no cadastro:', {
      message: existingError.message,
      details: existingError.details,
      hint: existingError.hint,
      code: existingError.code,
    })

    throw new Error('Erro ao verificar e-mail. Tente novamente.')
  }

  if (existing) {
    throw new Error('Este e-mail já está cadastrado.')
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS)

  const { data, error } = await supabase
    .from('users')
    .insert({
      name: name.trim(),
      email: normalizedEmail,
      password_hash,
      role: 'user',
      is_active: true,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('❌ Erro ao criar usuário no Supabase:', {
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
    })

    throw new Error('Erro ao criar conta. Tente novamente.')
  }

  const user = data as UserRow

  // Envia e-mail de boas-vindas sem bloquear o cadastro
  sendWelcomeEmail(user.email, user.name).catch((emailError) => {
    console.error('⚠️ Não foi possível enviar o e-mail de boas-vindas:', emailError)
  })

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  })

  return {
    user: toPublic(user),
    token,
  }
}

// ── Login ────────────────────────────────────────────────────────
export async function loginUser(
  email: string,
  password: string
): Promise<{ user: UserPublic; token: string }> {
  const normalizedEmail = email.toLowerCase().trim()

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (error) {
    console.error('❌ Erro ao consultar usuário no login:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })

    throw new Error('Erro ao acessar sua conta. Tente novamente.')
  }

  if (!data) {
    throw new Error('E-mail ou senha incorretos.')
  }

  const user = data as UserRow

  if (!user.is_active) {
    throw new Error(
      'Conta desativada. Entre em contato com o administrador.'
    )
  }

  const valid = await bcrypt.compare(password, user.password_hash)

  if (!valid) {
    throw new Error('E-mail ou senha incorretos.')
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  })

  return {
    user: toPublic(user),
    token,
  }
}

// ── Forgot Password ──────────────────────────────────────────────
export async function forgotPassword(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim()

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (error) {
    console.error('❌ Erro ao consultar usuário para recuperação de senha:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })

    throw new Error('Erro ao solicitar recuperação de senha.')
  }

  // Não revela se o e-mail existe ou não
  if (!data) return

  const user = data as UserRow
  const resetToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(
    Date.now() + 60 * 60 * 1000
  ).toISOString()

  const { error: updateError } = await supabase
    .from('users')
    .update({
      reset_token: resetToken,
      reset_token_expires: expiresAt,
    })
    .eq('id', user.id)

  if (updateError) {
    console.error('❌ Erro ao salvar token de recuperação:', {
      message: updateError.message,
      details: updateError.details,
      hint: updateError.hint,
      code: updateError.code,
    })

    throw new Error('Erro ao solicitar recuperação de senha.')
  }

  await sendPasswordResetEmail(
    user.email,
    user.name,
    resetToken
  )
}

// ── Reset Password ───────────────────────────────────────────────
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<void> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('reset_token', token)
    .maybeSingle()

  if (error) {
    console.error('❌ Erro ao consultar token de recuperação:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })

    throw new Error('Erro ao validar o token de recuperação.')
  }

  if (!data) {
    throw new Error('Token inválido ou expirado.')
  }

  const user = data as UserRow

  if (
    !user.reset_token_expires ||
    new Date(user.reset_token_expires) < new Date()
  ) {
    throw new Error(
      'Token expirado. Solicite um novo link de recuperação.'
    )
  }

  const password_hash = await bcrypt.hash(
    newPassword,
    SALT_ROUNDS
  )

  const { error: updateError } = await supabase
    .from('users')
    .update({
      password_hash,
      reset_token: null,
      reset_token_expires: null,
    })
    .eq('id', user.id)

  if (updateError) {
    console.error('❌ Erro ao redefinir senha:', {
      message: updateError.message,
      details: updateError.details,
      hint: updateError.hint,
      code: updateError.code,
    })

    throw new Error('Erro ao redefinir a senha.')
  }
}

// ── Seed Admin ───────────────────────────────────────────────────
export async function seedAdminIfNeeded(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim()
  const password = process.env.ADMIN_PASSWORD
  const name =
    process.env.ADMIN_NAME?.trim() || 'Administrador'

  if (!email || !password) {
    console.warn(
      '⚠️ Seed do administrador ignorado: ADMIN_EMAIL ou ADMIN_PASSWORD ausente.'
    )

    return
  }

  const { data: existing, error: selectError } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email)
    .maybeSingle()

  if (selectError) {
    console.error(
      '❌ Erro ao consultar administrador no Supabase:',
      {
        message: selectError.message,
        details: selectError.details,
        hint: selectError.hint,
        code: selectError.code,
      }
    )

    throw new Error(
      `Falha ao consultar administrador no Supabase: ${selectError.message}`
    )
  }

  if (existing) {
    console.log('✅ Admin já existe:', email)
    return
  }

  const password_hash = await bcrypt.hash(
    password,
    SALT_ROUNDS
  )

  const { data: createdAdmin, error: insertError } =
    await supabase
      .from('users')
      .insert({
        name,
        email,
        password_hash,
        role: 'admin',
        is_active: true,
      })
      .select('id, email, role, is_active')
      .single()

  if (insertError || !createdAdmin) {
    console.error(
      '❌ Erro ao criar administrador no Supabase:',
      {
        message: insertError?.message,
        details: insertError?.details,
        hint: insertError?.hint,
        code: insertError?.code,
      }
    )

    throw new Error(
      `Falha ao criar administrador no Supabase: ${
        insertError?.message || 'nenhum registro retornado'
      }`
    )
  }

  console.log(
    '✅ Admin criado automaticamente:',
    createdAdmin.email
  )
}