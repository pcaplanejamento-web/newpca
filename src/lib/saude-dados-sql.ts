/**
 * SAÚDE DOS DADOS — as consultas (só LEITURA, sem parâmetros) que conferem a INTEGRIDADE dos totais e apontam os DADOS A
 * TRATAR. Rodam no binding D1 cru (`prepare(...).all()`), sem getDb — testadas no D1 mínimo sobre `node:sqlite`
 * (`tests/fixtures/d1-sqlite.ts`). São as consultas da verificação em produção de 05/10/2026: DFD × itens, capa ×
 * somatória, abas, numeração/vínculos do PCA, rastro em dobro, Id repetido, itens sem valor e DFD sem planejamento.
 * 5 consultas por verificação — bem abaixo das 50 do Worker; as listas trazem só as linhas com problema (até 200).
 */

/** O que as consultas precisam do D1 (o binding real e o D1 mínimo dos testes). */
export type D1Leitura = { prepare(sql: string): { all(): Promise<{ results?: unknown[] }> } };

/** Teto das LISTAS (as contagens são exatas). */
export const LIMITE_LISTA = 200;

/** Itens gravados por DFD (CTE comum): quantos e a soma dos totais. */
const ITENS_POR_DFD = `it AS (SELECT dfd_id, COUNT(*) AS n, SUM(COALESCE(valor_total, 0)) AS s FROM dfd_itens GROUP BY dfd_id)`;

/** Os DFDs cujos totais NÃO batem com os itens: completos (itens ≥ declarados) com valor ou nº de itens diferente
 * (integridade — deve ser zero) e os PARCIAIS (gravação incompleta). A régua do banco: `comandoTotaisDfd` (4 casas). */
export const SQL_DFDS = `WITH ${ITENS_POR_DFD}
SELECT d.id, d.numero, d.planejamento, d.protocolo_id AS protocoloId, p.numero AS protocolo, p.pca_id AS pcaId,
  d.total_itens AS declarados, COALESCE(it.n, 0) AS itens, d.valor_total AS valor, ROUND(COALESCE(it.s, 0), 4) AS somaItens,
  CASE WHEN COALESCE(it.n, 0) < COALESCE(d.total_itens, 0) THEN 1 ELSE 0 END AS parcial
FROM dfds d
LEFT JOIN it ON it.dfd_id = d.id
LEFT JOIN dfd_protocolos p ON p.id = d.protocolo_id
WHERE COALESCE(it.n, 0) < COALESCE(d.total_itens, 0)
   OR d.total_itens IS NOT COALESCE(it.n, 0)
   OR ABS(COALESCE(d.valor_total, 0) - CASE WHEN COALESCE(it.s, 0) > 0 THEN ROUND(it.s, 4) ELSE 0 END) >= 0.00005
ORDER BY d.id
LIMIT ${LIMITE_LISTA}`;

/** Por PROTOCOLO: a capa, os DFDs vivos (Σ valor), a soma dos ITENS deles, quantos DFDs estão pela metade e o rastro dos
 * sobrescritos (Σ valor da época). A capa e as abas são conferidas no JS, com a MESMA régua da Mesa. */
export const SQL_PROTOCOLOS = `WITH ${ITENS_POR_DFD},
pd AS (SELECT d.protocolo_id AS pid, COUNT(*) AS n, SUM(COALESCE(d.valor_total, 0)) AS s, SUM(COALESCE(it.s, 0)) AS si,
    SUM(CASE WHEN COALESCE(it.n, 0) < COALESCE(d.total_itens, 0) THEN 1 ELSE 0 END) AS parciais
  FROM dfds d LEFT JOIN it ON it.dfd_id = d.id WHERE d.protocolo_id IS NOT NULL GROUP BY d.protocolo_id),
rs AS (SELECT protocolo_id AS pid, COUNT(*) AS n, SUM(COALESCE(valor_total, 0)) AS s FROM dfd_passagens GROUP BY protocolo_id)
SELECT p.id, p.numero, p.assunto, p.pca_id AS pcaId, p.valor_capa AS valorCapa,
  COALESCE(pd.n, 0) AS dfds, COALESCE(pd.s, 0) AS somaDfds, COALESCE(pd.si, 0) AS somaItens, COALESCE(pd.parciais, 0) AS parciais,
  COALESCE(rs.n, 0) AS rastro, COALESCE(rs.s, 0) AS somaRastro
FROM dfd_protocolos p
LEFT JOIN pd ON pd.pid = p.id
LEFT JOIN rs ON rs.pid = p.id
ORDER BY p.id`;

