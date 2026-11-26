# NEXUS AI — Manual de marca

Versão 1.0 · novembro de 2026 · Arquivos em `public/brand/` · Tokens em `design/tokens.css`

> Sistema visual baseado nos princípios do `design.md` de referência fornecido pelo cliente
> (tela branca, tinta quase preta, tipografia estreita e técnica, um único azul funcional, nada de cores
> chamativas). A marca de referência **não** é copiada: nome, brasão, fonte proprietária e imagens dela
> não são usados. Só os princípios (contenção, precisão, hierarquia, números como protagonistas).

---

## 1. Estratégia

### Mercado e público
SaaS B2B brasileiro que vende, configura e opera **agentes de IA sob medida** para empresas
(imobiliárias, clínicas, escritórios, comércio, serviços). Quem decide a compra é dono, sócio ou gestor
de operação; quem usa no dia a dia é a equipe. O medo dominante desse público é perder o controle:
"a IA vai responder errado para o meu cliente?", "vai mexer onde não deve?", "quanto vai custar?".

### Posicionamento
**Agentes de IA sob medida, configurados e operados com rigor de engenharia: controle, segurança e
resultado medido.**

A categoria está cheia de marcas "mágicas" (gradientes roxos, brilhos, robôs fofos, promessas de
substituir pessoas). O NEXUS AI ocupa o lado oposto: a marca que parece **instrumento de precisão**.
Sóbria como software de engenharia, clara como um painel de bordo.

### Proposta de valor (provas que o produto já sustenta)
| Promessa | Prova no produto |
|---|---|
| Você controla o agente | Ações sensíveis pedem aprovação humana; versões travadas; publicação explícita |
| Seus dados ficam separados | Isolamento por empresa no banco (RLS) testado automaticamente |
| Você vê o que aconteceu | Cada passo de cada execução fica registrado e auditável |
| Você sabe quanto custa | Consumo por empresa, por agente e por dia, a partir de dados reais |
| Nada de faz de conta | Integração só aparece como "conectada" depois de um teste real de comunicação |

### Personalidade
**Preciso · Sóbrio · Confiável · Direto · Discreto.**
É: um engenheiro experiente que explica sem jargão. Não é: futurista, eufórico, "mágico", infantil.

### Tom de voz
- Frases curtas, verbos concretos, português do Brasil, sem anglicismo desnecessário.
- Dizer o que aconteceu e o que fazer a seguir. Nunca prometer o que o sistema não mede.
- Números com unidade e período ("720 tokens nos últimos 30 dias"), nunca adjetivos vagos.

| Use | Evite |
|---|---|
| "O agente pediu sua aprovação para enviar a mensagem." | "Nossa IA incrível já resolveu tudo! ✨" |
| "Integração com falha: o servidor recusou a chave." | "Ops! Algo deu errado 😢" |
| "Sem dados neste período." | Números de exemplo para "preencher" o painel |

### Mensagens-chave
1. Agentes de IA feitos para a sua operação, não genéricos.
2. Você aprova o que é sensível. O agente executa o resto.
3. Cada passo registrado. Cada real de consumo visível.

---

## 2. Conceito do símbolo

**Nexo = ligação.** O símbolo é um "N" desenhado como **um único caminho entre dois nós**:
o nó de entrada (base, à esquerda) e o nó de resultado (topo, à direita). É literalmente o que o
produto faz: recebe uma demanda, percorre passos controlados e entrega um resultado.

- Traço contínuo, cantos vivos (precisão de engenharia).
- O nó de resultado é o **único ponto de cor** da marca: o azul de sinal `#1A44EA`.
- Construção em grade de 64 × 64: hastes em x = 19 e x = 45, de y = 18 a y = 46; traço 6; nós com raio 6,5.

## 3. Logotipo

- **Logotipo**: "NEXUS" em Barlow Semi Condensed 500 + "AI" em 400, caixa alta, espaçamento aberto
  (≈ 0,16 em). Letras convertidas em contorno: o arquivo não depende de fonte instalada.
- **Assinatura horizontal** (padrão): símbolo + logotipo. Espaço entre eles = altura de um nó × 2.

