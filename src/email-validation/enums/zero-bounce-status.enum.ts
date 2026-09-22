/** Espelha os status possíveis da API da ZeroBounce (v2/validate). */
export enum ZeroBounceStatus {
  VALID = 'valid',
  INVALID = 'invalid',
  CATCH_ALL = 'catch-all',
  UNKNOWN = 'unknown',
  SPAMTRAP = 'spamtrap',
  ABUSE = 'abuse',
  DO_NOT_MAIL = 'do_not_mail',
}

/**
 * Status que reprovam o e-mail de forma inequívoca. `catch-all` e `unknown`
 * são aceitos de propósito: servidores corporativos frequentemente não
 * confirmam a caixa por segurança, o que geraria falsos negativos se
 * tratados como inválidos. Mesma lista usada pelo trigo-connector
 * (src/types/emailValidation.ts) — mantenha as duas em sincronia.
 */
export const BLOCKED_ZERO_BOUNCE_STATUSES: ZeroBounceStatus[] = [
  ZeroBounceStatus.INVALID,
  ZeroBounceStatus.SPAMTRAP,
  ZeroBounceStatus.ABUSE,
  ZeroBounceStatus.DO_NOT_MAIL,
];
