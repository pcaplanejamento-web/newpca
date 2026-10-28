import { desc, eq } from "drizzle-orm";
import { declaracaoItens, declaracoes, usuarios } from "@/db/schema";
import type { NextResponse } from "next/server";
import { componenteLibera } from "./acesso";
import { type Guarda, intId, recusaPca } from "./api-auth";
import type { UsuarioSessao } from "./auth";
import { getDb } from "./db";
import { comandoCancelarDeclaracao, comandosEmitirDeclaracao, consultaDeclarados, consultaUltimoNumero } from "./declaracoes-sql";
import {
  type ConteudoDeclaracao,
  conferirPedido,
  type Finalidade,
  type ItemDeclaravel,
  lerConteudo,
  montarConteudo,
  type PedidoItem,
  ROTULO_FINALIDADE,
  rotuloNumero,
  seloDeclaracao,
} from "./declaracoes-core";
import { unidadeDoModulo } from "./escopo-cabecalho";
import { type FiltroId, passaFiltroId } from "./escopo-unidades-core";
import { dataIsoBrasilia } from "./format";
import { erro } from "./http";
import type { AcaoPapel } from "./papeis-core";
import { getPcaEspaco, itensConsolidados, type PcaEspaco } from "./pca-espaco";
import { unirPlanilhaEProtocolos } from "./pca-uniao";
import { getItensTodos } from "./queries";
import { codigoDeBytes } from "./termo-uso-core";

/**
 * DECLARAÇÕES DO PCA no D1 (o núcleo puro é `declaracoes-core.ts`). Os itens declaráveis são os itens REAIS do PCA — os
 * dos protocolos INCORPORADOS com o nº do PCA (a prévia não conta) e, no PCA de lista, os das planilhas que nenhum protocolo
 * incorporado substituiu (a MESMA união do Dashboard) —, só os da unidade da pessoa (`rep`, a régua do cabeçalho).
 */
export async function itensDeclaraveis(pca: PcaEspaco, rep: FiltroId): Promise<ItemDeclaravel[]> {
  if (rep === false) return [];
  const [c, declarados] = await Promise.all([itensConsolidados(pca), declaradosDoPca(pca.id)]);
  const doProtocolo = c.itens.filter((i) => i.numerado && !c.previaIds.has(i.dfdId) && passaFiltroId(rep, i.reparticaoId));
  const lista: ItemDeclaravel[] = doProtocolo.map((i) => {
    const m = c.meta.get(i.dfdId);
    return {
      sequencial: i.sequencial as number,
      codigo: i.codigoProduto,
      descricao: i.nome,
      unidade: i.unidadeMedida,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
      sigla: i.unidade,
      dfdId: i.dfdId,
      dfdNumero: m?.numero ?? null,
      planejamento: m?.planejamento ?? null,
      tipoDfd: i.tipoDfd,
      protocoloNumero: m?.protocoloNumero ?? null,
      itemNumero: i.itemNumero,
      declarado: 0,
    };
  });
  if (pca.fonte === "lista") {
    const planilha = await getItensTodos(undefined, undefined, rep ? { pcaId: pca.id, reparticaoId: rep } : pca.id);
    const incorporados = new Set<string | null>();
    for (const [dfdId, m] of c.meta) if (!c.previaIds.has(dfdId)) incorporados.add(m.protocoloIdExterno);
    for (const i of unirPlanilhaEProtocolos(planilha, [], (p) => p.protocoloIdExterno, incorporados).planilha)
      if (i.sequencial != null)
        lista.push({
          sequencial: i.sequencial,
          codigo: i.idProduto,
          descricao: i.nomeProduto,
          unidade: i.unidadeMedida,
          quantidade: i.quantidade,
          valorUnitario: i.valorReferencia,
          sigla: i.codigo,
          dfdId: null,
          dfdNumero: null,
          planejamento: null,
          tipoDfd: null,
          protocoloNumero: null,
          itemNumero: null,
          declarado: 0,
        });
  }
  for (const i of lista) i.declarado = declarados.get(i.sequencial) ?? 0;
  return lista.sort((a, b) => a.sequencial - b.sequencial);
}

async function declaradosDoPca(pcaId: number): Promise<Map<number, number>> {
  const rs = await consultaDeclarados(getDb(), pcaId);
  return new Map(rs.map((r) => [r.sequencial, Number(r.total ?? 0)]));
}

export type DeclaracaoResumo = {
  id: number;
  numero: number;
  ano: number;
  rotulo: string;
  codigo: string;
  finalidade: Finalidade;
  finalidadeRotulo: string;
  processo: string | null;
  totalItens: number;
  valorTotal: number;
  emitidoPorNome: string;
  emitidoEm: string;
  cancelada: { em: string; por: string | null; motivo: string | null } | null;
};

