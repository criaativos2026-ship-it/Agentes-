# NEXUS AI — Modelo de dados

Fonte da verdade: `src/server/db/schema/*.ts` (Drizzle) e `drizzle/*.sql` (migrações).
Convenções: `uuid` com `gen_random_uuid()`, `timestamptz` com `now()`, `organization_id NOT NULL` em **toda** tabela empresarial, `ON DELETE` explícito, índices em colunas de filtro/ordenação, e-mails em minúsculas (`citext` não é usado para manter portabilidade; normalizamos no app e há índice único em `lower(email)`).

## Legenda de escopo RLS

- **T** = tabela empresarial (política `tenant`: `scope=platform` **ou** `organization_id = app.org_id`)
- **P** = tabela da plataforma (leitura conforme regra; escrita só `platform`)
- **A** = tabela de autenticação (escopo `auth`/`platform` ou o próprio usuário)

## Identidade e acesso

| Tabela | RLS | Campos principais |
|---|---|---|
| `users` | A | id, email (único, minúsculo), name, password_hash, platform_role (`super_admin`/`platform_staff`/null), status (`active`/`disabled`), locale, privacy_version, privacy_accepted_at, deletion_requested_at, anonymized_at, last_login_at |
| `sessions` | A | id, user_id → users, token_hash (único), expires_at, ip, user_agent, revoked_at, active_org_id |
| `password_reset_tokens` | A | id, user_id, token_hash, expires_at, used_at |
| `rate_limit_buckets` | A | key, window_start, count (PK key+window) |
| `organizations` | T* | id, name, slug (único), segment, description, document (CNPJ, opcional), status (`active`/`trial`/`suspended`/`canceled`), is_demo, timezone, settings jsonb |
| `organization_members` | T | organization_id, user_id, role_id, status, invited_by — único (org, user) |
| `roles` | T/P | id, organization_id (null = papel de sistema), key, name, description, is_system |
| `permissions` | P | key (PK), group, description |
| `role_permissions` | — | role_id, permission_key (PK composta) |

\* Em `organizations` a regra usa `id = app.org_id`.

## Agentes

| Tabela | RLS | Campos principais |
|---|---|---|
| `agent_templates` | P | catálogo: key, name, category, description, default_config jsonb, is_active |
| `agents` | T | id, organization_id, name, slug, avatar, description, category, objective, status (`draft`/`testing`/`published`/`disabled`), draft_version_id, published_version_id, created_by |
| `agent_versions` | T | id, organization_id, agent_id, version (inteiro), provider, model, system_prompt, instructions, personality, language, boundaries, params jsonb (max_tokens, effort, temperature…), limits jsonb (max_steps, timeout_s, max_tokens_per_run), notes, created_by, created_at — **imutável após publicada** |
| `agent_tools` | T | agent_version_id, tool_key, config jsonb, requires_approval (sobrescreve o padrão) |
| `agent_knowledge_bases` | T | agent_version_id, knowledge_base_id |
| `agent_access` | T | agent_id, role_id **ou** user_id (quem pode usar) |

## Conhecimento (RAG)

| Tabela | RLS | Campos principais |
|---|---|---|
| `knowledge_bases` | T | id, organization_id, name, description |
| `knowledge_documents` | T | id, organization_id, knowledge_base_id, title, source_type (`upload`/`text`/`faq`), mime_type, size_bytes, sha256, status (`pending`/`processing`/`ready`/`error`), error, chunk_count |
| `knowledge_chunks` | T | id, organization_id, document_id, knowledge_base_id, ordinal, content, tsv (tsvector `portuguese`, gerado), embedding `vector` (opcional), token_estimate |

## Conversas e execução

| Tabela | RLS | Campos principais |
|---|---|---|
| `conversations` | T | id, organization_id, agent_id, agent_version_id, user_id, channel (`app`/`test`/`whatsapp`/`api`/`workflow`), title, is_test |
| `messages` | T | id, organization_id, conversation_id, role (`user`/`assistant`/`tool`/`system`), content jsonb, execution_id, tokens_in, tokens_out |
| `executions` | T | id, organization_id, agent_id, agent_version_id, conversation_id, workflow_run_id, triggered_by, kind (`chat`/`task`/`workflow_step`), status, input jsonb, output jsonb, error, attempts, max_attempts, run_after, locked_at, locked_by, started_at, finished_at, timeout_at, cancel_requested_at, idempotency_key (único por org), tokens_in, tokens_out, cost_micros |
| `execution_steps` | T | id, organization_id, execution_id, ordinal, type (`llm`/`tool`/`approval`/`retrieval`/`log`), name, status, input jsonb, output jsonb, error, started_at, finished_at, duration_ms |
| `approvals` | T | id, organization_id, execution_id, step_id, tool_key, payload jsonb, status (`pending`/`approved`/`rejected`/`expired`), requested_at, decided_by, decided_at, reason |

