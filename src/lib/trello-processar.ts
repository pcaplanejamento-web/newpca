import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { tarefaComentarios, tarefaListas, tarefas, trelloFila, trelloQuadros, trelloVinculos } from "@/db/schema";
import { registrarAuditoria } from "./auditoria";
import { getDb } from "./db";
import { type BlocoTarefa, hrefVinculo, PALETA_ETIQUETAS, type TarefaResumo } from "./tarefas-core";
import {
  atualizarItemChecklist,
  atualizarTarefa,
  criarChecklist,
  criarItemChecklist,
  excluirChecklist,
  excluirItemChecklist,
  getLista,
  getTarefa,
  itensChecklist,
  listarChecklists,
  moverTarefa,
  renomearChecklist,
  type TarefaCompleta,
  ultimoDaLista,
} from "./tarefas";
import { type ClienteTrello, ErroTrello } from "./trello-api";
import { trelloDaConfig } from "./trello-config";
import { enfileirar } from "./trello-fila";
import { comandoConcluir, comandoReivindicar, comandoVinculo } from "./trello-sql";
import { pessoaDoMembro } from "./trello-sync";
import {
  type CampoCartao,
  type CamposBoard,
  type CartaoApi,
  corpoValorCampo,
  dataDoTrello,
  dataParaTrello,
  lerCamposBoard,
  lerRetratoCartao,
  type MapaQuadro,
  patchDoCartao,
  ROTULO_CAMPO_CARTAO,
  reconciliar,
  type RetratoCartao,
  separarNotas,
  type ValoresCartao,
  type ValoresItem,
  valoresDaTarefa,
  valoresDoCartao,
} from "./trello-sync-core";
import { type Ligacao, ligacaoDoQuadro, mapaDoQuadro, tarefaParaCartao } from "./trello-vincular";

/**
 * O PROCESSADOR da sincronização com o Trello — o MESMO nos dois sentidos (é por ESTADO): cada item lê a tarefa daqui, o
 * cartão de lá e o RETRATO da última sincronização (`reconciliar`): o que mudou só de um lado vai para o outro; nos dois,
 * vence o mais recente e o valor perdido vai para o histórico (auditoria, origem `trello`). Conteúdo do cartão (checklists,
 * itens, comentários, anexos) segue a mesma regra por item. Tudo o que é gravado aqui tem origem `trello` — não volta para
 * a fila (sem eco); o eco do lado do Trello é cortado no webhook (as ações da conta institucional).
 */

/** Chamadas ao Trello por passada (cabe no limite de subrequisições do Worker). */
const ORCAMENTO_PASSADA = 30;
const MAX_TENTATIVAS = 6;

/** Um cliente que CONTA as chamadas (o orçamento da passada). */
function contado(c: ClienteTrello) {
  let n = 0;
  const conta =
    <A extends unknown[], R>(f: (...a: A) => Promise<R>) =>
    (...a: A) => {
      n++;
      return f(...a);
    };
  return { cliente: { ...c, get: conta(c.get), post: conta(c.post), put: conta(c.put), del: conta(c.del) } as ClienteTrello, usadas: () => n };
}

/** Contexto de uma passada num quadro ligado. */
type Ctx = { cliente: ClienteTrello; lig: Ligacao; campos: CamposBoard; mapa: MapaQuadro; contaId: string };

/** Adiar sem erro (o quadro está pausado/ainda sendo criado). */
class Adiar extends Error {}

/**
 * PROCESSA a fila: até `limite` itens (de um quadro, ou de todos), cada um REIVINDICADO atomicamente (dois processamentos
 * nunca pegam o mesmo item). Sucesso = sai da fila (se nada novo chegou no meio); falha = tenta de novo com espera crescente
 * (429/5xx/rede: a espera do Trello) e, depois de `MAX_TENTATIVAS`, fica com o erro à vista.
 */
