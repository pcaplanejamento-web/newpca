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
✅ **Home `/` = dashboard do PCA PÚBLICO** (todos veem, sem login; `GET /api/itens` liberado) · ✅ Aba **PCA** (`/painel/pca`) para subir planilhas + unidades · ✅ Consolidação: dashboard saiu de Ferramentas para `/`; upload para a aba PCA.

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
| 🔜 | Configurações da plataforma (ano do PCA, secretarias, listas) |
| 💡 | Painel de auditoria e uso |

## 11. Qualidade / Transversal
| | Item |
|---|---|
| ✅ | Responsivo + toque + tema claro/escuro |
| 🔜 | Reativar type-check no CI · Testes automatizados |
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
