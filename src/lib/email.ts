import nodemailer from 'nodemailer'

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false, // TLS via STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export async function sendPasswordResetEmail(
  toEmail: string,
  toName: string,
  resetToken: string
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`
  const from = process.env.EMAIL_FROM || 'Gerador de Leads <noreply@example.com>'

  const transporter = createTransporter()

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'Recuperação de senha — Gerador de Leads',
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f5f7; margin: 0; padding: 40px 20px;">
          <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; border: 1px solid #e5e7eb;">
            <h1 style="font-size: 20px; color: #1a1a2e; margin: 0 0 8px;">🔐 Recuperação de senha</h1>
            <p style="color: #6b7280; margin: 0 0 24px;">Olá, <strong>${toName}</strong>!</p>
            <p style="color: #374151; line-height: 1.6;">Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}"
                 style="background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
                Redefinir minha senha
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">
              Este link expira em <strong>1 hora</strong>.<br/>
              Se você não solicitou a recuperação de senha, ignore este e-mail.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #d1d5db; font-size: 11px; text-align: center;">Gerador de Leads Multi-Nicho</p>
          </div>
        </body>
      </html>
    `,
    text: `Olá ${toName},\n\nClique no link para redefinir sua senha:\n${resetLink}\n\nEste link expira em 1 hora.\n\nSe não solicitou, ignore este e-mail.`,
  })
}

export async function sendWelcomeEmail(toEmail: string, toName: string): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const from = process.env.EMAIL_FROM || 'Gerador de Leads <noreply@example.com>'
  const transporter = createTransporter()

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'Bem-vindo ao Gerador de Leads! 🎯',
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f5f7; margin: 0; padding: 40px 20px;">
          <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; border: 1px solid #e5e7eb;">
            <h1 style="font-size: 20px; color: #1a1a2e; margin: 0 0 8px;">🎯 Bem-vindo, ${toName}!</h1>
            <p style="color: #374151; line-height: 1.6;">Sua conta foi criada com sucesso. Você já pode fazer login e começar a gerar leads qualificados para o seu nicho.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${frontendUrl}/login"
                 style="background: #16a34a; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
                Acessar a plataforma
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #d1d5db; font-size: 11px; text-align: center;">Gerador de Leads Multi-Nicho</p>
          </div>
        </body>
      </html>
    `,
  })
}