export async function processarFila(limite = 5, quadroId?: number): Promise<{ feitos: number; falhas: number }> {
  const t = await trelloDaConfig();
  if ("erro" in t) return { feitos: 0, falhas: 0 };
  const { cliente, usadas } = contado(t.cliente);
  const db = getDb();
  let feitos = 0;
  let falhas = 0;
  for (let i = 0; i < limite && usadas() < ORCAMENTO_PASSADA; i++) {
    const [item] = await comandoReivindicar(db, quadroId);
    if (!item) break;
    try {
      const lig = await ligacaoDoQuadro(item.quadroId);
      if (lig) {
        if (lig.estado !== "ativo" && lig.estado !== "erro") throw new Adiar();
        const campos = lerCamposBoard(lig.campos);
        const ctx: Ctx = { cliente, lig, campos, mapa: await mapaDoQuadro(lig.quadroId, campos), contaId: t.membroId };
        await processarItem(ctx, item.direcao, item.tipo, item.alvo);
        await db.update(trelloQuadros).set({ estado: "ativo", ultimoErro: null, sincronizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(trelloQuadros.quadroId, lig.quadroId));
      }
      await comandoConcluir(db, item.id, item.criadoEm);
      feitos++;
    } catch (e) {
      if (e instanceof Adiar) {
        await db.update(trelloFila).set({ proximaEm: sql`datetime('now', '+60 seconds')`, tentativas: 0 }).where(eq(trelloFila.id, item.id));
        continue;
      }
      falhas++;
      const tr = e instanceof ErroTrello && e.transitorio;
      const espera = e instanceof ErroTrello && e.esperarS ? e.esperarS : Math.min(3600, 60 * 2 ** Math.max(0, item.tentativas));
      const esgotou = item.tentativas + 1 >= MAX_TENTATIVAS && !tr;
      const msg = (e as Error).message.slice(0, 500);
      await db
        .update(trelloFila)
        .set({ erro: msg, proximaEm: sql`datetime('now', ${`+${esgotou ? 86400 : espera} seconds`})` })
        .where(eq(trelloFila.id, item.id));
      await db.update(trelloQuadros).set({ ultimoErro: msg }).where(eq(trelloQuadros.quadroId, item.quadroId));
      if (e instanceof ErroTrello && e.status === 429) break;
    }
  }
  return { feitos, falhas };
}

async function processarItem(ctx: Ctx, direcao: string, tipo: string, alvo: string) {
  if (tipo === "tarefa") return direcao === "saida" ? sincronizarCartao(ctx, { tarefaId: Number(alvo) }) : sincronizarCartao(ctx, { cardId: alvo });
  if (tipo === "lista") return sincronizarLista(ctx, direcao === "saida" ? { localId: Number(alvo) } : { trelloId: alvo });
  if (tipo === "etiqueta") return sincronizarEtiqueta(ctx, direcao === "saida" ? { localId: Number(alvo) } : { trelloId: alvo });
  if (tipo === "quadro") return sincronizarBoard(ctx);
  if (tipo === "campo") return; // campos novos/renomeados entram pela "Continuar" da criação (fase 5 — reconciliação)
}

// ─── Vínculos ──────────────────────────────────────────────────────────────────────────────────────────────

async function vinculo(tipo: string, por: { localId?: number; trelloId?: string }) {
  const [v] = await getDb()
    .select()
    .from(trelloVinculos)
    .where(and(eq(trelloVinculos.tipo, tipo), por.localId != null ? eq(trelloVinculos.localId, por.localId) : eq(trelloVinculos.trelloId, por.trelloId ?? "")));
  return v ?? null;
}
async function gravarVinculo(quadroId: number, tipo: string, localId: number, trelloId: string, retrato: unknown) {
  await comandoVinculo(getDb(), quadroId, tipo, localId, trelloId, retrato == null ? null : JSON.stringify(retrato));
}
async function tirarVinculo(tipo: string, localId: number) {
  await getDb().delete(trelloVinculos).where(and(eq(trelloVinculos.tipo, tipo), eq(trelloVinculos.localId, localId)));
}
const naoAchou = (e: unknown) => e instanceof ErroTrello && (e.status === 404 || e.status === 400);

// ─── Registro no histórico (origem `trello`) ───────────────────────────────────────────────────────────────

const ATOR_TRELLO = { id: null, nome: "Trello", email: null };
async function historico(tarefaId: number, resumo: string, antes?: unknown, depois?: unknown) {
  await registrarAuditoria({ usuario: ATOR_TRELLO as never, acao: "editar", entidade: "tarefa", entidadeId: tarefaId, origem: "trello", resumo, antes, depois });
}

// ─── CARTÃO ⇄ TAREFA ───────────────────────────────────────────────────────────────────────────────────────

const CAMPOS_API = "name,desc,idList,idBoard,start,due,dueComplete,dueReminder,closed,isTemplate,cover,idLabels,idMembers,dateLastActivity,shortUrl";
type CartaoLido = CartaoApi & { idBoard: string; shortUrl: string };

async function buscarCartao(c: ClienteTrello, id: string): Promise<CartaoLido | null> {
  try {
    return await c.get<CartaoLido>(`/cards/${id}`, { fields: CAMPOS_API, customFieldItems: true });
  } catch (e) {
    if (naoAchou(e)) return null;
    throw e;
  }
}

/** Os blocos de NOTA e LINK da tarefa (a descrição do cartão leva as notas; os links viram anexos). */
function notasELinks(t: TarefaCompleta) {
  const bs = t.blocos ?? [];
  return {
    notas: bs.flatMap((b) => (b.tipo === "nota" && b.texto.trim() ? [b.texto] : [])),
    links: bs.flatMap((b) => (b.tipo === "link" && b.url ? [{ url: b.url, name: b.titulo || b.url }] : [])),
  };
}

/** Os ANEXOS que a tarefa pede no cartão: os links + os vínculos (tarefa = o link do outro cartão; o resto = o do sistema). */
async function anexosDaTarefa(ctx: Ctx, t: TarefaCompleta): Promise<{ url: string; name: string }[]> {
  const out = [...notasELinks(t).links];
  for (const v of t.vinculos) {
    if (v.tipo === "tarefa") {
      const outro = await vinculo("tarefa", { localId: v.id });
      const url = lerRetratoCartao(outro?.retrato)?.url ?? (outro?.retrato ? (JSON.parse(outro.retrato) as { url?: string }).url : null);
      if (url) out.push({ url, name: v.rotulo ?? "Tarefa" });
    } else if (ctx.campos.origem) out.push({ url: `${ctx.campos.origem}${hrefVinculo(v)}`, name: v.rotulo ?? v.tipo });
  }
  return out;
}

/** O corpo do PUT do cartão para os campos pedidos (os que têm atualização simples). */
function corpoCartao(v: ValoresCartao, campos: CampoCartao[]) {
  const c: Record<string, string | number | boolean | null> = {};
  for (const k of campos) {
    if (k === "idLabels" || k === "idMembers") c[k] = v[k].join(",");
    else if (k === "dueReminder") c[k] = v.dueReminder ?? -1;
    else if (k !== "cover" && k !== "campos") c[k] = v[k] as string | number | boolean | null;
  }
  // O Trello limpa data com "" (null some da query).
  for (const k of ["start", "due"] as const) if (k in c && c[k] == null) c[k] = "";
  if ("idList" in c) c.pos = "bottom";
  return c;
}

/** O tipo (na API) de um campo do board. */
function tipoCampo(ctx: Ctx, cf: string): string {
  if (ctx.campos.opcoes[cf]) return "list";
  if (cf === ctx.campos.estimativa) return "number";
  return ctx.campos.tipos?.[cf] ?? "text";
}

/** Grava no TRELLO os campos que venceram aqui. */
async function empurrar(ctx: Ctx, cardId: string, local: ValoresCartao, retrato: ValoresCartao | null, campos: CampoCartao[]) {
  const corpo = corpoCartao(local, campos);
  if (Object.keys(corpo).length) await ctx.cliente.put(`/cards/${cardId}`, corpo);
  if (campos.includes("cover")) await ctx.cliente.put(`/cards/${cardId}`, undefined, { cover: local.cover ? { color: local.cover, size: "normal" } : { color: null } });
  if (campos.includes("campos")) {
    const chaves = new Set([...Object.keys(local.campos), ...Object.keys(retrato?.campos ?? {})]);
    for (const cf of chaves) {
      const novo = local.campos[cf] ?? null;
      if (novo === (retrato?.campos[cf] ?? null)) continue;
      await ctx.cliente.put(`/cards/${cardId}/customField/${cf}/item`, undefined, corpoValorCampo(tipoCampo(ctx, cf), novo, ctx.campos.opcoes[cf]));
    }
  }
}

/** Grava AQUI os campos que venceram lá. */
async function trazer(ctx: Ctx, t: TarefaCompleta, trello: ValoresCartao, campos: CampoCartao[]) {
  const p = patchDoCartao(campos, trello, ctx.mapa, { pessoas: t.pessoas, etiquetas: t.etiquetas }, PALETA_ETIQUETAS);
  const { notas, listaId, template, etiquetas, pessoas, campos: valores, titulo, ...resto } = p;
  let blocos: BlocoTarefa[] | undefined;
  if (notas) {
    const atuais = t.blocos ?? [];
    const fila = [...notas];
    blocos = atuais.flatMap<BlocoTarefa>((b) => (b.tipo !== "nota" ? [b] : fila.length ? [{ ...b, texto: fila.shift() as string }] : []));
    for (const n of fila) blocos.push({ id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, tipo: "nota", texto: n });
  }
  const valoresNovos = valores ? Object.entries(valores).map(([id, v]) => ({ campoId: Number(id), valor: v })) : [];
  await atualizarTarefa(
    t.id,
    { ...resto, ...(titulo !== undefined ? { titulo, tituloManual: true } : {}), ...(blocos ? { blocos } : {}) },
    { ...(pessoas ? { pessoas } : {}), ...(etiquetas ? { etiquetas } : {}) },
    valoresNovos,
  );
  if (template !== undefined) await getDb().update(tarefas).set({ template }).where(eq(tarefas.id, t.id));
  if (listaId != null && listaId !== t.listaId) {
    const l = await getLista(listaId);
    if (l && l.quadroId === t.quadroId) await moverTarefa(t.id, listaId, await ultimoDaLista(listaId, t.id), null, l.concluida);
  }
}

/** A tarefa daqui nos valores do cartão. */
function valoresLocais(ctx: Ctx, t: TarefaCompleta) {
  return valoresDaTarefa(tarefaParaCartao(t as TarefaResumo, { descricao: t.descricao, notas: notasELinks(t).notas }), ctx.mapa, PALETA_ETIQUETAS);
}

/**
 * SINCRONIZA uma tarefa ⇄ um cartão. Casos: criada aqui (cria o cartão), criada lá (cria a tarefa), excluída aqui (exclui o
 * cartão), excluída/fora do board lá (ARQUIVA a tarefa — nada daqui é apagado por uma exclusão de lá), movida para outro
 * quadro (sai deste board) e, com os dois, a reconciliação campo a campo + o conteúdo.
 */
async function sincronizarCartao(ctx: Ctx, alvo: { tarefaId?: number; cardId?: string }) {
  const v = alvo.tarefaId != null ? await vinculo("tarefa", { localId: alvo.tarefaId }) : await vinculo("tarefa", { trelloId: alvo.cardId });
  const tarefaId = alvo.tarefaId ?? v?.localId ?? null;
  const cardId = alvo.cardId ?? v?.trelloId ?? null;
  const local = tarefaId != null ? await getTarefa(tarefaId) : null;
  const card = cardId ? await buscarCartao(ctx.cliente, cardId) : null;
  const q = ctx.lig.quadroId;
  // Movida AQUI para outro quadro: sai deste board (o outro quadro, se ligado, a recebe).
  if (local && local.quadroId !== q) {
    if (card) await ctx.cliente.del(`/cards/${card.id}`).catch((e) => (naoAchou(e) ? null : Promise.reject(e)));
    if (v) await tirarVinculo("tarefa", v.localId);
    const [outro] = await getDb().select({ q: trelloQuadros.quadroId }).from(trelloQuadros).where(eq(trelloQuadros.quadroId, local.quadroId));
    if (outro) await enfileirar(outro.q, "saida", "tarefa", String(local.id));
    return;
  }
  if (!v) {
    if (local) return criarCartao(ctx, local);
    if (card && card.idBoard === ctx.lig.boardId) return criarTarefaDoCartao(ctx, card);
    return;
  }
  if (!local) {
    // Excluída aqui → exclui o cartão.
    if (card) await ctx.cliente.del(`/cards/${card.id}`).catch((e) => (naoAchou(e) ? null : Promise.reject(e)));
    await tirarVinculo("tarefa", v.localId);
    return;
  }
  if (!card || card.idBoard !== ctx.lig.boardId) {
    // Excluído (ou levado a outro board) no Trello → ARQUIVA aqui (nada se perde).
    if (!local.arquivada) {
      await atualizarTarefa(local.id, { arquivada: true }, {});
      await historico(local.id, "Arquivada: o cartão foi excluído ou saiu do quadro no Trello");
    }
    await tirarVinculo("tarefa", local.id);
    return;
  }
  const antes = lerRetratoCartao(v.retrato);
  const valLocal = valoresLocais(ctx, local);
  const valTrello = valoresDoCartao(card, ctx.mapa);
  const r = reconciliar(antes?.v ?? null, valLocal, valTrello, local.atualizadoEm ? `${local.atualizadoEm.replace(" ", "T")}Z` : null, card.dateLastActivity ?? null);
  if (r.paraTrello.length) await empurrar(ctx, card.id, valLocal, antes?.v ?? null, r.paraTrello);
  if (r.paraLocal.length) {
    await trazer(ctx, local, valTrello, r.paraLocal);
    await historico(local.id, `Atualizada pelo Trello: ${r.paraLocal.map((k) => ROTULO_CAMPO_CARTAO[k]).join(", ")}`);
  }
  for (const d of r.descartados)
    await historico(
      local.id,
      `Conflito com o Trello — ${ROTULO_CAMPO_CARTAO[d.campo]}: ficou a alteração mais recente (${d.lado === "pca" ? "do Trello" : "daqui"}); a outra foi descartada`,
      { [d.campo]: d.valor },
      { [d.campo]: d.lado === "pca" ? valTrello[d.campo] : valLocal[d.campo] },
    );
  const anexos = await sincronizarConteudo(ctx, local, card, antes?.anexos ?? []);
  await gravarVinculo(q, "tarefa", local.id, card.id, { v: r.retrato, url: card.shortUrl, anexos } satisfies RetratoCartao);
}

/** Cria o cartão da tarefa (lista ligada; sem ela, espera a lista). */
async function criarCartao(ctx: Ctx, t: TarefaCompleta) {
  const idList = ctx.mapa.listas.get(t.listaId);
  if (!idList) {
    await enfileirar(ctx.lig.quadroId, "saida", "lista", String(t.listaId));
    throw new ErroTrello("A lista da tarefa ainda não está no Trello — criando a lista primeiro.", 503, 5);
  }
  const val = valoresLocais(ctx, t);
  const r = await ctx.cliente.post<{ id: string; shortUrl: string }>("/cards", { idList, name: val.name, pos: "bottom" });
  await gravarVinculo(ctx.lig.quadroId, "tarefa", t.id, r.id, { pendente: true, url: r.shortUrl });
  await empurrar(ctx, r.id, val, null, ["desc", "start", "due", "dueComplete", "dueReminder", "closed", "isTemplate", "cover", "idLabels", "idMembers", "campos"]);
  const anexos = await sincronizarConteudo(ctx, t, { ...(r as unknown as CartaoLido), id: r.id }, []);
  await gravarVinculo(ctx.lig.quadroId, "tarefa", t.id, r.id, { v: val, url: r.shortUrl, anexos } satisfies RetratoCartao);
}

/** Cria a tarefa de um cartão novo do Trello (na lista ligada; o conteúdo vem na sincronização do conteúdo). */
async function criarTarefaDoCartao(ctx: Ctx, card: CartaoLido) {
  const listaId = [...ctx.mapa.listas].find(([, id]) => id === card.idList)?.[0];
  if (listaId == null) {
    await enfileirar(ctx.lig.quadroId, "entrada", "lista", card.idList);
    throw new ErroTrello("A lista do cartão ainda não está aqui — trazendo a lista primeiro.", 503, 5);
  }
  const { criarTarefa } = await import("./tarefas");
  const valTrello = valoresDoCartao(card, ctx.mapa);
  const nova = await criarTarefa({
    quadroId: ctx.lig.quadroId,
    listaId,
    titulo: card.name.trim().slice(0, 200) || "Sem título",
    descricao: null,
    prioridade: "media",
    inicio: null,
    prazo: null,
    concluida: false,
    criadoPor: (ctx.lig.criadoPor ?? null) as number,
    pessoas: [],
    etiquetas: [],
  });
  const t = await getTarefa(nova.id);
  if (!t) return;
  await trazer(ctx, t, valTrello, ["desc", "start", "due", "dueComplete", "dueReminder", "closed", "isTemplate", "cover", "idLabels", "idMembers", "campos"]);
  await historico(t.id, "Criada pelo Trello");
  const atual = (await getTarefa(t.id)) as TarefaCompleta;
  const anexos = await sincronizarConteudo(ctx, atual, card, []);
  await gravarVinculo(ctx.lig.quadroId, "tarefa", t.id, card.id, { v: valTrello, url: card.shortUrl, anexos } satisfies RetratoCartao);
}

// ─── CONTEÚDO: checklists, itens, comentários e anexos ─────────────────────────────────────────────────────

type ChecklistApi = { id: string; name: string; checkItems: { id: string; name: string; state: "complete" | "incomplete"; due: string | null; idMember: string | null }[] };
type ComentarioApi = { id: string; date: string; data: { text: string }; idMemberCreator: string; memberCreator?: { fullName?: string } };
type AnexoApi = { id: string; url: string; name: string; isUpload: boolean };

/** Sincroniza o conteúdo do cartão; devolve os anexos (URLs) que ficaram — o retrato dos anexos. */
async function sincronizarConteudo(ctx: Ctx, t: TarefaCompleta, card: { id: string }, anexosAntes: string[]): Promise<string[]> {
  const c = ctx.cliente;
  const q = ctx.lig.quadroId;
  // CHECKLISTS e ITENS.
  const [cls, itens, lados] = await Promise.all([listarChecklists(t.id), itensChecklist(t.id), c.get<ChecklistApi[]>(`/cards/${card.id}/checklists`)]);
  const vs = await getDb()
    .select()
    .from(trelloVinculos)
    .where(and(eq(trelloVinculos.quadroId, q), inArray(trelloVinculos.tipo, ["checklist", "item", "comentario"])));
  const vPor = (tipo: string) => new Map(vs.filter((x) => x.tipo === tipo).map((x) => [x.localId, x]));
  const vTrello = (tipo: string) => new Map(vs.filter((x) => x.tipo === tipo).map((x) => [x.trelloId, x]));
  const vCl = vPor("checklist");
  const vClT = vTrello("checklist");
  const clLa = new Map(lados.map((x) => [x.id, x]));
  const localPorTrelloCl = new Map<string, number>();
  for (const cl of cls) {
    const vc = vCl.get(cl.id);
    if (!vc) {
      const r = await c.post<{ id: string }>("/checklists", { idCard: card.id, name: cl.nome });
      await gravarVinculo(q, "checklist", cl.id, r.id, { name: cl.nome });
      localPorTrelloCl.set(r.id, cl.id);
      clLa.set(r.id, { id: r.id, name: cl.nome, checkItems: [] });
      continue;
    }
    const la = clLa.get(vc.trelloId);
    if (!la) {
      await excluirChecklist(cl.id);
      await tirarVinculo("checklist", cl.id);
      await historico(t.id, `Checklist "${cl.nome}" excluído no Trello`);
      continue;
    }
    localPorTrelloCl.set(la.id, cl.id);
    const base = (JSON.parse(vc.retrato ?? "{}") as { name?: string }).name;
    if (cl.nome !== base && la.name === base) await c.put(`/checklists/${la.id}`, { name: cl.nome });
    else if (la.name !== base && cl.nome === base) await renomearChecklist(cl.id, la.name.slice(0, 80));
    await gravarVinculo(q, "checklist", cl.id, la.id, { name: cl.nome !== base && la.name === base ? cl.nome : la.name });
  }
  // Checklists excluídos aqui → exclui lá; novos lá → cria aqui.
  for (const [trelloId, vc] of vClT) if (!cls.some((x) => x.id === vc.localId) && clLa.has(trelloId) && vc.quadroId === q && lados.some((l) => l.id === trelloId)) {
    await c.del(`/checklists/${trelloId}`).catch((e) => (naoAchou(e) ? null : Promise.reject(e)));
    await tirarVinculo("checklist", vc.localId);
    clLa.delete(trelloId);
  }
  for (const la of lados)
    if (!vClT.has(la.id) && !localPorTrelloCl.has(la.id)) {
      const id = await criarChecklist(t.id, la.name.slice(0, 80) || "Checklist");
      await gravarVinculo(q, "checklist", id, la.id, { name: la.name });
      localPorTrelloCl.set(la.id, id);
    }
  // Itens.
  const vIt = vPor("item");
  const vItT = vTrello("item");
  const membro = (u: number | null) => (u != null ? (ctx.mapa.membros.get(u) ?? null) : null);
  const valItem = (i: (typeof itens)[number]): ValoresItem => ({ name: i.texto, state: i.feito ? "complete" : "incomplete", due: dataParaTrello(i.prazo), idMember: membro(i.responsavelId) });
  const itensLa = new Map(lados.flatMap((cl) => cl.checkItems.map((it) => [it.id, { ...it, idChecklist: cl.id }] as const)));
  for (const i of itens) {
    const vi = vIt.get(i.id);
    const clTrello = [...localPorTrelloCl].find(([, l]) => l === i.checklistId)?.[0];
    if (!clTrello) continue;
    const meu = valItem(i);
    if (!vi) {
      const r = await c.post<{ id: string }>(`/checklists/${clTrello}/checkItems`, { name: meu.name, checked: meu.state === "complete", pos: "bottom", due: meu.due, idMember: meu.idMember });
      await gravarVinculo(q, "item", i.id, r.id, meu);
      continue;
    }
    const la = itensLa.get(vi.trelloId);
    if (!la) {
      await excluirItemChecklist(i.id);
      await tirarVinculo("item", i.id);
      continue;
    }
    const base = JSON.parse(vi.retrato ?? "null") as ValoresItem | null;
    const deLa: ValoresItem = { name: la.name, state: la.state, due: la.due ? new Date(la.due).toISOString() : null, idMember: la.idMember ?? null };
    const mudouAqui = !base || JSON.stringify(meu) !== JSON.stringify(base);
    const mudouLa = !base || JSON.stringify(deLa) !== JSON.stringify(base);
    if (mudouAqui && JSON.stringify(meu) !== JSON.stringify(deLa)) {
      await c.put(`/cards/${card.id}/checkItem/${la.id}`, { name: meu.name, state: meu.state, due: meu.due ?? "", idMember: meu.idMember ?? "" });
      await gravarVinculo(q, "item", i.id, la.id, meu);
    } else if (mudouLa && !mudouAqui) {
      const inv = [...ctx.mapa.membros].find(([, m]) => m === deLa.idMember)?.[0] ?? null;
      await atualizarItemChecklist(
        { id: i.id, tarefaId: t.id, checklistId: i.checklistId },
        { texto: deLa.name.slice(0, 300), feito: deLa.state === "complete", prazo: dataDoTrello(deLa.due)?.data ?? null, responsavelId: deLa.idMember ? inv : i.responsavelId },
      );
      await gravarVinculo(q, "item", i.id, la.id, deLa);
    }
  }
  for (const [trelloId, vi] of vItT) if (!itens.some((x) => x.id === vi.localId) && itensLa.has(trelloId)) {
    const la = itensLa.get(trelloId);
    if (la) await c.del(`/checklists/${la.idChecklist}/checkItems/${trelloId}`).catch((e) => (naoAchou(e) ? null : Promise.reject(e)));
    await tirarVinculo("item", vi.localId);
  }
  for (const la of itensLa.values())
    if (!vItT.has(la.id)) {
      const clLocal = localPorTrelloCl.get(la.idChecklist);
      if (clLocal == null) continue;
      const novo = await criarItemChecklist(t.id, la.name.slice(0, 300) || "Item", clLocal);
      if (!novo) continue;
      const inv = [...ctx.mapa.membros].find(([, m]) => m === la.idMember)?.[0] ?? null;
      if (la.state === "complete" || la.due || inv) await atualizarItemChecklist({ id: novo.id, tarefaId: t.id, checklistId: clLocal }, { feito: la.state === "complete", prazo: dataDoTrello(la.due)?.data ?? null, responsavelId: inv });
      await gravarVinculo(q, "item", novo.id, la.id, { name: la.name, state: la.state, due: la.due ? new Date(la.due).toISOString() : null, idMember: la.idMember ?? null });
    }
  // COMENTÁRIOS: os daqui sem vínculo vão (com o nome); os de lá sem vínculo vêm (quem escreveu, pela ligação).
  const vCo = vPor("comentario");
  const vCoT = vTrello("comentario");
  const comentarios = await getDb().select().from(tarefaComentarios).where(eq(tarefaComentarios.tarefaId, t.id)).orderBy(asc(tarefaComentarios.id));
  for (const co of comentarios)
    if (!vCo.has(co.id)) {
      const r = await c.post<{ id: string }>(`/cards/${card.id}/actions/comments`, { text: `**${co.usuarioNome ?? "PCA"} (PCA):** ${co.texto}`.slice(0, 16384) });
      await gravarVinculo(q, "comentario", co.id, r.id, null);
      vCoT.set(r.id, { id: 0, quadroId: q, tipo: "comentario", localId: co.id, trelloId: r.id, retrato: null, sincronizadoEm: null });
    }
  const acoes = await c.get<ComentarioApi[]>(`/cards/${card.id}/actions`, { filter: "commentCard", limit: 50 });
  for (const a of acoes) {
    if (vCoT.has(a.id)) continue;
    const autor = await pessoaDoMembro(a.idMemberCreator);
    const [novo] = await getDb()
      .insert(tarefaComentarios)
      .values({ tarefaId: t.id, usuarioId: autor, usuarioNome: `${a.memberCreator?.fullName ?? "Trello"} (Trello)`.slice(0, 120), texto: a.data.text.slice(0, 5000), criadoEm: a.date.replace("T", " ").slice(0, 19) })
      .returning({ id: tarefaComentarios.id });
    await gravarVinculo(q, "comentario", novo.id, a.id, null);
  }
  // ANEXOS (URL): os que a tarefa pede × os do cartão, pelo retrato.
  const querAqui = await anexosDaTarefa(ctx, t);
  const la = (await c.get<AnexoApi[]>(`/cards/${card.id}/attachments`, { fields: "id,url,name,isUpload" })).filter((x) => !x.isUpload);
  const urlsLa = new Set(la.map((x) => x.url));
  const urlsAqui = new Set(querAqui.map((x) => x.url));
  const antes = new Set(anexosAntes);
  for (const a of querAqui) if (!urlsLa.has(a.url) && !antes.has(a.url)) await c.post(`/cards/${card.id}/attachments`, { url: a.url, name: a.name.slice(0, 256) });
  for (const a of la) if (antes.has(a.url) && !urlsAqui.has(a.url)) await c.del(`/cards/${card.id}/attachments/${a.id}`).catch((e) => (naoAchou(e) ? null : Promise.reject(e)));
  // Anexo NOVO lá → bloco Link aqui (o de outro cartão ligado → vínculo entre tarefas).
  const novosLa = la.filter((a) => !antes.has(a.url) && !urlsAqui.has(a.url));
  if (novosLa.length) {
    const blocos = [...(t.blocos ?? [])];
    for (const a of novosLa) blocos.push({ id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, tipo: "link", url: a.url, titulo: a.name.slice(0, 200) });
    await atualizarTarefa(t.id, { blocos }, {});
  }
  // Anexo que SAIU lá (e ainda está aqui como link) → sai o bloco.
  const saiuLa = [...antes].filter((u) => !urlsLa.has(u) && urlsAqui.has(u));
  if (saiuLa.length && t.blocos?.some((b) => b.tipo === "link" && saiuLa.includes(b.url)))
    await atualizarTarefa(t.id, { blocos: (t.blocos ?? []).filter((b) => !(b.tipo === "link" && saiuLa.includes(b.url))) }, {});
  return [...new Set([...urlsAqui, ...la.map((x) => x.url)])].filter((u) => !saiuLa.includes(u));
}

// ─── LISTAS, ETIQUETAS e o BOARD ───────────────────────────────────────────────────────────────────────────

async function sincronizarLista(ctx: Ctx, alvo: { localId?: number; trelloId?: string }) {
  const v = await vinculo("lista", alvo.localId != null ? { localId: alvo.localId } : { trelloId: alvo.trelloId });
  const localId = alvo.localId ?? v?.localId;
  const [l] = localId != null ? await getDb().select().from(tarefaListas).where(eq(tarefaListas.id, localId)) : [];
  const trelloId = alvo.trelloId ?? v?.trelloId;
  const la = trelloId ? await ctx.cliente.get<{ id: string; name: string; closed: boolean; idBoard: string }>(`/lists/${trelloId}`, { fields: "name,closed,idBoard" }).catch((e) => (naoAchou(e) ? null : Promise.reject(e))) : null;
  if (!v) {
    if (l && l.quadroId === ctx.lig.quadroId) {
      const r = await ctx.cliente.post<{ id: string }>("/lists", { name: l.nome, idBoard: ctx.lig.boardId, pos: "bottom" });
      if (l.arquivada) await ctx.cliente.put(`/lists/${r.id}/closed`, { value: true });
      await gravarVinculo(ctx.lig.quadroId, "lista", l.id, r.id, { name: l.nome, closed: l.arquivada });
    } else if (la && la.idBoard === ctx.lig.boardId) {
      const { criarLista, atualizarLista } = await import("./tarefas");
      const id = await criarLista(ctx.lig.quadroId, { nome: la.name.slice(0, 60) || "Lista" });
      if (la.closed) await atualizarLista(id, { arquivada: true });
      await gravarVinculo(ctx.lig.quadroId, "lista", id, la.id, { name: la.name, closed: la.closed });
    }
    return;
  }
  if (!l) {
    // Excluída aqui → ARQUIVA lá (o Trello não exclui listas).
    if (la && !la.closed) await ctx.cliente.put(`/lists/${la.id}/closed`, { value: true });
    await tirarVinculo("lista", v.localId);
    return;
  }
  if (!la) return;
  const base = JSON.parse(v.retrato ?? "{}") as { name?: string; closed?: boolean };
  const meu = { name: l.nome, closed: l.arquivada };
  const deLa = { name: la.name, closed: la.closed };
  const final = { ...deLa };
  if (meu.name !== base.name && meu.name !== deLa.name) {
    await ctx.cliente.put(`/lists/${la.id}`, { name: meu.name });
    final.name = meu.name;
  } else if (deLa.name !== base.name && meu.name === base.name) {
    const { atualizarLista } = await import("./tarefas");
    await atualizarLista(l.id, { nome: deLa.name.slice(0, 60) });
  }
  if (meu.closed !== base.closed && meu.closed !== deLa.closed) {
    await ctx.cliente.put(`/lists/${la.id}/closed`, { value: meu.closed });
    final.closed = meu.closed;
  } else if (deLa.closed !== base.closed && meu.closed === base.closed) {
    const { atualizarLista } = await import("./tarefas");
    await atualizarLista(l.id, { arquivada: deLa.closed });
  }
  await gravarVinculo(ctx.lig.quadroId, "lista", l.id, la.id, final);
}

async function sincronizarEtiqueta(ctx: Ctx, alvo: { localId?: number; trelloId?: string }) {
  const { tarefaEtiquetas } = await import("@/db/schema");
  const { corTrelloDeHex, hexDeCorTrello } = await import("./trello-sync-core");
  const v = await vinculo("etiqueta", alvo.localId != null ? { localId: alvo.localId } : { trelloId: alvo.trelloId });
  const localId = alvo.localId ?? v?.localId;
  const [e] = localId != null ? await getDb().select().from(tarefaEtiquetas).where(eq(tarefaEtiquetas.id, localId)) : [];
  const trelloId = alvo.trelloId ?? v?.trelloId;
  const la = trelloId ? await ctx.cliente.get<{ id: string; name: string; color: string | null; idBoard: string }>(`/labels/${trelloId}`, { fields: "name,color,idBoard" }).catch((x) => (naoAchou(x) ? null : Promise.reject(x))) : null;
  const { atualizarEtiqueta, criarEtiqueta, excluirEtiqueta } = await import("./tarefas");
  if (!v) {
    if (e && e.quadroId === ctx.lig.quadroId) {
      const r = await ctx.cliente.post<{ id: string }>("/labels", { name: e.nome, color: corTrelloDeHex(e.cor, PALETA_ETIQUETAS) ?? "blue", idBoard: ctx.lig.boardId });
      await gravarVinculo(ctx.lig.quadroId, "etiqueta", e.id, r.id, { name: e.nome, color: corTrelloDeHex(e.cor, PALETA_ETIQUETAS) });
    } else if (la && la.idBoard === ctx.lig.boardId) {
      const id = await criarEtiqueta(ctx.lig.quadroId, { nome: la.name.slice(0, 30) || "Etiqueta", cor: hexDeCorTrello(la.color, PALETA_ETIQUETAS) ?? "#8590a2" });
      await gravarVinculo(ctx.lig.quadroId, "etiqueta", id, la.id, { name: la.name, color: la.color });
    }
    return;
  }
  if (!e) {
    if (la) await ctx.cliente.del(`/labels/${la.id}`).catch((x) => (naoAchou(x) ? null : Promise.reject(x)));
    await tirarVinculo("etiqueta", v.localId);
    return;
  }
  if (!la) {
    await excluirEtiqueta(e.id);
    await tirarVinculo("etiqueta", e.id);
    return;
  }
  const base = JSON.parse(v.retrato ?? "{}") as { name?: string; color?: string | null };
  const meu = { name: e.nome, color: corTrelloDeHex(e.cor, PALETA_ETIQUETAS) };
  const deLa = { name: la.name, color: la.color };
  const mudouAqui = meu.name !== base.name || meu.color !== base.color;
  const mudouLa = deLa.name !== base.name || deLa.color !== base.color;
  if (mudouAqui && (meu.name !== deLa.name || meu.color !== deLa.color)) {
    await ctx.cliente.put(`/labels/${la.id}`, { name: meu.name, color: meu.color ?? "" });
    await gravarVinculo(ctx.lig.quadroId, "etiqueta", e.id, la.id, meu);
  } else if (mudouLa && !mudouAqui) {
    await atualizarEtiqueta(e.id, { nome: la.name.slice(0, 30) || e.nome, cor: hexDeCorTrello(la.color, PALETA_ETIQUETAS) ?? e.cor });
    await gravarVinculo(ctx.lig.quadroId, "etiqueta", e.id, la.id, deLa);
  }
}

/** O board acompanha o NOME e a DESCRIÇÃO do quadro (daqui para lá). */
async function sincronizarBoard(ctx: Ctx) {
  const { tarefaQuadros } = await import("@/db/schema");
  const [q] = await getDb().select().from(tarefaQuadros).where(eq(tarefaQuadros.id, ctx.lig.quadroId));
  if (q) await ctx.cliente.put(`/boards/${ctx.lig.boardId}`, { name: q.nome, desc: q.descricao ?? "" });
}

/** Separa (para a tela/teste) a descrição do cartão e as notas — reexport conveniente. */
export { separarNotas };
