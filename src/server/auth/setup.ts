import "server-only";
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
