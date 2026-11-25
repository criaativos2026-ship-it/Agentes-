import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Parâmetros recomendados pela OWASP para Argon2id (19 MiB, 2 iterações).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const PASSWORD_MIN = 10;

export function hashPassword(password: string) {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar contas. */
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummy ??= hashPassword("nexus-dummy-password-for-timing");
  await verifyPassword(await dummy, password);
}
