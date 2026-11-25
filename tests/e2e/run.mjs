/**
 * Testes E2E (Playwright) — fluxo completo no navegador, computador e celular.
 * Uso: npm run build && npm run test:e2e
 * Banco: nexus_e2e (limpo a cada rodada). Imprime PASS/FAIL por cenário e os erros de JS da página.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { createRequire } from "node:module";

// Playwright é resolvido via require (respeita NODE_PATH, onde o ambiente já tem o navegador instalado).
// Em outro ambiente: npm i -D playwright && npx playwright install chromium
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const OWNER_URL = process.env.E2E_MIGRATION_URL ?? "postgres://nexus_owner:nexus_owner_dev@localhost:5432/nexus_e2e";
const APP_URL = process.env.E2E_DATABASE_URL ?? "postgres://nexus_app_user:nexus_app_dev_password@localhost:5432/nexus_e2e";
const ONLY = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY) : null;

const results = [];
const jsErrors = [];
export const ctx = { BASE, sql: null };

async function resetDb() {
  const sql = postgres(OWNER_URL, { max: 1, onnotice: () => {} });
  const tables = await sql`select tablename from pg_tables where schemaname = 'public'`;
  await sql.unsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  for (const stmt of readFileSync("drizzle/0002_catalogo_inicial.sql", "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await sql.unsafe(stmt);
  return sql;
}

async function startServer() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: APP_URL,
    DATABASE_MIGRATION_URL: OWNER_URL,
    ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    APP_URL: BASE,
    CRON_SECRET: "e2e-cron-secret-0123456789abcdef",
    NODE_ENV: "production",
  };
  const proc = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  proc.stderr.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/privacidade`);
      if (r.ok) return proc;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Servidor não iniciou.");
}

export async function step(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`FAIL  ${name}\n      ${String(err?.message ?? err).split("\n").slice(0, 4).join("\n      ")}`);
  }
}

export function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

export async function newPage(browser, mobile = false) {
  const context = await browser.newContext(mobile ? { ...devices["iPhone 13"] } : { viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => jsErrors.push(`${page.url()}: ${e.message}`));
  return page;
}

export async function login(page, email, password) {
  await page.goto(`${BASE}/entrar`);
  if (!(await page.locator("#email").count())) throw new Error(`login: formulário ausente em ${page.url()}: ${(await page.locator("body").innerText()).slice(0, 200)}`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !["/entrar", "/"].includes(u.pathname), { timeout: 15000 }), page.click("button[type=submit]")]);
}

export async function logout(page) {
  await page.context().clearCookies();
}

export async function acceptPrivacyIfAsked(page) {
  if (new URL(page.url()).pathname === "/aceite") {
    await page.click("button[role=checkbox]");
    await Promise.all([page.waitForURL((u) => u.pathname !== "/aceite"), page.click("text=Concordo e quero continuar")]);
  }
}

const sql = await resetDb();
ctx.sql = sql;
const server = await startServer();
const browser = await chromium.launch();

try {
  const suites = ["./suite-foundation.mjs", "./suite-agents.mjs"];
  for (const s of suites) {
    try {
      const mod = await import(s);
      await mod.default({ browser, sql, BASE, step, expect, newPage, login, logout, acceptPrivacyIfAsked });
    } catch (err) {
      if (err?.code === "ERR_MODULE_NOT_FOUND" && String(err.message).includes(s.slice(2))) continue;
      throw err;
    }
  }
} finally {
  await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
  await sql.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} cenários passaram.`);
console.log(`JS errors: ${JSON.stringify(jsErrors)}`);
process.exit(failed.length || jsErrors.length ? 1 : 0);
