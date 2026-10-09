import { asc, desc, eq } from "drizzle-orm";
import { grupoReparticoes, grupos, pcas, reparticoes, usuarioGrupos, usuarios } from "@/db/schema";
import { abasConhecidas } from "@/lib/abas";
import { lerPcasGrupo } from "@/lib/acesso";
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
  const [lista, listaPcas, users, reps, vincUsu, vincRep] = await Promise.all([
    db.select({ id: grupos.id, nome: grupos.nome, abas: grupos.abas, pcas: grupos.pcas }).from(grupos).orderBy(grupos.nome),
    // Os PCAs que o grupo pode escolher (o mais recente primeiro).
    db.select({ id: pcas.id, nome: pcas.nome, ano: pcas.ano }).from(pcas).orderBy(desc(pcas.ano), desc(pcas.id)),
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
      id: g.id,
      nome: g.nome,
      abas: lerAbasGrupo(g.abas),
      pcas: lerPcasGrupo(g.pcas),
      membros: membrosPorGrupo.get(g.id) ?? [],
      reparticoes: repsPorGrupo.get(g.id) ?? [],
    })),
    pcas: listaPcas,
    usuarios: users,
    reparticoes: reps,
  });
}

/** As telas gravadas no grupo (as chaves antigas `dashboard`/`protocolos` saem na leitura). */
function lerAbasGrupo(json: string): string[] {
  try {
    return abasConhecidas(JSON.parse(json));
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const guard = await exigirAdmin();
  if ("erro" in guard) return guard.erro;
  const corpo = await parseCorpo(grupoCreateSchema, req);
  if ("resp" in corpo) return corpo.resp;
  const { nome, abas, pcas: pcasGrupo, membros, reparticoes: reps } = corpo.data;
  const db = getDb();
  const invalido = await motivoIdsInvalidos(db, corpo.data);
  if (invalido) return erro(invalido, 422);
  const [row] = await db.insert(grupos).values({ nome, abas: JSON.stringify(abas), pcas: pcasGrupo == null ? null : JSON.stringify(pcasGrupo) }).returning({ id: grupos.id });
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
    resumo: `Grupo "${nome}" criado (${abas.length} tela(s), ${pcasGrupo == null ? "todos os PCAs" : `${pcasGrupo.length} PCA(s)`}, ${membros.length} pessoa(s), ${reps.length} unidade(s))`,
    depois: { nome, abas, pcas: pcasGrupo, membros, reparticoes: reps },
  });
  return ok({ id: grupoId });
}
