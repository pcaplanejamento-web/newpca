# Roadmap — Tudo que pode ser criado na Plataforma PCA

Catálogo do que é possível construir, com base no **plano técnico**, na **planilha de
controle** (protocolos, compilado PCA, comunicações, orçamento, riscos), no sistema de
referência e no estado atual.

Legenda: ✅ pronto · 🔨 parcial · 🔜 recomendado a seguir · 💡 possível/futuro

---

## 0. Base já pronta
✅ Landing pública · ✅ Login/Cadastro/Sessão · ✅ Papéis (admin/gestor/membro) + aprovação de usuários · ✅ Área da equipe protegida (`/painel`) · ✅ Importação de planilha `.xlsx` em lotes · ✅ Deploy automático · ✅ Responsivo + tema claro/escuro.

### Fase 1 (padrão de design + navegação) — entregue
✅ **Design responsivo** (sidebar no desktop ↔ bottom-nav no mobile; tabela ↔ cards; botão ↔ FAB; modal ↔ bottom-sheet) · ✅ Navegação em 2 seções (Ferramentas / Administração) gated por papel · ✅ **Dashboard** (visão geral de protocolos: StatCards + recentes) · ✅ **Protocolos** — tabela única com **edição inline** (adicionar linha → editar células, como na planilha; dropdowns Natureza/Responsável/Situação/Distribuição, filtros por Natureza/Situação/Responsável/Período, paginação; tabela no desktop, cards editáveis no mobile) · ✅ **Ferramentas** (Dashboard do PCA + Importar + Tabelas dinâmicas) · 🔨 Abas Atividades/Pendências/Equipes/Permissões/Auditoria visíveis ("em construção").

