# Skills e recursos reutilizados

Investigação feita em 25/11/2026 no ambiente do Claude Code (sessão na nuvem) antes de iniciar o desenvolvimento.

## 1. Onde procurei

| Local | Resultado |
|---|---|
| `~/.claude/skills/` (Skills globais sincronizadas da sua conta) | 16 Skills — lidas as descrições; a `padrao-sistemas-web` foi lida **por completo** (SKILL.md + 7 referências + 2 scripts) |
| `~/.claude/plugins/` (plugin `creative-studio-os`) | 13 Skills criativas — descrições lidas |
| Skills embutidas do Claude Code (`claude-api`, `dataviz`, `code-review`, `security-review`, `run`…) | `claude-api` lida; demais registradas para uso nas fases seguintes |
| Pasta do projeto `Agentes-` | Vazia (nenhum commit) — sem Skills de projeto |
| Seus repositórios no GitHub | `Agente-de-IA` e `Compras-`: **vazios** (sem commits). `R-dio-Encorajamento-`: sistema Next.js feito com a Skill `padrao-sistemas-web` — **lido para reaproveitar componentes**. `Perfumes-`: app estático de estúdio de vídeo (JS puro) — fora do escopo. `Ebook`: vazio. |

Os repositórios anteriores foram apenas **lidos** (clone anônimo, só leitura). Nada foi alterado neles e nenhuma credencial, token ou dado foi copiado.

## 2. Skills identificadas e uso no NEXUS AI

| Skill | Localização | Finalidade | Uso no NEXUS AI | Adaptações / motivo de não uso |
|---|---|---|---|---|
| **padrao-sistemas-web** | `~/.claude/skills/synced/…/padrao-sistemas-web/` | Seu padrão aprovado para sistemas web | **Base do projeto**: Next.js App Router + TS + Tailwind v4 com tokens em `design/tokens.css` + componentes estilo shadcn (radix-ui) + Inter + lucide + Zod + Sonner + Alert Dialog; ações do servidor com validação + permissão + histórico; LGPD completa; cabeçalhos de segurança; horários do servidor; testes E2E com Playwright; commits pequenos em português | **Adaptações**: (1) Auth.js → sessões próprias no banco, para permitir listar/revogar sessões e limite de tentativas compartilhado entre servidores (ver ARQUITETURA §4); (2) limite de tentativas em memória → no banco; (3) perfis fixos → papéis e permissões configuráveis por empresa; (4) Drizzle mantido, mas o RLS é escrito em migração SQL própria; (5) banco Netlify Database → PostgreSQL do Supabase (pedido no briefing), deploy do app continua podendo ser Netlify |
| claude-api | embutida no Claude Code | Referência oficial da API Claude | Adaptador Anthropic do motor de agentes: IDs de modelo atuais (`claude-opus-5-5` padrão), thinking adaptativo, `effort` em vez de `temperature`, sem `tool_choice` forçado, formato `tool_use`/`tool_result`, campos de `usage` (inclusive cache), prompt caching, tratamento de `stop_reason: refusal` | A skill recomenda Managed Agents para agentes; **não usado** porque o briefing exige independência de fornecedor e execução própria auditável — usamos a Messages API com loop manual, atrás da interface `LLMProvider` |
| dataviz | embutida | Método de gráficos/dashboards consistente e acessível | Gráficos e cartões de indicadores dos dashboards (Fase 3) | Paleta adaptada aos tokens do NEXUS |
| security-review / code-review | embutidas | Revisão de segurança e de bugs | Fase 8 (revisão antes de publicar) | — |
| run | embutida | Subir o app e capturar telas | Validação visual das fases de interface | — |
| creative-studio-os:brand-identity | plugin | Estratégia de marca e identidade visual | Referência para formalizar a identidade NEXUS AI quando o nome definitivo for escolhido | Nesta fase os tokens seguem a direção visual do briefing (marinho/grafite + laranja + azul elétrico), marcados como provisórios |
| creative-studio-os:art-direction, graphic-advertising, instagram-design, social-content-strategy, motion-design, video-production, photography-retouching, visual-prompt-engineering, creative-director, creative-studio-os-v2 | plugin | Produção criativa e marketing | Futuro: materiais de venda do NEXUS e possíveis **agentes de marketing** para clientes (o conhecimento pode virar modelo de agente no catálogo) | Não aplicável ao código da plataforma |
| creative-studio-os:virtus-parfums-marca | plugin | Manual de marca de outro cliente | — | **Não usar**: marca de terceiro; a Skill padrão proíbe reaproveitar identidade de outros projetos |
| docx, xlsx, pdf, pptx | `~/.claude/skills/synced/…` | Manipulação de arquivos de escritório | Referência para a extração de texto da base de conhecimento (PDF/DOCX/XLSX) e futura geração de relatórios | No app usamos bibliotecas Node (as Skills são scripts Python para o Claude Code, não para o servidor) |
| deep-research | `~/.claude/skills/synced/…` | Pesquisa com fontes | Futuro: inspiração para um modelo de "agente de pesquisa" | — |
| google-workspace | `~/.claude/skills/synced/…` | Editar arquivos Google pelo conector do Claude | — | Não serve para a integração do produto (que usa OAuth e APIs oficiais do Google em nome de cada empresa) |
| skill-creator | `~/.claude/skills/synced/…` | Criar novas Skills | Futuro: transformar o padrão NEXUS (agentes + RLS) em uma Skill sua | — |
| import-memory, setup-writing-style, morning, chrome-browser, computer-use, built-in-browser, docs | `~/.claude/skills/synced/…` | Utilidades do Claude | — | Sem relação com o produto |
| session-start-hook | `~/.claude/skills/session-start-hook` | Hook de início de sessão | Opcional no futuro (instalar dependências automaticamente) | — |

