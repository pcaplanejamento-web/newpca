import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { diffCampos } from "@/lib/auditoria-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { pessoaResponsavelPatchSchema } from "@/lib/rbac-validation";
import { atualizarPessoa, excluirPessoa, getPessoa, pessoaRepetida, vinculosDaPessoa } from "@/lib/responsaveis";

export const dynamic = "force-dynamic";

/** Edita nome/matrícula da PESSOA — vale em todas as unidades e órgãos em que ela está vinculada. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await parseCorpo(pessoaResponsavelPatchSchema, req);
  if ("resp" in p) return p.resp;
  const antes = await getPessoa(id);
  if (!antes) return erro("Pessoa não encontrada.", 404);
  const depois = { nome: p.data.nome ?? antes.nome, matricula: p.data.matricula ?? antes.matricula };
  if ((await pessoaRepetida(depois.nome, depois.matricula, id)) != null)
    return erro("Já existe outra pessoa na planilha com o mesmo nome e matrícula.", 409);
  await atualizarPessoa(id, p.data);
  const d = diffCampos({ nome: antes.nome, matricula: antes.matricula }, depois, ["nome", "matricula"], { nome: "Nome", matricula: "Matrícula" });
  if (d.mudou)
    await registrarAuditoria({
      usuario: g.u,
      acao: "editar",
      entidade: "responsavel",
      entidadeId: id,
      resumo: `Responsável "${depois.nome}" editado — ${d.resumo}`,
      antes: d.antes,
      depois: d.depois,
    });
  return ok();
}

/** Exclui a PESSOA (e os vínculos dela). Com vínculos, só com `?confirmar=1` — sem ele, 409 com quantos saem. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const p = await getPessoa(id);
  if (!p) return erro("Pessoa não encontrada.", 404);
  const vinculos = await vinculosDaPessoa(id);
  if (vinculos.length && new URL(req.url).searchParams.get("confirmar") !== "1")
    return erro(`Esta pessoa responde em ${vinculos.length} lugar(es) — confirme para excluir os vínculos junto.`, 409);
  await excluirPessoa(id);
  await registrarAuditoria({
    usuario: g.u,
    acao: "excluir",
    entidade: "responsavel",
    entidadeId: id,
    resumo: `Responsável "${p.nome}" excluído${vinculos.length ? ` com ${vinculos.length} vínculo(s)` : ""}`,
    antes: { nome: p.nome, matricula: p.matricula, vinculos: vinculos.length },
  });
  return ok();
}
