# NEXUS AI — Arquitetura

> Documento da **Fase 1 (Planejamento)**. Descreve as decisões técnicas e o porquê de cada uma.
> Status de cada parte do produto: veja `docs/PLANO_DE_IMPLEMENTACAO.md`.

## 1. Visão geral

NEXUS AI é um SaaS multiempresa (multi-tenant) para **criar, configurar, testar, publicar, executar e comercializar agentes de IA personalizados**.

```
                    ┌────────────────────────────────────────────────┐
 Navegador  ───────▶│ Next.js (App Router)                           │
 (admin, cliente,   │  • Server Components (telas)                   │
  usuário)          │  • Server Actions (mutações validadas com Zod) │
                    │  • Rotas /api (webhooks, cron, exportação)     │
                    └──────────────┬─────────────────────────────────┘
                                   │  withOrg / withPlatform (transação + RLS)
                    ┌──────────────▼─────────────────────────────────┐
                    │ Camada de domínio  src/server/*                │
                    │  auth · rbac · agents · tools · execution      │
                    │  knowledge (RAG) · integrations · billing      │
                    │  workflows · audit · usage                     │
                    └──────┬───────────────┬────────────────┬────────┘
                           │               │                │
              ┌────────────▼───┐   ┌───────▼────────┐  ┌────▼─────────────────┐
              │ PostgreSQL     │   │ Worker         │  │ Provedores externos  │
              │ (Supabase)     │◀──│ (fila no banco │─▶│ LLMs, e-mail, Google,│
              │ RLS + pgvector │   │  SKIP LOCKED)  │  │ WhatsApp, Stripe, MP │
              └────────────────┘   └────────────────┘  └──────────────────────┘
```

## 2. Níveis de acesso

| Nível | Quem | Onde | Como é verificado |
|---|---|---|---|
| 1 — Super administrador | Dono da plataforma e equipe interna | `/admin/*` | `users.platform_role` (`super_admin`, `platform_staff`) conferido no servidor em toda página/ação |
| 2 — Administrador da empresa | Gestor da empresa cliente | `/app/[empresa]/*` | `organization_members` + papel com permissões `org.*` |
| 3 — Usuário da empresa | Funcionário | `/app/[empresa]/*` | papel com permissões limitadas + acesso por agente (`agent_access`) |

Permissões são **chaves** (`agents.use`, `members.manage`, `reports.view`…) agrupadas em **papéis**. Há papéis de sistema (`org_admin`, `org_member`) e a empresa pode criar papéis próprios. A checagem é sempre no servidor (`requirePermission`), nunca só escondendo botões.

## 3. Isolamento multiempresa (defesa em camadas)

1. **Aplicação**: toda consulta de dados empresariais passa por `withOrg(ctx, fn)`, que recebe o `organization_id` já validado a partir da sessão e da associação do usuário.
2. **Banco (Row Level Security)**: toda tabela empresarial tem `organization_id NOT NULL` e políticas RLS. O app conecta com o papel `nexus_app` (sem `BYPASSRLS`, não é dono das tabelas). `withOrg` abre uma transação e define `app.scope='org'` e `app.org_id` via `set_config(..., true)` (vale só na transação, seguro com pooler em modo transação). Uma consulta que esqueça o filtro **não** retorna dados de outra empresa.
3. **Credenciais e ferramentas segregadas**: credenciais de integração são criptografadas (AES-256-GCM) e só são lidas dentro do contexto da empresa dona; o worker executa cada tarefa no contexto da empresa da execução.
4. **Testes automatizados de isolamento** conectam como `nexus_app` e confirmam que a empresa A não lê nem altera nada da empresa B.

Escopos do RLS:

| `app.scope` | Uso | O que enxerga |
|---|---|---|
| `org` | Telas do cliente, worker executando tarefa de uma empresa | Só linhas com `organization_id = app.org_id` |
| `platform` | Painel do super administrador, rotinas globais | Tudo (só é aberto após conferir `platform_role` no servidor) |
| `auth` | Login, sessão, recuperação de senha | Tabelas de autenticação |

