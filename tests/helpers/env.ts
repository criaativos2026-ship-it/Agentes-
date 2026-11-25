/** Variáveis de ambiente dos testes (banco nexus_test local). Podem ser sobrescritas pelo CI. */
export const TEST_ENV = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://nexus_app_user:nexus_app_dev_password@localhost:5432/nexus_test",
  DATABASE_MIGRATION_URL:
    process.env.TEST_DATABASE_MIGRATION_URL ?? "postgres://nexus_owner:nexus_owner_dev@localhost:5432/nexus_test",
  ENCRYPTION_KEY: process.env.TEST_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString("base64"),
};
