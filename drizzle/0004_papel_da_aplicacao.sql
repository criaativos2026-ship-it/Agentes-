-- =====================================================================
-- Permite que a conexão do DONO do banco assuma o papel "nexus_app"
-- (SET LOCAL ROLE em cada transação). Assim o RLS vale mesmo quando a
-- hospedagem fornece uma única credencial (ex.: Netlify Database).
-- PostgreSQL 16+: a permissão SET precisa ser concedida explicitamente.
-- =====================================================================
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 160000 THEN
    EXECUTE 'GRANT nexus_app TO CURRENT_USER WITH SET TRUE, INHERIT FALSE';
  ELSE
    EXECUTE 'GRANT nexus_app TO CURRENT_USER';
  END IF;
END $$;