> Observação honesta: o RLS aqui é **defesa em profundidade** contra erros de código (filtro esquecido). Ele não protege contra um servidor comprometido, porque o próprio servidor define o escopo. As chaves e o acesso ao banco precisam continuar protegidos.

## 4. Autenticação

Decisão: **sessões próprias guardadas no banco** (padrão recomendado após a descontinuação do Lucia), em vez de Supabase Auth ou Auth.js.

- Senha com **Argon2id** (`@node-rs/argon2`), mínimo 10 caracteres.
- Cookie `nexus_session` `HttpOnly`, `Secure` (produção), `SameSite=Lax`, com token aleatório de 256 bits; no banco fica **apenas o hash SHA-256** do token.
- Sessão conferida no banco a cada requisição: conta desativada ou sessão revogada perde acesso **na hora**.
- Expiração deslizante (30 dias, renovada com 15 dias restantes); lista de sessões ativas com "encerrar sessão" (controle de sessões).
- Limite de tentativas de login por e-mail e por IP, **guardado no banco** (funciona com vários servidores).
- Recuperação de senha por token de uso único (hash no banco, validade 1 h). Envio por e-mail depende de credencial (SMTP/Resend). Sem credencial, o super administrador pode gerar o link manualmente — o sistema não finge que enviou.
- Sem cadastro aberto: o primeiro acesso (`/configurar`) só existe enquanto não houver usuários e cria o super administrador.

**Por que não Supabase Auth?** (a) os testes de autenticação e permissão precisam rodar localmente e no CI sem depender do serviço GoTrue; (b) o controle de sessões (listar/revogar) e o limite de tentativas ficam sob nosso controle; (c) independência de fornecedor; (d) o banco continua podendo ser o PostgreSQL do Supabase. O módulo `src/server/auth/` é isolado — trocar para Supabase Auth no futuro exige mexer só nele.

## 5. Motor de agentes

- **Agente** = registro com identidade (nome, avatar, categoria, objetivo) + **versões** imutáveis (`agent_versions`) com a configuração de inteligência (provedor, modelo, prompt de sistema, instruções, personalidade, idioma, limites, parâmetros), ferramentas e bases de conhecimento. Publicar = apontar `agents.published_version_id` para uma versão. Testes usam o rascunho.
- **Catálogo de modelos** (`agent_templates`) permite criar agentes a partir de modelos prontos, sem reconstruir a aplicação.
- **Provedores de IA** atrás de uma interface única (`LLMProvider.chat`) com adaptadores oficiais: Anthropic (`@anthropic-ai/sdk`), OpenAI (`openai`) e compatível com OpenAI (base URL configurável: OpenRouter, Groq, Ollama…). Sem chave configurada, o provedor aparece como **pendente**.
- **Loop agentic** próprio (independente de fornecedor): o modelo pede ferramentas → o runtime valida parâmetros (Zod), confere permissão, executa, registra o passo e devolve o resultado → repete até terminar ou atingir limites (passos, tempo, tokens).

## 6. Ferramentas

Interface padronizada (`src/server/tools/types.ts`):

```ts
interface ToolDefinition<I> {
  key: string; name: string; description: string; category: string;
  input: ZodSchema<I>;                // validação de parâmetros
  risk: "low" | "medium" | "high";   // ações sensíveis = high
  requiresApproval: boolean | ((input: I) => boolean);
  integration?: IntegrationKey;      // exige integração conectada
  execute(ctx: ToolContext, input: I): Promise<ToolResult>;
}
```

