# Integrações e serviços externos — o que falta para ativar

Regra da plataforma: **nenhuma integração é marcada como conectada sem um teste real de comunicação**. Sem credencial, a interface mostra PENDENTE e a ferramenta do agente responde informando a pendência (o modelo nunca recebe um resultado inventado).

| Serviço | Status no código | O que você precisa fazer |
|---|---|---|
| **Anthropic (Claude)** | Pronto (SDK oficial, thinking adaptativo, `effort`, cache de prompt, fallback em recusa) | Criar chave em console.anthropic.com e cadastrar em **Admin → Configurações → Provedores de IA** (o sistema testa na hora) ou definir `ANTHROPIC_API_KEY`. |
| **OpenAI / compatíveis** | Pronto (Chat Completions + ferramentas; embeddings) | Cadastrar a chave (e a URL base, para provedores compatíveis). A chave OpenAI também ativa a **busca vetorial**. |
| **E-mail (Resend)** | Pronto | Conta no resend.com, domínio verificado, `RESEND_API_KEY` e `EMAIL_FROM`. Sem isso, a recuperação de senha orienta pedir um link ao administrador (que o gera no painel). |
| **Pesquisa na internet (Tavily)** | Pronto | `TAVILY_API_KEY` (tavily.com). |
| **WhatsApp Business (Cloud API)** | Envio e recebimento prontos | Conta Meta Business verificada, número aprovado, token permanente de usuário do sistema e ID do número (cadastrar na Central de integrações da empresa). Para receber mensagens: configurar o webhook `APP_URL/api/webhooks/whatsapp` na Meta com `WHATSAPP_VERIFY_TOKEN` e `WHATSAPP_APP_SECRET`. Fora da janela de 24h, só modelos (templates) aprovados. Envios sempre passam por aprovação humana. |
| **Google (Gmail, Agenda, Planilhas, Drive)** | OAuth completo (estado assinado, nonce, renovação de token) | Projeto no Google Cloud, APIs ativadas, tela de consentimento (verificação do Google para uso amplo), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, URI de redirecionamento `APP_URL/api/integrations/google/callback`. Cada empresa conecta a própria conta. |
| **Google Maps (Places API New)** | Pronto | Chave com faturamento ativo; cadastrar na Central de integrações. |
| **HubSpot CRM** | Pronto (buscar e cadastrar contatos) | Token de aplicativo privado com escopos de contatos. |
| **API REST da empresa** | Pronto (domínio liberado automaticamente só para a integração; proteção SSRF) | URL base https, cabeçalho de autenticação e caminho de teste. |
| **Webhook de saída** | Pronto (HMAC-SHA256 em `X-Nexus-Signature`) | URL https do destino (Zapier, Make, n8n…). |
| **Stripe** | Checkout + webhook com assinatura e idempotência | `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`; webhook `APP_URL/api/webhooks/stripe` (evento `checkout.session.completed`). Testar em modo de teste e só então ligar **Cobrança online** em Admin → Assinaturas e pagamentos → Regras. |
| **Mercado Pago** | Checkout Pro + webhook com assinatura (status confirmado na API) | `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`; notificações em `APP_URL/api/webhooks/mercadopago`. Mesmo processo de teste e liberação. |
| **Automações por webhook** | Pronto | Gerar o token na tela da automação; chamar `POST APP_URL/api/webhooks/workflows/<id>` com `Authorization: Bearer <token>`. |

## Nunca testado com credencial real nesta entrega

Como o ambiente de desenvolvimento não tinha chaves, **nenhuma** das integrações acima teve a comunicação real testada ainda. O código segue as APIs oficiais e os testes automatizados cobrem validação, assinaturas, isolamento e o comportamento de pendência. Ao cadastrar cada credencial, o botão **Testar conexão** confirma a comunicação.
