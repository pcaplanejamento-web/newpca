# Módulo de Protocolos

Digitaliza a planilha de "Distribuição de Protocolos": cadastro, distribuição e
acompanhamento dos protocolos da equipe. Fica em **`/painel/protocolos`** (requer login).

## Modelo (`protocolos`)
`numero`, `assunto`, `secretaria`, `responsavelId` (→ usuário), `status`
(`recebido` | `em_andamento` | `aguardando` | `concluido` | `arquivado`),
`prioridade` (`baixa` | `media` | `alta`), `dataEntrada`, `prazo`, `dataConclusao`,
`observacoes`, `criadoPor`, datas. Migração `drizzle/0002_protocolos.sql`.

## Permissões
- **Todos os usuários ativos**: visualizam, buscam e filtram.
- **Admin e Gestor**: criam, editam e excluem.

## Funcionalidades
- KPIs: total, em aberto, **vencidos** (prazo passado e não concluído) e concluídos.
- Busca (número/assunto/secretaria) + filtros por status e responsável + paginação.
- Criar/editar em modal; excluir com confirmação. Prazo vencido aparece em vermelho.

## API
- `GET /api/protocolos` — lista + resumo (qualquer logado).
- `POST /api/protocolos` — cria (admin/gestor).
- `PATCH /api/protocolos/[id]` · `DELETE /api/protocolos/[id]` (admin/gestor).

## Próximos passos
- **Importar** a planilha de controle (reaproveitando o pipeline de `.xlsx`) —
  precisa das colunas reais da planilha para o mapeamento.
- Anexos por protocolo (R2), comentários e histórico de alterações; alertas de prazo.