## 3. Recursos de projetos anteriores reaproveitados (de `R-dio-Encorajamento-`)

| Recurso | Decisão |
|---|---|
| Componentes `button`, `card`, `badge`, `input`, `textarea`, `label`, `native-select`, `alert-dialog`, `dropdown-menu`, `submit-button`, `sonner` | **Adaptados**: mesma estrutura (radix-ui, `data-slot`, cva), estilos refeitos para o tema escuro do NEXUS |
| `ConfirmButton`, `Field`, `FormError`, `useFormFeedback`, `Panel` | **Reutilizados com adaptação** (mesmo contrato, novo visual) |
| `lib/format.ts` (datas no fuso do servidor) | **Reutilizado e generalizado** (fuso por empresa, padrão `America/Sao_Paulo`) |
| `lib/utils.ts` (`cn`) | **Reutilizado diretamente** |
| `next.config.ts` (cabeçalhos de segurança), `eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json` | **Reutilizados** e reforçados (CSP, HSTS) |
| `scripts/migrate.ts` | **Adaptado** (URL de migração separada da URL do app) |
| `lib/rate-limit.ts` (memória) | **Substituído** por limite no banco (vários servidores) |
| `lib/session.ts` + `auth.ts` (Auth.js) | **Referência de comportamento** (sessão conferida no banco, aceite LGPD obrigatório); implementação nova |
| Textos LGPD (`aviso-privacidade.tsx`, `lgpd.md`) | **Referência**; texto novo para o contexto B2B (NEXUS é operador dos dados dos clientes) |
| Cores, logos, vídeos | **Não reutilizados** (identidade de outro projeto) |

## 4. O que não estava acessível

- `Agente-de-IA` e `Compras-` estão vazios no GitHub (nenhum código para aproveitar). Se existir código desses projetos em outro lugar (computador, outro repositório), posso analisá-lo quando você disponibilizar.
- O anexo do repositório `Agente-de-IA` à sessão foi recusado pela política do ambiente; a leitura anônima confirmou que ele não tem conteúdo.
