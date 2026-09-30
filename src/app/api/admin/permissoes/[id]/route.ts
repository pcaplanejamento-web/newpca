import { count, eq, sql } from "drizzle-orm";
import { grupos, permissoes } from "@/db/schema";
import { ABAS, abasConhecidas } from "@/lib/abas";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { permissaoPatchSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/** As abas gravadas que EXISTEM, na ordem da navegação. */
function lerAbas(json: string): string[] {
  try {
    const set = new Set<string>(abasConhecidas(JSON.parse(json)));
    return ABAS.map((a) => a.key).filter((k) => set.has(k));
  } catch {
    return [];
  }
}
const rotulos = (abas: string[]) => (abas.length ? abas.map((k) => ABAS.find((a) => a.key === k)?.label ?? k).join(", ") : "nenhuma");

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  // PATCH explícito: um campo ausente fica como está (o schema de criação apagava as abas num PATCH só com o nome).
  const corpo = await parseCorpo(permissaoPatchSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const db = getDb();
  const [antes] = await db.select({ nome: permissoes.nome, abas: permissoes.abas }).from(permissoes).where(eq(permissoes.id, id)).limit(1);
  if (!antes) return erro("Permissão não encontrada.", 404);
  const { nome, abas } = corpo.data;
  // Grava na ORDEM da navegação (a tela e o histórico mostram sempre na mesma ordem).
  const abasOrdenadas = abas === undefined ? undefined : ABAS.map((a) => a.key).filter((k) => abas.includes(k));
  await db
    .update(permissoes)
    .set({
      ...(nome !== undefined ? { nome } : {}),
      ...(abasOrdenadas !== undefined ? { abas: JSON.stringify(abasOrdenadas) } : {}),
      atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(permissoes.id, id));
  const abasAntes = lerAbas(antes.abas);
  const mudou = [
    nome !== undefined && nome !== antes.nome ? `nome: ${antes.nome} → ${nome}` : null,
    abasOrdenadas !== undefined && abasOrdenadas.join() !== abasAntes.join() ? `telas: ${rotulos(abasAntes)} → ${rotulos(abasOrdenadas)}` : null,
  ].filter((x): x is string => !!x);
  await registrarAuditoria({
    usuario: guard.u,
    acao: "editar",
    entidade: "permissao",
    entidadeId: id,
    resumo: `Permissão "${nome ?? antes.nome}"${mudou.length ? `: ${mudou.join("; ")}` : " salva sem mudanças"}`,
    antes: { nome: antes.nome, abas: abasAntes },
    depois: { nome: nome ?? antes.nome, abas: abasOrdenadas ?? abasAntes },
  });
  return ok();
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const id = intId((await ctx.params).id);
  if (!id) return erro("ID inválido.");
  const db = getDb();
  const [antes] = await db.select({ nome: permissoes.nome, abas: permissoes.abas }).from(permissoes).where(eq(permissoes.id, id)).limit(1);
  if (!antes) return erro("Permissão não encontrada.", 404);
  const [{ n }] = await db.select({ n: count() }).from(grupos).where(eq(grupos.permissaoId, id));
  // Grupos que apontavam para esta permissão ficam sem permissão (FK set null) — as pessoas deles perdem as telas.
  await db.delete(permissoes).where(eq(permissoes.id, id));
  await registrarAuditoria({
    usuario: guard.u,
    acao: "excluir",
    entidade: "permissao",
    entidadeId: id,
    resumo: `Permissão "${antes.nome}" excluída${n ? ` — ${n} grupo(s) ficaram sem permissão` : ""}`,
    antes: { nome: antes.nome, abas: lerAbas(antes.abas), grupos: Number(n) },
  });
  return ok();
}
