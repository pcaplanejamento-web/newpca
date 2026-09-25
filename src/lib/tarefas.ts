import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import {
  dfdProtocolos,
  dfds,
  grupos,
  orcamentos,
  pcas,
  tarefaAnexos,
  tarefaChecklist,
  tarefaComentarios,
  tarefaEtiquetaLinks,
  tarefaEtiquetas,
  tarefaListas,
  tarefaPessoas,
  tarefaQuadros,
  tarefas,
} from "@/db/schema";
import type { UsuarioSessao } from "./auth";
import { getDb } from "./db";
import { getReparticaoContexto, gruposDoUsuario } from "./grupos";
import { lotesDeIds } from "./reparticoes";
import { listarPessoasDoGrupo } from "./usuarios";
import {
  type EtiquetaTarefa,
  type ListaTarefas,
  ordemEntre,
  ordemEntre as ordemItem,
  type Prioridade,
  PRIORIDADES,
  type TarefaResumo,
  type TipoVinculo,
  ehTipoVinculo,
  type VinculoTarefa,
} from "./tarefas-core";
import { comandosCriarTarefa, comandosMassa, comandosMover, comandosVinculos } from "./tarefas-sql";
import type { AcaoMassaTarefas } from "./tarefas-validation";

/**
 * TAREFAS (migração `0042`) — acesso ao D1 (só escopo de request). O quadro é de UM grupo: vê e edita quem é membro do
 * grupo (o ADM, todos).
 */

export type Quadro = { id: number; grupoId: number; grupoNome: string; nome: string; cor: string; descricao: string | null; arquivado: boolean };
export type QuadroCard = Quadro & { abertas: number; atrasadas: number; concluidas: number };
export type TarefaCompleta = TarefaResumo & { quadroId: number; descricao: string | null };

const COLS_QUADRO = {
  id: tarefaQuadros.id,
  grupoId: tarefaQuadros.grupoId,
  grupoNome: grupos.nome,
  nome: tarefaQuadros.nome,
  cor: tarefaQuadros.cor,
  descricao: tarefaQuadros.descricao,
  arquivado: tarefaQuadros.arquivado,
};

/** Os quadros dos GRUPOS dados (`null` = todos — o ADM sem grupo), com as contagens do card. `hoje` = "AAAA-MM-DD". */
export async function listarQuadros(grupoIds: number[] | null, hoje: string): Promise<QuadroCard[]> {
  if (grupoIds && grupoIds.length === 0) return [];
  const aberta = sql`t.arquivada = 0 AND t.concluida_em IS NULL`;
  return getDb()
    .select({
      ...COLS_QUADRO,
      abertas: sql<number>`(SELECT COUNT(*) FROM tarefas t WHERE t.quadro_id = ${tarefaQuadros.id} AND ${aberta})`,
      atrasadas: sql<number>`(SELECT COUNT(*) FROM tarefas t WHERE t.quadro_id = ${tarefaQuadros.id} AND ${aberta} AND t.prazo < ${hoje})`,
      concluidas: sql<number>`(SELECT COUNT(*) FROM tarefas t WHERE t.quadro_id = ${tarefaQuadros.id} AND t.arquivada = 0 AND t.concluida_em IS NOT NULL)`,
    })
    .from(tarefaQuadros)
    .innerJoin(grupos, eq(grupos.id, tarefaQuadros.grupoId))
    .where(grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds) : undefined)
    .orderBy(tarefaQuadros.arquivado, asc(tarefaQuadros.nome));
}

export async function getQuadro(id: number): Promise<Quadro | null> {
  const [q] = await getDb().select(COLS_QUADRO).from(tarefaQuadros).innerJoin(grupos, eq(grupos.id, tarefaQuadros.grupoId)).where(eq(tarefaQuadros.id, id));
  return q ?? null;
}

/** O quadro, se o usuário pode vê-lo (membro do grupo do quadro — o ADM, qualquer um); senão `null`. */
export async function quadroAcessivel(u: UsuarioSessao, id: number): Promise<Quadro | null> {
  const q = await getQuadro(id);
  if (!q || u.role === "admin") return q;
  return (await gruposDoUsuario(u.id)).some((g) => g.id === q.grupoId) ? q : null;
}

/** A tarefa e o quadro dela, se o usuário pode vê-la; senão `null`. */
export async function tarefaAcessivel(u: UsuarioSessao, id: number): Promise<{ tarefa: TarefaCompleta; quadro: Quadro } | null> {
  const tarefa = await getTarefa(id);
  const quadro = tarefa ? await quadroAcessivel(u, tarefa.quadroId) : null;
  return tarefa && quadro ? { tarefa, quadro } : null;
}

