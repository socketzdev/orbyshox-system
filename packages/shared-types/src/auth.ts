import { z } from 'zod';

// ─── Auth Schemas ───────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Informe seu nome completo'),
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
  companyName: z.string().trim().min(2, 'Informe o nome da empresa'),
  tradeName: z.string().trim().optional(),
  niche: z.enum(['RESTAURANT', 'BARBERSHOP', 'SUPERMARKET', 'UNIVERSAL']),
  slug: z
    .string()
    .trim()
    .min(3, 'O endereço precisa ter pelo menos 3 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífens'),
  phone: z.string().trim().optional(),
});

export const tenantLoginSchema = loginSchema.extend({
  tenantSlug: z.string().trim().min(3),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token de recuperação inválido'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token de verificação inválido'),
});

export const verify2faSchema = z.object({
  tempToken: z.string(),
  code: z.string().length(6, 'Código deve ter 6 dígitos'),
});

export const setup2faSchema = z.object({
  code: z.string().length(6, 'Código deve ter 6 dígitos'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(), // Can come from cookie
});

// ─── Auth Response Types ────────────────────────────────────────────────────

export interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  mfaRequired?: boolean;
  tempToken?: string;
}

export interface TokenResponse {
  accessToken: string;
}

export interface Setup2faResponse {
  qrCodeUrl: string;
  secret: string;
  recoveryCodes: string[];
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
  is2faAuthenticated: boolean;
  iat?: number;
  exp?: number;
}

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type TenantLoginInput = z.infer<typeof tenantLoginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type Verify2faInput = z.infer<typeof verify2faSchema>;
export type Setup2faInput = z.infer<typeof setup2faSchema>;
