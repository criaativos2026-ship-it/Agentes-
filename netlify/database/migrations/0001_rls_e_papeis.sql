-- =====================================================================
-- NEXUS AI — Segurança no banco: papel da aplicação, contexto e RLS
--
-- A aplicação conecta com um usuário membro de "nexus_app" (sem BYPASSRLS e
-- que NÃO é dono das tabelas). Toda transação define o contexto com
-- set_config(..., true):
--   app.scope   = 'org' | 'platform' | 'auth'
--   app.org_id  = empresa atual (escopo org)
--   app.user_id = usuário atual
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_app') THEN
    CREATE ROLE nexus_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.scope() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('app.scope', true), ''), 'none') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_platform() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.scope() = 'platform' $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO nexus_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO nexus_app;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO nexus_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexus_app;
--> statement-breakpoint

-- Supabase expõe o schema public pela API REST (roles anon/authenticated).
-- O NEXUS não usa essa API: removemos qualquer acesso dessas roles.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Tabelas empresariais: isolamento por organization_id
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agents', 'agent_versions', 'agent_tools', 'agent_access',
    'knowledge_bases', 'knowledge_documents', 'knowledge_chunks', 'agent_knowledge_bases',
    'conversations', 'messages', 'executions', 'execution_steps', 'approvals',
    'integrations', 'integration_credentials', 'integration_usage',
    'subscriptions', 'payments', 'usage_records',
    'custom_projects', 'project_events', 'workflows', 'workflow_runs',
    'tasks', 'crm_opportunities', 'reports', 'notifications',
    'support_tickets', 'support_ticket_messages'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (app.is_platform() OR organization_id = app.org_id()) '
      'WITH CHECK (app.is_platform() OR organization_id = app.org_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Membros: a empresa vê os seus; cada usuário vê as próprias associações (para escolher empresa).
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY members_read ON organization_members FOR SELECT
  USING (app.is_platform() OR organization_id = app.org_id() OR user_id = app.user_id());
--> statement-breakpoint
CREATE POLICY members_write ON organization_members FOR ALL
  USING (app.is_platform() OR organization_id = app.org_id())
  WITH CHECK (app.is_platform() OR organization_id = app.org_id());
--> statement-breakpoint

-- Empresas: a própria empresa (escopo org) ou as empresas das quais o usuário é membro.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organizations_read ON organizations FOR SELECT
  USING (
    app.is_platform()
    OR id = app.org_id()
    OR EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = organizations.id AND m.user_id = app.user_id())
  );
--> statement-breakpoint
CREATE POLICY organizations_update_own ON organizations FOR UPDATE
  USING (app.is_platform() OR id = app.org_id())
  WITH CHECK (app.is_platform() OR id = app.org_id());
--> statement-breakpoint
CREATE POLICY organizations_platform ON organizations FOR ALL
  USING (app.is_platform()) WITH CHECK (app.is_platform());
--> statement-breakpoint

-- Papéis: papéis de sistema (organization_id nulo) são legíveis por todos e editáveis só pela plataforma.
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY roles_read ON roles FOR SELECT
  USING (organization_id IS NULL OR app.is_platform() OR organization_id = app.org_id());
--> statement-breakpoint
CREATE POLICY roles_write ON roles FOR ALL
  USING (app.is_platform() OR (organization_id IS NOT NULL AND organization_id = app.org_id()))
  WITH CHECK (app.is_platform() OR (organization_id IS NOT NULL AND organization_id = app.org_id()));
--> statement-breakpoint

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT
  USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_permissions.role_id));
--> statement-breakpoint
CREATE POLICY role_permissions_write ON role_permissions FOR ALL
  USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_permissions.role_id
                 AND (app.is_platform() OR (r.organization_id IS NOT NULL AND r.organization_id = app.org_id()))))
  WITH CHECK (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_permissions.role_id
                 AND (app.is_platform() OR (r.organization_id IS NOT NULL AND r.organization_id = app.org_id()))));