- Cada chamada gera um `execution_step` com entrada, saída, duração e erro (log).
- Ferramentas de risco alto (envio em massa, pagamentos, exclusões) **pausam a execução** e criam uma **aprovação** (`approvals`); só continuam após um humano autorizado aprovar.
- **Não há execução de código gerado pelo modelo.** Requisições HTTP passam por proteção contra SSRF (bloqueio de IPs privados/metadados) e lista de domínios permitidos por empresa.

## 7. Execução assíncrona

- A própria tabela `executions` é a fila: `status` (`queued → running → waiting_approval → succeeded | failed | canceled | timed_out`), `attempts`, `max_attempts`, `locked_at`, `locked_by`, `run_after`, `timeout_at`, `idempotency_key` (único por empresa → evita duplicidade).
- Worker (`npm run worker`) busca tarefas com `FOR UPDATE SKIP LOCKED` (vários workers sem conflito). Para hospedagem serverless, a rota `/api/cron/worker` (protegida por `CRON_SECRET`) processa um lote e pode ser chamada por agendador.
- Retentativas com espera exponencial; timeout por execução; cancelamento cooperativo (checado entre passos); tarefas travadas por worker morto são recuperadas.

## 8. Conhecimento (RAG)

- Upload (PDF, DOCX, TXT, CSV, XLSX, MD, Perguntas e respostas) → extração de texto → divisão em trechos → indexação.
- **Busca textual em português** (`tsvector`, sempre disponível) + **busca vetorial** com `pgvector` quando houver provedor de embeddings configurado (busca híbrida).
- Bases isoladas por empresa e, opcionalmente, vinculadas a agentes específicos.
- Conteúdo recuperado entra no prompt delimitado e marcado como **dado não confiável** (proteção contra prompt injection).

## 9. Integrações

Catálogo em código (`src/server/integrations/catalog.ts`) + conexões por empresa (`integrations`) + credenciais criptografadas (`integration_credentials`) + registro de uso. Status: `pending_credentials`, `pending_authorization`, `connected`, `error`, `disabled`. **Nenhuma integração é marcada como conectada sem um teste real de comunicação.**

## 10. Comercialização

Planos (`plans`) com preço, ciclo, limites (agentes, usuários, execuções, tokens) e recursos. Assinaturas, pagamentos e controle de inadimplência no banco. Gateways (Stripe, Mercado Pago) atrás de uma interface; ficam **inativos** até as credenciais serem configuradas e testadas. Pagamentos manuais (PIX/boleto recebidos) podem ser registrados pelo super administrador.

## 11. Workflows

Definição em grafo (`nodes`/`edges` em JSON validado por Zod) com tipos de nó: gatilho, condição, agente, ferramenta, aprovação, ação, fim. O executor percorre o grafo usando o mesmo motor de execução. O formato já é o que um construtor visual futuro vai editar.

## 12. Segurança (resumo)

Argon2id · sessões no banco · RLS · AES-256-GCM para segredos · Zod em toda entrada · rate limiting no banco · cabeçalhos de segurança (CSP, HSTS, X-Frame-Options…) · auditoria (`audit_logs`) · proteção contra prompt injection · limites de uso por plano · SSRF guard · LGPD (aviso, aceite versionado, exportação, exclusão por anonimização, retenção). Chaves de API **nunca** vão para o navegador.

## 13. Internacionalização

Idioma inicial pt-BR. Textos de interface centralizados em `src/i18n/` com função `t()`; datas/números via `Intl` com fuso `America/Sao_Paulo` vindo do servidor. Adicionar idioma = adicionar dicionário.

## 14. Hospedagem recomendada

- **Banco**: Supabase (PostgreSQL 15+, `pgvector` disponível). Migrações aplicadas com `npm run db:migrate` usando `DATABASE_MIGRATION_URL` (papel dono); o app usa `DATABASE_URL` com o papel `nexus_app`.
- **App**: Netlify (padrão da sua Skill) ou Vercel.
- **Worker**: processo dedicado (Railway, Render, Fly.io) **ou** agendador chamando `/api/cron/worker`.
