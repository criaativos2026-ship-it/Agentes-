# Publicação (produção)

## Caminho atual: Netlify + Netlify Database (projeto `nexus-ai-agentes`)

Já configurado: projeto criado, login da equipe Netlify desligado para visitantes, variáveis
`ENCRYPTION_KEY`, `CRON_SECRET`, `SETUP_TOKEN` (produção), `APP_URL`, `WORKER_BUDGET_MS`,
`WORKER_HARD_LIMIT_MS`, `WORKER_LEASE_MS`. O banco é criado pela Netlify (pacote `@netlify/database`)
e as migrações de `netlify/database/migrations` são aplicadas antes de cada publicação. A aplicação
usa `NETLIFY_DB_URL` e assume o papel `nexus_app` em toda transação (RLS ativo).

Para publicar: Netlify → projeto **nexus-ai-agentes** → **Project configuration → Build & deploy →
Continuous deployment → Link repository** → GitHub → `criaativos2026-ship-it/Agentes-` → branch de
produção `ccr-171475ad-48d1cm` (ou `main`, depois de juntar o código) → **Deploy**. Cada push publica sozinho.

Primeiro acesso: `https://nexus-ai-agentes.netlify.app/configurar?codigo=<SETUP_TOKEN>` (o valor está
nas variáveis de ambiente do projeto). Sem o código a tela não cria contas.

Limite da Netlify: 60 s por requisição. As execuções dos agentes são fatiadas (o estado é salvo e
a tarefa continua na chamada seguinte); para tarefas muito longas, prefira o worker dedicado.

---

## Alternativa: Supabase + Netlify/Vercel

Arquitetura recomendada: **Supabase** (PostgreSQL + pgvector) · **Netlify** (app Next.js) · fila processada por **função agendada** (incluída) ou **worker dedicado**.

## 1. Banco no Supabase

1. Crie o projeto (região São Paulo, se disponível).
2. Em *Database → Extensions*, ative `vector` e `pgcrypto`.
3. Copie a *connection string* do papel `postgres` (dono) → `DATABASE_MIGRATION_URL`.
4. No seu computador: `DATABASE_MIGRATION_URL=... npm run db:migrate`.
5. Crie o usuário da aplicação: `DATABASE_MIGRATION_URL=... APP_DB_PASSWORD="senha-longa" npx tsx scripts/create-app-db-user.ts`.
6. Monte `DATABASE_URL` com `nexus_app_user` e a senha, usando o **pooler em modo transação** (porta 6543). O app já usa `prepare: false` e define o contexto de segurança por transação, compatível com o pooler.

> A API REST automática do Supabase não é usada: a migração revoga o acesso das roles `anon` e `authenticated` às tabelas.

## 2. App na Netlify

1. *Add new project → Import from Git* → este repositório.
2. Variáveis (Site configuration → Environment variables): `DATABASE_URL`, `ENCRYPTION_KEY`, `APP_URL` (URL final), `CRON_SECRET` e as opcionais do `.env.example`. Marque as chaves como secretas.
3. Publique. A função `netlify/functions/worker-cron.mts` roda a cada minuto e chama `/api/cron/worker` (fila, cobrança, automações agendadas, retenção LGPD).
4. Abra a URL: a primeira pessoa vê o **Primeiro acesso** — crie a sua conta de super administrador antes de divulgar o endereço.

Limite: funções serverless têm tempo máximo de execução. Agentes com tarefas longas (muitos passos) funcionam melhor com o **worker dedicado** (`npm run worker` em Railway, Render, Fly.io ou um servidor), que pode rodar em paralelo à função agendada.

## 3. Depois de publicar

- Cadastre a chave de IA em *Admin → Configurações* e confirme "Verificada".
- Configure e-mail (Resend) para a recuperação de senha.
- Configure os webhooks externos (WhatsApp, Stripe, Mercado Pago) com a URL final.
- Mantenha o repositório **privado**.
- Faça backup da `ENCRYPTION_KEY` em local seguro: sem ela, as credenciais salvas não podem ser lidas.

## 4. Atualizações

Cada push no branch de produção republica. Se houver migração nova, rode `npm run db:migrate` antes (nunca edite uma migração já aplicada; crie outra).
