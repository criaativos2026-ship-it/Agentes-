# NEXUS AI — Plano de implementação

Legenda: ✅ concluído e testado · 🟡 estrutura pronta, depende de credencial externa · ⏳ próxima etapa

## Tecnologias escolhidas

| Camada | Escolha | Versão verificada (nov/2026) |
|---|---|---|
| Framework | Next.js App Router + React + TypeScript (strict) | next 16.4, react 19.3 |
| Estilo | Tailwind CSS v4 + tokens (`design/tokens.css`) + componentes estilo shadcn (radix-ui) | tailwindcss 4.3, radix-ui 1.8 |
| Fonte / ícones | Inter (`next/font`) / lucide-react | — |
| Banco | PostgreSQL 15+ (Supabase em produção) + Drizzle ORM + migrações SQL + RLS + pgvector | drizzle-orm 0.45, drizzle-kit 0.31, postgres 4.1 |
| Validação | Zod | 4.x |
| Senhas | Argon2id (`@node-rs/argon2`) | 2.2 |
| IA | `@anthropic-ai/sdk`, `openai` (adaptadores) | 1.14 / 7.x |
| Documentos | `pdf-parse`, `mammoth`, `papaparse`, `exceljs` | — |
| Gráficos | recharts | 3.x |
| Testes | Vitest (unitários/integração com banco real) + Playwright (E2E) | vitest 5.x |

## Estrutura de diretórios

```
design/tokens.css                 identidade visual (fonte única)
drizzle/                          migrações SQL versionadas (tabelas + RLS + seeds)
docs/                             arquitetura, banco, plano, skills, integrações, deploy
scripts/                          migrate.ts, seed-demo.ts, worker.ts, db-roles.ts
src/app/(auth)/                   entrar, configurar, recuperar-senha, redefinir-senha
src/app/admin/                    NÍVEL 1 — super administrador
src/app/app/[org]/                NÍVEL 2 e 3 — ambiente da empresa
src/app/aceite, privacidade       LGPD
src/app/api/                      cron/worker, webhooks, exportação
src/components/ui/                componentes base
src/components/                   componentes do app (shell, dashboards, formulários)
src/i18n/                         dicionários (pt-BR)
src/lib/                          utilitários puros (format, utils)
src/server/db/                    schema, cliente, contexto de tenant (withOrg/withPlatform)
src/server/auth/                  senha, sessão, guardas, rate limit, recuperação
src/server/rbac/                  catálogo de permissões e checagem
src/server/security/              criptografia, SSRF, prompt guard
src/server/audit/                 auditoria
src/server/ai/                    provedores de IA (interface + adaptadores)
src/server/agents/                agentes, versões, publicação, runtime
src/server/tools/                 registro e ferramentas
src/server/execution/             fila, worker, motor
src/server/knowledge/             ingestão, extração, busca
src/server/integrations/          catálogo e conectores
src/server/billing/               planos, assinaturas, gateways, limites
src/server/workflows/             definição e executor
tests/unit, tests/integration, tests/e2e
```

## Fases

| Fase | Entregas | Status |
|---|---|---|
| 1 — Planejamento | Arquitetura, banco, estrutura, dependências, investigação de Skills | ✅ |
| 2 — Fundação | Next.js, 44 tabelas + migrações, RLS em 43 tabelas, sessões no banco, Argon2id, limite de tentativas, papéis/permissões, isolamento multiempresa | ✅ |
| 3 — Interface | Painéis admin e cliente responsivos, dashboards com dados reais, empresas, usuários, equipe, papéis, auditoria, minha conta/LGPD | ✅ |
| 4 — Agentes | Construtor completo (identidade, inteligência, 21 ferramentas, conhecimento, acesso, testes, versões, publicação) | ✅ |
| 5 — Execução | Motor agentic, fila, worker, retentativas, aprovações, cancelamento, monitoramento, consumo | ✅ |
| 6 — Conhecimento e integrações | Upload/extração/RAG híbrido, análise de planilhas, central de integrações com teste real, OAuth Google, webhook WhatsApp | ✅ código · 🟡 credenciais |
| 7 — Comercialização | Planos, assinaturas, pagamentos, inadimplência/suspensão, limites, Stripe e Mercado Pago preparados | ✅ código · 🟡 gateways desligados até configurar |
| 8 — Testes e publicação | 63 testes de integração + 37 E2E, revisão de segurança, documentação, CI, Netlify | ✅ · 🟡 publicação depende das suas contas |

Também entregues: Projetos personalizados (seção 13/15), Automações/workflows (seção 14), Central de suporte, Tarefas e Relatórios.

## Pendências que dependem de você

- Credenciais e contas externas (lista completa em `docs/INTEGRACOES.md`).
- Contas Supabase e Netlify para publicar (passo a passo em `docs/DEPLOY.md`).
- Definir nome/marca definitivos (editar só `design/tokens.css` e `src/components/logo.tsx`).
- Revisão jurídica do aviso de privacidade; contato do encarregado e prazo de retenção (`src/lib/privacy.ts`).
- Cadastrar os planos e preços que vão ser comercializados.

## Próximas evoluções sugeridas

Construtor visual (arrastar e soltar) sobre a definição em grafo já existente · MFA para administradores · CSP com nonce · respostas automáticas no WhatsApp sem aprovação (por configuração explícita) · mais gatilhos por evento (ex.: oportunidade criada) · streaming de tokens no chat · relatórios exportáveis em planilha.