### Fase 1b (perfil) — entregue
✅ **Tela do usuário**: editar nome/e-mail/**matrícula**, **trocar senha**, **foto** (base64 redimensionada no cliente); a foto reflete no menu; admin edita esses dados em Usuários. · ✅ **Carregamento profissional**: tema aplicado antes da pintura (fim do flash), skeletons com shimmer nas listas, sem títulos/descrições redundantes.

### Fase 2 (início público + PCA) — entregue
✅ **Home `/` = dashboard do PCA PÚBLICO** (todos veem, sem login) · ✅ Aba **PCA** (`/painel/pca`) para subir planilhas + unidades · ✅ Consolidação: dashboard saiu de Ferramentas para `/`; upload para a aba PCA.

### DFD: conferência em banner + regras de importação — entregue
✅ Ao importar (ou clicar em "Ver"), o DFD aparece **completo num banner flutuante** (`DfdView` em `Modal`,
reutilizado nos dois casos) — só grava no D1 **ao confirmar**. **Bloqueia a importação** (botão travado + lista
explicativa do que falta, mas deixando conferir) quando não há **valor unitário** em todos os itens, **repartição**,
**justificativa**, **previsão de entrega**, **prioridade** ou **fundamentação legal** (`faltasObrigatorias`,
cliente+servidor). Visualização por `GET /api/dfd/[id]`.

### DFD em PDF (além do .xlsx) — entregue
✅ O import de DFD aceita **`.pdf`** além de `.xlsx`: leitura no navegador via **pdf.js** (`parse-dfd-pdf`),
reaproveitando o cabeçalho/seções (`parse-dfd-comum`) e remontando a tabela por posição (rejunta o código
quebrado). Mesmo resultado do `.xlsx` (validado no arquivo real). O `.xlsx` segue como via mais determinística.

### DFD → PCA (importar DFDs e compilar edições) — entregue
✅ Aba **PCA** (`/painel/pca`) com 3 abas: **Planilha** (fluxo achatado atual, intacto) · **DFDs** (importa o formulário DFD `.xlsx` no navegador via `parse-dfd`, vincula à repartição por auto-match da sigla do Setor Requisitante, lista/visualiza a tabela do DFD) · **PCA** (une DFDs selecionados numa **edição gerada e salva**, ex.: "PCA 2026", e mostra a compilação organizada por repartição). Escopo **por repartição** (como as `unidades`); sem `grupo_id`. Tabelas `dfds`/`dfd_itens`/`pcas`/`pca_dfds` (migração `0012`). Rotas `POST /api/dfd`, `DELETE /api/dfd/[id]`, `POST /api/pca`, `DELETE /api/pca/[id]`.

### Fase 4 (Design System + Personalização do ADM) — entregue / em propagação
✅ **Design System por tokens** — tema por `data-theme`, fonte **Geist**, biblioteca única em
**`/design-system`** (Button, StatusTag, KpiStat, Segmented, FilterChip, Dropdown, ColorField
[conta-gotas+swatches], PeriodoPicker, MultiSelectHeader, Tabs [swipe], Toast, DataTable
[seleção+filtro], ícones) + **Theme Playground** + preview mobile · ✅ **Home pública
redesenhada** (tokens/Geist) · ✅ **Painel de Aparência do ADM** (`/painel/aparencia`):
cores claro/escuro, raio, densidade, motion, presets; **persistido no D1** e **injetado sem
flash** (anti-XSS) · ✅ **Chrome do painel** (AppShell/nav/inputs) por token · 🔨 Propagação do
redesign ao conteúdo das telas logadas (Protocolos [status ✅], Dashboard, Usuários, Ferramentas).
Regras em [../CLAUDE.md](../CLAUDE.md); a `/design-system` é a **fonte única** de componentes.

---

## 1. Acesso, Usuários e Equipe (Fase 1 — continuar)
| | Item |
|---|---|
| ✅ | Login, cadastro, sessão, aprovação de cadastros pelo admin |
| ✅ | **Perfil do usuário**: editar nome, e-mail, **matrícula**, trocar senha e **foto** (base64, redimensionada no cliente) — a foto reflete no avatar do menu. Admin edita esses dados em Usuários. |
| 🔜 | **Times/Secretarias**: vincular usuários a setores; filtrar dados por time (dados separados por equipe) |
| 🔜 | **Permissões finas** (RBAC): níveis de acesso configuráveis → telas por equipe |
| 💡 | Convite por e-mail · Recuperação de senha · 2FA · Login Google (SSO) |
| 💡 | **Auditoria**: registro de quem fez o quê (login, edições, exclusões) |

## 2. Gestão de Protocolos (o "coração" do plano) 🔨
Digitalizar a planilha de controle (aba *Distribuição de Protocolos*). Ver [PROTOCOLOS.md](./PROTOCOLOS.md).
| | Item |
|---|---|
| ✅ | **Construtor de tabelas**: várias listas (cards), criar/renomear/excluir |
| ✅ | **Colunas personalizáveis** por tipo (texto/seleção/data/número); opções cadastráveis na tela |
| ✅ | **Edição na própria linha** (data padrão = hoje); busca + paginação; badges coloridos |
| 🔜 | **Importar** a aba "Distribuição de Protocolos" (.xlsx) para uma tabela |
| 💡 | Alertas de vencimento/SLA · Anexos · Comentários · Histórico de alterações |

## 3. Compilado PCA / Contratações (dashboard — expandir) 🔨
| | Item |
|---|---|
| ✅ | Importar `.xlsx`, KPIs, gráficos, consulta de itens com filtros |
| 🔜 | **Editar itens na plataforma** (sem reimportar) + histórico de versões |
| 🔜 | Vincular itens do PCA a protocolos/contratações |
| 💡 | Comparativo entre anos · Metas · Execução vs. planejado |

## 4. Orçamento PCA 🔜
| | Item |
|---|---|
| 🔜 | Orçamento por secretaria/unidade: **planejado × contratado**, % de execução |
| 🔜 | Tabela comparativa (como no sistema de referência) e diferença/saldo |
| 💡 | Importar a aba de orçamento · Alertas de estouro |

## 5. Comunicações Internas 🔜
| | Item |
|---|---|
| 🔜 | Mural/avisos internos · Comunicações vinculadas a um protocolo |
| 💡 | Notificações in-app (sino) · E-mail · Menções (@) |

## 6. Gestão de Riscos 🔜
| | Item |
|---|---|
| 🔜 | Matriz de riscos (probabilidade × impacto) por protocolo/contratação |
| 💡 | Planos de mitigação, responsáveis e acompanhamento de status |

## 7. Documentos / Drive 🔜
| | Item |
|---|---|
| 🔜 | Upload e organização de documentos (por protocolo/unidade) — usa R2 |
| 💡 | Modelos e geração: "Gerar PCA", Declarações, ofícios (como a referência) |

## 8. Relatórios & Exportação 🔜
| | Item |
|---|---|
| 🔜 | Exportar Excel/CSV das consultas · Exportar gráficos em PNG |
| 🔜 | Gerar PDF (relatório analítico, "Gerar PCA", declaração) |
| 💡 | Relatórios agendados/por e-mail |

## 9. Notificações 💡
E-mail e/ou in-app para: prazos de protocolo, cadastro pendente para o admin, atribuição de tarefa, estouro de orçamento.

## 10. Administração & Configurações 🔨
| | Item |
|---|---|
| ✅ | Gestão de usuários (aprovar, papel, ativar/excluir) |
| ✅ | **Aparência (Personalização §39)**: Design Tokens + painel do ADM (`/painel/aparencia`) — cores/raio/densidade/motion + presets, persistido no D1 e injetado sem flash |
| 🔜 | Configurações da plataforma (ano do PCA, secretarias, listas) |
| 💡 | Painel de auditoria e uso |

## 11. Qualidade / Transversal
| | Item |
|---|---|
| ✅ | Responsivo + toque + tema claro/escuro |
| ✅ | **Testes** (`node:test`) + **lint** (Biome) + **type-check** com **portão de qualidade na CI** (`ci.yml`/`deploy.yml`); error boundaries (`error.tsx`/`not-found.tsx`); observabilidade do Worker. Regras em [CLAUDE.md](../CLAUDE.md). |
| 🔜 | Tornar o type-check **bloqueante** (hoje informativo) quando o baseline de tipos estiver limpo |
| 🔜 | Deploy via **Workers Builds** (evita quebra quando um token é revogado) |
| 💡 | **PWA** (instalar no celular) · Acessibilidade (WCAG) · Backups do D1 |

---

## Ordem sugerida
1. **Fechar a Fase 1**: times + permissões + perfil + auditoria.
2. **Protocolos** (o núcleo do plano): CRUD + importação + fluxo.
3. **Orçamento** + **Relatórios/Exportação**.
4. **Comunicações** + **Notificações** + **Riscos**.
5. **Documentos/Drive** + extras (SSO, PWA, backups).

> Cada item é entregue de forma incremental e aditiva (sem quebrar o que já existe),
> com commit + deploy + verificação a cada passo.