/** Os responsáveis pedidos são PESSOAS DO GRUPO do quadro (as já designadas antes seguem valendo, mesmo fora dele)? */
export async function pessoasValidas(grupoId: number, ids: number[], atuais: number[] = []): Promise<boolean> {
  if (ids.every((i) => atuais.includes(i))) return true;
  const membros = new Set((await listarPessoasDoGrupo(grupoId)).map((p) => p.id));
  return ids.every((i) => membros.has(i) || atuais.includes(i));
}

/** Listas + cartões (resumo, sem descrição) + etiquetas do quadro — consultas de UM parâmetro (o quadro) cada. */
export async function dadosQuadro(quadroId: number): Promise<{ listas: ListaTarefas[]; tarefas: TarefaResumo[]; etiquetas: EtiquetaTarefa[] }> {
  const db = getDb();
  const doQuadro = eq(tarefas.quadroId, quadroId);
  const contar = (tabela: typeof tarefaComentarios | typeof tarefaAnexos) =>
    db
      .select({ tarefaId: tabela.tarefaId, n: sql<number>`COUNT(*)` })
      .from(tabela)
      .innerJoin(tarefas, eq(tarefas.id, tabela.tarefaId))
      .where(doQuadro)
      .groupBy(tabela.tarefaId);
  const [listas, cartoes, pessoas, links, etiquetas, checks, comentarios, anexos] = await Promise.all([
    db
      .select({
        id: tarefaListas.id,
        nome: tarefaListas.nome,
        ordem: tarefaListas.ordem,
        limiteWip: tarefaListas.limiteWip,
        concluida: tarefaListas.concluida,
        arquivada: tarefaListas.arquivada,
      })
      .from(tarefaListas)
      .where(eq(tarefaListas.quadroId, quadroId))
      .orderBy(asc(tarefaListas.ordem), asc(tarefaListas.id)),
    db
      .select({
        id: tarefas.id,
        listaId: tarefas.listaId,
        ticket: tarefas.ticket,
        titulo: tarefas.titulo,
        prioridade: tarefas.prioridade,
        inicio: tarefas.inicio,
        prazo: tarefas.prazo,
        ordem: tarefas.ordem,
        concluidaEm: tarefas.concluidaEm,
        arquivada: tarefas.arquivada,
        criadoEm: tarefas.criadoEm,
        atualizadoEm: tarefas.atualizadoEm,
        estimativaH: tarefas.estimativaH,
        vinculoTipo: tarefas.vinculoTipo,
        vinculoId: tarefas.vinculoId,
      })
      .from(tarefas)
      .where(doQuadro),
    db
      .select({ tarefaId: tarefaPessoas.tarefaId, usuarioId: tarefaPessoas.usuarioId, papel: tarefaPessoas.papel })
      .from(tarefaPessoas)
      .innerJoin(tarefas, eq(tarefas.id, tarefaPessoas.tarefaId))
      .where(doQuadro),
    db
      .select({ tarefaId: tarefaEtiquetaLinks.tarefaId, etiquetaId: tarefaEtiquetaLinks.etiquetaId })
      .from(tarefaEtiquetaLinks)
      .innerJoin(tarefas, eq(tarefas.id, tarefaEtiquetaLinks.tarefaId))
      .where(doQuadro),
    db
      .select({ id: tarefaEtiquetas.id, nome: tarefaEtiquetas.nome, cor: tarefaEtiquetas.cor })
      .from(tarefaEtiquetas)
      .where(eq(tarefaEtiquetas.quadroId, quadroId))
      .orderBy(asc(tarefaEtiquetas.ordem), asc(tarefaEtiquetas.id)),
    db
      .select({
        tarefaId: tarefaChecklist.tarefaId,
        total: sql<number>`COUNT(*)`,
        feitos: sql<number>`COALESCE(SUM(${tarefaChecklist.feito}), 0)`,
      })
      .from(tarefaChecklist)
      .innerJoin(tarefas, eq(tarefas.id, tarefaChecklist.tarefaId))
      .where(doQuadro)
      .groupBy(tarefaChecklist.tarefaId),
    contar(tarefaComentarios),
    contar(tarefaAnexos),
  ]);
  const agrupar = (pares: { tarefaId: number; v: number }[]) => {
    const m = new Map<number, number[]>();
    for (const p of pares) m.set(p.tarefaId, [...(m.get(p.tarefaId) ?? []), p.v]);
    return m;
  };
  const porPessoa = agrupar(pessoas.filter((p) => p.papel === "responsavel").map((p) => ({ tarefaId: p.tarefaId, v: p.usuarioId })));
  const porObservador = agrupar(pessoas.filter((p) => p.papel === "observador").map((p) => ({ tarefaId: p.tarefaId, v: p.usuarioId })));
  const porEtiqueta = agrupar(links.map((l) => ({ tarefaId: l.tarefaId, v: l.etiquetaId })));
  const porCheck = new Map(checks.map((c) => [c.tarefaId, { feitos: Number(c.feitos), total: Number(c.total) }]));
  const porComentario = new Map(comentarios.map((c) => [c.tarefaId, Number(c.n)]));
  const porAnexo = new Map(anexos.map((c) => [c.tarefaId, Number(c.n)]));
  const rotulos = await rotulosVinculos(cartoes.map((t) => vinculoDe(t.vinculoTipo, t.vinculoId)).filter((v): v is VinculoTarefa => !!v));
  return {
    listas,
    etiquetas,
    tarefas: cartoes.map(({ vinculoTipo, vinculoId, ...t }) => {
      const v = vinculoDe(vinculoTipo, vinculoId);
      return {
        ...t,
        prioridade: prioridadeValida(t.prioridade),
        pessoas: porPessoa.get(t.id) ?? [],
        observadores: porObservador.get(t.id) ?? [],
        etiquetas: porEtiqueta.get(t.id) ?? [],
        vinculo: v ? { ...v, rotulo: rotulos.get(`${v.tipo}:${v.id}`) ?? null } : null,
        checklist: porCheck.get(t.id) ?? { feitos: 0, total: 0 },
        comentarios: porComentario.get(t.id) ?? 0,
        anexos: porAnexo.get(t.id) ?? 0,
      };
    }),
  };
}

