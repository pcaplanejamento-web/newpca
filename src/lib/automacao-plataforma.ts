import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { automacaoExecucoes, automacaoPassos, automacaoRegistros, configuracoes } from "@/db/schema";
import { getDb } from "./db";
import { lerBlobConfiguracoes } from "./integracoes";
import { coerceConfigAutomacao, type ConfigAutomacao, type EstadoExecucao, type EstadoPasso, estadoFinal } from "./automacao-core.ts";
import {
  comandoAtualizarPasso,
  comandoConsumirAutorizacao,
  comandoCriarAutorizacao,
  comandoLimparAutorizacoes,
  comandoRecontar,
  comandoRegistrarEscrita,
  comandosPassos,
  type PassoNovo,
} from "./automacao-sql.ts";
import { lotesDeIds } from "./reparticoes";

// AUTOMAÇÃO CENTI — o acesso ao D1 da plataforma (só em escopo de requisição). A configuração é lida SEMPRE do banco
// (sem cache): o freio de emergência vale na hora, em qualquer isolate do Worker.

export async function getConfigAutomacao(): Promise<ConfigAutomacao> {
  try {
    return coerceConfigAutomacao((await lerBlobConfiguracoes()).automacao);
  } catch {
    // Sem ler a configuração, a escrita fica PAUSADA (falha segura); a leitura segue.
    return { ...coerceConfigAutomacao(undefined), ativa: false };
  }
}

/** Grava a configuração no blob (as chaves irmãs — aparência, avaliação, integrações — ficam). */
export async function gravarConfigAutomacao(cfg: ConfigAutomacao, usuarioId: number) {
  const blob = await lerBlobConfiguracoes();
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, automacao: cfg }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
}

export type ExecucaoResumo = typeof automacaoExecucoes.$inferSelect;
export type PassoResumo = Pick<typeof automacaoPassos.$inferSelect, "ordem" | "chave" | "capacidade" | "alvo" | "estado" | "resultado" | "erro" | "inicio" | "fim">;

/** Cria a execução + os passos num lote atômico (o id pela última inserção — o lote do D1 é sequencial). */
export async function criarExecucao(e: {
  receita: string;
  versao: number;
  usuarioId: number;
  usuarioNome: string;
  ensaio: boolean;
  entrada: Record<string, unknown>;
  passos: readonly PassoNovo[];
}): Promise<number> {
  const db = getDb();
  const [x] = await db
    .insert(automacaoExecucoes)
    .values({
      receita: e.receita,
      receitaVersao: e.versao,
      usuarioId: e.usuarioId,
      usuarioNome: e.usuarioNome,
      ensaio: e.ensaio,
      entrada: JSON.stringify(e.entrada),
      total: e.passos.length,
    })
    .returning({ id: automacaoExecucoes.id });
  try {
    const cmds = comandosPassos(db, x.id, e.passos);
    await db.batch([cmds[0], ...cmds.slice(1)] as never);
  } catch (err) {
    // Sem os passos, a execução não existe (nada pela metade).
    await db.delete(automacaoExecucoes).where(eq(automacaoExecucoes.id, x.id));
    throw err;
  }
  return x.id;
}

export async function getExecucao(id: number): Promise<{ execucao: ExecucaoResumo; passos: PassoResumo[] } | null> {
  const db = getDb();
  const [execucao] = await db.select().from(automacaoExecucoes).where(eq(automacaoExecucoes.id, id)).limit(1);
  if (!execucao) return null;
  const passos = await db
    .select({
      ordem: automacaoPassos.ordem,
      chave: automacaoPassos.chave,
      capacidade: automacaoPassos.capacidade,
      alvo: automacaoPassos.alvo,
      estado: automacaoPassos.estado,
      resultado: automacaoPassos.resultado,
      erro: automacaoPassos.erro,
      inicio: automacaoPassos.inicio,
      fim: automacaoPassos.fim,
    })
    .from(automacaoPassos)
    .where(eq(automacaoPassos.execucaoId, id))
    .orderBy(automacaoPassos.ordem);
  return { execucao, passos };
}

/** As últimas execuções (o histórico da tela). */
export async function listarExecucoes(limite = 30): Promise<ExecucaoResumo[]> {
  return getDb().select().from(automacaoExecucoes).orderBy(desc(automacaoExecucoes.id)).limit(limite);
}

