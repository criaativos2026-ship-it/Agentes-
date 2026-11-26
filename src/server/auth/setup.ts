import "server-only";
import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { count } from "drizzle-orm";
import { withAuth } from "@/server/db/client";
import { users } from "@/server/db/schema";

/** O primeiro acesso (/configurar) só existe enquanto não houver nenhum usuário. */
export async function hasAnyUser() {
  await connection();
  const [row] = await withAuth((tx) => tx.select({ n: count() }).from(users));
  return Number(row.n) > 0;
}

/**
 * Em produção, o primeiro acesso exige o código SETUP_TOKEN (link enviado ao dono da plataforma):
 * evita que um visitante qualquer chegue antes e vire super administrador.
 */
export function setupTokenRequired() {
  return Boolean(process.env.SETUP_TOKEN);
}

export function setupTokenValid(token: string | null | undefined) {
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return true;
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
