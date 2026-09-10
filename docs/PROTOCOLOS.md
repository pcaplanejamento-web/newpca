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
- Busca (protocolo/secretaria/natureza/responsável) + filtros por situação, responsável e natureza + paginação.
- Criar/editar em modal (com sugestões de natureza/responsável/distribuição a partir dos valores já usados).

## API
- `GET /api/protocolos` — lista + resumo + opções (qualquer logado).
- `POST /api/protocolos` — cria (admin/gestor).
- `PATCH`/`DELETE /api/protocolos/[id]` (admin/gestor).

## Próximo passo
- **Importar** a aba "Distribuição de Protocolos" exportada em `.xlsx` (mapeando
  DATA, PROTOCOLO, SECRETARIA, NATUREZA, RESPONSÁVEL, SITUAÇÃO, DISTRIBUIÇÃO).
