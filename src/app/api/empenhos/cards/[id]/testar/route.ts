import { exigirAcesso, intId } from "@/lib/api-auth";
import { baixarSeguro } from "@/lib/busca-segura";
import { type ResultadoTeste, resumoResposta } from "@/lib/centi-resposta-core";
import { motivoCardInvalido, previaPedido } from "@/lib/empenho-cards-core";
import { getCard } from "@/lib/empenho-cards";
import { testarCardSchema } from "@/lib/empenho-cards-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Até 40 MB de resposta (o teste lê o ano até 31/12, ou até hoje no ano atual) e 60 s. */
const MAX_BYTES = 40_000_000;
const TEMPO_MS = 60_000;

/**
 * TESTA a integração do card com a configuração EM CURSO (ainda não salva) — Configurar: faz SÓ o pedido do período do
 * ano (até hoje no atual) e devolve o que veio (status, tempo, quantos registros, o total informado, os campos e uma amostra). NADA é gravado.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAcesso("empenhos", "configurar");
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id || !(await getCard(id))) return erro("Card não encontrado.", 404);
  const p = await parseCorpo(testarCardSchema, req);
  if ("resp" in p) return p.resp;
  const { edicao, ano } = p.data;
  const motivo = motivoCardInvalido(edicao);
  if (motivo) return erro(motivo, 422);
  const { url, corpo } = previaPedido(edicao, ano);
  const inicio = Date.now();
  try {
    const r = await baixarSeguro(url, { accept: "application/json", maxBytes: MAX_BYTES, quem: "A API da Centi", tempoMs: TEMPO_MS, post: JSON.stringify(corpo), comErro: true });
    const resumo = resumoResposta(r.texto);
    const resultado: ResultadoTeste = {
      ok: r.status >= 200 && r.status < 300 && !resumo.mensagem?.startsWith("A resposta não"),
      status: r.status,
      ms: Date.now() - inicio,
      url,
      corpo,
      ...resumo,
      mensagem: r.status >= 300 ? `A API respondeu ${r.status}. ${resumo.mensagem ?? ""}`.trim() : resumo.mensagem,
    };
    return ok({ resultado });
  } catch (e) {
    const resultado: ResultadoTeste = {
      ok: false,
      status: 0,
      ms: Date.now() - inicio,
      url,
      corpo,
      itens: 0,
      total: null,
      campos: [],
      amostra: [],
      mensagem: e instanceof Error ? e.message : "Não foi possível acessar a API.",
    };
    return ok({ resultado });
  }
}
