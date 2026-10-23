import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { baixarSeguro } from "@/lib/busca-segura";
import { getApiCenti, registrarLeitura } from "@/lib/centi-apis";
import { importavel, urlDaApi } from "@/lib/centi-apis-core";
import { importarCentiApiSchema } from "@/lib/centi-apis-validation";
import { getDb } from "@/lib/db";
import { criarLote, getLote, listarLotes, loteEmAndamento } from "@/lib/empenhos";
import { anosDaApi, conferirLote, corpoDaPagina, lerPaginaEmpenhos } from "@/lib/empenhos-core";
import { comandoContarPagina, comandoGuardarPagina, comandosFecharLote, comandosPromover, contagemDaPromocao } from "@/lib/empenhos-sql";
import { dataIsoBrasilia } from "@/lib/format";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Até 12 MB por página e 30 s (a página dos empenhos cabe com folga). */
const MAX_BYTES = 12_000_000;
const TEMPO_MS = 30_000;

async function apiImportavel(ctx: { params: Promise<{ id: string }> }) {
  const id = intId((await ctx.params).id);
  if (!id) return { resp: erro("ID inválido.") };
  const api = await getApiCenti(id);
  if (!api) return { resp: erro("API não encontrada.", 404) };
  if (!importavel(api.chave)) return { resp: erro("A importação desta API ainda não existe.", 409) };
  return { api };
}

/** Os últimos lotes da API (o histórico da importação) + o que está lendo agora. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const a = await apiImportavel(ctx);
  if ("resp" in a) return a.resp;
  return ok({ lotes: await listarLotes(a.api.chave), emAndamento: await loteEmAndamento(a.api.chave) });
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
    return ok({ lote: await criarLote(api.chave, corpo.ano, g.u.nome) });
  }

  const lote = await getLote(corpo.lote, api.chave);
  if (!lote) return erro("Importação não encontrada.", 404);
  if (lote.estado !== "lendo") return erro("Esta importação já foi encerrada.", 409);

  if (corpo.acao === "pagina") {
    let texto: string;
    try {
      const r = await baixarSeguro(urlDaApi(api), {
        accept: "application/json",
        maxBytes: MAX_BYTES,
        quem: "A API da Centi",
        tempoMs: TEMPO_MS,
        post: JSON.stringify(corpoDaPagina(api.parametros, lote.ano, corpo.pagina)),
      });
      texto = r.texto;
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Não foi possível ler a página.", 502);
    }
    let pagina: ReturnType<typeof lerPaginaEmpenhos>;
    try {
      pagina = lerPaginaEmpenhos(texto, lote.ano);
    } catch (e) {
      return erro(e instanceof Error ? e.message : "Resposta inválida da Centi.", 502);
    }
    await db.batch([
      comandoGuardarPagina(db, lote.id, corpo.pagina, pagina.linhas),
      comandoContarPagina(db, lote.id, corpo.pagina, pagina.recebidos, pagina.recusados, pagina.total),
    ]);
    const depois = await getLote(lote.id, api.chave);
    return ok({ lote: depois, pagina: { recebidos: pagina.recebidos, novos: (depois?.unicos ?? 0) - lote.unicos, recusados: pagina.recusados, repetidos: pagina.repetidos } });
  }

  if (corpo.acao === "cancelar") {
    const motivo = corpo.motivo || "Cancelada pelo administrador.";
    await db.batch(comandosFecharLote(db, lote.id, corpo.falhou ? "falhou" : "cancelado", motivo) as never);
    if (corpo.falhou) await registrarLeitura(api.id, "falhou", lote.unicos + lote.recusados, lote.totalInformado);
    return ok({ lote: await getLote(lote.id, api.chave) });
  }

  // concluir: a CONFERÊNCIA decide.
  const conf = conferirLote(lote);
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
