import postgres from "postgres";
import { TEST_ENV } from "./env";
import { resetData } from "./global-setup";

Object.assign(process.env, TEST_ENV);

/** Conexão como DONO (só para preparar/inspecionar nos testes). */
export const ownerSql = () => postgres(TEST_ENV.DATABASE_MIGRATION_URL, { max: 1, onnotice: () => {} });

/** Conexão como APLICAÇÃO (sujeita a RLS), igual à usada em produção. */
export const appSql = () => postgres(TEST_ENV.DATABASE_URL, { max: 1, onnotice: () => {} });

export async function resetDatabase() {
  const sql = ownerSql();
  await resetData(sql);
  await sql.end();
}
