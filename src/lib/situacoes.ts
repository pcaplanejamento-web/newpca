import { asc, eq, sql } from "drizzle-orm";
import { dfdProtocolos, protocoloSituacoes } from "@/db/schema";
import { getDb } from "./db";

/**
 * SITUAÇÕES do protocolo — SÓ as cadastradas pelo ADM (Configurações → Situações): nome, cor e ordem (a
 * ordem do dropdown na célula "Situação" da Mesa). Excluir uma situação LIMPA a dos protocolos que a
 * usavam (explícito aqui, além da FK `set null`).
 */

export type SituacaoCadastrada = {
  id: number;
  nome: string;
  cor: string;
  ordem: number;
  /** O protocolo nesta situação pode ser movido para o PCA (migração `0033`). */
  permiteMoverPca: boolean;
  /** Camada do PCA em que os DFDs do protocolo contam (`publicado` = aparecem na tela inicial). */
  camadaPca: "preview" | "publicado";
};
type DadosSituacao = { nome: string; cor: string; permiteMoverPca?: boolean; camadaPca?: "preview" | "publicado" };
/** Para a tela do ADM: quantos protocolos estão em cada situação (aviso ao excluir). */
export type SituacaoComUso = SituacaoCadastrada & { emUso: number };

const COLS = {
  id: protocoloSituacoes.id,
  nome: protocoloSituacoes.nome,
  cor: protocoloSituacoes.cor,
  ordem: protocoloSituacoes.ordem,
  permiteMoverPca: protocoloSituacoes.permiteMoverPca,
  camadaPca: protocoloSituacoes.camadaPca,
};

export async function listarSituacoes(): Promise<SituacaoCadastrada[]> {
  return getDb().select(COLS).from(protocoloSituacoes).orderBy(asc(protocoloSituacoes.ordem), asc(protocoloSituacoes.id));
}

export async function listarSituacoesComUso(): Promise<SituacaoComUso[]> {
  const db = getDb();
  const [lista, usos] = await Promise.all([
    listarSituacoes(),
    db
      .select({ id: dfdProtocolos.situacaoId, n: sql<number>`COUNT(*)` })
      .from(dfdProtocolos)
      .where(sql`${dfdProtocolos.situacaoId} IS NOT NULL`)
      .groupBy(dfdProtocolos.situacaoId),
  ]);
  const porId = new Map(usos.map((u) => [u.id, Number(u.n)]));
  return lista.map((s) => ({ ...s, emUso: porId.get(s.id) ?? 0 }));
}

export async function getSituacao(id: number): Promise<SituacaoCadastrada | null> {
  const [s] = await getDb().select(COLS).from(protocoloSituacoes).where(eq(protocoloSituacoes.id, id)).limit(1);
  return s ?? null;
}

/** Cria no FIM da ordem. */
export async function criarSituacao(d: DadosSituacao): Promise<{ id: number }> {
  const db = getDb();
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(${protocoloSituacoes.ordem}), -1)` }).from(protocoloSituacoes);
  const [row] = await db
    .insert(protocoloSituacoes)
    .values({ nome: d.nome, cor: d.cor, ordem: Number(max) + 1, permiteMoverPca: d.permiteMoverPca ?? false, camadaPca: d.camadaPca ?? "preview" })
    .returning({ id: protocoloSituacoes.id });
  return { id: row.id };
}

export async function atualizarSituacao(id: number, d: DadosSituacao): Promise<void> {
  await getDb()
    .update(protocoloSituacoes)
    .set({
      nome: d.nome,
      cor: d.cor,
      ...(d.permiteMoverPca !== undefined ? { permiteMoverPca: d.permiteMoverPca } : {}),
      ...(d.camadaPca !== undefined ? { camadaPca: d.camadaPca } : {}),
      atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(protocoloSituacoes.id, id));
}

/** Exclui a situação e LIMPA a dos protocolos que a usavam — num lote atômico. */
export async function excluirSituacao(id: number): Promise<void> {
  const db = getDb();
  await db.batch([
    db.update(dfdProtocolos).set({ situacaoId: null }).where(eq(dfdProtocolos.situacaoId, id)),
    db.delete(protocoloSituacoes).where(eq(protocoloSituacoes.id, id)),
  ]);
}

/** Nova ordem (índice = posição na lista). */
export async function reordenarSituacoes(ids: number[]): Promise<void> {
  const db = getDb();
  if (ids.length === 0) return;
  const stmts = ids.map((id, i) =>
    db.update(protocoloSituacoes).set({ ordem: i, atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(protocoloSituacoes.id, id)),
  );
  await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
}
