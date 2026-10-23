import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { baixarSeguro } from "@/lib/busca-segura";
import { getApiCenti, registrarLeitura } from "@/lib/centi-apis";
import { importavel, urlDaApi } from "@/lib/centi-apis-core";
import { importarCentiApiSchema } from "@/lib/centi-apis-validation";
import { getDb } from "@/lib/db";
import { criarLote, getLote, listarLotes, listarPassos, loteEmAndamento, paraPasso } from "@/lib/empenhos";
import {
  anoInteiro,
  anosDaApi,
  conferirLote,
  continuarPeriodo,
  corpoDaPagina,
  diasDoPeriodo,
  dividirPeriodo,
  lacunasDoAno,
  lerPaginaEmpenhos,
  type PassoLote,
  type Periodo,
  periodosLidos,
  rotuloPeriodo,
  tipoDoErro,
  totalDoPeriodo,
  usaPeriodo,
} from "@/lib/empenhos-core";
import {
  comandoDividirPeriodo,
  comandoExcluirPasso,
  comandoRecontarLote,
  comandoRegistrarPasso,
  comandosExcluirLote,
  comandosFecharLote,
  comandosGuardarPagina,
  comandosPromover,
  contagemDaPromocao,
  jaNoLote,
  lidoNoPeriodo,
} from "@/lib/empenhos-sql";
import type { centiLotePassos } from "@/db/schema";
import { dataIsoBrasilia } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

type Linha = typeof centiLotePassos.$inferSelect;

/**
 * Até 2 MB por resposta (a semana; o que passa disso é dividido ao meio — ler e consertar mais que isso pesa demais para o
 * Worker) e, no período de UM dia (que não se divide), até 12 MB. 30 s por pedido.
 */
const MAX_BYTES = 2_000_000;
const MAX_BYTES_DIA = 12_000_000;
const TEMPO_MS = 30_000;

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
  return ok({ lotes: await listarLotes(a.api.chave), emAndamento: await loteEmAndamento(a.api.chave) });
}

