import type { NextResponse } from "next/server";
import { exigirSessao, type Guarda, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { atualizarEdicaoTabela, excluirEdicaoTabela, getEdicaoTabela, recusaNaChave } from "@/lib/edicoes-tabela";
import { acaoParaGravar } from "@/lib/edicoes-tabela-core";
import { erro, ok, parseCorpo } from "@/lib/http";
import { editarEdicaoSchema } from "@/lib/preferencias-validation";

export const dynamic = "force-dynamic";

type Edicao = NonNullable<Awaited<ReturnType<typeof getEdicaoTabela>>>;

/**
 * A edição do `[id]`, se a pessoa pode GRAVÁ-LA (a régua pura `acaoParaGravar`): o DONO grava a sua — publicar exige
 * Configurar na tela da tabela; despublicar e excluir a sua nunca são recusados —; a PÚBLICA de outra pessoa, quem
 * CONFIGURA a tela (moderar); a PRIVADA de outra pessoa, só o ADM.
 */
async function paraGravar(
  g: Guarda,
  ctx: { params: Promise<{ id: string }> },
  depois: { publico?: boolean; excluir: boolean },
): Promise<{ e: Edicao; dono: boolean } | { erro: NextResponse }> {
  const id = intId((await ctx.params).id);
  if (!id) return { erro: erro("ID inválido.") };
  const e = await getEdicaoTabela(id);
  if (!e) return { erro: erro("Edição não encontrada.", 404) };
  const dono = e.usuarioId === g.u.id;
  if (g.u.admin) return { e, dono };
  if (!dono && !e.publico) return { erro: erro("Só quem criou a edição pode alterá-la.", 403) };
  const acao = acaoParaGravar({ dono, publicoAntes: e.publico, publicoDepois: depois.publico ?? e.publico, excluir: depois.excluir });
  const r = acao ? await recusaNaChave(g.acesso, e.chave, acao) : null;
  return r ? { erro: erro(r.msg, r.status) } : { e, dono };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(editarEdicaoSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  const g = await paraGravar(a, ctx, { publico: d.publico, excluir: false });
  if ("erro" in g) return g.erro;
  const { e, dono } = g;
  await atualizarEdicaoTabela(e.id, d);
  // O que é (ou foi) PÚBLICO e o que alguém faz na edição de OUTRA pessoa (moderar) vão ao histórico.
  const publicoDepois = d.publico ?? e.publico;
  if (e.publico || publicoDepois || !dono) {
    const resumo = !e.publico && publicoDepois ? "publicada" : e.publico && !publicoDepois ? "despublicada" : "alterada";
    await registrarAuditoria({
      usuario: a.u,
      acao: "editar",
      entidade: "edicao_tabela",
      entidadeId: e.id,
      resumo: `Edição "${d.nome ?? e.nome}" ${resumo} (${e.chave})${dono ? "" : " — de outra pessoa"}`,
      antes: { nome: e.nome, publico: e.publico },
      depois: { nome: d.nome ?? e.nome, publico: publicoDepois, layout: d.valor !== undefined ? "alterado" : "mantido" },
    });
  }
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const g = await paraGravar(a, ctx, { excluir: true });
  if ("erro" in g) return g.erro;
  const { e, dono } = g;
  await excluirEdicaoTabela(e.id);
  if (e.publico || !dono)
    await registrarAuditoria({
      usuario: a.u,
      acao: "excluir",
      entidade: "edicao_tabela",
      entidadeId: e.id,
      resumo: `Edição "${e.nome}" excluída (${e.chave})${dono ? "" : " — de outra pessoa"}`,
      antes: { nome: e.nome, publico: e.publico },
    });
  return ok();
}
