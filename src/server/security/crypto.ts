import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Criptografia de segredos (credenciais de integrações e chaves de IA) com AES-256-GCM.
 * Formato: v1.<iv base64url>.<tag base64url>.<dados base64url>
 * A chave vem de ENCRYPTION_KEY (32 bytes em base64). O texto claro nunca é registrado em log.
 */
const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY não configurada: não é possível guardar credenciais.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY deve ter 32 bytes (gere com: openssl rand -base64 32).");
  return buf;
}

export function isEncryptionConfigured() {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string, aad = ""): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, aad = ""): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Formato de segredo inválido.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Token aleatório (256 bits) para sessões, links e webhooks. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** "sk-ant-…abcd": permite identificar a chave sem revelá-la. */
export function keyHint(secret: string) {
  const s = secret.trim();
  return s.length <= 8 ? "••••" : `${s.slice(0, 4)}…${s.slice(-4)}`;
}