const vinculoDe = (tipo: string | null, id: number | null): VinculoTarefa | null => (ehTipoVinculo(tipo) && id ? { tipo, id } : null);

/** O nº/nome de cada alvo vinculado (protocolo: nº; DFD: nº; PCA/orçamento: nome) — `tipo:id` → rótulo; o excluído some. */
export async function rotulosVinculos(vinculos: VinculoTarefa[]): Promise<Map<string, string>> {
  const db = getDb();
  const ids = (tipo: TipoVinculo) => [...new Set(vinculos.filter((v) => v.tipo === tipo).map((v) => v.id))];
  const em = async <T extends { id: number; r: string }>(lista: number[], ler: (l: number[]) => Promise<T[]>) =>
    (await Promise.all(lotesDeIds(lista).map(ler))).flat();
  const [ps, ds, pc, oc] = await Promise.all([
    em(ids("protocolo"), (l) => db.select({ id: dfdProtocolos.id, r: dfdProtocolos.numero }).from(dfdProtocolos).where(inArray(dfdProtocolos.id, l))),
    em(ids("dfd"), (l) => db.select({ id: dfds.id, r: dfds.numero }).from(dfds).where(inArray(dfds.id, l))),
    em(ids("pca"), (l) => db.select({ id: pcas.id, r: pcas.nome }).from(pcas).where(inArray(pcas.id, l))),
    em(ids("orcamento"), (l) =>
      db
        .select({ id: orcamentos.id, r: sql<string>`${orcamentos.nome} || ' ' || ${orcamentos.ano}` })
        .from(orcamentos)
        .where(inArray(orcamentos.id, l)),
    ),
  ]);
  const m = new Map<string, string>();
  for (const [tipo, linhas] of [["protocolo", ps], ["dfd", ds], ["pca", pc], ["orcamento", oc]] as const) for (const x of linhas) m.set(`${tipo}:${x.id}`, x.r);
  return m;
}

const prioridadeValida = (p: string): Prioridade => ((PRIORIDADES as readonly string[]).includes(p) ? (p as Prioridade) : "media");

