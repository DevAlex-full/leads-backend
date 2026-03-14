import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.')
}

// Service role bypassa RLS — use apenas no backend, NUNCA no frontend
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

// ── Tipos da tabela users ────────────────────────────────────────
export interface UserRow {
  id: string
  name: string
  email: string
  password_hash: string
  role: 'user' | 'admin'
  is_active: boolean
  reset_token: string | null
  reset_token_expires: string | null
  created_at: string
  updated_at: string
}

export type UserPublic = Omit<UserRow, 'password_hash' | 'reset_token' | 'reset_token_expires'>
