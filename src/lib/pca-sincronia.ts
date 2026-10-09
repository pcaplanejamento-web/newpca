import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { dfdItens, dfdProtocolos, dfds, pcaDfds, pcaItens } from "@/db/schema";
import { getDb } from "./db";
import { acaoSugerida, coerceAcao, consolidarPca } from "./pca-core";
import {
  baixarNumeros,
  baixarNumerosPendentes,
  desvincularDfdDoPca,
  gravarSequencialDoDfd,
  numerarItensDoDfd,
  reativarVigentes,
  religarNumeros,
  retratarNumeros,
  trocarProtocoloDoVinculo,
  vincularDfdAoPca,
} from "./pca-itens-sql";
import { type IdentidadeItem, MOTIVO_NUMERO, parearNumeros, planoVinculoDfd, vinculoDesejado } from "./pca-numeracao-core";
import { lotesDeIds } from "./reparticoes";

/**
 * SINCRONIA do PCA — o protocolo INCORPORADO se edita como qualquer outro e o PCA acompanha (núcleo puro em
 * `pca-numeracao-core.ts`; comandos em `pca-itens-sql.ts`):
 * - `numeracaoDaGravacao`: antes de REGRAVAR itens, pareia as linhas novas com os nºs que vão perder o item (o editado
 *   mantém o nº); as linhas levam o nº e o religam no MESMO lote.
 * - `sincronizarDfdNoPca`: depois de gravar, o DFD fica no PCA do protocolo incorporado em que está (entra/sai/troca) e,
 *   com a gravação COMPLETA, os itens novos ganham nº e os nºs sem item são baixados.
 * - `sincronizarAtivosPca`: o nº do DFD que deixou de ser VIGENTE fica inativo; o que voltou a valer, reativado.
 */
type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];

/** A numeração de uma regravação de itens: o nº de cada linha nova + os comandos antes do DELETE e depois do INSERT. */
export type NumeracaoGravacao = { porLinha: ({ pcaId: number; sequencial: number } | null)[]; antes: Stmt[]; depois: Stmt[] };

/**
 * Prepara a regravação dos itens de um DFD numerado no PCA (`null` = o DFD não tem nº — nada a fazer). A gravação apaga os
 * itens com sequencial na faixa `apagaDe < sequencial ≤ apagaAte` (sem `apagaAte` = todos acima de `apagaDe`: 0 = start-dfd e
 * "Salvar"; o append apaga só a faixa do próprio lote) — só os nºs dessa faixa (e os pendentes) ficam livres para parear.
 */
export async function numeracaoDaGravacao(dfdId: number, lote: IdentidadeItem[], apagaDe: number, apagaAte?: number): Promise<NumeracaoGravacao | null> {
  const db = getDb();
  const rows = await db
    .select({
      pcaId: pcaItens.pcaId,
      sequencial: pcaItens.sequencial,
      ligado: pcaItens.dfdItemId,
      seqItem: dfdItens.sequencial,
      item: sql<number | null>`COALESCE(${dfdItens.item}, ${pcaItens.item})`,
      codigo: sql<string | null>`COALESCE(${dfdItens.codigo}, ${pcaItens.codigo})`,
      descricao: sql<string | null>`COALESCE(${dfdItens.descricao}, ${pcaItens.descricao})`,
      unidade: sql<string | null>`COALESCE(${dfdItens.unidade}, ${pcaItens.unidade})`,
    })
    .from(pcaItens)
    .leftJoin(dfdItens, eq(dfdItens.id, pcaItens.dfdItemId))
    .where(and(eq(pcaItens.dfdId, dfdId), isNull(pcaItens.baixadoEm)));
  if (rows.length === 0) return null;
  // Livres: os pendentes (sem item) e os dos itens que esta gravação apaga (a faixa dela).
  const livres = rows.filter((r) => r.ligado == null || (r.seqItem != null && r.seqItem > apagaDe && (apagaAte == null || r.seqItem <= apagaAte)));
  const { numeros } = parearNumeros(lote, livres);
  return { porLinha: numeros, antes: [retratarNumeros(db, { dfdId })], depois: [religarNumeros(db, dfdId)] };
}

/**
 * Depois de gravar o DFD: ele fica no PCA do protocolo INCORPORADO em que está — entra (com a ação do protocolo), sai (nºs
 * baixados) ou troca de protocolo no mesmo PCA (nºs ficam). Com a gravação COMPLETA (`gravados` ≥ o total declarado do DFD,
 * ou "todos"), os itens novos ganham o próximo nº e os nºs que ficaram sem item são baixados. Idempotente — repetir não muda
 * nada (a nova tentativa de uma gravação que falhou no meio conserta o estado).
 */
