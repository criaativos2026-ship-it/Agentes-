/**
 * Dados de DEMONSTRAÇÃO (fictícios), claramente identificados:
 * - empresas com is_demo = true (faixa "DEMONSTRAÇÃO" no painel);
 * - e-mails no domínio reservado @demo.nexus.invalid (nunca recebem e-mail);
 * - nada de execuções, consumo ou pagamentos inventados: os indicadores continuam vindo do uso real.
 *
 * Uso: DEMO_PASSWORD="senha-de-10+" npm run db:seed-demo
 * Remover: DEMO_REMOVE=1 npm run db:seed-demo
 */
import { eq, like } from "drizzle-orm";
import { closeDb, withOrg, withPlatform } from "../src/server/db/client";
import { knowledgeBases, organizations, users } from "../src/server/db/schema";
import { addMember, createOrganization, systemRoleId } from "../src/server/services/organizations";
import { createAgent } from "../src/server/agents/service";
import { ingestDocument } from "../src/server/knowledge/ingest";

const DOMAIN = "demo.nexus.invalid";

async function remove() {
  await withPlatform(null, async (tx) => {
    const orgs = await tx.delete(organizations).where(eq(organizations.isDemo, true)).returning({ id: organizations.id });
    const us = await tx.delete(users).where(like(users.email, `%@${DOMAIN}`)).returning({ id: users.id });
    console.log(`Removidas ${orgs.length} empresas e ${us.length} contas de demonstração.`);
  });
}

async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 10) throw new Error("Defina DEMO_PASSWORD (mín. 10 caracteres).");
  const existing = await withPlatform(null, (tx) => tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.isDemo, true)));
  if (existing.length) {
    console.log("Já existem dados de demonstração. Use DEMO_REMOVE=1 para recriar.");
    return;
  }
  const demos = [
    { name: "Imobiliária Horizonte (DEMO)", segment: "Imobiliária", admin: "gestor.imobiliaria", agents: [["Prospecção de imóveis", "prospeccao"], ["Atendimento de locação", "atendimento"]] },
    { name: "Clínica Vida Plena (DEMO)", segment: "Saúde", admin: "gestor.clinica", agents: [["Agendamento e dúvidas", "atendimento"], ["Rotinas administrativas", "administrativo"]] },
    { name: "Metalúrgica Aço Forte (DEMO)", segment: "Indústria", admin: "gestor.industria", agents: [["Análise de compras", "analise_dados"], ["Relatórios de produção", "gestao"]] },
  ] as const;
  for (const d of demos) {
    const org = await withPlatform(null, (tx) => createOrganization(tx, null, { name: d.name, segment: d.segment, status: "trial", isDemo: true, description: "Empresa fictícia para demonstração." }));
    await withPlatform(null, async (tx) =>
      addMember(tx, null, { organizationId: org.id, email: `${d.admin}@${DOMAIN}`, name: `Gestor(a) ${d.segment} (demo)`, tempPassword: password, roleId: await systemRoleId(tx, "org_admin") }),
    );
    await withPlatform(null, async (tx) =>
      addMember(tx, null, { organizationId: org.id, email: `usuario.${d.admin.split(".")[1]}@${DOMAIN}`, name: `Usuário ${d.segment} (demo)`, tempPassword: password, roleId: await systemRoleId(tx, "org_member") }),
    );
    const [kb] = await withOrg(org.id, null, (tx) => tx.insert(knowledgeBases).values({ organizationId: org.id, name: "Políticas (demo)", description: "Conteúdo fictício" }).returning());
    const adminUser = await withPlatform(null, (tx) => tx.select({ id: users.id }).from(users).where(eq(users.email, `${d.admin}@${DOMAIN}`)));
    await ingestDocument({
      orgId: org.id,
      userId: adminUser[0].id,
      knowledgeBaseId: kb.id,
      title: "Perguntas frequentes (demo)",
      source: "faq",
      text: `Pergunta: Qual o horário de atendimento?\nResposta: De segunda a sexta, das 8h às 18h (conteúdo de demonstração).\n\nPergunta: Como falar com um humano?\nResposta: Peça ao agente para abrir uma tarefa de retorno (conteúdo de demonstração).`,
    });
    for (const [name, tpl] of d.agents) {
      await withOrg(org.id, null, (tx) => createAgent(tx, adminUser[0].id, { organizationId: org.id, name: `${name} (demo)`, templateKey: tpl }));
    }
    console.log(`✓ ${d.name}: login ${d.admin}@${DOMAIN}`);
  }
  console.log("Agentes criados como RASCUNHO: configure o provedor de IA, teste e publique no Construtor.");
}

try {
  if (process.env.DEMO_REMOVE === "1") await remove();
  else await seed();
} finally {
  await closeDb();
}