/** Itens SEM valor unitário (vazio, zero ou negativo — a régua `semValorUnitario`), por DFD: os que têm mais primeiro. */
export const SQL_SEM_VALOR = `SELECT d.id, d.numero, d.planejamento, d.protocolo_id AS protocoloId, p.numero AS protocolo, p.pca_id AS pcaId,
  COUNT(*) AS itens, d.total_itens AS declarados
FROM dfd_itens i
JOIN dfds d ON d.id = i.dfd_id
LEFT JOIN dfd_protocolos p ON p.id = d.protocolo_id
WHERE i.valor_unitario IS NULL OR i.valor_unitario <= 0
GROUP BY d.id
ORDER BY itens DESC, d.id
LIMIT ${LIMITE_LISTA}`;

/** DFDs sem nº de planejamento (vazio ou só espaços — o identificador do Centi). */
export const SQL_SEM_PLANEJAMENTO = `SELECT d.id, d.numero, d.planejamento, d.protocolo_id AS protocoloId, p.numero AS protocolo, p.pca_id AS pcaId
FROM dfds d
LEFT JOIN dfd_protocolos p ON p.id = d.protocolo_id
WHERE d.planejamento IS NULL OR TRIM(d.planejamento) = ''
ORDER BY d.id
LIMIT ${LIMITE_LISTA}`;

/** As CONTAGENS exatas + as conferências ESTRUTURAIS que devem ser ZERO: a numeração e os vínculos do PCA (a sincronia
 * da Mesa do PCA), o rastro contado em dobro e o Id de protocolo repetido. O DFD pela metade fica fora da numeração (o
 * item novo só ganha nº com a gravação completa). */
export const SQL_CONTAGENS = `WITH ${ITENS_POR_DFD},
completos AS (SELECT d.id FROM dfds d LEFT JOIN it ON it.dfd_id = d.id WHERE COALESCE(it.n, 0) >= COALESCE(d.total_itens, 0))
SELECT
  (SELECT COUNT(*) FROM dfd_protocolos) AS protocolos,
  (SELECT COUNT(*) FROM dfds) AS dfds,
  (SELECT COUNT(*) FROM dfd_itens) AS itens,
  (SELECT COUNT(*) FROM dfds d LEFT JOIN it ON it.dfd_id = d.id WHERE COALESCE(it.n, 0) < COALESCE(d.total_itens, 0)) AS dfdsParciais,
  (SELECT COUNT(*) FROM dfds d LEFT JOIN it ON it.dfd_id = d.id
    WHERE COALESCE(it.n, 0) >= COALESCE(d.total_itens, 0)
      AND (d.total_itens IS NOT COALESCE(it.n, 0)
        OR ABS(COALESCE(d.valor_total, 0) - CASE WHEN COALESCE(it.s, 0) > 0 THEN ROUND(it.s, 4) ELSE 0 END) >= 0.00005)) AS dfdsDivergentes,
  (SELECT COUNT(*) FROM dfd_itens WHERE valor_unitario IS NULL OR valor_unitario <= 0) AS itensSemValor,
  (SELECT COUNT(DISTINCT dfd_id) FROM dfd_itens WHERE valor_unitario IS NULL OR valor_unitario <= 0) AS dfdsSemValor,
  (SELECT COUNT(*) FROM dfds WHERE planejamento IS NULL OR TRIM(planejamento) = '') AS semPlanejamento,
  (SELECT COUNT(*) FROM pca_itens WHERE baixado_em IS NULL) AS numerosPca,
  (SELECT COUNT(*) FROM pca_itens x WHERE x.baixado_em IS NULL AND x.ativo = 1
    AND NOT EXISTS (SELECT 1 FROM pca_dfds l WHERE l.pca_id = x.pca_id AND l.dfd_id = x.dfd_id AND l.acao <> 'excluir')) AS pcaAtivoSemVinculo,
  (SELECT COUNT(*) FROM pca_itens x WHERE x.baixado_em IS NULL AND x.dfd_item_id IS NULL
    AND x.dfd_id IN (SELECT id FROM completos)) AS pcaNumeroSemItem,
  (SELECT COUNT(*) FROM dfd_itens i
    JOIN pca_dfds l ON l.dfd_id = i.dfd_id AND l.protocolo_id IS NOT NULL AND l.acao <> 'excluir'
    WHERE i.dfd_id IN (SELECT id FROM completos)
      AND NOT EXISTS (SELECT 1 FROM pca_itens x WHERE x.dfd_item_id = i.id AND x.pca_id = l.pca_id AND x.baixado_em IS NULL)) AS pcaItemSemNumero,
  (SELECT COUNT(*) FROM dfd_itens i LEFT JOIN pca_itens x ON x.dfd_item_id = i.id AND x.baixado_em IS NULL
    WHERE i.pca_id IS NOT x.pca_id OR i.pca_sequencial IS NOT x.sequencial) AS pcaNumeroDivergente,
  (SELECT COUNT(*) FROM (SELECT dfd_item_id FROM pca_itens WHERE baixado_em IS NULL AND dfd_item_id IS NOT NULL
    GROUP BY dfd_item_id HAVING COUNT(*) > 1)) AS pcaItemDoisNumeros,
  (SELECT COUNT(*) FROM pca_dfds l JOIN dfds d ON d.id = l.dfd_id LEFT JOIN dfd_protocolos p ON p.id = l.protocolo_id
    WHERE l.protocolo_id IS NOT NULL
      AND (d.protocolo_id IS NOT l.protocolo_id OR p.pca_id IS NOT l.pca_id OR p.pca_incorporado_em IS NULL)) AS pcaVinculoForaDoProtocolo,
  (SELECT COUNT(*) FROM dfds d JOIN dfd_protocolos p ON p.id = d.protocolo_id
    WHERE p.pca_id IS NOT NULL AND p.pca_incorporado_em IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM pca_dfds l WHERE l.dfd_id = d.id AND l.pca_id = p.pca_id)
      AND NOT EXISTS (SELECT 1 FROM pca_dfds l WHERE l.dfd_id = d.id AND l.protocolo_id IS NULL)) AS pcaIncorporadoSemVinculo,
  (SELECT COUNT(*) FROM dfd_passagens r JOIN dfds d ON d.numero = r.dfd_numero AND d.protocolo_id = r.protocolo_id) AS rastroEmDobro,
  (SELECT COUNT(*) FROM (SELECT id_externo FROM dfd_protocolos WHERE id_externo IS NOT NULL AND TRIM(id_externo) <> ''
    GROUP BY id_externo HAVING COUNT(*) > 1)) AS idsRepetidos`;