## Integrações

| Tabela | RLS | Campos principais |
|---|---|---|
| `integrations` | T | id, organization_id, provider_key, name, status, scopes, connected_at, last_checked_at, last_error, config jsonb (não secreto) |
| `integration_credentials` | T | id, organization_id, integration_id, kind (`api_key`/`oauth`/`basic`), ciphertext (AES-256-GCM), key_version, expires_at |
| `integration_usage` | T | id, organization_id, integration_id, action, status, created_at, execution_id |
| `ai_provider_credentials` | T/P | organization_id (null = chave da plataforma), provider, ciphertext, status, last_checked_at |

## Comercialização

| Tabela | RLS | Campos principais |
|---|---|---|
| `plans` | P (leitura por todos) | id, key, name, type (`monthly`/`annual`/`custom`/`enterprise`), price_cents, currency, interval, limits jsonb (agents, users, executions_per_month, tokens_per_month, storage_mb), features jsonb, is_active, valid_until |
| `subscriptions` | T | id, organization_id, plan_id, status (`trialing`/`active`/`past_due`/`canceled`/`suspended`), current_period_start/end, custom_limits jsonb, custom_price_cents, gateway, gateway_ref, cancel_at |
| `payments` | T | id, organization_id, subscription_id, amount_cents, currency, status (`pending`/`paid`/`failed`/`refunded`/`overdue`), method (`manual_pix`/`manual_boleto`/`stripe`/`mercadopago`…), due_date, paid_at, gateway_ref, notes |
| `usage_records` | T | id, organization_id, agent_id, execution_id, kind (`llm_tokens`/`execution`/`tool_call`/`embedding`/`storage`), provider, model, quantity, tokens_in, tokens_out, cost_micros, period (AAAA-MM), created_at |
| `gateway_events` | P | id, gateway, event_id (único), type, payload, processed_at (idempotência de webhooks) |

## Projetos personalizados e workflows

| Tabela | RLS | Campos principais |
|---|---|---|
| `custom_projects` | T | id, organization_id, name, segment, business_description, objectives, needs, processes jsonb, required_integrations jsonb, status (9 status do briefing), owner_user_id (responsável), go_live_date |
| `project_events` | T | id, organization_id, project_id, type, message, from_status, to_status, user_id, created_at (histórico de alterações) |
| `workflows` | T | id, organization_id, name, description, trigger_type (`manual`/`webhook`/`schedule`/`event`), trigger_config, definition jsonb (nós/arestas), status, version |
| `workflow_runs` | T | id, organization_id, workflow_id, status, input, output, current_node, started_at, finished_at |
| `tasks` | T | id, organization_id, title, description, status, assignee_id, agent_id, execution_id, due_at |
| `crm_opportunities` | T | id, organization_id, name, company, contact, source, stage, score, notes, created_by_execution_id |
| `reports` | T | id, organization_id, title, content (markdown), created_by_execution_id, created_by |

## Operação e conformidade

| Tabela | RLS | Campos principais |
|---|---|---|
| `audit_logs` | T (org_id opcional) | id, organization_id (null = ação da plataforma), actor_user_id, action, entity_type, entity_id, metadata jsonb, ip, created_at |
| `notifications` | T | id, organization_id, user_id, type, title, body, link, read_at |
| `support_tickets` | T | id, organization_id, opened_by, subject, status (`open`/`in_progress`/`waiting_customer`/`resolved`/`closed`), priority, assigned_to |
| `support_ticket_messages` | T | id, organization_id, ticket_id, author_id, body, is_internal |
| `platform_settings` | P | key (PK), value jsonb |

## Índices e restrições principais

- `users(lower(email))` único; `sessions(token_hash)` único; `sessions(user_id)`.
- `organizations(slug)` único; `organization_members(organization_id, user_id)` único.
- `agents(organization_id, slug)` único; `agent_versions(agent_id, version)` único.
- `executions(organization_id, idempotency_key)` único parcial; `executions(status, run_after)` para a fila.
- `knowledge_chunks` com índice GIN em `tsv` e HNSW em `embedding` (quando `pgvector` existir).
- `usage_records(organization_id, period)`; `audit_logs(organization_id, created_at desc)`.
- `gateway_events(gateway, event_id)` único.
- `CHECK` em valores monetários (≥ 0) e chaves de domínio.
