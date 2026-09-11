import { grupos, permissoes, usuarioGrupos, usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";
import { grupoCreateSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

/** Insere os membros em lotes (limite de 100 params vinculados do D1). */
async function inserirMembros(grupoId: number, membros: number[]) {
  const db = getDb();
  for (let i = 0; i < membros.length; i += 40) {
    const lote = membros.slice(i, i + 40);
    await db.insert(usuarioGrupos).values(lote.map((usuarioId) => ({ usuarioId, grupoId })));
  }
}

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const db = getDb();
  const [lista, perms, users, vinculos] = await Promise.all([
    db.select({ id: grupos.id, nome: grupos.nome, permissaoId: grupos.permissaoId }).from(grupos).orderBy(grupos.nome),
    db.select({ id: permissoes.id, nome: permissoes.nome }).from(permissoes).orderBy(permissoes.nome),
    db.select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email }).from(usuarios).orderBy(usuarios.nome),
    db.select({ grupoId: usuarioGrupos.grupoId, usuarioId: usuarioGrupos.usuarioId }).from(usuarioGrupos),
  ]);
  const membrosPorGrupo = new Map<number, number[]>();
  for (const v of vinculos) {
    const arr = membrosPorGrupo.get(v.grupoId) ?? [];
    arr.push(v.usuarioId);
    membrosPorGrupo.set(v.grupoId, arr);
  }
  return ok({
    grupos: lista.map((g) => ({ ...g, membros: membrosPorGrupo.get(g.id) ?? [] })),
    permissoes: perms,
    usuarios: users,
  });
}

export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(grupoCreateSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, permissaoId, membros } = corpo.data;
  const [row] = await getDb()
    .insert(grupos)
    .values({ nome, permissaoId: permissaoId ?? null })
    .returning({ id: grupos.id });
  if (row?.id && membros.length) await inserirMembros(row.id, membros);
  return ok({ id: row?.id });
}