export async function getTarefa(id: number): Promise<TarefaCompleta | null> {
  const db = getDb();
  const [t] = await db.select().from(tarefas).where(eq(tarefas.id, id));
  if (!t) return null;
  const [pessoas, links, checks, com, anx] = await Promise.all([
    db.select({ u: tarefaPessoas.usuarioId, papel: tarefaPessoas.papel }).from(tarefaPessoas).where(eq(tarefaPessoas.tarefaId, id)),
    db.select({ e: tarefaEtiquetaLinks.etiquetaId }).from(tarefaEtiquetaLinks).where(eq(tarefaEtiquetaLinks.tarefaId, id)),
    db.select({ feito: tarefaChecklist.feito }).from(tarefaChecklist).where(eq(tarefaChecklist.tarefaId, id)),
    db.select({ n: sql<number>`COUNT(*)` }).from(tarefaComentarios).where(eq(tarefaComentarios.tarefaId, id)),
    db.select({ n: sql<number>`COUNT(*)` }).from(tarefaAnexos).where(eq(tarefaAnexos.tarefaId, id)),
  ]);
  const v = vinculoDe(t.vinculoTipo, t.vinculoId);
  const rotulo = v ? (await rotulosVinculos([v])).get(`${v.tipo}:${v.id}`) : null;
  return {
    id: t.id,
    quadroId: t.quadroId,
    listaId: t.listaId,
    ticket: t.ticket,
    titulo: t.titulo,
    descricao: t.descricao,
    prioridade: prioridadeValida(t.prioridade),
    inicio: t.inicio,
    prazo: t.prazo,
    ordem: t.ordem,
    concluidaEm: t.concluidaEm,
    arquivada: t.arquivada,
    pessoas: pessoas.filter((p) => p.papel === "responsavel").map((p) => p.u),
    observadores: pessoas.filter((p) => p.papel === "observador").map((p) => p.u),
    etiquetas: links.map((l) => l.e),
    criadoEm: t.criadoEm,
    atualizadoEm: t.atualizadoEm,
    estimativaH: t.estimativaH,
    vinculo: v ? { ...v, rotulo: rotulo ?? null } : null,
    checklist: { feitos: checks.filter((c) => c.feito).length, total: checks.length },
    comentarios: Number(com[0]?.n ?? 0),
    anexos: Number(anx[0]?.n ?? 0),
  };
}

/** As listas com que todo quadro NASCE (a última é a de concluídas). */
const LISTAS_INICIAIS = [
  { nome: "A fazer", concluida: false },
  { nome: "Em andamento", concluida: false },
  { nome: "Concluído", concluida: true },
];

export async function criarQuadro(grupoId: number, d: { nome: string; cor?: string; descricao?: string | null }, usuarioId: number): Promise<number> {
  const db = getDb();
  const [q] = await db
    .insert(tarefaQuadros)
    .values({ grupoId, nome: d.nome, cor: d.cor ?? "#6366f1", descricao: d.descricao ?? null, criadoPor: usuarioId })
    .returning({ id: tarefaQuadros.id });
  await db.insert(tarefaListas).values(LISTAS_INICIAIS.map((l, i) => ({ quadroId: q.id, nome: l.nome, concluida: l.concluida, ordem: i + 1 })));
  return q.id;
}

export async function atualizarQuadro(id: number, d: { nome?: string; cor?: string; descricao?: string | null; arquivado?: boolean }) {
  await getDb()
    .update(tarefaQuadros)
    .set({ ...d, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(tarefaQuadros.id, id));
}

export async function excluirQuadro(id: number) {
  await getDb().delete(tarefaQuadros).where(eq(tarefaQuadros.id, id));
}

export async function getLista(id: number) {
  const [l] = await getDb().select().from(tarefaListas).where(eq(tarefaListas.id, id));
  return l ?? null;
}

export async function criarLista(quadroId: number, d: { nome: string; limiteWip?: number | null; concluida?: boolean }): Promise<number> {
  const [l] = await getDb()
    .insert(tarefaListas)
    .values({
      quadroId,
      nome: d.nome,
      limiteWip: d.limiteWip ?? null,
      concluida: d.concluida ?? false,
      ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_listas WHERE quadro_id = ${quadroId})`,
    })
    .returning({ id: tarefaListas.id });
  return l.id;
}

export async function atualizarLista(id: number, d: { nome?: string; limiteWip?: number | null; concluida?: boolean; arquivada?: boolean }) {
  await getDb().update(tarefaListas).set(d).where(eq(tarefaListas.id, id));
}

/** Quantos cartões (inclusive arquivados) a lista tem — só a vazia é excluída. */
export async function cartoesNaLista(id: number): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`COUNT(*)` }).from(tarefas).where(eq(tarefas.listaId, id));
  return Number(r?.n ?? 0);
}

export async function excluirLista(id: number) {
  await getDb().delete(tarefaListas).where(eq(tarefaListas.id, id));
}

/** Grava a ORDEM das listas (as de fora do quadro são ignoradas). */
export async function ordenarListas(quadroId: number, ids: number[]) {
  const db = getDb();
  const cmds = ids.map((id, i) => db.update(tarefaListas).set({ ordem: i + 1 }).where(and(eq(tarefaListas.id, id), eq(tarefaListas.quadroId, quadroId))));
  if (cmds.length) await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}

export async function criarEtiqueta(quadroId: number, d: { nome: string; cor: string }): Promise<number> {
  const [e] = await getDb()
    .insert(tarefaEtiquetas)
    .values({ quadroId, ...d, ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_etiquetas WHERE quadro_id = ${quadroId})` })
    .returning({ id: tarefaEtiquetas.id });
  return e.id;
}