/** Uma linha de DFD das listas. */
export type DfdSaude = {
  id: number;
  numero: string;
  planejamento: string | null;
  protocoloId: number | null;
  protocolo: string | null;
  pcaId: number | null;
};
export type DfdTotaisSaude = DfdSaude & { declarados: number | null; itens: number; valor: number | null; somaItens: number; parcial: number };
export type DfdSemValorSaude = DfdSaude & { itens: number; declarados: number | null };
export type ProtocoloSaude = {
  id: number;
  numero: string;
  assunto: string | null;
  pcaId: number | null;
  valorCapa: number | null;
  dfds: number;
  somaDfds: number;
  somaItens: number;
  parciais: number;
  rastro: number;
  somaRastro: number;
};
export type ContagensSaude = {
  protocolos: number;
  dfds: number;
  itens: number;
  dfdsParciais: number;
  dfdsDivergentes: number;
  itensSemValor: number;
  dfdsSemValor: number;
  semPlanejamento: number;
  numerosPca: number;
  pcaAtivoSemVinculo: number;
  pcaNumeroSemItem: number;
  pcaItemSemNumero: number;
  pcaNumeroDivergente: number;
  pcaItemDoisNumeros: number;
  pcaVinculoForaDoProtocolo: number;
  pcaIncorporadoSemVinculo: number;
  rastroEmDobro: number;
  idsRepetidos: number;
};

/** O que a verificação lê do banco (a entrada pura de `avaliarSaude`). */
export type EntradaSaude = {
  dfds: DfdTotaisSaude[];
  protocolos: ProtocoloSaude[];
  semValor: DfdSemValorSaude[];
  semPlanejamento: DfdSaude[];
  contagens: ContagensSaude;
};

const linhas = async <T>(d1: D1Leitura, sql: string) => ((await d1.prepare(sql).all()).results ?? []) as T[];

/** Roda as 5 consultas em paralelo. */
export async function consultarSaude(d1: D1Leitura): Promise<EntradaSaude> {
  const [dfds, protocolos, semValor, semPlanejamento, contagens] = await Promise.all([
    linhas<DfdTotaisSaude>(d1, SQL_DFDS),
    linhas<ProtocoloSaude>(d1, SQL_PROTOCOLOS),
    linhas<DfdSemValorSaude>(d1, SQL_SEM_VALOR),
    linhas<DfdSaude>(d1, SQL_SEM_PLANEJAMENTO),
    linhas<ContagensSaude>(d1, SQL_CONTAGENS),
  ]);
  return { dfds, protocolos, semValor, semPlanejamento, contagens: contagens[0] as ContagensSaude };
}
