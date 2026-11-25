/** Cenários da fundação: primeiro acesso, login, LGPD, empresas, equipe, permissões e isolamento. */
export default async function suite({ browser, sql, BASE, step, expect, newPage, login, logout, acceptPrivacyIfAsked }) {
  const admin = { name: "Ana Fundadora", email: "ana@nexus.test", password: "senha-super-admin-1" };
  const orgAdmin = { name: "Carlos Gestor", email: "carlos@imobiliaria.test", password: "provisoria-carlos-1" };
  const member = { name: "Duda Corretora", email: "duda@imobiliaria.test", password: "provisoria-duda-1" };
  let orgSlug = "";
  let orgBSlug = "";

  const page = await newPage(browser);

  await step("anônimo é levado ao primeiro acesso quando não há usuários", async () => {
    await page.goto(`${BASE}/`);
    await page.waitForURL("**/configurar");
  });

  await step("primeiro acesso cria o super administrador e abre o painel", async () => {
    await page.fill("#name", admin.name);
    await page.fill("#email", admin.email);
    await page.fill("#password", admin.password);
    await page.fill("#confirm", admin.password);
    await page.click("button[role=checkbox]");
    await Promise.all([page.waitForURL("**/admin"), page.click("button[type=submit]")]);
    await page.getByText("Empresas cadastradas").waitFor();
    const [u] = await sql`select platform_role, password_hash from users where email = ${admin.email}`;
    expect(u.platform_role === "super_admin", "papel incorreto");
    expect(u.password_hash.startsWith("$argon2id$"), "senha sem Argon2id");
  });

  await step("/configurar fica bloqueado depois do primeiro cadastro", async () => {
    const p2 = await newPage(browser);
    await p2.goto(`${BASE}/configurar`);
    await p2.waitForURL("**/entrar");
    await p2.context().close();
  });

  await step("cadastra empresa com administrador", async () => {
    await page.goto(`${BASE}/admin/empresas/nova`);
    await page.fill("#name", "Imobiliária Horizonte");
    await page.fill("#segment", "Imobiliária");
    await page.fill("#adminName", orgAdmin.name);
    await page.fill("#adminEmail", orgAdmin.email);
    await page.fill("#adminPassword", orgAdmin.password);
    await Promise.all([page.waitForURL(/\/admin\/empresas\/[0-9a-f-]{36}$/), page.click("button[type=submit]")]);
    await page.getByText(orgAdmin.email).waitFor();
    const [o] = await sql`select slug from organizations where name = 'Imobiliária Horizonte'`;
    orgSlug = o.slug;
    expect(orgSlug === "imobiliaria-horizonte", `slug inesperado: ${orgSlug}`);
  });

  await step("adiciona membro com papel Usuário", async () => {
    await page.fill("#m-name", member.name);
    await page.fill("#m-email", member.email.toUpperCase());
    await page.fill("#m-pass", member.password);
    await page.click("text=Adicionar >> nth=-1");
    await page.getByText(member.email).waitFor();
    const [r] = await sql`select r.key from organization_members m join users u on u.id = m.user_id join roles r on r.id = m.role_id where u.email = ${member.email}`;
    expect(r?.key === "org_member", "papel do membro incorreto (ou e-mail não normalizado)");
  });

  await step("cria segunda empresa (para teste de isolamento)", async () => {
    await page.goto(`${BASE}/admin/empresas/nova`);
    await page.fill("#name", "Clínica Vida");
    await Promise.all([page.waitForURL(/\/admin\/empresas\/[0-9a-f-]{36}$/), page.click("button[type=submit]")]);
    const [o] = await sql`select slug from organizations where name = 'Clínica Vida'`;
    orgBSlug = o.slug;
  });

  await step("login com senha errada mantém o e-mail e mostra erro", async () => {
    await logout(page);
    await page.goto(`${BASE}/entrar`);
    await page.fill("#email", orgAdmin.email);
    await page.fill("#password", "senha-errada-123");
    await page.click("button[type=submit]");
    await page.getByText("E-mail ou senha incorretos.").waitFor();
    expect((await page.inputValue("#email")) === orgAdmin.email, "e-mail não foi preservado");
  });

  await step("administrador da empresa aceita o aviso LGPD e chega ao painel da empresa", async () => {
    await login(page, orgAdmin.email, orgAdmin.password);
    expect(new URL(page.url()).pathname === "/aceite", `esperava /aceite, veio ${page.url()}`);
    // Sem aceite, nenhuma tela funciona:
    await page.goto(`${BASE}/app/${orgSlug}`);
    await page.waitForURL("**/aceite");
    await Promise.all([page.waitForURL((u) => u.pathname !== "/aceite").catch(() => {}), page.click("text=Concordo e quero continuar")]);
    await page.getByText("Marque a caixa").waitFor();
    await acceptPrivacyIfAsked(page);
    await page.waitForURL(`**/app/${orgSlug}`);
    await page.getByText("Agentes contratados").waitFor();
    const [u] = await sql`select privacy_version from users where email = ${orgAdmin.email}`;
    expect(u.privacy_version, "aceite não gravado");
  });

  await step("administrador da empresa cria papel personalizado", async () => {
    await page.goto(`${BASE}/app/${orgSlug}/equipe`);
    await page.click("text=Papéis");
    await page.click("text=Novo papel personalizado");
    await page.fill("#r-name", "Corretor Sênior");
    await page.getByRole("dialog").getByText("Ver e usar todos os agentes contratados pela empresa").click();
    await page.getByRole("dialog").getByText("Ver relatórios e indicadores").click();
    await page.click("text=Salvar papel");
    await page.getByText("Papel salvo.").waitFor();
    const [r] = await sql`select count(*)::int as n from role_permissions rp join roles r on r.id = rp.role_id where r.name = 'Corretor Sênior'`;
    expect(r.n === 2, `permissões gravadas: ${r.n}`);
  });

  await step("administrador não consegue se rebaixar deixando a empresa sem gestão", async () => {
    const [m] = await sql`select m.id from organization_members m join users u on u.id = m.user_id where u.email = ${orgAdmin.email}`;
    // Pelo banco: único admin → mudar o papel do próprio admin pela UI não aparece (sem seletor para si mesmo).
    await page.goto(`${BASE}/app/${orgSlug}/equipe`);
    expect((await page.getByLabel(`Papel de ${orgAdmin.name}`).count()) === 0, "seletor de papel apareceu para o próprio usuário");
    expect(m, "membro não encontrado");
  });

  await step("empresa A não acessa a empresa B (404)", async () => {
    const res = await page.goto(`${BASE}/app/${orgBSlug}`);
    expect(res.status() === 404, `status ${res.status()}`);
    const res2 = await page.goto(`${BASE}/admin`);
    expect(new URL(page.url()).pathname !== "/admin" || res2.status() !== 200, "cliente acessou /admin");
  });

  await step("usuário comum não vê a gestão da equipe nem o registro de atividades", async () => {
    await logout(page);
    await login(page, member.email, member.password);
    await acceptPrivacyIfAsked(page);
    await page.waitForURL(`**/app/${orgSlug}`);
    expect((await page.locator("nav >> text=Equipe e permissões").count()) === 0, "menu Equipe visível para usuário comum");
    const res = await page.goto(`${BASE}/app/${orgSlug}/equipe`);
    expect(res.status() === 404, `equipe acessível: ${res.status()}`);
    const res2 = await page.goto(`${BASE}/app/${orgSlug}/auditoria`);
    expect(res2.status() === 404, `auditoria acessível: ${res2.status()}`);
  });

  await step("exportação LGPD traz o e-mail, vem como anexo e não tem senha", async () => {
    const r = await page.request.get(`${BASE}/api/meus-dados`);
    expect(r.status() === 200, `status ${r.status()}`);
    expect((r.headers()["content-disposition"] ?? "").includes("attachment"), "sem anexo");
    const text = await r.text();
    expect(text.includes(member.email), "sem e-mail");
    expect(!/argon2|password_?hash/i.test(text), "exportou hash de senha");
    const anon = await fetch(`${BASE}/api/meus-dados`);
    expect(anon.status === 401, "exportação sem login");
  });

  await step("conta desativada perde o acesso imediatamente", async () => {
    await sql`update users set status = 'disabled' where email = ${member.email}`;
    await page.goto(`${BASE}/app/${orgSlug}`);
    await page.waitForURL("**/entrar");
    await sql`update users set status = 'active' where email = ${member.email}`;
  });

  await step("cabeçalhos de segurança presentes", async () => {
    const r = await fetch(`${BASE}/entrar`);
    for (const h of ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy"]) expect(r.headers.get(h), `faltando ${h}`);
    expect(!r.headers.get("x-powered-by"), "x-powered-by exposto");
  });

  await step("cookie de sessão é HttpOnly e o token não fica no banco", async () => {
    await logout(page);
    await login(page, admin.email, admin.password);
    const cookies = await page.context().cookies();
    const c = cookies.find((x) => x.name.includes("nexus_session"));
    expect(c?.httpOnly, "cookie sem HttpOnly");
    const [found] = await sql`select count(*)::int as n from sessions where token_hash = ${c.value}`;
    expect(found.n === 0, "token em texto claro no banco");
  });

  await step("celular: painel admin com menu em gaveta", async () => {
    const m = await newPage(browser, true);
    await login(m, admin.email, admin.password);
    await m.waitForURL("**/admin");
    await m.getByLabel("Abrir menu").click();
    await m.getByRole("dialog").getByText("Empresas").click();
    await m.waitForURL("**/admin/empresas");
    await m.getByText("Imobiliária Horizonte").first().waitFor();
    await m.context().close();
  });

  await page.context().close();
}
