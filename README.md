# NEXUS AI

Plataforma SaaS para **criar, configurar, testar, publicar, executar e comercializar agentes de inteligência artificial personalizados** para empresas de qualquer segmento.

> Nome e identidade visual provisórios. Idioma inicial: português do Brasil (estrutura pronta para outros idiomas).

## O que a plataforma faz

| Área | Funcionalidades |
|---|---|
| **Super administrador** (`/admin`) | Dashboard com indicadores reais · empresas · projetos personalizados · usuários · **Construtor de agentes** · monitoramento de execuções · consumo de IA · integrações · planos · assinaturas e pagamentos · suporte · logs de atividades · configurações (chaves de IA, status dos serviços) |
| **Administrador da empresa** (`/app/<empresa>`) | Painel · agentes contratados · conversa com agentes · histórico de atividades · aprovações · tarefas · relatórios · automações · base de conhecimento · integrações · equipe e papéis/permissões · plano e consumo · suporte · registro de atividades |
| **Usuário da empresa** | Usa os agentes liberados para o seu papel; vê as próprias execuções |

**Construtor de agentes:** identidade, provedor e modelo de IA, prompt de sistema, instruções, personalidade, idioma, limites de atuação, parâmetros de geração, limites de execução, 21 ferramentas com política de aprovação, bases de conhecimento, acesso por papel, área de testes (conversa com o rascunho, passos ao vivo) e versões imutáveis com publicação e restauração.

**Motor de execução:** loop agentic próprio e independente de fornecedor; fila no PostgreSQL com `SKIP LOCKED`; idempotência; retentativas com espera exponencial; tempo limite; cancelamento; recuperação de tarefas travadas; aprovação humana obrigatória para ações sensíveis; registro de cada passo, ferramenta, tokens e custo. Não executa código gerado pelo modelo.

## Tecnologias

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 + componentes estilo shadcn (Radix) · PostgreSQL 15+ (Supabase em produção) com **Row Level Security** e pgvector · Drizzle ORM · Zod · Argon2id · SDKs oficiais `@anthropic-ai/sdk` e `openai` · Vitest · Playwright.

Detalhes e decisões: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) · modelo de dados: [`docs/BANCO_DE_DADOS.md`](docs/BANCO_DE_DADOS.md) · status por fase: [`docs/PLANO_DE_IMPLEMENTACAO.md`](docs/PLANO_DE_IMPLEMENTACAO.md) · Skills reaproveitadas: [`docs/SKILLS_E_RECURSOS_REUTILIZADOS.md`](docs/SKILLS_E_RECURSOS_REUTILIZADOS.md).

## Como rodar localmente

Requisitos: Node 22+, PostgreSQL 15+ com a extensão `vector` (pgvector).

```bash
npm install

# 1. Banco: crie o banco e as extensões (como superusuário)
createdb nexus
psql -d nexus -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# 2. Variáveis: copie e preencha
cp .env.example .env.local
#    ENCRYPTION_KEY: openssl rand -base64 32
#    CRON_SECRET:    openssl rand -hex 32

# 3. Migrações (papel DONO das tabelas)
npm run db:migrate

# 4. Usuário da aplicação (membro de nexus_app, sujeito a RLS) — use a senha no DATABASE_URL
APP_DB_PASSWORD="uma-senha-longa-aqui" npx tsx scripts/create-app-db-user.ts

# 5. App + worker (em terminais separados)
npm run dev
npm run worker
```

Abra `http://localhost:3000`. O **primeiro acesso** cria o super administrador (a tela só existe enquanto não houver usuários).

Opcional: `DEMO_PASSWORD="..." npm run db:seed-demo` cria 3 empresas de **demonstração** (marcadas, e-mails `@demo.nexus.invalid`). Para remover: `DEMO_REMOVE=1 npm run db:seed-demo`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run worker` | Processa a fila de execuções, cobrança, automações agendadas e limpeza LGPD |
| `npm run db:migrate` | Aplica migrações (`DATABASE_MIGRATION_URL`) |
| `npm run db:generate` | Gera migração a partir do schema Drizzle |
| `npm run db:seed-demo` | Dados de demonstração |
| `npm run typecheck` / `lint` | Verificações |
| `npm test` | Testes unitários e de integração (banco real, inclui isolamento RLS) |
| `npm run test:e2e` | Testes no navegador (precisa de `npm run build` antes e do banco `nexus_e2e`) |

## Variáveis de ambiente

Todas documentadas em [`.env.example`](.env.example). Resumo:

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | Conexão da aplicação (usuário membro de `nexus_app`) |
| `DATABASE_MIGRATION_URL` | para migrar | Papel dono das tabelas (ex.: `postgres` no Supabase) |
| `ENCRYPTION_KEY` | sim | AES-256-GCM das credenciais (32 bytes base64) — **guarde com segurança** |
| `APP_URL` | sim | Links de e-mail, OAuth e webhooks |
| `CRON_SECRET` | serverless | Protege `/api/cron/worker` |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | não | Chaves da plataforma (também podem ser cadastradas no painel) |
| `RESEND_API_KEY`, `EMAIL_FROM` | não | E-mail (recuperação de senha, ferramenta `send_email`) |
| `TAVILY_API_KEY` | não | Pesquisa na internet |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | não | Gmail, Agenda, Planilhas, Drive (OAuth) |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | não | Webhook de mensagens recebidas |
| `STRIPE_*`, `MERCADOPAGO_*` | não | Pagamento online (desligado até liberar no painel) |
| `EMBEDDING_MODEL` | não | Modelo de embeddings (padrão `text-embedding-3-small`) |

Sem uma credencial, a funcionalidade correspondente aparece como **PENDENTE** — nada é simulado. Veja [`docs/INTEGRACOES.md`](docs/INTEGRACOES.md).

## Segurança e LGPD

Isolamento multiempresa no banco (RLS) + na aplicação · sessões no banco com revogação · Argon2id · limite de tentativas · criptografia de credenciais por empresa · proteção contra SSRF e prompt injection · aprovação humana para ações sensíveis · auditoria · cabeçalhos de segurança · aviso de privacidade com aceite versionado, exportação de dados, pedido de exclusão, anonimização e retenção automática. Detalhes: [`docs/SEGURANCA.md`](docs/SEGURANCA.md).

## Publicação

Banco no Supabase + app na Netlify (ou Vercel) + processamento da fila por função agendada ou worker dedicado. Passo a passo: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Testes

- **63 testes** de unidade/integração com PostgreSQL real: isolamento RLS entre empresas, autenticação e sessões, criptografia, motor de execução (ferramentas, aprovações, retentativas, cancelamento, limites, idempotência), base de conhecimento, cobrança e workflows.
- **37 cenários E2E** no navegador (computador e celular).
- O LLM nos testes é um **dublê de teste** determinístico (ativado só por variável explícita e somente em `localhost`); ele não existe no produto.