const COLS = {
  id: declaracoes.id,
  numero: declaracoes.numero,
  ano: declaracoes.ano,
  codigo: declaracoes.codigo,
  finalidade: declaracoes.finalidade,
  processo: declaracoes.processo,
  totalItens: declaracoes.totalItens,
  valorTotal: declaracoes.valorTotal,
  emitidoPorNome: declaracoes.emitidoPorNome,
  emitidoEm: declaracoes.emitidoEm,
  canceladaEm: declaracoes.canceladaEm,
  canceladaPorNome: declaracoes.canceladaPorNome,
  motivoCancelamento: declaracoes.motivoCancelamento,
};

type LinhaCols = { [K in keyof typeof COLS]: (typeof COLS)[K]["_"]["data"] | null };
const resumo = (r: LinhaCols): DeclaracaoResumo => ({
  id: r.id as number,
  numero: r.numero as number,
  ano: r.ano as number,
  rotulo: rotuloNumero(r.numero as number, r.ano as number),
  codigo: r.codigo as string,
  finalidade: r.finalidade as Finalidade,
  finalidadeRotulo: ROTULO_FINALIDADE[r.finalidade as Finalidade] ?? String(r.finalidade),
  processo: r.processo,
  totalItens: r.totalItens as number,
  valorTotal: Number(r.valorTotal ?? 0),
  emitidoPorNome: r.emitidoPorNome as string,
  emitidoEm: r.emitidoEm as string,
  cancelada: r.canceladaEm ? { em: r.canceladaEm, por: r.canceladaPorNome, motivo: r.motivoCancelamento } : null,
});

/**
 * As declarações do PCA (as mais recentes primeiro). Com a unidade da pessoa (`visiveis` = os sequenciais que ela vê), só as
 * que declaram ao menos um desses itens — uma pessoa não vê a declaração só de itens de outra unidade.
 */
export async function listarDeclaracoes(pcaId: number, visiveis: ReadonlySet<number> | null): Promise<DeclaracaoResumo[]> {
  const db = getDb();
  const rs = await db.select(COLS).from(declaracoes).where(eq(declaracoes.pcaId, pcaId)).orderBy(desc(declaracoes.id));
  if (!visiveis) return rs.map(resumo);
  const seqs = rs.length
    ? await db.select({ id: declaracaoItens.declaracaoId, sequencial: declaracaoItens.sequencial }).from(declaracaoItens).where(eq(declaracaoItens.pcaId, pcaId))
    : [];
  const ve = new Set(seqs.filter((s) => visiveis.has(s.sequencial)).map((s) => s.id));
  return rs.filter((r) => ve.has(r.id)).map(resumo);
}

export type DeclaracaoCompleta = DeclaracaoResumo & { pcaId: number; selo: string; conteudoTexto: string; conteudo: ConteudoDeclaracao | null };

async function uma(onde: ReturnType<typeof eq>): Promise<DeclaracaoCompleta | null> {
  const [r] = await getDb()
    .select({ ...COLS, pcaId: declaracoes.pcaId, selo: declaracoes.selo, conteudo: declaracoes.conteudo })
    .from(declaracoes)
    .where(onde)
    .limit(1);
  return r ? { ...resumo(r), pcaId: r.pcaId, selo: r.selo, conteudoTexto: r.conteudo, conteudo: lerConteudo(r.conteudo) } : null;
}

export const getDeclaracao = (id: number) => uma(eq(declaracoes.id, id));
export const declaracaoPorCodigo = (codigo: string) => uma(eq(declaracoes.codigo, codigo));

/** O selo gravado confere com o conteúdo (nada foi mexido no banco depois da emissão). */
export async function seloConfereDeclaracao(d: DeclaracaoCompleta): Promise<boolean> {
  return (await seloDeclaracao({ codigo: d.codigo, ano: d.ano, numero: d.numero, emitidoEm: d.emitidoEm, conteudo: d.conteudoTexto })) === d.selo;
}

export type PedidoDeclaracao = {
  finalidade: Finalidade;
  finalidadeTexto: string | null;
  processo: string | null;
  observacao: string | null;
  itens: PedidoItem[];
};

/**
 * EMITE a declaração: confere o pedido contra os itens de HOJE, congela o retrato, sela e grava num lote ATÔMICO (a
 * declaração + os itens). O gatilho do banco barra o que passar do saldo mesmo com duas emissões juntas; o número do ano
 * repetido (corrida) tenta de novo.
 */
