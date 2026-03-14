import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
} from '../services/authService'

const router = Router()

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(100),
  email: z.string().email('E-mail inválido'),
  password: z
    .string()
    .min(8, 'Senha deve ter ao menos 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número'),
})

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
})

const forgotSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

const resetSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  password: z
    .string()
    .min(8, 'Senha deve ter ao menos 8 caracteres')
    .regex(/[A-Z]/, 'Deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Deve conter ao menos um número'),
})

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: result.error.errors[0].message,
    })
    return
  }

  try {
    const { name, email, password } = result.data
    const { user, token } = await registerUser(name, email, password)
    res.status(201).json({ success: true, data: { user, token } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar conta.'
    res.status(400).json({ success: false, error: message })
  }
})

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: result.error.errors[0].message,
    })
    return
  }

  try {
    const { email, password } = result.data
    const { user, token } = await loginUser(email, password)
    res.json({ success: true, data: { user, token } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Credenciais inválidas.'
    res.status(401).json({ success: false, error: message })
  }
})

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response) => {
  const result = forgotSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error.errors[0].message })
    return
  }

  try {
    await forgotPassword(result.data.email)
    // Sempre retorna sucesso (não revela se o e-mail existe)
    res.json({
      success: true,
      message: 'Se o e-mail estiver cadastrado, você receberá um link em breve.',
    })
  } catch {
    res.json({
      success: true,
      message: 'Se o e-mail estiver cadastrado, você receberá um link em breve.',
    })
  }
})

// POST /api/auth/reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
  const result = resetSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error.errors[0].message })
    return
  }

  try {
    await resetPassword(result.data.token, result.data.password)
    res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao redefinir senha.'
    res.status(400).json({ success: false, error: message })
  }
})

export default router
