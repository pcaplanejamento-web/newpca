import { asc, eq } from "drizzle-orm";
import { grupoReparticoes, grupos, permissoes, reparticoes, usuarioGrupos, usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { comandosMembros, comandosUnidades, motivoIdsInvalidos } from "@/lib/rbac-sql";
import { grupoCreateSchema } from "@/lib/rbac-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const db = getDb();
  const [lista, perms, users, reps, vincUsu, vincRep] = await Promise.all([
    db.select({ id: grupos.id, nome: grupos.nome, permissaoId: grupos.permissaoId }).from(grupos).orderBy(grupos.nome),
    db.select({ id: permissoes.id, nome: permissoes.nome }).from(permissoes).orderBy(permissoes.nome),
    // Status: a tela marca quem está pendente/inativo (não conta como acesso ativo).
    db.select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, status: usuarios.status }).from(usuarios).orderBy(usuarios.nome),
    // Oculta: a unidade não aparece nos documentos novos (o selo avisa); a "Geral" (código GERAL) = todas as unidades.
    db
      .select({ id: reparticoes.id, codigo: reparticoes.codigo, nome: reparticoes.nome, oculto: reparticoes.oculto })
      .from(reparticoes)
      .orderBy(asc(reparticoes.ordem), asc(reparticoes.id)),
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
  const invalido = await motivoIdsInvalidos(db, corpo.data);
  if (invalido) return erro(invalido, 422);
  const [row] = await db.insert(grupos).values({ nome, permissaoId: permissaoId ?? null }).returning({ id: grupos.id });
  const grupoId = row.id;
  // Pessoas + unidades num LOTE (tudo ou nada); se falhar, o grupo recém-criado sai (nada fica pela metade).
  const comandos = [...comandosMembros(db, grupoId, membros), ...comandosUnidades(db, grupoId, reps)];
  try {
    await db.batch(comandos as [(typeof comandos)[number], ...(typeof comandos)[number][]]);
  } catch (e) {
    await db.delete(grupos).where(eq(grupos.id, grupoId));
    console.error("Falha ao gravar o grupo:", e);
    return erro("Não foi possível gravar as pessoas e unidades do grupo — nada foi criado. Tente de novo.", 500);
  }
  await registrarAuditoria({
    usuario: guard.u,
    acao: "criar",
    entidade: "grupo",
    entidadeId: grupoId,
    resumo: `Grupo "${nome}" criado (${membros.length} pessoa(s), ${reps.length} unidade(s))`,
    depois: { nome, permissaoId: permissaoId ?? null, membros, reparticoes: reps },
  });
  return ok({ id: grupoId });
}