/** O status HTTP citado na mensagem do erro ("… respondeu 503."). */
const statusDaMensagem = (m: string) => Number(m.match(/respondeu (\d{3})/)?.[1]) || null;

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
    return ok({ lote: await criarLote(api.chave, corpo.ano, g.u.nome) });
  }

  const lote = await getLote(corpo.lote, api.chave);
  if (!lote) return erro("Importação não encontrada.", 404);
  if (lote.estado !== "lendo") return erro("Esta importação já foi encerrada.", 409);

  if (corpo.acao === "pagina") {
    const periodo: Periodo = { inicio: corpo.inicio, fim: corpo.fim };
    const doAno = anoInteiro(lote.ano);
    if (periodo.inicio > periodo.fim || periodo.inicio < doAno.inicio || periodo.fim > doAno.fim) return erro("Período fora do ano da importação.", 422);
    if (!usaPeriodo(api.parametros) && (periodo.inicio !== doAno.inicio || periodo.fim !== doAno.fim)) {
      return erro("Os parâmetros desta API não usam {inicio} e {fim} — o ano só pode ser lido inteiro.", 422);
    }
    let enviado: string;
    try {
      enviado = JSON.stringify(corpoDaPagina(api.parametros, lote.ano, corpo.pagina, periodo));
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Parâmetros inválidos.", 422);
    }
    const base = { inicio: periodo.inicio, fim: periodo.fim, pagina: corpo.pagina, corpo: enviado };
    const t0 = Date.now();
    let texto = "";
    let status: number | null = null;
    let falha: string | null = null;
    let pagina: ReturnType<typeof lerPaginaEmpenhos> | null = null;
    try {
      const r = await baixarSeguro(urlDaApi(api), { accept: "application/json", maxBytes: diasDoPeriodo(periodo) > 1 ? MAX_BYTES : MAX_BYTES_DIA, quem: "A API da Centi", tempoMs: TEMPO_MS, post: enviado });
      texto = r.texto;
      status = r.status;
      pagina = lerPaginaEmpenhos(texto, lote.ano);
    } catch (e) {
      falha = e instanceof Error ? e.message : "Não foi possível ler a página.";
    }
    const ms = Date.now() - t0;
    const bytes = texto.length || null;

    if (falha || !pagina) {
      // O ERRO também é um passo — com o detalhe (status, tempo, o corpo enviado), à vista na hora.
      const mensagem = falha ?? "Resposta inválida da Centi.";
      const tipo = tipoDoErro(mensagem);
      const metades = tipo === "grande" && usaPeriodo(api.parametros) ? dividirPeriodo(periodo) : null;
      const passo: Omit<PassoLote, "id" | "em"> = {
        ...base,
        estado: metades ? "dividido" : "erro",
        fimPeriodo: false,
        status: status ?? statusDaMensagem(mensagem),
        bytes,
        ms,
        recebidos: 0,
        novos: 0,
        recusados: 0,
        repetidos: 0,
        total: null,
        mensagem: metades ? `${mensagem} — ${rotuloPeriodo(periodo)} será lido em duas partes: ${rotuloPeriodo(metades[0])} e ${rotuloPeriodo(metades[1])}.` : mensagem,
      };
      const res = await db.batch([comandoRegistrarPasso(db, lote.id, passo).returning(), ...(metades ? [comandoDividirPeriodo(db, lote.id, periodo), comandoRecontarLote(db, lote.id)] : [])] as never);
      return ok({ lote: await getLote(lote.id, api.chave), passo: paraPasso((res as Linha[][])[0][0]), erro: { tipo, mensagem }, dividir: metades });
    }

    const lido = await lidoNoPeriodo(db, lote.id, periodo);
    const novos = pagina.linhas.length - (await jaNoLote(db, lote.id, pagina.linhas.map((l) => l.chave)));
    const total = totalDoPeriodo(pagina, corpo.pagina) ?? lido.total;
    const continuar = continuarPeriodo({ recebidos: lido.recebidos + pagina.recebidos, paginas: lido.paginas + 1, total }, { recebidos: pagina.recebidos, novos });
    const passo: Omit<PassoLote, "id" | "em"> = {
      ...base,
      estado: "ok",
      fimPeriodo: !continuar,
      status,
      bytes,
      ms,
      recebidos: pagina.recebidos,
      novos,
      recusados: pagina.recusados,
      repetidos: pagina.repetidos,
      total,
      mensagem: pagina.reparado ? "A Centi mandou textos com aspas sem escape (ex.: num histórico) — a leitura consertou; nada se perdeu." : null,
    };
    const res = await db.batch([
      comandoRegistrarPasso(db, lote.id, passo).returning(),
      ...comandosGuardarPagina(db, lote.id, corpo.pagina, pagina.linhas),
      comandoRecontarLote(db, lote.id),
    ] as never);
    return ok({ lote: await getLote(lote.id, api.chave), passo: paraPasso((res as Linha[][])[0][0]), continuar });
  }

  if (corpo.acao === "cancelar") {
    const motivo = corpo.motivo || "Cancelada pelo administrador.";
    await db.batch(comandosFecharLote(db, lote.id, corpo.falhou ? "falhou" : "cancelado", motivo) as never);
    if (corpo.falhou) await registrarLeitura(api.id, "falhou", lote.unicos + lote.recusados, lote.totalInformado);
    return ok({ lote: await getLote(lote.id, api.chave) });
  }

  // concluir: a CONFERÊNCIA decide — todo o ano lido (nenhum período faltando) e a contagem batendo com a Centi.
  const lidos = periodosLidos(await listarPassos(lote.id));
  const lacunas = lacunasDoAno(lote.ano, lidos);
  const conf = lacunas.length
    ? { completo: false as const, motivo: `Períodos não lidos: ${lacunas.slice(0, 6).map(rotuloPeriodo).join(", ")}${lacunas.length > 6 ? ` e mais ${lacunas.length - 6}` : ""}.` }
    : conferirLote(lote);
  if (!conf.completo) {
    await db.batch(comandosFecharLote(db, lote.id, "parcial", conf.motivo) as never);
    await registrarLeitura(api.id, "parcial", lote.unicos + lote.recusados, lote.totalInformado);
    await registrarAuditoria({ usuario: g.u, acao: "importar", entidade: "centi_api", entidadeId: api.id, resumo: `${api.nome} ${lote.ano}: importação PARCIAL — ${conf.motivo} (nada foi gravado)` });
    return ok({ lote: await getLote(lote.id, api.chave) });
  }
  const contagem = await contagemDaPromocao(db, lote.id, lote.ano);
  await db.batch(comandosPromover(db, lote.id, lote.ano, contagem) as never);
  await registrarLeitura(api.id, "completo", lote.unicos + lote.recusados, lote.totalInformado);
  await registrarAuditoria({
    usuario: g.u,
    acao: "importar",
    entidade: "centi_api",
    entidadeId: api.id,
    resumo: `${api.nome} ${lote.ano}: ${lote.unicos} conferidos com a Centi — ${contagem.inseridos} novos, ${contagem.atualizados} atualizados, ${contagem.removidos} marcados como removidos`,
  });
  return ok({ lote: await getLote(lote.id, api.chave) });
}

/**
 * EXCLUI DO BANCO uma tentativa: `?lote=` = a importação inteira (passos, staging e o lote — os empenhos já promovidos
 * ficam); `?lote=&passo=` = um passo NÃO lido (erro ou dividido).
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const a = await apiImportavel(ctx);
  if ("resp" in a) return a.resp;
  const { api } = a;
  const busca = new URL(req.url).searchParams;
  const loteId = intId(busca.get("lote") ?? "");
  if (!loteId) return erro("Informe a importação.");
  const lote = await getLote(loteId, api.chave);
  if (!lote) return erro("Importação não encontrada.", 404);
  const db = getDb();
  const passoId = busca.get("passo") ? intId(busca.get("passo") ?? "") : null;
  if (busca.get("passo") && !passoId) return erro("Passo inválido.");
  if (passoId) {
    const res = await comandoExcluirPasso(db, lote.id, passoId);
    if (!res.length) return erro("Só se exclui o passo que não foi lido (com erro ou dividido).", 409);
    await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "centi_api", entidadeId: api.id, resumo: `${api.nome} ${lote.ano}: passo ${passoId} da importação ${lote.id} excluído` });
    return ok({ lote: await getLote(lote.id, api.chave) });
  }
  const res = await db.batch(comandosExcluirLote(db, lote.id) as never);
  if (!(res as unknown[][])[3]?.length) return erro("A importação não foi excluída.", 409);
  await registrarAuditoria({
    usuario: g.u,
    acao: "excluir",
    entidade: "centi_api",
    entidadeId: api.id,
    resumo: `${api.nome} ${lote.ano}: importação ${lote.id} (${lote.estado}) excluída do banco com os passos${lote.estado === "promovido" ? " — os empenhos que ela gravou ficam" : ""}`,
  });
  return ok({ excluido: lote.id });
}
