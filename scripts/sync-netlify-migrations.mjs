/**
 * Copia as migrações (drizzle/NNNN_nome.sql) para netlify/database/migrations, que a Netlify aplica
 * sozinha antes de cada publicação. Falha se uma migração já copiada tiver sido alterada
 * (migração aplicada nunca é editada — crie outra).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";

const src = "drizzle";
const dst = "netlify/database/migrations";
mkdirSync(dst, { recursive: true });
let copied = 0;
for (const f of readdirSync(src).filter((f) => /^\d{4}_[a-z0-9_-]+\.sql$/.test(f)).sort()) {
  const target = `${dst}/${f}`;
  if (existsSync(target)) {
    if (readFileSync(target, "utf8") !== readFileSync(`${src}/${f}`, "utf8")) {
      console.error(`ERRO: ${f} foi alterada depois de copiada. Não edite migrações publicadas; crie uma nova.`);
      process.exit(1);
    }
    continue;
  }
  copyFileSync(`${src}/${f}`, target);
  copied++;
}
console.log(`Migrações sincronizadas (${copied} nova(s)).`);
