import { and, eq, sql } from "drizzle-orm";
import { usuarioGrupos, usuarios } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { atorDe, notificar } from "@/lib/notificacoes";
import { comunicadoSchema } from "@/lib/notificacoes-validation";

export const dynamic = "force-dynamic";

/** Um COMUNICADO do ADM no sino de TODAS as pessoas ativas — ou só das dos grupos escolhidos. */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(comunicadoSchema, req);
  if ("resp" in p) return p.resp;
  const { titulo, texto, link, grupos } = p.data;
  const db = getDb();
  const pessoas = await db
    .selectDistinct({ id: usuarios.id })
    .from(usuarios)
    .leftJoin(usuarioGrupos, eq(usuarioGrupos.usuarioId, usuarios.id))
    .where(and(eq(usuarios.status, "ativo"), grupos.length ? sql`${usuarioGrupos.grupoId} IN (SELECT value FROM json_each(${JSON.stringify(grupos)}))` : undefined));
  const destinos = pessoas.map((x) => x.id).filter((id) => id !== g.u.id);
  if (!destinos.length) return erro("Ninguém para receber o comunicado.", 422);
  await notificar(
    destinos.map((usuarioId) => ({ usuarioId, tipo: "comunicado" as const, titulo, texto: texto || null, link: link || null, ...atorDe(g.u) })),
    g.u.id,
  );
  await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "configuracao", entidadeId: 1, resumo: `Comunicado enviado a ${destinos.length} pessoa(s): ${titulo}`.slice(0, 500) });
  return ok({ enviados: destinos.length });
}
