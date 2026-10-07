import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { vinculoResponsavelPatchSchema } from "@/lib/rbac-validation";
import { hojeISO } from "@/lib/reparticao-responsaveis";
import {
  atualizarVinculo,
  cargoParaGravar,
  conflitoDoVinculo,
  excluirVinculo,
  getPessoa,
  getVinculo,
  MSG_CARGO_FORA,
  motivoAlvoInvalido,
} from "@/lib/responsaveis";
import { motivoNaoVincular, motivoVinculoInvalido, normalizarVinculo, rotuloVinculo } from "@/lib/responsaveis-planilha-core";

export const dynamic = "force-dynamic";

/** Edita o vínculo (tipo, cargo do temporário, nomeação, período, a pessoa e ONDE RESPONDE — o alvo novo tem de valer
 * pela regra do órgão). O cargo fora da lista só fica quando já era o do vínculo (dado antigo). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(vinculoResponsavelPatchSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getVinculo(id);
  if (!antes) return erro("Vínculo não encontrado.", 404);
  const { orgaoId: oNovo, reparticaoId: uNovo, ...dados } = p.data;
  const alvo =
    oNovo === undefined && uNovo === undefined ? { orgaoId: antes.orgaoId, reparticaoId: antes.reparticaoId } : { orgaoId: oNovo ?? null, reparticaoId: uNovo ?? null };
  const mudouAlvo = alvo.orgaoId !== antes.orgaoId || alvo.reparticaoId !== antes.reparticaoId;
  if (mudouAlvo) {
    const invalidoAlvo = await motivoAlvoInvalido(alvo);
    if (invalidoAlvo) return erro(invalidoAlvo, 422);
  }
  const n = { ...dados, ...normalizarVinculo(dados) };
  const invalido = motivoVinculoInvalido(n);
  if (invalido) return erro(invalido, 422);
  const funcao = await cargoParaGravar(n.funcao, antes.funcao);
  if (funcao == null) return erro(MSG_CARGO_FORA, 422);
  const d = { ...n, funcao };
  const pessoa = await getPessoa(d.responsavelId);
  if (!pessoa) return erro("Pessoa não encontrada na planilha.", 422);
  const exonerada = motivoNaoVincular(pessoa, d, hojeISO(), d.responsavelId !== antes.responsavelId || mudouAlvo);
  if (exonerada) return erro(exonerada, 409);
  const conflito = await conflitoDoVinculo({ ...d, id, ...alvo });
  if (conflito) return erro(conflito, 409);
  await atualizarVinculo(id, d, mudouAlvo ? alvo : undefined);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "responsavel",
    entidadeId: d.responsavelId,
    resumo: `Vínculo de ${pessoa.nome} editado — ${rotuloVinculo(d)}${mudouAlvo ? " (onde responde alterado)" : ""}`,
    antes,
    depois: { ...d, ...alvo },
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
