import { exigirAcesso, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { edicaoDoCard, motivoCardInvalido } from "@/lib/empenho-cards-core";
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
  ativa: "atualização automática",
  frequenciaMin: "frequência",
  diasUteis: "dias úteis",
  horaInicio: "início",
  horaFim: "fim",
  quedaSoma: "queda da soma",
  quedaRegistros: "queda dos registros",
  removidos: "removidos na Centi",
};

/** CONFIGURA o card (Configurar): a integração, os anos, a programação e as regras — a régua de `motivoCardInvalido`. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAcesso("empenhos", "configurar");
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getCard(id);
  if (!antes) return erro("Card não encontrado.", 404);
  const p = await parseCorpo(cardEmpenhoSchema, req);
  if ("resp" in p) return p.resp;
  const motivo = motivoCardInvalido(p.data);
  if (motivo) return erro(motivo, 422);
  await atualizarCard(id, p.data);
  const dd = diffCampos(edicaoDoCard(antes) as Record<string, unknown>, p.data as Record<string, unknown>, Object.keys(ROTULOS), ROTULOS);
  await registrarAuditoria({ usuario: g.u, acao: "editar", entidade: "empenho_card", entidadeId: id, resumo: `Card "${antes.nome}": ${dd.resumo || "configurado"}`, antes: dd.antes, depois: dd.depois });
  return ok({ card: await getCard(id) });
}

/** EXCLUI o card (Excluir) — as importações, os vínculos e os EMPENHOS dele saem junto. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAcesso("empenhos", "excluir");
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const card = await getCard(id);
  if (!card || !(await excluirCard(id))) return erro("Card não encontrado.", 404);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "empenho_card", entidadeId: id, resumo: `Card de empenhos "${card.nome}" excluído com os vínculos, as importações e os empenhos dele` });
  return ok();
}