export async function getEtiqueta(id: number) {
  const [e] = await getDb().select().from(tarefaEtiquetas).where(eq(tarefaEtiquetas.id, id));
  return e ?? null;
}

export async function atualizarEtiqueta(id: number, d: { nome: string; cor: string }) {
  await getDb().update(tarefaEtiquetas).set(d).where(eq(tarefaEtiquetas.id, id));
}

export async function excluirEtiqueta(id: number) {
  await getDb().delete(tarefaEtiquetas).where(eq(tarefaEtiquetas.id, id));
}

/** As etiquetas pedidas que são DO quadro (as de outro quadro saem). */
export async function etiquetasDoQuadro(quadroId: number, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const r = await getDb()
    .select({ id: tarefaEtiquetas.id })
    .from(tarefaEtiquetas)
    .where(and(eq(tarefaEtiquetas.quadroId, quadroId), inArray(tarefaEtiquetas.id, ids)));
  return r.map((x) => x.id);
}

/** CRIA a tarefa (ticket + fim da lista + responsáveis + etiquetas, num lote atômico). */
export async function criarTarefa(d: Parameters<typeof comandosCriarTarefa>[1]): Promise<{ id: number; ticket: number }> {
  const db = getDb();
  const r = await db.batch(comandosCriarTarefa(db, d));
  const [nova] = r[r.length - 1] as { id: number; ticket: number }[];
  return nova;
}

