import { exigirSessao, recusa } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { edicaoDoCard, motivoCardInvalido, telaDoCard } from "@/lib/empenho-cards-core";
import { cardDaRota } from "@/lib/empenho-card-rota";
import { atualizarCard, excluirCard, getCard, liquidacoesDaOrigem } from "@/lib/empenho-cards";
import { cardEmpenhoSchema } from "@/lib/empenho-cards-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

const ROTULOS: Record<string, string> = {
  nome: "nome",
  descricao: "descrição",
  cor: "cor",
  urlBase: "URL base",
  endpoint: "endpoint",
  uf: "UF",
  tenant: "município",
  parametros: "parâmetros",
  anos: "anos",
  ativa: "atualização automática",
  frequenciaMin: "frequência",
  diasUteis: "dias úteis",
  horaInicio: "início",
  horaFim: "fim",
  quedaSoma: "queda da soma",
  quedaRegistros: "queda dos registros",
  removidos: "removidos na Centi",
  origemId: "card de empenhos de origem",
};

/** CONFIGURA o card (Configurar, na tela do card): a integração, os anos, a programação, as regras e (liquidações) o card de
 * empenhos de origem — a régua de `motivoCardInvalido`. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const antes = a.card;
  const id = antes.id;
  const negado = recusa(g.acesso, telaDoCard(antes), "configurar");
  if (negado) return negado;
  const p = await parseCorpo(cardEmpenhoSchema, req);
  if ("resp" in p) return p.resp;
  const motivo = motivoCardInvalido(p.data, antes.tipo);
  if (motivo) return erro(motivo, 422);
  if (p.data.origemId != null) {
    // A ORIGEM de um card de liquidações tem de ser um card de EMPENHOS que existe.
    const origem = await getCard(p.data.origemId);
    if (!origem || origem.tipo !== "empenhos") return erro("O card de empenhos de origem não existe mais.", 422);
  }
  await atualizarCard(id, p.data);
  const dd = diffCampos(edicaoDoCard(antes) as Record<string, unknown>, p.data as Record<string, unknown>, Object.keys(ROTULOS), ROTULOS);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "empenho_card", entidadeId: id, resumo: `Card "${antes.nome}": ${dd.resumo || "configurado"}`, antes: dd.antes, depois: dd.depois });
  return ok({ card: await getCard(id) });
}

/** EXCLUI o card (Excluir, na tela do card) — as importações, os vínculos e os dados dele saem junto. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessao();
  if ("erro" in g) return g.erro;
  const a = await cardDaRota(ctx);
  if ("resp" in a) return a.resp;
  const { card } = a;
  const negado = recusa(g.acesso, telaDoCard(card), "excluir");
  if (negado) return negado;
  // As LIQUIDAÇÕES seguem o empenho: excluir o card de empenhos tira as liquidações dos cards que o têm como origem.
  const dependentes = card.tipo === "empenhos" ? await liquidacoesDaOrigem(card.id) : [];
  if (!(await excluirCard(card.id))) return erro("Card não encontrado.", 404);
  const resumo =
    card.tipo === "liquidacoes"
      ? `Card de liquidações "${card.nome}" excluído com as importações e as liquidações dele`
      : `Card de empenhos "${card.nome}" excluído com os vínculos, as importações e os empenhos dele${dependentes.length ? ` (os cards de liquidações ${dependentes.map((d) => `"${d.nome}"`).join(", ")} ficaram sem origem e sem as liquidações desses empenhos)` : ""}`;
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "empenho_card", entidadeId: card.id, resumo });
  return ok();
}
