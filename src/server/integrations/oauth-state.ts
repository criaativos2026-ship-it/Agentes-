import "server-only";
import { createHmac } from "node:crypto";
import { randomToken, safeEqual } from "@/server/security/crypto";

/** Estado OAuth assinado (HMAC com chave derivada de ENCRYPTION_KEY), com validade de 10 minutos. */
const secret = () => createHmac("sha256", process.env.ENCRYPTION_KEY ?? "").update("oauth-state-v1").digest();

export function signState(data: { orgId: string; slug: string; userId: string }) {
  const nonce = randomToken(16);
  const payload = Buffer.from(JSON.stringify({ ...data, nonce, exp: Date.now() + 10 * 60_000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { state: `${payload}.${sig}`, nonce };
}

export function verifyState(state: string): { orgId: string; slug: string; userId: string; nonce: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { orgId: string; slug: string; userId: string; nonce: string; exp: number };
  return data.exp > Date.now() ? data : null;
}
