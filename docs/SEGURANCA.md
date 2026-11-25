# Segurança — revisão da Fase 8

## Controles implementados

| Requisito | Como foi atendido | Onde |
|---|---|---|
| Isolamento entre empresas | `organization_id` em toda tabela empresarial + **RLS** em 43 tabelas; app conecta como `nexus_app` (sem BYPASSRLS, não é dona das tabelas); contexto por transação | `drizzle/0001_rls_e_papeis.sql`, `src/server/db/client.ts` |
| Controle de acesso por função | 23 permissões, papéis de sistema e personalizados; checagem no servidor em toda página/ação; empresa nunca fica sem administrador | `src/server/rbac`, `src/server/auth/guards.ts`, `src/server/services/members.ts` |
| Credenciais protegidas | AES-256-GCM com dado associado por empresa/integração; só a dica da chave é exibida; nada vai para o navegador | `src/server/security/crypto.ts`, `src/server/integrations/store.ts` |
| Sessões | Token de 256 bits, só o hash no banco, cookie HttpOnly/Secure/SameSite (`__Host-` em produção), expiração deslizante, revogação, lista de sessões | `src/server/auth/session.ts`, `/conta` |
| Senhas | Argon2id (parâmetros OWASP), mínimo 10 caracteres, verificação com tempo constante para e-mails inexistentes | `src/server/auth/password.ts` |
| Rate limiting | Limites no banco (vários servidores): login (e-mail e IP), recuperação de senha, primeiro acesso, chat, uploads, integrações, webhooks de automação | `src/server/auth/rate-limit.ts` |
| Validação de entradas | Zod em toda ação/rota; parâmetros de ferramentas validados antes de executar; assinatura dos arquivos enviados conferida | `src/app/actions`, `src/server/tools` |
| Prompt injection | Conteúdo externo delimitado como não confiável; política fixa no prompt de sistema; ferramentas restritas por agente; aprovação humana; detecção registrada no log | `src/server/security/prompt-guard.ts` |
| Execução de código | Não existe ferramenta que execute código gerado pelo modelo | — |
| SSRF | Só domínios liberados por empresa; IP conferido no momento da conexão (bloqueia redes privadas e metadados de nuvem); sem seguir redirecionamentos; limite de tamanho/tempo | `src/server/security/ssrf.ts` |
| Ações sensíveis | Ferramentas de risco alto SEMPRE pedem aprovação; aprovação executa com os parâmetros aprovados | `src/server/tools/registry.ts`, `src/server/execution/engine.ts` |
| Webhooks | Assinaturas HMAC verificadas (WhatsApp, Stripe, Mercado Pago); tokens com hash (automações); idempotência | `src/app/api/webhooks` |
| OAuth | Estado assinado + nonce em cookie + checagem do usuário da sessão | `src/server/integrations/oauth-state.ts` |
| Auditoria | `audit_logs` na mesma transação da ação; telas para plataforma e empresa | `src/server/audit/log.ts` |
| Cabeçalhos | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy; sem `X-Powered-By` | `next.config.ts` |
| LGPD | Aviso versionado com aceite obrigatório, exportação dos dados, correção, pedido de exclusão, anonimização, retenção automática, minimização (arquivos originais não são guardados) | `src/lib/privacy.ts`, `/conta`, `src/server/services/privacy.ts`, `src/server/services/retention.ts` |

## Verificações feitas

- Script que confere que **toda** ação de servidor exportada chama uma guarda de sessão/permissão (exceções esperadas: login, sair, primeiro acesso e recuperação de senha, todas com limite de tentativas).
- Busca por `dangerouslySetInnerHTML`, `eval` e `new Function`: nenhum uso. Respostas dos agentes são exibidas como texto (links tratados com `rel="noopener noreferrer nofollow"`).
- Testes automatizados de isolamento (RLS) e de permissão (E2E: usuário comum sem acesso à gestão, aprovações e agentes restritos; empresa A recebe 404 na empresa B).

## Limitações conhecidas (honestas)

- O RLS é **defesa em profundidade** contra erros de código; um servidor comprometido define o próprio contexto. Proteja `DATABASE_URL`, `ENCRYPTION_KEY` e o acesso ao servidor.
- Algumas operações precisam enxergar além de uma empresa (e-mail único na plataforma ao adicionar membro, exportação LGPD da própria pessoa, worker). Elas usam o escopo de sistema **sempre com filtro fixo** e depois de checar a permissão.
- O limite por IP usa `x-forwarded-for`; atrás de proxy confiável (Netlify/Vercel) é adequado, mas pode ser contornado em outras topologias. O limite por e-mail continua valendo.
- A CSP usa `'unsafe-inline'` para scripts (exigência do Next sem nonce). Evoluir para CSP com nonce é recomendado.
- O texto do aviso de privacidade precisa de **revisão jurídica**, e o contato do encarregado e o prazo de retenção estão marcados como PENDENTES em `src/lib/privacy.ts`.
- Não há autenticação em dois fatores (MFA) ainda — recomendado para contas de super administrador.
