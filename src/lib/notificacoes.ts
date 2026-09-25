import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { notificacoes, tarefaPessoas, tarefaQuadros, tarefas, usuarios } from "@/db/schema";
import type { UsuarioSessao } from "./auth";
import { getDb } from "./db";
import { dataIsoBrasilia } from "./format";
import { gruposDoUsuario } from "./grupos";
import { nomeExibicao, urlFoto } from "./pessoa";
import { notificacaoDePrazo, somarDias, type TipoNotificacao, TIPOS_NOTIFICACAO } from "./tarefas-core";
import { comandosNotificacoes, type NovaNotificacao } from "./tarefas-sql";

/**
 * NOTIFICAÇÕES do sino (migração `0044`) — acesso ao D1 (só escopo de request). As de EVENTO (atribuída, menção,
 * comentário, automação) são gravadas por `notificar` (BEST-EFFORT: nunca derruba a ação que as gerou; nunca avisa o
 * próprio autor). As de PRAZO (vence amanhã, atrasada) são DERIVADAS NA LEITURA — sem cron: a cada contagem/lista, as
 * tarefas abertas da pessoa viram linhas com uma CHAVE única (tarefa + prazo), então o "lida" persiste e nada repete.
 */

export type Notificacao = {
  id: number;
  tipo: TipoNotificacao;
  titulo: string;
  texto: string | null;
  link: string | null;
  lida: boolean;
  criadoEm: string | null;
  ator: { id: number; nome: string; foto: string | null } | null;
};

/** As lidas somem depois de 60 dias (limpeza barata, por pessoa, na leitura). */
const DIAS_GUARDAR_LIDAS = 60;

