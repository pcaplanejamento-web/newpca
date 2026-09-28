import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { tarefaCampos, tarefaEtiquetas, tarefaListas, tarefas, trelloQuadros, trelloVinculos } from "@/db/schema";
import { getDb } from "./db";
import { comandoEnfileirar } from "./trello-sql";

/**
 * A FILA da sincronização com o Trello (`trello_fila`): UM item por (direção, tipo, alvo) — várias alterações seguidas viram
 * uma (a sincronização é por ESTADO: o processador lê os dois lados na hora). Leve: sem dependência das tarefas, para o
 * gancho da auditoria não criar ciclos.
 */

export type TipoFila = "tarefa" | "lista" | "etiqueta" | "quadro" | "campo";

/** A entidade da auditoria → o tipo na fila (só as do quadro de Tarefas). */
export const TIPO_DA_ENTIDADE: Record<string, TipoFila> = {
  tarefa: "tarefa",
  tarefa_lista: "lista",
  tarefa_etiqueta: "etiqueta",
  tarefa_quadro: "quadro",
  tarefa_campo: "campo",
};

/** O quadro LIGADO ao Trello de um item daqui (pelo vínculo — vale também depois de excluído — ou pela tabela). */
export async function quadroLigadoDe(tipo: TipoFila, id: number): Promise<number | null> {
  const db = getDb();
  if (tipo === "quadro") {
    const [l] = await db.select({ q: trelloQuadros.quadroId }).from(trelloQuadros).where(eq(trelloQuadros.quadroId, id));
    return l?.q ?? null;
  }
  if (tipo !== "campo") {
    const [v] = await db
      .select({ q: trelloVinculos.quadroId })
      .from(trelloVinculos)
      .where(and(eq(trelloVinculos.tipo, tipo), eq(trelloVinculos.localId, id)));
    if (v) return v.q;
  }
  const tabela = tipo === "tarefa" ? tarefas : tipo === "lista" ? tarefaListas : tipo === "etiqueta" ? tarefaEtiquetas : tarefaCampos;
  const [r] = await db
    .select({ q: trelloQuadros.quadroId })
    .from(tabela)
    .innerJoin(trelloQuadros, eq(trelloQuadros.quadroId, tabela.quadroId))
    .where(eq(tabela.id, id));
  return r?.q ?? null;
}

/** Põe na fila (ou RENOVA o item que já estava — a mudança nova não se perde enquanto o anterior processa). */
export async function enfileirar(quadroId: number, direcao: "saida" | "entrada", tipo: TipoFila, alvo: string) {
  await comandoEnfileirar(getDb(), quadroId, direcao, tipo, alvo);
}

/** Roda `p` depois da resposta (o Worker espera) — fora do Worker, só dispara. */
export function depoisDaResposta(p: Promise<unknown>) {
  const seguro = p.catch((e) => console.error("[trello] falha em segundo plano:", e));
  try {
    getCloudflareContext().ctx.waitUntil(seguro);
  } catch {
    // sem contexto (testes/scripts): segue sozinho
  }
}

/**
 * O GANCHO da auditoria: a alteração de um item do quadro de Tarefas LIGADO ao Trello entra na fila de SAÍDA e o
 * processador roda depois da resposta. Best-effort: nunca lança (a gravação já aconteceu).
 */
export async function marcarSaidaTrello(entidade: string, id: number | null | undefined) {
  const tipo = TIPO_DA_ENTIDADE[entidade];
  if (!tipo || id == null) return;
  try {
    const q = await quadroLigadoDe(tipo, id);
    if (q == null) return;
    await enfileirar(q, "saida", tipo, String(id));
    depoisDaResposta(import("./trello-processar").then((m) => m.processarFila(4, q)));
  } catch (e) {
    console.error("[trello] falha ao pôr na fila:", e);
  }
}

/** O endereço do CARTÃO da tarefa no Trello (quadro ligado) — "Abrir no Trello" no detalhe. */
export async function urlDoCartao(tarefaId: number): Promise<string | null> {
  const [v] = await getDb()
    .select({ r: trelloVinculos.retrato })
    .from(trelloVinculos)
    .where(and(eq(trelloVinculos.tipo, "tarefa"), eq(trelloVinculos.localId, tarefaId)));
  try {
    const u = v?.r ? (JSON.parse(v.r) as { url?: unknown }).url : null;
    return typeof u === "string" && u.startsWith("https://trello.com/") ? u : null;
  } catch {
    return null;
  }
}
