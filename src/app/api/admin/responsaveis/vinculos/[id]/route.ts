import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { vinculoResponsavelPatchSchema } from "@/lib/rbac-validation";
import { atualizarVinculo, conflitoDoVinculo, excluirVinculo, getPessoa, getVinculo } from "@/lib/responsaveis";
import { motivoVinculoInvalido, normalizarVinculo, rotuloVinculo } from "@/lib/responsaveis-planilha-core";

export const dynamic = "force-dynamic";

/** Edita o vínculo (tipo, função, nomeação, período — ou troca a pessoa). O alvo não muda (remova e vincule de novo). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(vinculoResponsavelPatchSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getVinculo(id);
  if (!antes) return erro("Vínculo não encontrado.", 404);
  const d = { ...p.data, ...normalizarVinculo(p.data) };
  const invalido = motivoVinculoInvalido(d);
  if (invalido) return erro(invalido, 422);
  const pessoa = await getPessoa(d.responsavelId);
  if (!pessoa) return erro("Pessoa não encontrada na planilha.", 422);
  const conflito = await conflitoDoVinculo({ ...d, id, orgaoId: antes.orgaoId, reparticaoId: antes.reparticaoId });
  if (conflito) return erro(conflito, 409);
  await atualizarVinculo(id, d);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "responsavel",
    entidadeId: d.responsavelId,
    resumo: `Vínculo de ${pessoa.nome} editado — ${rotuloVinculo(d)}`,
    antes,
    depois: d,
  });
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const antes = await getVinculo(id);
  if (!antes) return erro("Vínculo não encontrado.", 404);
  const pessoa = await getPessoa(antes.responsavelId);
  await excluirVinculo(id);
  await registrarAuditoria({
    usuario: g.u,
    acao: "excluir",
    entidade: "responsavel",
    entidadeId: antes.responsavelId,
    resumo: `Vínculo de ${pessoa?.nome ?? "pessoa"} removido — ${rotuloVinculo(antes)}`,
    antes,
  });
  return ok();
}