### Arquivos (`public/brand/`)
| Arquivo | Uso |
|---|---|
| `nexus-assinatura.svg` | Padrão, fundos claros |
| `nexus-assinatura-negativa.svg` | Fundos escuros (tinta `#010205` ou foto escura) |
| `nexus-logotipo.svg` / `-negativo.svg` | Quando o símbolo já aparece por perto |
| `nexus-simbolo.svg` / `-negativo.svg` | Avatar, carimbo, espaços quadrados |
| `nexus-simbolo-mono.svg` | Uma cor só (impressão em 1 cor, gravação, carimbo) |
| `nexus-icone-app.svg`, `nexus-icone-192.png`, `nexus-icone-512.png` | Ícone de aplicativo e redes |
| `src/app/icon.svg`, `src/app/apple-icon.png` | Favicon e ícone da tela inicial (iOS) |

Para regenerar: `node scripts/brand/generate-logos.mjs` e `node scripts/brand/render-icons.mjs`.

### Área de proteção e tamanho mínimo
- Margem livre em volta = **diâmetro de um nó** (≈ 20% da altura do símbolo) em todos os lados.
- Mínimo: assinatura com **96 px** de largura na tela / 25 mm impressa; símbolo com **16 px** / 5 mm.
  Abaixo disso, use só o símbolo (ícone de app).

### Fundos permitidos
Branco `#FFFFFF`, cinza claro `#F2F2F3`, tinta `#010205` (versão negativa), fotos escuras e
uniformes (versão negativa). Em fundo de cor média ou foto movimentada, use o ícone de app (quadrado escuro).

### Usos incorretos
- Não trocar o azul do nó por outra cor nem colorir o "N".
- Não aplicar gradiente, brilho, sombra, contorno ou efeito 3D.
- Não distorcer, inclinar, girar nem mudar a proporção.
- Não redesenhar o logotipo em outra fonte nem mudar o espaçamento.
- Não usar a versão positiva sobre fundo escuro (nem o contrário).
- Não colocar o símbolo dentro de outras formas (círculos, balões), exceto o ícone de app oficial.

---

## 4. Cores

Proporção sugerida: **80% branco/cinzas claros · 15% tinta · ≤ 5% azul de sinal e estados.**
Não existe "cor de destaque" de marca: a ação principal é **preta**. O azul é funcional.

| Nome | HEX | Função |
|---|---|---|
| Tinta | `#010205` | Títulos, botão principal, marca |
| Tinta hover / pressionado | `#333333` / `#4D4D4D` | Estados do botão principal |
| Texto corrido | `#393A3D` | Parágrafos |
| Texto secundário | `#5C5E62` | Descrições |
| Rótulo | `#6B6D70` | Legendas, dicas |
| Tela | `#FFFFFF` | Fundo e cartões |
| Superfície | `#F2F2F3` | Barra lateral, faixas, hover |
| Superfície 2 | `#E7E7E8` | Item ativo, trilhos, grade de gráficos |
| Borda | `#D8D8DB` | Cartões, réguas |
| Borda forte | `#A8A8AD` | Campos de formulário |
| Azul de sinal | `#1A44EA` | Foco, links, nó do símbolo |
| Informação / gráfico | `#1649E8` | Série principal dos gráficos |
| Sucesso | `#237A1D` | Concluído |
| Atenção | `#AC5702` | Pendente, aguardando aprovação |
| Erro | `#BA171D` | Falha, ação destrutiva |

**Gráficos:** no máximo duas séries com cor (`#1649E8` principal, `#BA171D` falhas). Paleta validada
(skill de visualização de dados, modo claro): separação para daltonismo, contraste ≥ 3:1. Uma paleta de
4 cores reprovou nos testes, por isso o sistema não usa paleta larga. Gráficos sempre têm legenda e
"Ver como tabela".

## 5. Tipografia

Fontes livres (SIL Open Font License), servidas pelo Google Fonts via `next/font` (sem chamadas
externas no navegador do cliente):

| Papel | Fonte | Peso | Exemplo de uso |
|---|---|---|---|
| Display / títulos | **Barlow Semi Condensed** | 400 (títulos grandes), 500 (títulos de cartão) | "Boa noite, Carlos", nome do agente |
| Números de destaque | Barlow Semi Condensed | 400, numerais tabulares | "100%", "720" |
| Interface e texto | **Barlow** | 400 / 500 / 600 | Menus, formulários, tabelas |
| Código e prompts | Monoespaçada do sistema | 400 | Prompt de sistema, IDs |

Regras: títulos grandes em **peso 400** (elegância vem do tamanho, não do negrito); sem caixa alta em
títulos de página (caixa alta só em rótulos curtos de seção, com espaçamento 0,08 em); sem itálico de efeito.

Escala da interface: 12 · 13 · 15 · 18 · 28/36 (título de página) · 32/40 (número de destaque).

## 6. Forma, espaço e elementos