export async function emitirDeclaracao(
  u: UsuarioSessao,
  pca: PcaEspaco,
  p: PedidoDeclaracao,
  rep: FiltroId,
): Promise<{ declaracao: DeclaracaoResumo } | { erro: string; status: number }> {
  const db = getDb();
  const [itens, [pessoa]] = await Promise.all([
    itensDeclaraveis(pca, rep),
    db.select({ cargo: usuarios.cargo }).from(usuarios).where(eq(usuarios.id, u.id)).limit(1),
  ]);
  const { linhas, erros } = conferirPedido(p.itens, itens);
  if (erros.length) return { erro: erros.slice(0, 5).join(" "), status: 422 };
  const conteudo = montarConteudo({
    pca: { id: pca.id, nome: pca.nome, ano: pca.ano },
    finalidade: p.finalidade,
    finalidadeTexto: p.finalidade === "outra" ? p.finalidadeTexto : null,
    processo: p.processo,
    observacao: p.observacao,
    linhas,
    emitente: { nome: u.nome, matricula: u.matricula, cargo: pessoa?.cargo ?? null },
  });
  const texto = JSON.stringify(conteudo);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const emitidoEm = new Date().toISOString().slice(0, 19).replace("T", " ");
    const ano = Number(dataIsoBrasilia(emitidoEm).slice(0, 4));
    const [ult] = await consultaUltimoNumero(db, ano);
    const numero = Number(ult?.n ?? 0) + 1;
    const codigo = codigoDeBytes(crypto.getRandomValues(new Uint8Array(16)));
    const selo = await seloDeclaracao({ codigo, ano, numero, emitidoEm, conteudo: texto });
    const cmds = comandosEmitirDeclaracao(db, {
      pcaId: pca.id,
      ano,
      numero,
      codigo,
      finalidade: p.finalidade,
      processo: p.processo,
      observacao: p.observacao,
      conteudo: texto,
      selo,
      totalItens: conteudo.totalItens,
      valorTotal: conteudo.valorTotal,
      emitidoPor: u.id,
      emitidoPorNome: u.nome,
      emitidoEm,
      itens: linhas.map((l) => ({ sequencial: l.sequencial, quantidade: l.quantidade, quantidadePca: l.quantidadePca })),
    });
    try {
      await db.batch(cmds);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e) + String((e as { cause?: Error })?.cause?.message ?? "");
      if (msg.includes("saldo_insuficiente")) return { erro: "Parte destes itens acabou de ser declarada por outra pessoa — recarregue e confira o saldo.", status: 409 };
      if (/UNIQUE/i.test(msg) && tentativa < 2) continue;
      throw e;
    }
    const d = await declaracaoPorCodigo(codigo);
    if (!d) break;
    const { pcaId: _p, selo: _s, conteudoTexto: _t, conteudo: _c, ...r } = d;
    return { declaracao: r };
  }
  return { erro: "Não consegui numerar a declaração — tente de novo.", status: 409 };
}

/** CANCELA (nada é apagado): devolve o saldo dos itens; a verificação pública passa a dizer "cancelada". */
export async function cancelarDeclaracao(id: number, quem: string, motivo: string): Promise<boolean> {
  return (await comandoCancelarDeclaracao(getDb(), id, quem, motivo)).length > 0;
}

/**
 * O CONTEXTO de uma rota das declarações (depois da guarda da tela): o PCA do grupo, o componente `pca.declaracoes` na ação
 * e a unidade da pessoa (a régua do cabeçalho na aba Declarações). Falha = a resposta pronta.
 */
export async function contextoDeclaracoes(g: Guarda, pcaIdTexto: string, acao: AcaoPapel): Promise<{ pca: PcaEspaco; rep: FiltroId } | { erro: NextResponse }> {
  const id = intId(pcaIdTexto);
  if (!id) return { erro: erro("PCA inválido.") };
  const semPca = await recusaPca(id);
  if (semPca) return { erro: semPca };
  if (!componenteLibera(g.acesso, "pca.declaracoes", acao)) return { erro: erro("Sem permissão nas declarações deste PCA.", 403) };
  const pca = await getPcaEspaco(id);
  if (!pca) return { erro: erro("PCA não encontrado.", 404) };
  return { pca, rep: (await unidadeDoModulo("pca", g.u, undefined, "declaracoes")).id };
}

/** A declaração do PCA que a pessoa vê (com a unidade dela: ao menos um item que ela vê) — senão `null` (404). */
export async function declaracaoDoContexto(pca: PcaEspaco, rep: FiltroId, idTexto: string): Promise<DeclaracaoCompleta | null> {
  const id = intId(idTexto);
  const d = id ? await getDeclaracao(id) : null;
  if (!d || d.pcaId !== pca.id) return null;
  if (rep === null) return d;
  const ve = new Set((await itensDeclaraveis(pca, rep)).map((i) => i.sequencial));
  return d.conteudo?.linhas.some((l) => ve.has(l.sequencial)) ? d : null;
}