--> statement-breakpoint

-- Catálogos da plataforma: leitura livre, escrita só no escopo da plataforma.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['permissions', 'plans', 'agent_templates'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY catalog_read ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY catalog_write ON %I FOR ALL USING (app.is_platform()) WITH CHECK (app.is_platform())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Somente plataforma.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gateway_events', 'platform_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY platform_only ON %I USING (app.is_platform()) WITH CHECK (app.is_platform())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Chaves de IA: da plataforma (org nula) só no escopo plataforma; da empresa, na própria empresa.
ALTER TABLE ai_provider_credentials ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_keys_isolation ON ai_provider_credentials
  USING (app.is_platform() OR (organization_id IS NOT NULL AND organization_id = app.org_id()))
  WITH CHECK (app.is_platform() OR (organization_id IS NOT NULL AND organization_id = app.org_id()));
--> statement-breakpoint

-- Auditoria: empresa vê a sua; eventos de autenticação (org nula) podem ser gravados no escopo auth.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_read ON audit_logs FOR SELECT
  USING (app.is_platform() OR (organization_id IS NOT NULL AND organization_id = app.org_id()));
--> statement-breakpoint
CREATE POLICY audit_insert ON audit_logs FOR INSERT
  WITH CHECK (
    app.is_platform()
    OR (organization_id IS NOT NULL AND organization_id = app.org_id())
    OR (organization_id IS NULL AND app.scope() IN ('org', 'user') AND actor_user_id = app.user_id())
    OR (organization_id IS NULL AND app.scope() = 'auth')
  );
--> statement-breakpoint

-- Usuários: autenticação/plataforma; o próprio usuário; membros da empresa atual (somente leitura).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_read ON users FOR SELECT
  USING (
    app.scope() IN ('platform', 'auth')
    OR id = app.user_id()
    OR (app.org_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members m WHERE m.user_id = users.id AND m.organization_id = app.org_id()))
  );
--> statement-breakpoint
CREATE POLICY users_write ON users FOR ALL
  USING (app.scope() IN ('platform', 'auth') OR id = app.user_id())
  WITH CHECK (app.scope() IN ('platform', 'auth') OR id = app.user_id());
--> statement-breakpoint

-- Sessões e tokens de senha.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sessions', 'password_reset_tokens'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY auth_isolation ON %I USING (app.scope() IN (''platform'', ''auth'') OR user_id = app.user_id()) '
      'WITH CHECK (app.scope() IN (''platform'', ''auth'') OR user_id = app.user_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- rate_limit_buckets: contém apenas chaves técnicas (hash de e-mail/IP); sem RLS, usado em qualquer escopo.

-- ---------------------------------------------------------------------
-- Integridade: versões de agente travadas não podem ser alteradas.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.prevent_locked_version_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'agent_version % is locked (published) and cannot be modified', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER agent_versions_locked BEFORE UPDATE ON agent_versions
  FOR EACH ROW EXECUTE FUNCTION app.prevent_locked_version_update();
--> statement-breakpoint

-- Ferramentas e bases de uma versão travada também ficam congeladas.
CREATE OR REPLACE FUNCTION app.prevent_locked_version_children() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  v_id := coalesce(NEW.agent_version_id, OLD.agent_version_id);
  IF EXISTS (SELECT 1 FROM agent_versions v WHERE v.id = v_id AND v.locked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'agent_version % is locked (published) and cannot be modified', v_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER agent_tools_locked BEFORE INSERT OR UPDATE OR DELETE ON agent_tools
  FOR EACH ROW EXECUTE FUNCTION app.prevent_locked_version_children();
--> statement-breakpoint
CREATE TRIGGER agent_kb_locked BEFORE INSERT OR UPDATE OR DELETE ON agent_knowledge_bases
  FOR EACH ROW EXECUTE FUNCTION app.prevent_locked_version_children();
--> statement-breakpoint

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO nexus_app;