- **Raios**: 4 px (selos), 6 px (itens de menu pequenos), **8 px (botões e campos)**, **16 px (cartões)**,
  32 px (blocos de destaque/campanha).
- **Sombras**: quase nenhuma. Só menus e diálogos flutuantes (`0 8px 24px rgba(1,2,5,.12)`).
  Cartões separam-se por borda de 1 px, não por sombra.
- **Réguas**: linhas de 1 px `#D8D8DB` separam número e legenda nos indicadores (estilo "ficha técnica").
- **Botões**: principal preto com texto branco, 44 px de altura; secundário com contorno; destrutivo com
  contorno vermelho. Um único botão preto por área.
- **Foco**: contorno azul `#1A44EA` de 2 px, sempre visível no teclado.
- **Ícones**: Lucide, traço 1,5–2 px, cantos vivos, monocromáticos (tinta ou cinza). Sem ícones coloridos
  ou em 3D.
- **Fotografia** (site e materiais): pessoas reais trabalhando, luz natural, tons neutros, muito espaço
  branco. Nada de robôs humanoides, cérebros brilhando ou telas com código verde.
- **Ilustração**: diagramas de linha fina (nós e caminhos, derivados do símbolo), em tinta com um ponto azul.

## 7. Aplicações

| Aplicação | Regra |
|---|---|
| Sistema web | Implementado: `design/tokens.css` + componentes em `src/components/ui` |
| Favicon / app | `src/app/icon.svg`, `apple-icon.png`, `manifest.ts` (ícones 192/512) |
| E-mail transacional | Assinatura positiva em 120 px no topo, texto em `#393A3D`, link em `#1A44EA` |
| Redes sociais | Avatar = ícone de app; posts com fundo branco ou tinta, número grande em Barlow Semi Condensed 400 |
| Proposta comercial / PDF | Capa em tinta com assinatura negativa; miolo branco, réguas de 1 px, números de destaque |
| Apresentação | Uma ideia por slide, título em 400, um único elemento azul por slide no máximo |

## 8. Acessibilidade

Contraste (WCAG 2.2) medido sobre branco:

| Cor | Sobre `#FFFFFF` | Sobre `#F2F2F3` | Uso permitido |
|---|---|---|---|
| `#010205` | 20,7 : 1 | 18,5 : 1 | Qualquer texto |
| `#393A3D` | 11,4 : 1 | 10,2 : 1 | Qualquer texto |
| `#5C5E62` | 6,5 : 1 | 5,8 : 1 | Qualquer texto |
| `#6B6D70` | 5,2 : 1 | 4,6 : 1 | Texto (AA) |
| `#1A44EA` | 6,9 : 1 | 6,1 : 1 | Links, foco |
| `#237A1D` / `#AC5702` / `#BA171D` | 5,4 / 5,1 / 6,5 : 1 | 4,8 / 4,6 / 5,8 : 1 | Texto de estado (AA) |
| Branco sobre `#010205` | 20,7 : 1 | — | Botão principal |
| `#A8A8AD` | 2,4 : 1 | — | **Só bordas**, nunca texto |

O nó azul sobre tinta (versão negativa) tem 3,0 : 1, suficiente para elemento gráfico.
Estado nunca é comunicado só por cor: sempre há texto ("Concluída", "Com erro") ou ícone.
Movimento reduzido é respeitado (`prefers-reduced-motion`).

## 9. Registro e licenças

- **Não foi feita busca de anterioridade.** Antes de registrar "NEXUS AI" e o símbolo no INPI
  (classes 9 e 42), faça busca de marca com um profissional: "Nexus" é um nome usado por outras empresas
  de tecnologia, e isso pode exigir um complemento ao nome.
- Barlow e Barlow Semi Condensed: SIL Open Font License 1.1 (uso comercial livre, inclusive em logotipo).
- Ícones Lucide: licença ISC.

## 10. Checklist de implantação

- [x] Tokens de cor, tipografia, raio e sombra em `design/tokens.css`
- [x] Componentes da interface (botões, cartões, campos, menus, diálogos, indicadores, chat) no novo sistema
- [x] Logo no menu, login, primeiro acesso, páginas públicas
- [x] Favicon SVG, ícone Apple e manifesto com ícones 192/512
- [x] Gráficos com paleta validada
- [ ] Busca de marca e registro no INPI (responsável: cliente)
- [ ] Domínio e e-mail com a marca (responsável: cliente)
- [ ] Modelos de e-mail transacional com a assinatura (quando o envio de e-mails for configurado)
- [ ] Imagem de compartilhamento (Open Graph) quando houver site público