export async function sincronizarDfdNoPca(dfdId: number, ator: number | null, gravados: number | "todos"): Promise<void> {
  const db = getDb();
  const [[d], vinculosDoDfd] = await Promise.all([
    db
      .select({
        protocoloId: dfds.protocoloId,
        totalItens: dfds.totalItens,
        pcaId: dfdProtocolos.pcaId,
        incorporadoEm: dfdProtocolos.pcaIncorporadoEm,
        assunto: dfdProtocolos.assunto,
      })
      .from(dfds)
      .leftJoin(dfdProtocolos, eq(dfdProtocolos.id, dfds.protocoloId))
      .where(eq(dfds.id, dfdId))
      .limit(1),
    db.select({ pcaId: pcaDfds.pcaId, protocoloId: pcaDfds.protocoloId }).from(pcaDfds).where(eq(pcaDfds.dfdId, dfdId)),
  ]);
  if (!d) return;
  // Um DFD em UM PCA (a regra da incorporação): com vínculo LEGADO (edição antiga, sem protocolo) em OUTRO PCA, ele não
  // entra por incorporação neste — fica onde está.
  const desejado0 = vinculoDesejado({ protocoloId: d.protocoloId, pcaId: d.pcaId, pcaIncorporadoEm: d.incorporadoEm });
  const legadoEmOutro = vinculosDoDfd.some((v) => v.protocoloId == null && v.pcaId !== desejado0?.pcaId);
  const desejado = legadoEmOutro ? null : desejado0;
  const plano = planoVinculoDfd(
    vinculosDoDfd.flatMap((v) => (v.protocoloId != null ? [{ pcaId: v.pcaId, protocoloId: v.protocoloId }] : [])),
    desejado,
  );
  const cmds: Stmt[] = [];
  for (const pca of plano.sai) cmds.push(retratarNumeros(db, { dfdId }), ...baixarNumeros(db, { dfdId }, pca, MOTIVO_NUMERO.dfdSaiu, ator), desvincularDfdDoPca(db, dfdId, pca));
  if (plano.entra) cmds.push(vincularDfdAoPca(db, dfdId, plano.entra.pcaId, plano.entra.protocoloId, acaoSugerida(d.assunto), ator));
  if (plano.troca) cmds.push(trocarProtocoloDoVinculo(db, dfdId, plano.troca.pcaId, plano.troca.protocoloId, acaoSugerida(d.assunto)));
  const completo = gravados === "todos" || gravados >= (d.totalItens ?? 0);
  if (desejado && completo)
    cmds.push(numerarItensDoDfd(db, dfdId), gravarSequencialDoDfd(db, dfdId), baixarNumerosPendentes(db, dfdId, MOTIVO_NUMERO.itemRemovido, ator));
  if (cmds.length > 0) await db.batch(cmds as [Stmt, ...Stmt[]]);
  // A VIGÊNCIA de todo PCA tocado: o que o DFD deixou e o dele — também a cada gravação COMPLETA e a cada troca (o
  // planejamento ou a ação podem ter mudado: o substituído volta a valer, o nº novo de um DFD não vigente fica inativo).
  const afetados = new Set(plano.sai);
  if (desejado && (plano.entra || plano.troca || completo)) afetados.add(desejado.pcaId);
  for (const pca of afetados) await sincronizarAtivosPca(pca, ator);
}

/** Os PCAs em que os DFDs dados (ou os DFDs de um protocolo) estão vinculados — a vigência a ressincronizar depois de tirá-los. */
export async function pcasDosDfds(alvo: { dfdId: number } | { protocoloId: number }): Promise<number[]> {
  const rows = await getDb()
    .selectDistinct({ pcaId: pcaDfds.pcaId })
    .from(pcaDfds)
    .where(
      "dfdId" in alvo
        ? eq(pcaDfds.dfdId, alvo.dfdId)
        : inArray(pcaDfds.dfdId, getDb().select({ id: dfds.id }).from(dfds).where(eq(dfds.protocoloId, alvo.protocoloId))),
    );
  return rows.map((r) => r.pcaId);
}

/**
 * VIGÊNCIA dos nºs do PCA: o nº de um DFD que deixou de ser VIGENTE (substituído/excluído por outro protocolo) fica inativo;
 * o de um DFD que voltou a valer (quem o substituía saiu do PCA) é REATIVADO. Retirado e baixado não mudam.
 */
export async function sincronizarAtivosPca(pcaId: number, usuarioId: number | null): Promise<void> {
  const db = getDb();
  const [vs, numerados] = await Promise.all([
    db
      .select({
        dfdId: pcaDfds.dfdId,
        acao: pcaDfds.acao,
        planejamento: dfds.planejamento,
        vinculadoEm: pcaDfds.vinculadoEm,
        protocoladoEm: dfdProtocolos.criadoEm,
      })
      .from(pcaDfds)
      .innerJoin(dfds, eq(pcaDfds.dfdId, dfds.id))
      .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
      .where(eq(pcaDfds.pcaId, pcaId)),
    db
      .selectDistinct({ dfdId: pcaItens.dfdId, ativo: pcaItens.ativo })
      .from(pcaItens)
      .where(
        and(
          eq(pcaItens.pcaId, pcaId),
          isNull(pcaItens.baixadoEm),
          or(eq(pcaItens.ativo, true), eq(pcaItens.motivo, MOTIVO_NUMERO.naoVigente)),
        ),
      ),
  ]);
  // A MESMA ordem da consolidação do Dashboard (`vinculos` em `pca-espaco.ts`).
  const vig = new Set(
    consolidarPca(vs.map((r) => ({ dfdId: r.dfdId, acao: coerceAcao(r.acao), planejamento: r.planejamento, ordem: `${r.protocoladoEm ?? ""}|${r.vinculadoEm ?? ""}` })))
      .vigentes,
  );
  const fora = [...new Set(numerados.filter((r) => r.ativo && r.dfdId != null && !vig.has(r.dfdId)).map((r) => r.dfdId as number))];
  const volta = [...new Set(numerados.filter((r) => !r.ativo && r.dfdId != null && vig.has(r.dfdId)).map((r) => r.dfdId as number))];
  for (const lote of lotesDeIds(fora))
    await db
      .update(pcaItens)
      .set({ ativo: false, inativadoEm: sql`(CURRENT_TIMESTAMP)`, inativadoPor: usuarioId, motivo: MOTIVO_NUMERO.naoVigente })
      .where(and(eq(pcaItens.pcaId, pcaId), eq(pcaItens.ativo, true), isNull(pcaItens.baixadoEm), inArray(pcaItens.dfdId, lote)));
  for (const lote of lotesDeIds(volta)) await reativarVigentes(db, pcaId, lote, MOTIVO_NUMERO.naoVigente);
}