export async function mudarEstadoExecucao(id: number, estado: EstadoExecucao, erroTexto: string | null = null) {
  await getDb()
    .update(automacaoExecucoes)
    .set({ estado, erro: erroTexto, atualizadoEm: sql`CURRENT_TIMESTAMP` })
    .where(eq(automacaoExecucoes.id, id));
}

/** Grava o resultado dos passos + recontagem; a execução que rodava e não tem mais pendentes vai ao estado final. */
export async function registrarPassos(
  id: number,
  passos: readonly { chave: string; estado: EstadoPasso; resultado?: string | null; erro?: string | null }[],
): Promise<EstadoExecucao | null> {
  const db = getDb();
  await db.batch([...passos.map((p) => comandoAtualizarPasso(db, id, p.chave, p)), comandoRecontar(db, id)] as never);
  const x = await getExecucao(id);
  if (x?.execucao.estado !== "rodando") return null;
  const fim = estadoFinal(x.passos as { estado: EstadoPasso }[]);
  if (fim) await mudarEstadoExecucao(id, fim);
  return fim;
}

/** O passo de uma execução (para conferir a autorização). */
export async function passoDaExecucao(id: number, chave: string) {
  const [p] = await getDb()
    .select({ capacidade: automacaoPassos.capacidade, estado: automacaoPassos.estado, alvo: automacaoPassos.alvo })
    .from(automacaoPassos)
    .where(and(eq(automacaoPassos.execucaoId, id), eq(automacaoPassos.chave, chave)))
    .limit(1);
  return p ?? null;
}

export async function criarAutorizacao(a: Parameters<typeof comandoCriarAutorizacao>[1]) {
  const db = getDb();
  await db.batch([comandoLimparAutorizacoes(db, Math.floor(Date.now() / 1000)), comandoCriarAutorizacao(db, a)] as never);
}

export async function consumirAutorizacao(idHash: string, usuarioId: number) {
  const [a] = await comandoConsumirAutorizacao(getDb(), idHash, usuarioId, Math.floor(Date.now() / 1000));
  return a ?? null;
}

/** A escrita já foi feita (mesmo alvo + descrição)? */
export async function escritaRegistrada(capacidade: string, centiAlvo: string, descricao: string) {
  const [r] = await getDb()
    .select({ id: automacaoRegistros.id, centiDocumento: automacaoRegistros.centiDocumento })
    .from(automacaoRegistros)
    .where(and(eq(automacaoRegistros.capacidade, capacidade), eq(automacaoRegistros.centiAlvo, centiAlvo), eq(automacaoRegistros.descricao, descricao)))
    .limit(1);
  return r ?? null;
}

export async function registrarEscrita(r: Parameters<typeof comandoRegistrarEscrita>[1]) {
  return (await comandoRegistrarEscrita(getDb(), r)).length > 0;
}

export type RegistroCenti = {
  protocoloId: number | null;
  descricao: string;
  centiAlvo: string;
  centiDocumento: string | null;
  criadoEm: string | null;
  usuarioNome: string | null;
};
const COLS_REGISTRO = {
  protocoloId: automacaoRegistros.protocoloId,
  descricao: automacaoRegistros.descricao,
  centiAlvo: automacaoRegistros.centiAlvo,
  centiDocumento: automacaoRegistros.centiDocumento,
  criadoEm: automacaoRegistros.criadoEm,
  usuarioNome: automacaoRegistros.usuarioNome,
};

/** As escritas feitas nos protocolos do sistema (a coluna "Na Centi"). */
export async function registrosDosProtocolos(ids: readonly number[]): Promise<RegistroCenti[]> {
  const db = getDb();
  const out: RegistroCenti[] = [];
  for (const lote of lotesDeIds([...ids]))
    out.push(...(await db.select(COLS_REGISTRO).from(automacaoRegistros).where(inArray(automacaoRegistros.protocoloId, lote))));
  return out;
}

/** As escritas feitas nos protocolos DA CENTI indicados (o Id de cada um — a pré-verificação antes de emitir). */
export async function registrosDosAlvos(alvos: readonly string[]): Promise<RegistroCenti[]> {
  const db = getDb();
  const out: RegistroCenti[] = [];
  for (let i = 0; i < alvos.length; i += 90)
    out.push(...(await db.select(COLS_REGISTRO).from(automacaoRegistros).where(and(eq(automacaoRegistros.capacidade, "anexar"), inArray(automacaoRegistros.centiAlvo, alvos.slice(i, i + 90))))));
  return out;
}
