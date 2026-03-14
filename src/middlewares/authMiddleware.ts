import { Request, Response, NextFunction } from 'express'
import { verifyToken, JwtPayload } from '../services/authService'

// Extende o tipo Request do Express para incluir o usuário
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

// Middleware de autenticação — exige token JWT válido
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Token de autenticação não fornecido.' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = verifyToken(token)
    req.user = payload
    next()
  } catch {
    res.status(401).json({ success: false, error: 'Token inválido ou expirado. Faça login novamente.' })
  }
}

// Middleware de admin — exige role admin
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Acesso negado. Apenas administradores.' })
      return
    }
    next()
  })
}
