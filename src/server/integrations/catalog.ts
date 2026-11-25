import "server-only";

export type IntegrationField = { key: string; label: string; secret: boolean; required: boolean; placeholder?: string; hint?: string };

export type IntegrationDef = {
  key: string;
  name: string;
  description: string;
  category: "comunicação" | "google" | "crm" | "dados" | "automação";
  auth: "api_key" | "oauth_google" | "webhook";
  fields: IntegrationField[];
  /** O que falta, além dos campos, para funcionar (mostrado de forma honesta na central). */
  requirements: string[];
  docsUrl: string;
  /** Escopos OAuth (Google). */
  scopes?: string[];
};

export const GRAPH_VERSION_DEFAULT = "v23.0";

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "whatsapp",
    name: "WhatsApp Business (Cloud API)",
    description: "Envio de mensagens pelo número oficial da empresa e recebimento por webhook.",
    category: "comunicação",
    auth: "api_key",
    fields: [
      { key: "phone_number_id", label: "ID do número de telefone", secret: false, required: true, hint: "Meta for Developers → WhatsApp → Configuração da API" },
      { key: "business_account_id", label: "ID da conta WhatsApp Business (WABA)", secret: false, required: false },
      { key: "access_token", label: "Token de acesso permanente (usuário do sistema)", secret: true, required: true },
      { key: "graph_version", label: "Versão da Graph API", secret: false, required: false, placeholder: GRAPH_VERSION_DEFAULT },
    ],
    requirements: [
      "Conta Meta Business verificada e número aprovado no WhatsApp Business Platform.",
      "Fora da janela de 24h de atendimento, só é possível enviar modelos (templates) aprovados pela Meta.",
      "Para receber mensagens: configurar o webhook com WHATSAPP_VERIFY_TOKEN e WHATSAPP_APP_SECRET no servidor.",
    ],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  },
  {
    key: "google",
    name: "Google Workspace (Gmail, Agenda, Planilhas, Drive)",
    description: "Conexão OAuth com a conta Google da empresa para enviar e-mails, criar eventos, registrar em planilhas e listar arquivos.",
    category: "google",
    auth: "oauth_google",
    fields: [],
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
    requirements: [
      "Projeto no Google Cloud com as APIs Gmail, Calendar, Sheets e Drive ativadas.",
      "Tela de consentimento OAuth configurada (e verificada pelo Google para uso amplo).",
      "Variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor, com o redirecionamento APP_URL/api/integrations/google/callback.",
    ],
    docsUrl: "https://developers.google.com/identity/protocols/oauth2/web-server",
  },
  {
    key: "google_maps",
    name: "Google Maps (Places)",
    description: "Busca de empresas e locais (ex.: prospecção por região).",
    category: "google",
    auth: "api_key",
    fields: [{ key: "api_key", label: "Chave de API (Places API New)", secret: true, required: true }],
    requirements: ["Projeto Google Cloud com faturamento ativo e a Places API (New) habilitada.", "Restrinja a chave por API e, se possível, por IP do servidor."],
    docsUrl: "https://developers.google.com/maps/documentation/places/web-service/text-search",
  },
  {
    key: "hubspot",
    name: "HubSpot CRM",
    description: "Consulta e cadastro de contatos no CRM HubSpot.",
    category: "crm",
    auth: "api_key",
    fields: [{ key: "access_token", label: "Token do aplicativo privado", secret: true, required: true, hint: "HubSpot → Configurações → Integrações → Aplicativos privados (escopos crm.objects.contacts.read/write)" }],
    requirements: ["Conta HubSpot com permissão para criar aplicativos privados."],
    docsUrl: "https://developers.hubspot.com/docs/api/crm/contacts",
  },
  {
    key: "rest_api",
    name: "API REST externa",
    description: "Conecta um sistema da empresa (ERP, sistema próprio) por API REST com autenticação por cabeçalho.",
    category: "dados",
    auth: "api_key",
    fields: [
      { key: "base_url", label: "URL base (https)", secret: false, required: true, placeholder: "https://api.minhaempresa.com.br/v1" },
      { key: "header_name", label: "Cabeçalho de autenticação", secret: false, required: false, placeholder: "Authorization" },
      { key: "header_value", label: "Valor do cabeçalho", secret: true, required: false, placeholder: "Bearer …" },
      { key: "health_path", label: "Caminho para teste (GET)", secret: false, required: false, placeholder: "/health" },
    ],
    requirements: ["O domínio da URL base é liberado automaticamente apenas para esta integração."],
    docsUrl: "https://developer.mozilla.org/pt-BR/docs/Web/HTTP",
  },
  {
    key: "webhook_out",
    name: "Webhook de saída",
    description: "Envia eventos (JSON assinado com HMAC-SHA256) para um sistema externo, como Zapier, Make ou n8n.",
    category: "automação",
    auth: "webhook",
    fields: [
      { key: "url", label: "URL de destino (https)", secret: false, required: true },
      { key: "signing_secret", label: "Segredo de assinatura (gerado se vazio)", secret: true, required: false },
    ],
    requirements: ["O sistema de destino deve validar o cabeçalho X-Nexus-Signature."],
    docsUrl: "https://en.wikipedia.org/wiki/HMAC",
  },
];

export const integrationDef = (key: string) => INTEGRATIONS.find((i) => i.key === key);