/** Grava as notificações de um evento (sem o próprio ator, sem repetir a pessoa). Nunca lança. */
export async function notificar(linhas: NovaNotificacao[], atorId?: number | null): Promise<void> {
  const vistos = new Set<string>();
  const validas = linhas.filter((n) => {
    const k = `${n.usuarioId}|${n.tipo}|${n.tarefaId ?? ""}`;
    if (n.usuarioId === atorId || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  if (!validas.length) return;
  try {
    const db = getDb();
    const cmds = comandosNotificacoes(db, validas);
    await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
  } catch (e) {
    console.error("notificar falhou", e);
  }
}

/** O autor (snapshot) de uma notificação de evento. */
export const atorDe = (u: UsuarioSessao) => ({ atorId: u.id, atorNome: nomeExibicao(u) });

/**
 * DERIVA as notificações de PRAZO da pessoa (tarefas abertas em que é responsável, nos quadros dos grupos dela — o ADM,
 * todos; prazo entre 30 dias atrás e amanhã) e grava as que faltam (a chave repetida é ignorada). Nunca lança.
 */
async function derivarPrazos(u: UsuarioSessao, grupoIds: number[] | null): Promise<void> {
  if (grupoIds && !grupoIds.length) return;
  try {
    const db = getDb();
    const hoje = dataIsoBrasilia(new Date().toISOString());
    const linhas = await db
      .select({ id: tarefas.id, ticket: tarefas.ticket, titulo: tarefas.titulo, prazo: tarefas.prazo, quadroId: tarefas.quadroId, quadroNome: tarefaQuadros.nome })
      .from(tarefaPessoas)
      .innerJoin(tarefas, eq(tarefas.id, tarefaPessoas.tarefaId))
      .innerJoin(tarefaQuadros, eq(tarefaQuadros.id, tarefas.quadroId))
      .where(
        and(
          eq(tarefaPessoas.usuarioId, u.id),
          eq(tarefaPessoas.papel, "responsavel"),
          isNull(tarefas.concluidaEm),
          eq(tarefas.arquivada, false),
          eq(tarefaQuadros.arquivado, false),
          gte(tarefas.prazo, somarDias(hoje, -30)),
          lte(tarefas.prazo, somarDias(hoje, 1)),
          grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds.slice(0, 90)) : undefined,
        ),
      )
      .limit(200);
    const novas: NovaNotificacao[] = [];
    for (const t of linhas) {
      const n = notificacaoDePrazo(t, hoje);
      if (n) novas.push({ usuarioId: u.id, ...n, tarefaId: t.id, quadroId: t.quadroId });
    }
    if (!novas.length) return;
    const cmds = comandosNotificacoes(db, novas);
    await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
  } catch (e) {
    console.error("derivar prazos falhou", e);
  }
}

const gruposDe = async (u: UsuarioSessao, grupoIds?: number[]) => (u.role === "admin" ? null : (grupoIds ?? (await gruposDoUsuario(u.id)).map((g) => g.id)));

/** Quantas NÃO LIDAS (o número do sino — o layout passa os grupos que já carregou). Falha = 0. */
export async function contarNaoLidas(u: UsuarioSessao, grupoIds?: number[]): Promise<number> {
  try {
    await derivarPrazos(u, await gruposDe(u, grupoIds));
    const [r] = await getDb()
      .select({ n: sql<number>`COUNT(*)` })
      .from(notificacoes)
      .where(and(eq(notificacoes.usuarioId, u.id), eq(notificacoes.lida, false)));
    return Number(r?.n ?? 0);
  } catch {
    return 0;
  }
}

/** As últimas notificações (não lidas primeiro) + a contagem de não lidas. */
export async function listarNotificacoes(u: UsuarioSessao, limite = 50): Promise<{ itens: Notificacao[]; naoLidas: number }> {
  const db = getDb();
  await derivarPrazos(u, await gruposDe(u));
  await db
    .delete(notificacoes)
    .where(and(eq(notificacoes.usuarioId, u.id), eq(notificacoes.lida, true), sql`${notificacoes.criadoEm} < datetime('now', ${`-${DIAS_GUARDAR_LIDAS} days`})`));
  const [linhas, [cont]] = await Promise.all([
    db
      .select({
        id: notificacoes.id,
        tipo: notificacoes.tipo,
        titulo: notificacoes.titulo,
        texto: notificacoes.texto,
        link: notificacoes.link,
        lida: notificacoes.lida,
        criadoEm: notificacoes.criadoEm,
        atorId: notificacoes.atorId,
        atorNome: notificacoes.atorNome,
        temFoto: sql<number>`(${usuarios.foto} IS NOT NULL AND ${usuarios.foto} <> '')`,
        versao: usuarios.atualizadoEm,
      })
      .from(notificacoes)
      .leftJoin(usuarios, eq(usuarios.id, notificacoes.atorId))
      .where(eq(notificacoes.usuarioId, u.id))
      .orderBy(notificacoes.lida, desc(notificacoes.id))
      .limit(limite),
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(notificacoes)
      .where(and(eq(notificacoes.usuarioId, u.id), eq(notificacoes.lida, false))),
  ]);
  return {
    naoLidas: Number(cont?.n ?? 0),
    itens: linhas.map((l) => ({
      id: l.id,
      tipo: (TIPOS_NOTIFICACAO as readonly string[]).includes(l.tipo) ? (l.tipo as TipoNotificacao) : "automacao",
      titulo: l.titulo,
      texto: l.texto,
      link: l.link,
      lida: l.lida,
      criadoEm: l.criadoEm,
      ator: l.atorId != null ? { id: l.atorId, nome: l.atorNome ?? "", foto: urlFoto(l.atorId, !!l.temFoto, l.versao) } : null,
    })),
  };
}

/** Marca como LIDAS as notificações pedidas (só as da pessoa) ou todas. */
export async function marcarLidas(u: UsuarioSessao, alvo: { ids: number[] } | { todas: true }) {
  await getDb()
    .update(notificacoes)
    .set({ lida: true })
    .where(and(eq(notificacoes.usuarioId, u.id), "ids" in alvo ? inArray(notificacoes.id, alvo.ids.slice(0, 90)) : eq(notificacoes.lida, false)));
}
