import { eq, inArray } from "drizzle-orm";
import { trelloMembros } from "@/db/schema";
import { getDb } from "./db";
import type { LigacaoMembro } from "./trello-sync-core";

/**
 * SINCRONIZAÇÃO com o Trello — acesso ao D1 (só escopo de request). A régua (correspondência, retrato, conflito) é pura, em
 * `trello-sync-core.ts`; as chamadas, em `trello-api.ts` pelo cliente da conta institucional (`trello-config.ts`).
 */

/** As ligações pessoa ↔ membro do Trello. */
export function listarLigacoesMembros(): Promise<LigacaoMembro[]> {
  return getDb().select().from(trelloMembros);
}

/**
 * Grava as ligações: `membroId` null = desligar a pessoa. Um membro fica ligado a UMA pessoa — ligá-lo a outra tira a
 * ligação anterior (no MESMO lote).
 */
export async function gravarLigacoesMembros(ls: { usuarioId: number; membro: { id: string; username: string; fullName: string } | null }[]) {
  const db = getDb();
  const membros = ls.flatMap((l) => (l.membro ? [l.membro.id] : []));
  const cmds = [
    db.delete(trelloMembros).where(inArray(trelloMembros.usuarioId, ls.map((l) => l.usuarioId))),
    ...(membros.length ? [db.delete(trelloMembros).where(inArray(trelloMembros.membroId, membros))] : []),
    ...ls.flatMap((l) =>
      l.membro ? [db.insert(trelloMembros).values({ usuarioId: l.usuarioId, membroId: l.membro.id, usuarioTrello: l.membro.username, nome: l.membro.fullName })] : [],
    ),
  ];
  await db.batch(cmds as unknown as Parameters<typeof db.batch>[0]);
}

/** A pessoa ligada a um membro do Trello (quem fez a ação que chegou). */
export async function pessoaDoMembro(membroId: string): Promise<number | null> {
  const [r] = await getDb().select({ id: trelloMembros.usuarioId }).from(trelloMembros).where(eq(trelloMembros.membroId, membroId));
  return r?.id ?? null;
}
