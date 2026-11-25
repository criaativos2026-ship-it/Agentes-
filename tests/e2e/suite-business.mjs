/** Fases 6–8: conhecimento, integrações, cobrança, automações, suporte e projetos. */
export default async function suite({ browser, sql, BASE, step, expect, newPage, login, logout }) {
  const admin = { email: "ana@nexus.test", password: "senha-super-admin-1" };
  const orgAdmin = { email: "carlos@imobiliaria.test", password: "provisoria-carlos-1" };
  const slug = "imobiliaria-horizonte";
  const page = await newPage(browser);
  await login(page, orgAdmin.email, orgAdmin.password);

  await step("conhecimento: cria base, adiciona perguntas e respostas e encontra pela busca", async () => {
    await page.goto(`${BASE}/app/${slug}/conhecimento`);
    await page.fill("#kb-name", "Políticas comerciais");
    await page.click("text=Criar base");
    await page.getByText("Base criada.").waitFor();
    await page.getByRole("tab", { name: /Colar texto/ }).click();
    const panel = page.getByRole("tabpanel");
    await panel.getByLabel("Título").fill("FAQ de locação");
    await panel.getByLabel("Tipo").selectOption("faq");
    await panel.getByLabel("Conteúdo").fill("P: Aceitam pet no apartamento?\nR: Sim, com caução adicional de um aluguel.\nP: Qual o prazo mínimo?\nR: 30 meses.");
    await panel.getByRole("button", { name: "Adicionar" }).click();
    await page.getByText(/Adicionado \(\d+ trechos?\)/).waitFor();
    await page.getByLabel("Testar busca").fill("posso levar meu pet?");
    await page.getByLabel("Buscar").click();
    await page.getByText("caução adicional").waitFor();
  });

  await step("integrações: falha de comunicação fica registrada (nunca marcada como conectada)", async () => {
    await page.goto(`${BASE}/app/${slug}/integracoes`);
    const card = page.locator("[data-slot=card]", { hasText: "Webhook de saída" });
    await card.getByLabel(/URL de destino/).fill("https://destino-inexistente.invalid/hook");
    await card.getByRole("button", { name: /Conectar e testar/ }).click();
    await page.getByText(/o teste falhou/).waitFor({ timeout: 30000 });
    const [i] = await sql`select status from integrations where provider_key = 'webhook_out'`;
    expect(i.status === "error", `status ${i.status}`);
  });

  await step("automação: cria, dispara manualmente e registra a execução", async () => {
    await page.goto(`${BASE}/app/${slug}/automacoes`);
    await page.fill("#wf-name", "Novo lead");
    await Promise.all([page.waitForURL(/automacoes\/[0-9a-f-]{36}$/, { timeout: 20000 }), page.click("text=Salvar automação")]);
    await page.getByLabel("Entrada da automação").fill("Novo contato João quer comprar casa");
    await page.getByRole("button", { name: "Executar" }).click();
    await page.getByText("Automação disparada.").waitFor();
    for (let i = 0; i < 40; i++) {
      const [r] = await sql`select e.status from executions e where e.kind = 'workflow' order by created_at desc limit 1`;
      if (r?.status === "succeeded") return;
      await new Promise((res) => setTimeout(res, 500));
    }
    throw new Error("workflow não concluiu");
  });

  await step("suporte: cliente abre chamado", async () => {
    await page.goto(`${BASE}/app/${slug}/suporte`);
    await page.fill("#tk-subject", "Dúvida sobre o agente");
    await page.fill("#tk-body", "Como faço para liberar o agente para outro corretor?");
    await page.click("text=Abrir chamado");
    await page.getByText("Chamado aberto").waitFor();
  });

  await logout(page);
  await login(page, admin.email, admin.password);

  await step("suporte: equipe responde e nota interna não aparece para o cliente", async () => {
    await page.goto(`${BASE}/admin/suporte`);
    const card = page.locator("[data-slot=card]", { hasText: "Dúvida sobre o agente" });
    await card.getByLabel("Resposta").fill("NOTA: cliente estratégico");
    await card.getByText("Nota interna").click();
    await card.getByRole("button", { name: "Enviar" }).click();
    await page.getByText("Mensagem enviada.").first().waitFor();
    await card.getByLabel("Resposta").fill("Acesse Construtor → Acesso e marque o papel.");
    await card.getByRole("button", { name: "Enviar" }).click();
    await page.getByText("Acesse Construtor").waitFor();
  });

  await step("cobrança: cria plano, assinatura e dá baixa no pagamento", async () => {
    await page.goto(`${BASE}/admin/planos`);
    await page.getByRole("button", { name: "Novo plano" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Nome").fill("Profissional");
    await d.getByLabel("Código").fill("profissional");
    await d.getByLabel("Preço (R$)").fill("499,90");
    await d.getByLabel("Execuções por mês").fill("1000");
    await d.getByRole("button", { name: "Salvar plano" }).click();
    await page.getByText("Plano salvo.").waitFor();
    await page.goto(`${BASE}/admin/financeiro`);
    const [org] = await sql`select id from organizations where slug = ${slug}`;
    await page.selectOption("#s-org", org.id);
    await page.click("text=Criar assinatura");
    await page.getByText("Assinatura criada.").waitFor();
    await page.getByRole("tab", { name: "Pagamentos" }).click();
    await page.getByRole("button", { name: "Baixar (PIX)" }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar pagamento" }).click();
    await page.getByText("Pagamento confirmado.").waitFor();
    const [p] = await sql`select status, amount_cents from payments where organization_id = ${org.id}`;
    expect(p.status === "paid" && p.amount_cents === 49990, JSON.stringify(p));
  });

  await step("projeto personalizado: cria, muda status e registra histórico", async () => {
    await page.goto(`${BASE}/admin/projetos/novo`);
    await page.fill("#pj-name", "Automação comercial Horizonte");
    await page.fill("#pj-needs", "Responder leads em minutos");
    await page.fill("#pj-proc", "* Qualificação de leads: classificar e priorizar");
    await Promise.all([page.waitForURL(/projetos\/[0-9a-f-]{36}$/), page.click("text=Criar projeto")]);
    await page.getByText("Fluxo de implantação").waitFor();
    await page.getByLabel("Status do projeto").selectOption("development");
    await page.getByLabel("Anotação").fill("Iniciado");
    await page.click("text=Registrar");
    await page.getByText("Registrado no histórico.").waitFor();
    const [e] = await sql`select count(*)::int as n from project_events`;
    expect(e.n === 2, `eventos: ${e.n}`);
  });

  await logout(page);
  await login(page, orgAdmin.email, orgAdmin.password);

  await step("cliente vê plano/consumo e não vê a nota interna", async () => {
    await page.goto(`${BASE}/app/${slug}/assinatura`);
    await page.getByText("Profissional").first().waitFor();
    await page.getByText("Execuções no mês").waitFor();
    await page.goto(`${BASE}/app/${slug}/suporte`);
    await page.getByText("Acesse Construtor").waitFor();
    expect((await page.getByText("cliente estratégico").count()) === 0, "nota interna visível ao cliente");
  });

  await step("celular: chat do agente e menu do cliente", async () => {
    const m = await newPage(browser, true);
    await login(m, orgAdmin.email, orgAdmin.password);
    await m.getByLabel("Abrir menu").click();
    await m.getByRole("dialog").getByText("Meus agentes").click();
    await m.waitForURL(`**/app/${slug}/agentes`);
    await m.getByText("Conversar").first().click();
    await m.getByLabel("Mensagem").fill("teste no celular");
    await m.getByLabel("Enviar").click();
    await m.getByText("Recebi: teste no celular").waitFor({ timeout: 20000 });
    await m.context().close();
  });

  await page.context().close();
}
