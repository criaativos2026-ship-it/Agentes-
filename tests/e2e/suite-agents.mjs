/**
 * Cenários de agentes: construtor, área de testes, ferramentas, publicação, chat do cliente,
 * aprovação humana, restrição de acesso e monitoramento. LLM: dublê determinístico (NEXUS_E2E_FAKE_LLM).
 */
export default async function suite({ browser, sql, BASE, step, expect, newPage, login, logout }) {
  const admin = { email: "ana@nexus.test", password: "senha-super-admin-1" };
  const orgAdmin = { email: "carlos@imobiliaria.test", password: "provisoria-carlos-1" };
  const member = { email: "duda@imobiliaria.test", password: "provisoria-duda-1" };
  const slug = "imobiliaria-horizonte";
  let agentId = "";

  const page = await newPage(browser);
  await login(page, admin.email, admin.password);

  const sendChat = async (p, text, expectText, timeout = 20000) => {
    await p.getByLabel("Mensagem").fill(text);
    await p.getByLabel("Enviar").click();
    await p.getByText(expectText).first().waitFor({ timeout });
  };

  await step("cria agente a partir de modelo e abre o construtor", async () => {
    await page.goto(`${BASE}/admin/agentes/novo`);
    const [org] = await sql`select id from organizations where slug = ${slug}`;
    await page.selectOption("#organizationId", org.id);
    await page.fill("#name", "Assistente Administrativo");
    await page.getByRole("button", { name: /Agente administrativo/ }).click();
    await Promise.all([page.waitForURL(/\/admin\/agentes\/[0-9a-f-]{36}$/), page.click("text=Criar e abrir o construtor")]);
    agentId = page.url().split("/").pop();
    const tools = await sql`select t.tool_key from agent_tools t join agent_versions v on v.id = t.agent_version_id where v.agent_id = ${agentId} order by 1`;
    expect(tools.map((t) => t.tool_key).join(",") === "create_report,create_task,knowledge_search", `ferramentas sugeridas: ${tools.map((t) => t.tool_key)}`);
  });

  await step("área de testes: conversa com o rascunho", async () => {
    await page.getByRole("tab", { name: "Testar" }).click();
    await sendChat(page, "olá agente", "Recebi: olá agente");
    const [e] = await sql`select is_test, status from executions where agent_id = ${agentId} order by created_at desc limit 1`;
    expect(e.is_test === true && e.status === "succeeded", `execução de teste: ${JSON.stringify(e)}`);
  });

  await step("área de testes: agente usa ferramenta e mostra o passo", async () => {
    await sendChat(page, "tarefa: Ligar para o João amanhã", "Pronto! Resultado: Tarefa criada");
    const [t] = await sql`select title from tasks where title like 'Ligar para o João%'`;
    expect(t, "tarefa não criada");
  });

  await step("ferramentas: ativa CRM com aprovação obrigatória", async () => {
    await page.reload();
    await page.getByRole("tab", { name: /Ferramentas/ }).click();
    const row = page.locator("li", { has: page.locator("code", { hasText: "crm_register_opportunity" }) });
    await row.getByRole("checkbox").click();
    await row.locator("select").selectOption("always");
    await page.click("text=Salvar ferramentas");
    await page.getByText("Ferramentas salvas no rascunho.").waitFor();
  });

  await step("publica o agente", async () => {
    await page.getByRole("button", { name: /Publicar rascunho/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publicar" }).click();
    await page.getByText(/publicada\. O cliente já pode usar/).waitFor();
    const [a] = await sql`select status, published_version_id from agents where id = ${agentId}`;
    expect(a.status === "published" && a.published_version_id, "não publicado");
    const [v] = await sql`select locked_at from agent_versions where id = ${a.published_version_id}`;
    expect(v.locked_at, "versão publicada não foi travada");
  });

  await step("cliente conversa com o agente publicado", async () => {
    await logout(page);
    await login(page, orgAdmin.email, orgAdmin.password);
    await page.goto(`${BASE}/app/${slug}/agentes`);
    await page.getByText("Assistente Administrativo").waitFor();
    await page.click("text=Conversar");
    await page.waitForURL(`**/agentes/${agentId}`);
    await sendChat(page, "bom dia", "Recebi: bom dia");
  });

  await step("ação sensível pausa e só acontece após aprovação", async () => {
    await page.getByLabel("Mensagem").fill("lead: Maria Souza");
    await page.getByLabel("Enviar").click();
    await page.getByText("Aguardando aprovação humana").waitFor({ timeout: 20000 });
    const before = await sql`select count(*)::int as n from crm_opportunities`;
    expect(before[0].n === 0, "oportunidade criada antes da aprovação");
    await page.goto(`${BASE}/app/${slug}/aprovacoes`);
    await page.getByText(/Registrar oportunidade "Maria Souza"/).waitFor();
    await page.getByRole("button", { name: "Aprovar" }).click();
    await page.getByText("Ação aprovada").waitFor();
    for (let i = 0; i < 40; i++) {
      const [o] = await sql`select count(*)::int as n from crm_opportunities where name = 'Maria Souza'`;
      if (o.n === 1) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("oportunidade não registrada após aprovação");
  });

  await step("histórico mostra a execução com etapas", async () => {
    await page.goto(`${BASE}/app/${slug}/execucoes`);
    await page.getByRole("link", { name: "lead: Maria Souza" }).first().click();
    await page.getByText(/Aprovação solicitada/).waitFor();
    await page.getByText("Concluída").first().waitFor({ timeout: 15000 });
  });

  await step("usuário comum usa o agente, mas não aprova ações", async () => {
    await logout(page);
    await login(page, member.email, member.password);
    await page.goto(`${BASE}/app/${slug}/agentes/${agentId}`);
    await sendChat(page, "oi", "Recebi: oi");
    const r = await page.goto(`${BASE}/app/${slug}/aprovacoes`);
    expect(r.status() === 404, `aprovações acessível: ${r.status()}`);
  });

  await step("acesso restrito a um papel: usuário comum perde o agente", async () => {
    await logout(page);
    await login(page, admin.email, admin.password);
    await page.goto(`${BASE}/admin/agentes/${agentId}`);
    await page.getByRole("tab", { name: "Acesso" }).click();
    await page.getByRole("tabpanel").getByText("Corretor Sênior").click();
    await page.click("text=Salvar acesso");
    await page.getByText("Permissões de acesso salvas.").waitFor();
    await logout(page);
    await login(page, member.email, member.password);
    await page.goto(`${BASE}/app/${slug}/agentes`);
    await page.getByText("Nenhum agente disponível").waitFor();
    const r = await page.goto(`${BASE}/app/${slug}/agentes/${agentId}`);
    expect(r.status() === 404, `agente acessível: ${r.status()}`);
  });

  await step("monitoramento do admin lista execuções e consumo", async () => {
    await logout(page);
    await login(page, admin.email, admin.password);
    await page.goto(`${BASE}/admin/execucoes`);
    await page.getByText("Assistente Administrativo").first().waitFor();
    await page.goto(`${BASE}/admin/consumo`);
    await page.getByText("Imobiliária Horizonte").first().waitFor();
    await page.goto(`${BASE}/admin`);
    await page.getByText("Agentes em funcionamento").waitFor();
  });

  await page.context().close();
}
