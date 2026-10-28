import { exigirSessao, recusa } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { edicaoDoCard, motivoCardInvalido, NOME_TIPO, telaDoCard } from "@/lib/empenho-cards-core";
import { cardDaRota } from "@/lib/empenho-card-rota";
import { atualizarCard, excluirCard, getCard } from "@/lib/empenho-cards";
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
  porOrgao: "ler por órgão",
};

/** CONFIGURA o card: a identificação, os anos e a integração — a régua de `motivoCardInvalido` (a atualização automática
 * e as regras são centrais — `/api/admin/importacoes/config`). */
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
  const motivo = motivoCardInvalido(p.data);
  if (motivo) return erro(motivo, 422);
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
  if (!(await excluirCard(card.id))) return erro("Card não encontrado.", 404);
  const resumo =
    card.tipo !== "empenhos"
      ? `Card de ${NOME_TIPO[card.tipo].varios} "${card.nome}" excluído com as importações e ${card.tipo === "pagamentos" ? "os pagamentos" : "as liquidações"} dele`
      : `Card de empenhos "${card.nome}" excluído com os vínculos, as importações e os empenhos dele`;
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "empenho_card", entidadeId: card.id, resumo });
  return ok();
}
