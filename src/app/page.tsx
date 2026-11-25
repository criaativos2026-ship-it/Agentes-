import { redirect } from "next/navigation";
import { getSession, isPlatformUser, listUserOrgs } from "@/server/auth/guards";
import { hasAnyUser } from "@/server/auth/setup";
import { hasAcceptedPrivacy } from "@/lib/privacy";

/** Roteador inicial: leva cada pessoa para o painel certo. */
export default async function Home() {
  const s = await getSession();
  if (!s) redirect((await hasAnyUser()) ? "/entrar" : "/configurar");
  if (!hasAcceptedPrivacy(s.user)) redirect("/aceite");
  if (isPlatformUser(s.user)) redirect("/admin");
  const orgs = await listUserOrgs(s.user.id);
  if (orgs.length === 1) redirect(`/app/${orgs[0].slug}`);
  redirect("/empresas");
}
