import { asc } from "drizzle-orm";
import { grupoReparticoes, grupos, permissoes, reparticoes, usuarioGrupos, usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { ok, parseCorpo } from "@/lib/http";
import { grupoCreateSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const db = getDb();
  const [lista, perms, users, reps, vincUsu, vincRep] = await Promise.all([
    db.select({ id: grupos.id, nome: grupos.nome, permissaoId: grupos.permissaoId }).from(grupos).orderBy(grupos.nome),
    db.select({ id: permissoes.id, nome: permissoes.nome }).from(permissoes).orderBy(permissoes.nome),
    db.select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email }).from(usuarios).orderBy(usuarios.nome),
    db.select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome }).from(reparticoes).orderBy(asc(reparticoes.ordem), asc(reparticoes.id)),
    db.select({ grupoId: usuarioGrupos.grupoId, usuarioId: usuarioGrupos.usuarioId }).from(usuarioGrupos),
    db.select({ grupoId: grupoReparticoes.grupoId, reparticaoId: grupoReparticoes.reparticaoId }).from(grupoReparticoes),
  ]);
  const membrosPorGrupo = new Map<number, number[]>();
  for (const v of vincUsu) {
    const arr = membrosPorGrupo.get(v.grupoId) ?? [];
    arr.push(v.usuarioId);
    membrosPorGrupo.set(v.grupoId, arr);
  }
  const repsPorGrupo = new Map<number, number[]>();
  for (const v of vincRep) {
    const arr = repsPorGrupo.get(v.grupoId) ?? [];
    arr.push(v.reparticaoId);
    repsPorGrupo.set(v.grupoId, arr);
  }
  return ok({
    grupos: lista.map((g) => ({
      ...g,
      membros: membrosPorGrupo.get(g.id) ?? [],
      reparticoes: repsPorGrupo.get(g.id) ?? [],
    })),
    permissoes: perms,
    usuarios: users,
    reparticoes: reps,
  });
}

export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(grupoCreateSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, permissaoId, membros, reparticoes: reps } = corpo.data;
  const db = getDb();
  const [row] = await db.insert(grupos).values({ nome, permissaoId: permissaoId ?? null }).returning({ id: grupos.id });
  const grupoId = row?.id;
  if (grupoId) {
    for (let i = 0; i < membros.length; i += 40)
      await db.insert(usuarioGrupos).values(membros.slice(i, i + 40).map((usuarioId) => ({ usuarioId, grupoId })));
    for (let i = 0; i < reps.length; i += 40)
      await db.insert(grupoReparticoes).values(reps.slice(i, i + 40).map((reparticaoId) => ({ grupoId, reparticaoId })));
  }
  return ok({ id: grupoId });
}
