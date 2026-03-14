import { Router, Request, Response } from 'express'
import { requireAdmin } from '../middlewares/authMiddleware'
import { supabase, UserRow, UserPublic } from '../lib/supabase'

const router = Router()

// Aplica requireAdmin em todas as rotas deste router
router.use(requireAdmin)

function toPublic(user: UserRow): UserPublic {
  const { password_hash, reset_token, reset_token_expires, ...pub } = user
  void password_hash; void reset_token; void reset_token_expires
  return pub
}

// GET /api/admin/users — lista todos os usuários
router.get('/users', async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar usuários.' })
    return
  }

  const users = (data as UserRow[]).map(toPublic)
  res.json({
    success: true,
    data: {
      users,
      total: users.length,
      active: users.filter((u) => u.is_active).length,
      admins: users.filter((u) => u.role === 'admin').length,
    },
  })
})

// PATCH /api/admin/users/:id — atualiza role ou is_active
router.patch('/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { role, is_active, name } = req.body

  // Impede que o admin se auto-rebaixe
  if (req.user?.userId === id && role === 'user') {
    res.status(400).json({ success: false, error: 'Você não pode rebaixar sua própria conta.' })
    return
  }

  const updates: Partial<UserRow> = {}
  if (typeof is_active === 'boolean') updates.is_active = is_active
  if (role === 'user' || role === 'admin') updates.role = role
  if (name && typeof name === 'string') updates.name = name.trim()

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ success: false, error: 'Nenhum campo válido para atualizar.' })
    return
  }

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    res.status(404).json({ success: false, error: 'Usuário não encontrado.' })
    return
  }

  res.json({ success: true, data: { user: toPublic(data as UserRow) } })
})

// DELETE /api/admin/users/:id — remove usuário
router.delete('/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  if (req.user?.userId === id) {
    res.status(400).json({ success: false, error: 'Você não pode excluir sua própria conta.' })
    return
  }

  const { error } = await supabase.from('users').delete().eq('id', id)

  if (error) {
    res.status(404).json({ success: false, error: 'Usuário não encontrado.' })
    return
  }

  res.json({ success: true, message: 'Usuário removido com sucesso.' })
})

// GET /api/admin/stats — estatísticas rápidas do painel
router.get('/stats', async (_req: Request, res: Response) => {
  const { data } = await supabase
    .from('users')
    .select('role, is_active, created_at')

  if (!data) {
    res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas.' })
    return
  }

  const users = data as Pick<UserRow, 'role' | 'is_active' | 'created_at'>[]
  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = new Date().toISOString().slice(0, 7)

  res.json({
    success: true,
    data: {
      total: users.length,
      active: users.filter((u) => u.is_active).length,
      inactive: users.filter((u) => !u.is_active).length,
      admins: users.filter((u) => u.role === 'admin').length,
      newToday: users.filter((u) => u.created_at.startsWith(today)).length,
      newThisMonth: users.filter((u) => u.created_at.startsWith(thisMonth)).length,
    },
  })
})

export default router
