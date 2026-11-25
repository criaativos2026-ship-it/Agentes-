/**
 * Configuração central de privacidade (LGPD).
 * Contato e prazo ficam PENDENTES até a empresa informar (revisão jurídica recomendada).
 */
export const PRIVACY_VERSION = "2026-11";
export const PRIVACY_DATE = "25 de novembro de 2026";
export const CONTROLLER_NAME = "NEXUS AI"; // PENDENTE: razão social definitiva
export const PRIVACY_CONTACT = { responsavel: null as string | null, email: null as string | null }; // PENDENTE
/** Prazo de guarda de registros operacionais (execuções, mensagens, auditoria). PENDENTE: confirmar. */
export const RETENTION_DAYS = 730;
export const ANONYMOUS_NAME = "Pessoa removida";

export const hasAcceptedPrivacy = (u: { privacyVersion: string | null; privacyAcceptedAt: Date | null }) =>
  !!u.privacyAcceptedAt && u.privacyVersion === PRIVACY_VERSION;
