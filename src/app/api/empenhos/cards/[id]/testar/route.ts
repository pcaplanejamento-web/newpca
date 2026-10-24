import { exigirSessao, recusa } from "@/lib/api-auth";
import { cardDaRota } from "@/lib/empenho-card-rota";
import { baixarSeguro } from "@/lib/busca-segura";
import { type ResultadoTeste, resumoResposta } from "@/lib/centi-resposta-core";
import { motivoCardInvalido, previaPedido, telaDoCard } from "@/lib/empenho-cards-core";
import { orgaosLiquidacao } from "@/lib/empenho-cards";
import { testarCardSchema } from "@/lib/empenho-cards-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Até 40 MB de resposta (o teste lê o ano inteiro, até 31/12) e 60 s. */
const MAX_BYTES = 40_000_000;
const TEMPO_MS = 60_000;

/**
 * TESTA a integração do card com a configuração EM CURSO (ainda não salva) — Configurar: faz SÓ o pedido do período do
 * ano inteiro (até 31/12) e devolve o que veio (status, tempo, quantos registros, o total informado, os campos e uma amostra). NADA é gravado.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const negado = recusa(g.acesso, telaDoCard(a.card), "configurar");
  if (negado) return negado;
  const p = await parseCorpo(testarCardSchema, req);
  if ("resp" in p) return p.resp;
  const { edicao, ano } = p.data;
  const motivo = motivoCardInvalido(edicao, a.card.tipo);
  if (motivo) return erro(motivo, 422);
  const previa = previaPedido(edicao, ano);
  const { url } = previa;
  let corpo = previa.corpo;
  if (a.card.tipo === "liquidacoes") {
    // A API de liquidações exige o ÓRGÃO da Centi: o teste pede o 1º órgão do card de empenhos de origem.
    const { orgaos } = await orgaosLiquidacao({ id: a.card.id, origemId: edicao.origemId });
    if (!orgaos.length) return erro("Escolha o card de empenhos de origem (com vínculos e o “ID na Centi” cadastrado nos órgãos de destino) para testar.", 422);
    corpo = { ...(corpo as Record<string, unknown>), idOrgao: orgaos[0].id };
  }
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
