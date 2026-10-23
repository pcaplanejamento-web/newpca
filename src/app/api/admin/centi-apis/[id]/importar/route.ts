import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getApiCenti } from "@/lib/centi-apis";
import { importavel } from "@/lib/centi-apis-core";
import { excluirImportacaoSchema, importarCentiApiSchema } from "@/lib/centi-apis-validation";
import { getDb } from "@/lib/db";
import { anosDesatualizados, criarLote, getLote, listarLotes, listarPassos, loteEmAndamento } from "@/lib/empenhos";
import { anosDaApi, LEITOR_EMPENHOS } from "@/lib/empenhos-core";
import { concluirLoteEmpenhos, fecharLoteEmpenhos, lerPaginaDoLote, PedidoInvalido } from "@/lib/empenhos-importacao";
import { comandoConduzir, comandoExcluirPassos, comandoRecontarLote, comandosExcluirLote } from "@/lib/empenhos-sql";
import { dataIsoBrasilia } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

async function apiImportavel(ctx: { params: Promise<{ id: string }> }) {
  const id = intId((await ctx.params).id);
  if (!id) return { resp: erro("ID inválido.") };
  const api = await getApiCenti(id);
  if (!api) return { resp: erro("API não encontrada.", 404) };
  if (!importavel(api.chave)) return { resp: erro("A importação desta API ainda não existe.", 409) };
  return { api };
}

/** Os últimos lotes da API (o histórico da importação) + o que está lendo agora; com `?lote=`, os PASSOS daquele lote. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const a = await apiImportavel(ctx);
  if ("resp" in a) return a.resp;
  const loteId = intId(new URL(req.url).searchParams.get("lote") ?? "");
  if (loteId) {
    const lote = await getLote(loteId, a.api.chave);
    if (!lote) return erro("Importação não encontrada.", 404);
    return ok({ lote, passos: await listarPassos(lote.id) });
  }
  return ok({ lotes: await listarLotes(a.api.chave), emAndamento: await loteEmAndamento(a.api.chave), desatualizados: await anosDesatualizados(), leitor: LEITOR_EMPENHOS });
}

/**
 * IMPORTAÇÃO MANUAL, passo a passo (a tela conduz): `iniciar` cria o lote · `pagina` lê UMA página da Centi com o
 * cadastro SALVO e guarda no staging · `concluir` CONFERE (recebidos × total informado pela Centi) e só então PROMOVE
 * para a tabela final — senão fecha como parcial, sem tocar nela · `cancelar` fecha sem promover.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const a = await apiImportavel(ctx);
  if ("resp" in a) return a.resp;
  const { api } = a;
  const p = await parseCorpo(importarCentiApiSchema, req);
  if ("resp" in p) return p.resp;
  const db = getDb();
  const corpo = p.data;

  if (corpo.acao === "iniciar") {
    const anos = anosDaApi(Number(dataIsoBrasilia(new Date().toISOString()).slice(0, 4)), api.anos);
    if (!anos.includes(corpo.ano)) return erro(`O ano ${corpo.ano} está fora dos anos mantidos desta API.`, 422);
    const andando = await loteEmAndamento(api.chave);
    if (andando) return erro(`Já há uma importação em andamento (${andando.ano}) — continue ou cancele aquela antes.`, 409);
    return ok({ lote: await criarLote(api.chave, corpo.ano, g.u.nome, corpo.condutor, corpo.modo) });
  }

  const lote = await getLote(corpo.lote, api.chave);
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
      const r = await lerPaginaDoLote(api, lote, { inicio: corpo.inicio, fim: corpo.fim }, corpo.pagina);
      return ok({ lote: await getLote(lote.id, api.chave), ...r });
    } catch (e) {
      if (e instanceof PedidoInvalido) return erro(e.message, e.status);
      throw e;
    }
  }

  if (corpo.acao === "cancelar") {
    await fecharLoteEmpenhos(api, lote, corpo.falhou ? "falhou" : "cancelado", corpo.motivo || "Cancelada pelo administrador.");
    return ok({ lote: await getLote(lote.id, api.chave) });
  }

  // concluir: a CONFERÊNCIA decide (a mesma da atualização automática); a QUEDA volta para a pessoa confirmar.
  const c = await concluirLoteEmpenhos(api, lote, { aceitarQueda: !!corpo.aceitarQueda, usuario: g.u });
  if (c.estado === "queda") return ok({ lote, queda: c.queda });
  return ok({ lote: await getLote(lote.id, api.chave) });
}

/**
 * EXCLUI DO BANCO, vários de uma vez: `{lotes}` = importações inteiras (passos, staging e o lote — os empenhos promovidos
 * ficam); `{lote, passos}` = passos de uma importação (a que ainda lê é recontada; o período volta a faltar).
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const a = await apiImportavel(ctx);
  if ("resp" in a) return a.resp;
  const { api } = a;
  const p = await parseCorpo(excluirImportacaoSchema, req);
  if ("resp" in p) return p.resp;
  const db = getDb();
  if ("passos" in p.data) {
    const lote = await getLote(p.data.lote, api.chave);
    if (!lote) return erro("Importação não encontrada.", 404);
    const ids = [...new Set(p.data.passos)];
    const res = (await db.batch([comandoExcluirPassos(db, lote.id, ids), ...(lote.estado === "lendo" ? [comandoRecontarLote(db, lote.id)] : [])] as never)) as unknown[][];
    const excluidos = res[0].length;
    await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "centi_api", entidadeId: api.id, resumo: `${api.nome} ${lote.ano}: ${excluidos} passo(s) da importação ${lote.id} excluído(s)` });
    return ok({ excluidos, lote: await getLote(lote.id, api.chave) });
  }
  let excluidos = 0;
  for (const id of new Set(p.data.lotes)) {
    const lote = await getLote(id, api.chave);
    if (!lote) continue;
    const res = (await db.batch(comandosExcluirLote(db, lote.id) as never)) as unknown[][];
    if (!res[3]?.length) continue;
    excluidos++;
    await registrarAuditoria({
      usuario: g.u,
      acao: "excluir",
      entidade: "centi_api",
      entidadeId: api.id,
      resumo: `${api.nome} ${lote.ano}: importação ${lote.id} (${lote.estado}) excluída do banco com os passos${lote.estado === "promovido" ? " — os empenhos que ela gravou ficam" : ""}`,
    });
  }
  return ok({ excluidos });
}
