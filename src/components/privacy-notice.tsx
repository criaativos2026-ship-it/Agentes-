import { CONTROLLER_NAME, PRIVACY_CONTACT, PRIVACY_DATE, PRIVACY_VERSION, RETENTION_DAYS } from "@/lib/privacy";

/**
 * Aviso de privacidade (LGPD). Implementação técnica: o texto deve passar por revisão jurídica
 * antes do lançamento comercial. Itens PENDENTES aparecem explicitamente.
 */
export function PrivacyNotice() {
  const contact = PRIVACY_CONTACT.email
    ? `${PRIVACY_CONTACT.responsavel ?? "Encarregado(a)"} — ${PRIVACY_CONTACT.email}`
    : "Canal de contato em definição. Enquanto isso, fale com o administrador da sua empresa ou com a equipe da plataforma.";
  const sections: [string, React.ReactNode][] = [
    [
      "Quem cuida dos seus dados",
      <>
        <strong>{CONTROLLER_NAME}</strong> é responsável (controlador) pelos dados da sua conta na plataforma. Os dados que a
        sua empresa envia para os agentes (documentos, conversas, contatos) pertencem à sua empresa: nesse caso a NEXUS atua
        como <strong>operadora</strong>, tratando-os apenas conforme as instruções dela. Contato: {contact}
      </>,
    ],
    [
      "Quais dados guardamos",
      <>
        Nome, e-mail, empresa e papel de acesso; senha <strong>apenas em formato criptografado</strong> (Argon2id); registros de
        uso com data e hora (logins, execuções dos agentes, ações administrativas); aceite deste aviso. Não coletamos CPF,
        endereço, localização ou dados sensíveis para criar a conta.
      </>,
    ],
    [
      "Para que usamos",
      <>Para permitir o acesso, executar os agentes contratados, manter a segurança (auditoria, prevenção de fraude) e cumprir o contrato. Não vendemos dados nem os usamos para publicidade.</>,
    ],
    [
      "Base legal",
      <>Execução de contrato (art. 7º, V), legítimo interesse para segurança e auditoria (art. 7º, IX) e cumprimento de obrigação legal (art. 7º, II) da LGPD.</>,
    ],
    [
      "Quem pode ver",
      <>Os administradores da sua empresa veem a equipe, as execuções e os relatórios da empresa. Nenhuma outra empresa tem acesso aos seus dados: o isolamento é aplicado no próprio banco de dados. A equipe da plataforma acessa apenas para suporte e operação, com registro em auditoria.</>,
    ],
    [
      "Provedores de inteligência artificial e serviços externos",
      <>Para responder, os agentes enviam o conteúdo necessário ao provedor de IA configurado (ex.: Anthropic, OpenAI) e às integrações que sua empresa autorizar (ex.: Google, WhatsApp). Esses provedores podem estar fora do Brasil (transferência internacional, art. 33).</>,
    ],
    [
      "Por quanto tempo",
      <>Registros operacionais são guardados por até {RETENTION_DAYS} dias (prazo PENDENTE de confirmação) e depois apagados automaticamente. Os dados da conta ficam enquanto você fizer parte de uma empresa cliente.</>,
    ],
    [
      "Seus direitos (art. 18)",
      <>Confirmar e acessar seus dados, corrigir, pedir exclusão, portabilidade e informações sobre compartilhamento. Na plataforma: <strong>Minha conta → Privacidade</strong> (baixar meus dados, corrigir dados, pedir exclusão). Você também pode reclamar à ANPD.</>,
    ],
    [
      "Segurança e cookies",
      <>Usamos apenas um cookie essencial de sessão (sem rastreamento). Credenciais de integrações são criptografadas. Em caso de incidente relevante, comunicaremos os afetados e a ANPD.</>,
    ],
    [
      "Mudanças neste aviso",
      <>Mudanças relevantes geram nova versão e um novo aceite. Versão {PRIVACY_VERSION}, de {PRIVACY_DATE}.</>,
    ],
  ];
  return (
    <ol className="grid gap-5 text-sm leading-relaxed text-ink-muted">
      {sections.map(([title, body], i) => (
        <li key={title}>
          <h2 className="mb-1 font-semibold text-ink">
            {i + 1}. {title}
          </h2>
          <p>{body}</p>
        </li>
      ))}
    </ol>
  );
}
