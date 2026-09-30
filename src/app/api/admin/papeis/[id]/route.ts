import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { diffCapacidades, textoDiffCapacidades } from "@/lib/papeis-core";
import { atualizarPapel, excluirPapel, getPapel, nomeDuplicado, nomePapelEmUso } from "@/lib/papeis";
import { editarPapelSchema } from "@/lib/papeis-validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Altera o papel (nome, descrição, capacidades, padrão dos novos cadastros). O Administrador é fixo (403). */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  const atual = id ? await getPapel(id) : null;
  if (!atual) return erro("Papel não encontrado.", 404);
  const p = await parseCorpo(editarPapelSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  if (atual.chave === "admin") return erro("O papel Administrador é fixo: tem acesso a tudo, inclusive à Administração.", 403);
  if (d.nome !== undefined && (await nomePapelEmUso(d.nome, atual.id))) return erro("Já existe um papel com este nome.", 409);
  let motivo: string | null;
  try {
    motivo = await atualizarPapel(atual, { ...d, descricao: d.descricao === undefined ? undefined : d.descricao || null });
  } catch (e) {
    if (nomeDuplicado(e)) return erro("Já existe um papel com este nome.", 409);
    throw e;
  }
  if (motivo) return erro(motivo, 409);
  const diff = d.capacidades ? diffCapacidades(atual.capacidades, d.capacidades) : [];
  const partes = [
    d.nome !== undefined && d.nome !== atual.nome ? `nome "${atual.nome}" → "${d.nome}"` : "",
    diff.length ? textoDiffCapacidades(diff) : "",
    d.padraoCadastro && !atual.padraoCadastro ? "passou a ser o padrão dos novos cadastros" : "",
  ].filter(Boolean);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "papel",
    entidadeId: atual.id,
    resumo: `Papel "${d.nome ?? atual.nome}" alterado${partes.length ? ` — ${partes.join("; ")}` : ""}${atual.pessoas ? ` (${atual.pessoas} ${atual.pessoas === 1 ? "pessoa" : "pessoas"})` : ""}`,
    antes: { nome: atual.nome, descricao: atual.descricao, capacidades: atual.capacidades, padraoCadastro: atual.padraoCadastro },
    depois: { ...d },
  });
  return ok();
}

/** Exclui o papel — só o criado pelo ADM, que não é o padrão e que ninguém tem (409 com o motivo). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await ctx.params).id);
  const atual = id ? await getPapel(id) : null;
  if (!atual) return erro("Papel não encontrado.", 404);
  const motivo = await excluirPapel(atual);
  if (motivo) return erro(motivo, 409);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "papel", entidadeId: atual.id, resumo: `Papel "${atual.nome}" excluído`, antes: { nome: atual.nome, capacidades: atual.capacidades } });
  return ok();
}