/** Atualiza os campos + (opcional) responsáveis/observadores/etiquetas num lote só. */
export async function atualizarTarefa(
  id: number,
  campos: {
    titulo?: string;
    descricao?: string | null;
    prioridade?: Prioridade;
    inicio?: string | null;
    prazo?: string | null;
    arquivada?: boolean;
    estimativaH?: number | null;
    vinculo?: { tipo: TipoVinculo; id: number } | null;
  },
  vinculos: { pessoas?: number[]; observadores?: number[]; etiquetas?: number[] },
) {
  const db = getDb();
  const { vinculo, ...resto } = campos;
  await db.batch([
    db
      .update(tarefas)
      .set({
        ...resto,
        ...(vinculo !== undefined ? { vinculoTipo: vinculo?.tipo ?? null, vinculoId: vinculo?.id ?? null } : {}),
        atualizadoEm: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(tarefas.id, id)),
    ...comandosVinculos(db, id, vinculos),
  ]);
}

/**
 * MOVE o cartão para `listaId` entre os vizinhos dados (ids da MESMA lista; `null` = ponta). A ordem vem de
 * `ordemEntre`; sem vão, RENUMERA a lista (1, 2, 3…) com o cartão já no lugar. Devolve as ordens gravadas.
 */
export async function moverTarefa(id: number, listaId: number, anteriorId: number | null, proximoId: number | null, concluida: boolean) {
  const db = getDb();
  const lista = await db
    .select({ id: tarefas.id, ordem: tarefas.ordem })
    .from(tarefas)
    .where(and(eq(tarefas.listaId, listaId), eq(tarefas.arquivada, false)))
    .orderBy(asc(tarefas.ordem), asc(tarefas.ticket));
  const outros = lista.filter((t) => t.id !== id);
  const ordemDe = (x: number | null) => (x == null ? null : (outros.find((t) => t.id === x)?.ordem ?? null));
  // Um vizinho que não está (mais) na lista conta como ponta.
  const r = ordemEntre(ordemDe(anteriorId), ordemDe(proximoId));
  let ordens: [number, number][] = [];
  let ordem = r.ordem;
  if (r.renumerar) {
    const pos = anteriorId == null ? 0 : outros.findIndex((t) => t.id === anteriorId) + 1;
    const nova = [...outros.slice(0, pos).map((t) => t.id), id, ...outros.slice(pos).map((t) => t.id)];
    ordens = nova.map((t, i) => [t, i + 1] as [number, number]).filter(([t]) => t !== id);
    ordem = pos + 1;
  }
  await db.batch(comandosMover(db, id, listaId, ordem, concluida, ordens) as [ReturnType<typeof comandosMover>[number], ...ReturnType<typeof comandosMover>]);
  return { ordem, ordens };
}

/** O último cartão (não arquivado) da lista, sem contar `exceto` — mover "para o fim". */
export async function ultimoDaLista(listaId: number, exceto: number): Promise<number | null> {
  const [t] = await getDb()
    .select({ id: tarefas.id })
    .from(tarefas)
    .where(and(eq(tarefas.listaId, listaId), eq(tarefas.arquivada, false), sql`${tarefas.id} <> ${exceto}`))
    .orderBy(sql`${tarefas.ordem} DESC`, sql`${tarefas.ticket} DESC`)
    .limit(1);
  return t?.id ?? null;
}

export async function excluirTarefa(id: number) {
  await getDb().delete(tarefas).where(eq(tarefas.id, id));
}

// ─── Conteúdo do cartão (fase 2): checklist · comentários · anexos ────────────────────────────────────────────

export type ItemChecklist = { id: number; texto: string; feito: boolean; ordem: number };
export type ComentarioTarefa = { id: number; usuarioId: number | null; usuarioNome: string; texto: string; mencoes: number[]; criadoEm: string | null; editadoEm: string | null };
/** O anexo SEM o conteúdo (o arquivo é servido pela rota própria). */
export type AnexoTarefa = { id: number; tipo: "link" | "arquivo"; nome: string; url: string | null; mime: string | null; tamanho: number | null; criadoPor: number | null; criadoEm: string | null };

const lerMencoes = (v: string | null): number[] => {
  try {
    const a = JSON.parse(v ?? "[]");
    return Array.isArray(a) ? a.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
};

/** O CONTEÚDO do cartão (checklist, comentários — mais antigo primeiro — e anexos sem o arquivo). */
export async function conteudoTarefa(id: number): Promise<{ checklist: ItemChecklist[]; comentarios: ComentarioTarefa[]; anexos: AnexoTarefa[] }> {
  const db = getDb();
  const [checklist, comentarios, anexos] = await Promise.all([
    db
      .select({ id: tarefaChecklist.id, texto: tarefaChecklist.texto, feito: tarefaChecklist.feito, ordem: tarefaChecklist.ordem })
      .from(tarefaChecklist)
      .where(eq(tarefaChecklist.tarefaId, id))
      .orderBy(asc(tarefaChecklist.ordem), asc(tarefaChecklist.id)),
    db.select().from(tarefaComentarios).where(eq(tarefaComentarios.tarefaId, id)).orderBy(asc(tarefaComentarios.id)),
    db
      .select({
        id: tarefaAnexos.id,
        tipo: tarefaAnexos.tipo,
        nome: tarefaAnexos.nome,
        url: tarefaAnexos.url,
        mime: tarefaAnexos.mime,
        tamanho: tarefaAnexos.tamanho,
        criadoPor: tarefaAnexos.criadoPor,
        criadoEm: tarefaAnexos.criadoEm,
      })
      .from(tarefaAnexos)
      .where(eq(tarefaAnexos.tarefaId, id))
      .orderBy(desc(tarefaAnexos.id)),
  ]);
  return {
    checklist,
    comentarios: comentarios.map((c) => ({
      id: c.id,
      usuarioId: c.usuarioId,
      usuarioNome: c.usuarioNome,
      texto: c.texto,
      mencoes: lerMencoes(c.mencoes),
      criadoEm: c.criadoEm,
      editadoEm: c.editadoEm,
    })),
    anexos: anexos.map((a) => ({ ...a, tipo: a.tipo === "arquivo" ? "arquivo" : "link" })),
  };
}

export async function getItemChecklist(id: number) {
  const [i] = await getDb().select().from(tarefaChecklist).where(eq(tarefaChecklist.id, id));
  return i ?? null;
}

export async function criarItemChecklist(tarefaId: number, texto: string): Promise<number> {
  const [i] = await getDb()
    .insert(tarefaChecklist)
    .values({ tarefaId, texto, ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefa_checklist WHERE tarefa_id = ${tarefaId})` })
    .returning({ id: tarefaChecklist.id });
  return i.id;
}

/** Edita o item (texto/feito) e, com vizinhos, o REORDENA entre eles (ordem fracionária; sem vão, renumera a lista). */
export async function atualizarItemChecklist(
  item: { id: number; tarefaId: number },
  d: { texto?: string; feito?: boolean; anteriorId?: number | null; proximoId?: number | null },
) {
  const db = getDb();
  let ordem: number | undefined;
  const renumeros: [number, number][] = [];
  if (d.anteriorId !== undefined || d.proximoId !== undefined) {
    const lista = (
      await db.select({ id: tarefaChecklist.id, ordem: tarefaChecklist.ordem }).from(tarefaChecklist).where(eq(tarefaChecklist.tarefaId, item.tarefaId)).orderBy(asc(tarefaChecklist.ordem), asc(tarefaChecklist.id))
    ).filter((x) => x.id !== item.id);
    const de = (x: number | null | undefined) => (x == null ? null : (lista.find((l) => l.id === x)?.ordem ?? null));
    const r = ordemItem(de(d.anteriorId), de(d.proximoId));
    ordem = r.ordem;
    if (r.renumerar) {
      const pos = d.anteriorId == null ? 0 : lista.findIndex((l) => l.id === d.anteriorId) + 1;
      const nova = [...lista.slice(0, pos).map((l) => l.id), item.id, ...lista.slice(pos).map((l) => l.id)];
      ordem = pos + 1;
      nova.forEach((x, i) => {
        if (x !== item.id) renumeros.push([x, i + 1]);
      });
    }
  }
  const set = { ...(d.texto != null ? { texto: d.texto } : {}), ...(d.feito != null ? { feito: d.feito } : {}), ...(ordem != null ? { ordem } : {}) };
  const cmds = [
    ...(Object.keys(set).length ? [db.update(tarefaChecklist).set(set).where(eq(tarefaChecklist.id, item.id))] : []),
    ...renumeros.map(([x, o]) => db.update(tarefaChecklist).set({ ordem: o }).where(eq(tarefaChecklist.id, x))),
  ];
  if (cmds.length) await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}

export async function excluirItemChecklist(id: number) {
  await getDb().delete(tarefaChecklist).where(eq(tarefaChecklist.id, id));
}

export async function getComentario(id: number) {
  const [c] = await getDb().select().from(tarefaComentarios).where(eq(tarefaComentarios.id, id));
  return c ?? null;
}

export async function criarComentario(d: { tarefaId: number; usuarioId: number; usuarioNome: string; texto: string; mencoes: number[] }): Promise<number> {
  const [c] = await getDb()
    .insert(tarefaComentarios)
    .values({ ...d, mencoes: JSON.stringify(d.mencoes) })
    .returning({ id: tarefaComentarios.id });
  return c.id;
}

export async function editarComentario(id: number, texto: string, mencoes: number[]) {
  await getDb()
    .update(tarefaComentarios)
    .set({ texto, mencoes: JSON.stringify(mencoes), editadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(tarefaComentarios.id, id));
}

export async function excluirComentario(id: number) {
  await getDb().delete(tarefaComentarios).where(eq(tarefaComentarios.id, id));
}

/** O anexo COM o conteúdo (a rota que serve o arquivo e a conferência de acesso). */
export async function getAnexo(id: number) {
  const [a] = await getDb().select().from(tarefaAnexos).where(eq(tarefaAnexos.id, id));
  return a ?? null;
}

export async function criarAnexo(d: {
  tarefaId: number;
  tipo: "link" | "arquivo";
  nome: string;
  url?: string | null;
  conteudo?: string | null;
  mime?: string | null;
  tamanho?: number | null;
  criadoPor: number;
}): Promise<number> {
  const [a] = await getDb().insert(tarefaAnexos).values(d).returning({ id: tarefaAnexos.id });
  return a.id;
}

export async function excluirAnexo(id: number) {
  await getDb().delete(tarefaAnexos).where(eq(tarefaAnexos.id, id));
}

// ─── Massa · vínculos ────────────────────────────────────────────────────────────────────────────────────────

/** As tarefas pedidas (id, quadro, ticket, título, lista) — a conferência de acesso da edição em massa. */
export async function tarefasPorIds(ids: number[]) {
  const db = getDb();
  return (
    await Promise.all(
      lotesDeIds(ids).map((l) =>
        db.select({ id: tarefas.id, quadroId: tarefas.quadroId, ticket: tarefas.ticket, titulo: tarefas.titulo, listaId: tarefas.listaId }).from(tarefas).where(inArray(tarefas.id, l)),
      ),
    )
  ).flat();
}

/** Aplica a EDIÇÃO EM MASSA (ids já conferidos) num lote atômico. */
export async function aplicarMassaTarefas(ids: number[], acao: AcaoMassaTarefas, listaConcluida = false) {
  const db = getDb();
  const cmds = comandosMassa(db, ids, acao, listaConcluida);
  if (cmds.length) await db.batch(cmds as [(typeof cmds)[number], ...(typeof cmds)[number][]]);
}

/** Opções para VINCULAR uma tarefa (até 50 por busca): protocolos e DFDs no escopo de unidade do usuário; PCAs e
 * orçamentos (globais). `q` casa nº/Id/assunto (protocolo), nº/planejamento (DFD) ou nome/ano (PCA/orçamento). */
export async function buscarVinculos(u: UsuarioSessao, tipo: TipoVinculo, q: string): Promise<{ id: number; rotulo: string; detalhe: string }[]> {
  const db = getDb();
  const termo = `%${q.trim().replace(/[%_]/g, "")}%`;
  const LIMITE = 50;
  if (tipo === "pca" || tipo === "orcamento") {
    const t = tipo === "pca" ? pcas : orcamentos;
    const linhas = await db
      .select({ id: t.id, nome: t.nome, ano: t.ano })
      .from(t)
      .where(or(like(t.nome, termo), like(sql`CAST(${t.ano} AS TEXT)`, termo)))
      .orderBy(desc(t.id))
      .limit(LIMITE);
    // O MESMO rótulo que `rotulosVinculos` dá ao vínculo gravado (orçamento = nome + ano).
    return linhas.map((l) =>
      tipo === "orcamento" ? { id: l.id, rotulo: `${l.nome} ${l.ano ?? ""}`.trim(), detalhe: "" } : { id: l.id, rotulo: l.nome, detalhe: l.ano ? String(l.ano) : "" },
    );
  }
  const reps = (await getReparticaoContexto(u)).lista.map((r) => r.id);
  const escopo = (col: typeof dfdProtocolos.reparticaoId | typeof dfds.reparticaoId) =>
    u.role === "admin" ? undefined : reps.length ? or(sql`${col} IS NULL`, inArray(col, reps.slice(0, 90))) : sql`${col} IS NULL`;
  if (tipo === "protocolo") {
    const linhas = await db
      .select({ id: dfdProtocolos.id, numero: dfdProtocolos.numero, idExterno: dfdProtocolos.idExterno, assunto: dfdProtocolos.assunto })
      .from(dfdProtocolos)
      .where(and(or(like(dfdProtocolos.numero, termo), like(dfdProtocolos.idExterno, termo), like(dfdProtocolos.assunto, termo)), escopo(dfdProtocolos.reparticaoId)))
      .orderBy(desc(dfdProtocolos.id))
      .limit(LIMITE);
    return linhas.map((l) => ({ id: l.id, rotulo: l.numero, detalhe: [l.idExterno ? `Id ${l.idExterno}` : "", l.assunto ?? ""].filter(Boolean).join(" · ") }));
  }
  const linhas = await db
    .select({ id: dfds.id, numero: dfds.numero, planejamento: dfds.planejamento, objeto: dfds.objeto })
    .from(dfds)
    .where(and(or(like(dfds.numero, termo), like(dfds.planejamento, termo), like(dfds.objeto, termo)), escopo(dfds.reparticaoId)))
    .orderBy(desc(dfds.id))
    .limit(LIMITE);
  return linhas.map((l) => ({ id: l.id, rotulo: `DFD ${l.numero}`, detalhe: [l.planejamento ? `Planej. ${l.planejamento}` : "", l.objeto ?? ""].filter(Boolean).join(" · ") }));
}

/** As tarefas LIGADAS a um alvo (protocolo/DFD/…) nos quadros que o usuário vê — o botão "Tarefas" dos banners da Mesa. */
export async function tarefasDoVinculo(u: UsuarioSessao, tipo: TipoVinculo, id: number) {
  const db = getDb();
  const grupoIds = u.role === "admin" ? null : (await gruposDoUsuario(u.id)).map((g) => g.id);
  if (grupoIds && !grupoIds.length) return [];
  return db
    .select({
      id: tarefas.id,
      ticket: tarefas.ticket,
      titulo: tarefas.titulo,
      prazo: tarefas.prazo,
      concluidaEm: tarefas.concluidaEm,
      arquivada: tarefas.arquivada,
      quadroId: tarefas.quadroId,
      quadroNome: tarefaQuadros.nome,
      quadroCor: tarefaQuadros.cor,
      listaNome: tarefaListas.nome,
    })
    .from(tarefas)
    .innerJoin(tarefaQuadros, eq(tarefaQuadros.id, tarefas.quadroId))
    .innerJoin(tarefaListas, eq(tarefaListas.id, tarefas.listaId))
    .where(and(eq(tarefas.vinculoTipo, tipo), eq(tarefas.vinculoId, id), grupoIds ? inArray(tarefaQuadros.grupoId, grupoIds.slice(0, 90)) : undefined))
    .orderBy(tarefas.arquivada, desc(tarefas.id))
    .limit(200);
}

/** O alvo do vínculo existe e o usuário o vê (protocolo/DFD no escopo de unidade dele; PCA/orçamento, globais). */
export async function vinculoAcessivel(u: UsuarioSessao, v: { tipo: TipoVinculo; id: number }): Promise<boolean> {
  const db = getDb();
  if (v.tipo === "pca" || v.tipo === "orcamento") {
    const t = v.tipo === "pca" ? pcas : orcamentos;
    return (await db.select({ id: t.id }).from(t).where(eq(t.id, v.id))).length > 0;
  }
  const t = v.tipo === "protocolo" ? dfdProtocolos : dfds;
  const [r] = await db.select({ rep: t.reparticaoId }).from(t).where(eq(t.id, v.id));
  if (!r) return false;
  if (u.role === "admin" || r.rep == null) return true;
  return (await getReparticaoContexto(u)).lista.some((x) => x.id === r.rep);
}
