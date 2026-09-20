/**
 * Janela de tolerância na rotação do refresh token.
 *
 * O PROBLEMA: o app faz polling a cada 3-6s e o usuário usa vários
 * dispositivos/abas (caixa, KDS, celular do garçom). Quando o access expira,
 * duas abas podem chamar o refresh com o MESMO token ao mesmo tempo: a
 * primeira rotaciona, a segunda apresenta um token já revogado. Sem tolerância,
 * isso é indistinguível de roubo e a "proteção" revoga a família inteira —
 * derrubando TODOS os dispositivos. Era o deslogamento em massa.
 *
 * A REGRA: reuso de token revogado HÁ POUCOS SEGUNDOS e COM sucessor
 * (`replacedByTokenId`, ou seja, rotação normal — não logout) ganha UMA chance:
 * devolvemos só um access novo, sem rotacionar de novo e sem matar ninguém.
 * Reuso repetido, tardio ou sem sucessor continua caindo na revogação total.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

export function isBenignRotationReuse(
  revokedAt: Date | string | null | undefined,
  replacedByTokenId: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!revokedAt || !replacedByTokenId) return false;
  const revokedMs = new Date(revokedAt).getTime();
  if (!Number.isFinite(revokedMs)) return false;
  const age = now - revokedMs;
  return age >= 0 && age <= REFRESH_REUSE_GRACE_MS;
}
