import { exigirSessao, intId, recusa } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { anosDoCard, pendenciasDoCard, telaDoCard } from "@/lib/empenho-cards-core";
import { orgaosLiquidacao, vinculosDoCard } from "@/lib/empenho-cards";
import { cardDaRota } from "@/lib/empenho-card-rota";
import { excluirImportacaoSchema, importarCardSchema } from "@/lib/empenho-cards-validation";
import { anosDesatualizados, criarLote, getLote, listarLotes, listarPassos, loteEmAndamento } from "@/lib/empenhos";
import { LEITOR_EMPENHOS } from "@/lib/empenhos-core";
import { concluirLoteEmpenhos, fecharLoteEmpenhos, lerPaginaDoLote, PedidoInvalido } from "@/lib/empenhos-importacao";
import { comandoConduzir, comandoExcluirPassos, comandoRecontarLote, comandosExcluirLote } from "@/lib/empenhos-sql";
import { dataIsoBrasilia } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";


/** Os últimos lotes do card (o histórico da importação) + o que está lendo agora; com `?lote=`, os PASSOS daquele lote. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const negado = recusa(g.acesso, telaDoCard(a.card), "importar");
  if (negado) return negado;
  const loteId = intId(new URL(req.url).searchParams.get("lote") ?? "");
  if (loteId) {
    const lote = await getLote(loteId, a.card.id);
    if (!lote) return erro("Importação não encontrada.", 404);
    return ok({ lote, passos: await listarPassos(lote.id) });
  }
  return ok({ lotes: await listarLotes(a.card.id), orgaosLiquidacao: await orgaosLiquidacao(a.card), emAndamento: await loteEmAndamento(a.card.id), desatualizados: await anosDesatualizados(a.card.id), leitor: LEITOR_EMPENHOS });
}

/**
 * IMPORTAÇÃO MANUAL do card, passo a passo (a tela conduz — Importar): `iniciar` cria o lote · `pagina` lê UMA página da
 * Centi com a configuração SALVA do card e guarda no staging (só o que os vínculos cobrem) · `concluir` CONFERE (recebidos × total informado pela Centi) e só então PROMOVE
 * para a tabela final — senão fecha como parcial, sem tocar nela · `cancelar` fecha sem promover.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const negado = recusa(g.acesso, telaDoCard(a.card), "importar");
  if (negado) return negado;
  const { card } = a;
  const p = await parseCorpo(importarCardSchema, req);
  if ("resp" in p) return p.resp;
  const db = getDb();
  const corpo = p.data;

  if (corpo.acao === "iniciar") {
    const anos = anosDoCard(card.anos, Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4)));
    if (!anos.includes(corpo.ano)) return erro(`O ano ${corpo.ano} está fora dos anos deste card (Configuração).`, 422);
    // A CONFIGURAÇÃO vem antes de qualquer importação: o catálogo ("Buscar na Centi") exige a Configuração confirmada;
    // os empenhos, também os vínculos.
    // O MODO segue o tipo do card: no de liquidações, só liquidações; no de empenhos, os empenhos ou o catálogo.
    if ((corpo.modo === "liquidacoes") !== (card.tipo === "liquidacoes")) return erro(card.tipo === "liquidacoes" ? "Este card importa liquidações." : "Liquidações se importam num card de liquidações.", 422);
    const vinculos = (await vinculosDoCard(card.origemId ?? card.id)).length;
    const falta = pendenciasDoCard(card, card.tipo === "liquidacoes" && card.origemId == null ? 0 : vinculos).filter((x) => corpo.modo !== "unidades" || x.aba === "configuracao");
    if (falta.length) return erro(`Antes de importar: ${falta.map((x) => x.texto).join(" ")}`, 409);
    const andando = await loteEmAndamento(card.id);
    if (andando) return erro(`Já há uma importação em andamento (${andando.ano}) — continue ou cancele aquela antes.`, 409);
    // LIQUIDAÇÕES: um lote por ÓRGÃO da Centi — só os dos destinos dos vínculos (o "ID na Centi" do órgão).
    if (corpo.modo === "liquidacoes") {
      const { orgaos } = await orgaosLiquidacao(card);
      if (!corpo.idOrgao || !orgaos.some((o) => o.id === corpo.idOrgao)) return erro("Órgão da Centi fora dos órgãos dos vínculos do card de empenhos de origem (o ID na Centi do órgão).", 422);
    }
    return ok({ lote: await criarLote(card.id, corpo.ano, g.u.nome, corpo.condutor, corpo.modo, corpo.modo === "liquidacoes" ? (corpo.idOrgao ?? null) : null) });
  }

  const lote = await getLote(corpo.lote, card.id);
  if (!lote) return erro("Importação não encontrada.", 404);
  if (lote.estado !== "lendo") return erro("Esta importação já foi encerrada.", 409);
  // UMA ABA POR VEZ: a que conduz renova a trava a cada pedido; outra só entra quando ela vence (2 min sem notícia).
  if (corpo.condutor || corpo.acao !== "cancelar") {
    const [conduz] = await comandoConduzir(db, lote.id, corpo.condutor ?? "");
    if (!conduz) return erro("Esta importação está em andamento em outra aba, com outra pessoa ou na atualização automática — acompanhe por lá ou espere 2 minutos sem atividade dela.", 409);
  } else if (lote.conduzido) {
    return erro("Esta importação está em andamento em outra aba — interrompa por lá.", 409);
  }
  // O leitor que começou o lote é o que o termina (nada de páginas lidas por versões diferentes no mesmo lote).
  if (lote.leitor !== LEITOR_EMPENHOS && corpo.acao !== "cancelar") {
    return erro("Esta importação começou com uma versão anterior do leitor — cancele e importe de novo.", 409);
  }

  if (corpo.acao === "pagina") {
    try {
      const r = await lerPaginaDoLote(card, lote, { inicio: corpo.inicio, fim: corpo.fim }, corpo.pagina);
      return ok({ lote: await getLote(lote.id, card.id), ...r });
    } catch (e) {
      if (e instanceof PedidoInvalido) return erro(e.message, e.status);
      throw e;
    }
  }

  if (corpo.acao === "cancelar") {
    await fecharLoteEmpenhos(card, lote, corpo.falhou ? "falhou" : "cancelado", corpo.motivo || "Cancelada por quem importava.");
    return ok({ lote: await getLote(lote.id, card.id) });
  }

  // concluir: a CONFERÊNCIA decide (a mesma da atualização automática); a QUEDA volta para a pessoa confirmar.
  const c = await concluirLoteEmpenhos(card, lote, { aceitarQueda: !!corpo.aceitarQueda, usuario: g.u });
  if (c.estado === "queda") return ok({ lote, queda: c.queda });
  return ok({ lote: await getLote(lote.id, card.id) });
}

/**
 * EXCLUI DO BANCO (Excluir), vários de uma vez: `{lotes}` = importações inteiras (passos, staging e o lote — os empenhos promovidos
 * ficam); `{lote, passos}` = passos de uma importação (a que ainda lê é recontada; o período volta a faltar).
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const negado = recusa(g.acesso, telaDoCard(a.card), "excluir");
  if (negado) return negado;
  const { card } = a;
  const p = await parseCorpo(excluirImportacaoSchema, req);
  if ("resp" in p) return p.resp;
  const db = getDb();
  if ("passos" in p.data) {
    const lote = await getLote(p.data.lote, card.id);
    if (!lote) return erro("Importação não encontrada.", 404);
    const ids = [...new Set(p.data.passos)];
    const res = (await db.batch([comandoExcluirPassos(db, lote.id, ids), ...(lote.estado === "lendo" ? [comandoRecontarLote(db, lote.id)] : [])] as never)) as unknown[][];
    const excluidos = res[0].length;
    await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "empenho_card", entidadeId: card.id, resumo: `${card.nome} ${lote.ano}: ${excluidos} passo(s) da importação ${lote.id} excluído(s)` });
    return ok({ excluidos, lote: await getLote(lote.id, card.id) });
  }
  let excluidos = 0;
  for (const id of new Set(p.data.lotes)) {
    const lote = await getLote(id, card.id);
    if (!lote) continue;
    const res = (await db.batch(comandosExcluirLote(db, lote.id) as never)) as unknown[][];
    if (!res.at(-1)?.length) continue;
    excluidos++;
    await registrarAuditoria({
      usuario: g.u,
      acao: "excluir",
      entidade: "empenho_card",
      entidadeId: card.id,
      resumo: `${card.nome} ${lote.ano}: importação ${lote.id} (${lote.estado}) excluída do banco com os passos${lote.estado === "promovido" ? " — os empenhos que ela gravou ficam" : ""}`,
    });
  }
  return ok({ excluidos });
}
