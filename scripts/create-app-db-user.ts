/**
 * Cria (ou atualiza a senha de) um usuário de login para a aplicação, membro de "nexus_app".
 * Uso: APP_DB_USER=nexus_app_user APP_DB_PASSWORD=... npx tsx scripts/create-app-db-user.ts
 * A senha nunca é impressa.
 */
import postgres from "postgres";

const url = process.env.DATABASE_MIGRATION_URL;
const user = process.env.APP_DB_USER ?? "nexus_app_user";
const password = process.env.APP_DB_PASSWORD;
if (!url) throw new Error("DATABASE_MIGRATION_URL não configurada.");
if (!password || password.length < 16) throw new Error("APP_DB_PASSWORD precisa ter ao menos 16 caracteres.");
if (!/^[a-z_][a-z0-9_]{2,62}$/.test(user)) throw new Error("APP_DB_USER inválido.");

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const [exists] = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${user}`;
const pw = password.replace(/'/g, "''");
if (exists) await sql.unsafe(`ALTER ROLE ${user} WITH LOGIN NOBYPASSRLS PASSWORD '${pw}'`);
else await sql.unsafe(`CREATE ROLE ${user} WITH LOGIN NOBYPASSRLS PASSWORD '${pw}' IN ROLE nexus_app`);
await sql.unsafe(`GRANT nexus_app TO ${user}`);
await sql.end();
console.log(`Usuário de aplicação "${user}" pronto (membro de nexus_app, sujeito a RLS).`);
