# Módulo de Protocolos

Espelha a planilha **"Distribuição de Protocolos"**. Fica em **`/painel/protocolos`** (requer login).

## Colunas (iguais à planilha)
| Campo | Coluna da planilha | Observação |
|---|---|---|
| `data` | DATA | data do protocolo (dd/mm/aaaa) |
| `numero` | PROTOCOLO | número do protocolo |
| `secretaria` | SECRETARIA / ÓRGÃO | órgão de origem (com o solicitante) |
| `natureza` | NATUREZA | ex.: INCLUSÃO 2027, INCLUSÃO 2026, EXCLUSÃO (badge colorido) |
| `responsavel` | RESPONSÁVEL | quem responde (Naty/Cris/Maria…) |
| `situacao` | SITUAÇÃO | Em análise · Em andamento · Pendente · Finalizado |
| `distribuicao` | DISTRIBUIÇÃO | para quem foi distribuído |

Migração: `drizzle/0003_protocolos_v2.sql`.

## Permissões
- **Todos os usuários ativos**: visualizam, buscam e filtram.
- **Admin e Gestor**: criam, editam e excluem.

## Funcionalidades
- KPIs: total, em aberto, em análise, finalizados.
- Busca + filtros (situação, responsável, natureza) + paginação.
- **Edição na própria linha** (estilo planilha): "+ Adicionar linha" cria uma linha
  editável; "Editar" torna a linha existente editável. Salvar/Cancelar inline.
- **Tudo por seleção** (menos o nº do protocolo): secretaria, natureza, responsável,
  situação e distribuição são `<select>`.
- **Cadastro de opções na própria tela**: cada select tem "➕ Nova opção…"; e há
  **"Gerenciar listas"** para adicionar/remover valores por categoria.

## Listas de seleção (`protocolo_opcoes`, migração 0004)
Categorias gerenciáveis: `secretaria`, `natureza`, `responsavel`, `distribuicao`
(únicas por categoria+valor). `situacao` é fixa (workflow). Naturezas iniciais:
INCLUSÃO 2027/2026, EXCLUSÃO.

## API
- `GET /api/protocolos` — lista + resumo (qualquer logado).
- `POST /api/protocolos` · `PATCH`/`DELETE /api/protocolos/[id]` (admin/gestor).
- `GET /api/protocolos/opcoes` — listas de seleção · `POST` adiciona ·
  `DELETE /api/protocolos/opcoes/[id]` remove (admin/gestor).

## Próximo passo
- **Importar** a aba "Distribuição de Protocolos" (.xlsx), populando protocolos e
  já cadastrando as opções (secretaria/natureza/responsável/distribuição) encontradas.
