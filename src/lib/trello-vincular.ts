import { asc, eq, inArray, sql } from "drizzle-orm";
import { tarefaChecklist, tarefaChecklists, tarefaComentarios, tarefas, trelloFila, trelloQuadros, trelloVinculos } from "@/db/schema";
import { getDb } from "./db";
import { lerGradiente } from "./imagem-fundo-core";
import { lotesDeIds } from "./reparticoes";
import { type CampoTarefa, hrefVinculo, lerBlocos, PALETA_ETIQUETAS, type TarefaResumo } from "./tarefas-core";
import { dadosQuadro, listarCampos, pessoasDoQuadro, type Quadro } from "./tarefas";
import { type ClienteTrello, ErroTrello } from "./trello-api";
import { enfileirar } from "./trello-fila";
import { listarLigacoesMembros } from "./trello-sync";
import {
  CAMPO_ESTIMATIVA,
  CAMPO_PRIORIDADE,
  CAMPO_TICKET,
  type CamposBoard,
  type CartaoApi,
  campoDoBoard,
  casarPorNome,
  corTrelloDeHex,
  dataParaTrello,
  fundoTrello,
  lerCamposBoard,
  type MapaQuadro,
  PRIORIDADE_TRELLO,
  TIPO_CAMPO_TRELLO,
  corpoValorCampo,
  type RetratoCartao,
  retratoDaFusao,
  type TarefaParaCartao,
  valoresDaTarefa,
  valoresDoCartao,
} from "./trello-sync-core";

/**
 * LIGAR um quadro do PCA ao Trello CRIANDO o board ADAPTADO (listas, etiquetas, campos personalizados, membros, cartões,
 * checklists, comentários e anexos). Em ETAPAS retomáveis: cada chamada faz no máximo `ORCAMENTO` chamadas ao Trello e
 * grava cada item criado em `trello_vinculos` — o que já tem vínculo não é refeito (idempotente; uma falha no meio só
 * atrasa, nunca duplica). A tela repete a etapa até `restante` = 0.
 */

/** Chamadas ao Trello por etapa (cabe no limite de subrequisições do Worker, com folga para o D1). */
export const ORCAMENTO = 25;

export type Ligacao = typeof trelloQuadros.$inferSelect;
export type Progresso = { listas: [number, number]; etiquetas: [number, number]; cartoes: [number, number]; checklists: [number, number]; comentarios: [number, number] };

export async function ligacaoDoQuadro(quadroId: number): Promise<Ligacao | null> {
  const [l] = await getDb().select().from(trelloQuadros).where(eq(trelloQuadros.quadroId, quadroId));
  return l ?? null;
}

/** Os vínculos do quadro, por tipo: id daqui → {id do Trello, retrato}. */
export async function vinculosDoQuadro(quadroId: number) {
  const linhas = await getDb().select().from(trelloVinculos).where(eq(trelloVinculos.quadroId, quadroId));
  const por = new Map<string, Map<number, { trelloId: string; retrato: string | null }>>();
  for (const l of linhas) {
    const m = por.get(l.tipo) ?? new Map();
    m.set(l.localId, { trelloId: l.trelloId, retrato: l.retrato });
    por.set(l.tipo, m);
  }
  return (tipo: string) => por.get(tipo) ?? new Map<number, { trelloId: string; retrato: string | null }>();
}

/** Grava vínculos num lote (novo ou atualizado pelo (tipo, id daqui)). */
export async function gravarVinculos(quadroId: number, vs: { tipo: string; localId: number; trelloId: string; retrato?: string | null }[]) {
  if (!vs.length) return;
  const db = getDb();
  const cmds = vs.map((v) =>
    db
      .insert(trelloVinculos)
      .values({ quadroId, tipo: v.tipo, localId: v.localId, trelloId: v.trelloId, retrato: v.retrato ?? null })
      .onConflictDoUpdate({
        target: [trelloVinculos.tipo, trelloVinculos.localId],
        set: { trelloId: v.trelloId, retrato: v.retrato ?? null, sincronizadoEm: sql`(CURRENT_TIMESTAMP)` },
      }),
  );
  await db.batch(cmds as unknown as Parameters<typeof db.batch>[0]);
}

/** O conteúdo local do quadro que o board recebe (descrição/blocos, checklists, itens e comentários — em lotes). */
async function conteudoDoQuadro(quadroId: number, ids: number[]) {
  const db = getDb();
  const descr = new Map<number, { descricao: string | null; notas: string[]; links: { url: string; titulo: string }[] }>();
  const checklists: { id: number; tarefaId: number; nome: string; ordem: number }[] = [];
  const itens: { id: number; tarefaId: number; checklistId: number | null; texto: string; feito: boolean; prazo: string | null; responsavelId: number | null; ordem: number }[] = [];
  const comentarios: { id: number; tarefaId: number; usuarioNome: string | null; texto: string; criadoEm: string | null }[] = [];
  const rs = await db.select({ id: tarefas.id, descricao: tarefas.descricao, blocos: tarefas.blocos }).from(tarefas).where(eq(tarefas.quadroId, quadroId));
  for (const r of rs) {
    const bs = lerBlocos(r.blocos) ?? [];
    descr.set(r.id, {
      descricao: r.descricao,
      notas: bs.flatMap((b) => (b.tipo === "nota" && b.texto.trim() ? [b.texto] : [])),
      links: bs.flatMap((b) => (b.tipo === "link" && b.url ? [{ url: b.url, titulo: b.titulo }] : [])),
    });
  }
  for (const lote of lotesDeIds(ids)) {
    checklists.push(
      ...(await db
        .select({ id: tarefaChecklists.id, tarefaId: tarefaChecklists.tarefaId, nome: tarefaChecklists.nome, ordem: tarefaChecklists.ordem })
        .from(tarefaChecklists)
        .where(inArray(tarefaChecklists.tarefaId, lote))
        .orderBy(asc(tarefaChecklists.ordem), asc(tarefaChecklists.id))),
    );
    itens.push(
      ...(await db
        .select({
          id: tarefaChecklist.id,
          tarefaId: tarefaChecklist.tarefaId,
          checklistId: tarefaChecklist.checklistId,
          texto: tarefaChecklist.texto,
          feito: tarefaChecklist.feito,
          prazo: tarefaChecklist.prazo,
          responsavelId: tarefaChecklist.responsavelId,
          ordem: tarefaChecklist.ordem,
        })
        .from(tarefaChecklist)
        .where(inArray(tarefaChecklist.tarefaId, lote))
        .orderBy(asc(tarefaChecklist.ordem), asc(tarefaChecklist.id))),
    );
    comentarios.push(
      ...(await db
        .select({ id: tarefaComentarios.id, tarefaId: tarefaComentarios.tarefaId, usuarioNome: tarefaComentarios.usuarioNome, texto: tarefaComentarios.texto, criadoEm: tarefaComentarios.criadoEm })
        .from(tarefaComentarios)
        .where(inArray(tarefaComentarios.tarefaId, lote))
        .orderBy(asc(tarefaComentarios.id))),
    );
  }
  return { descr, checklists, itens, comentarios };
}

/** A tarefa no formato da conversão. */
export function tarefaParaCartao(t: TarefaResumo, d: { descricao: string | null; notas: string[] } | undefined): TarefaParaCartao {
  return { ...t, descricao: d?.descricao ?? null, notas: d?.notas ?? [] };
}

/** O cartão foi CRIADO pela ligação (o conteúdo dele vai junto na criação) — ou ainda está sendo. */
function cartaoNovo(retrato: string | null | undefined) {
  return !!retrato && (retrato.includes('"nova":true') || retrato.includes('"pendente":true'));
}

/** O MAPA de ids do quadro ligado (listas, etiquetas, membros, campos). */
export async function mapaDoQuadro(quadroId: number, campos: CamposBoard): Promise<MapaQuadro> {
  const v = await vinculosDoQuadro(quadroId);
  const ids = (tipo: string) => new Map([...v(tipo)].map(([k, x]) => [k, x.trelloId]));
  const membros = new Map((await listarLigacoesMembros()).map((l) => [l.usuarioId, l.membroId]));
  return { listas: ids("lista"), etiquetas: ids("etiqueta"), membros, campos };
}

/** CRIA o board adaptado e liga o quadro (a 1ª etapa). */
export async function criarBoard(cliente: ClienteTrello, q: Quadro, usuarioId: number, origem: string): Promise<Ligacao> {
  const grad = lerGradiente(q.fundoGradiente);
  const b = await cliente.post<{ id: string; url: string }>("/boards", {
    name: q.nome.slice(0, 16384),
    desc: q.descricao ?? "",
    defaultLists: false,
    defaultLabels: false,
    prefs_permissionLevel: "private",
    prefs_background: fundoTrello(q.cor, grad),
  });
  await getDb().insert(trelloQuadros).values({ quadroId: q.id, boardId: b.id, boardUrl: b.url, estado: "vinculando", criadoPor: usuarioId, campos: JSON.stringify({ porCampo: {}, opcoes: {}, origem }) });
  return (await ligacaoDoQuadro(q.id)) as Ligacao;
}

/**
 * UMA etapa da criação: faz o que falta, na ordem (listas → etiquetas → campos → membros → cartões → detalhes dos cartões →
 * checklists e itens → comentários), até gastar o orçamento. Devolve o progresso e quanto falta.
 */
export async function avancarCriacao(cliente: ClienteTrello, q: Quadro, lig: Ligacao, origem: string): Promise<{ progresso: Progresso; restante: number }> {
  let gasto = 0;
  const chamada = async <T>(f: () => Promise<T>) => {
    gasto++;
    return f();
  };
  const cabe = (n = 1) => gasto + n <= ORCAMENTO;
  const novos: { tipo: string; localId: number; trelloId: string; retrato?: string | null }[] = [];
  let v = await vinculosDoQuadro(q.id);
  const tem = (tipo: string, id: number) => v(tipo).has(id) || novos.some((n) => n.tipo === tipo && n.localId === id);
  const idDe = (tipo: string, id: number) => v(tipo).get(id)?.trelloId ?? novos.find((n) => n.tipo === tipo && n.localId === id)?.trelloId;
  const campos = lerCamposBoard(lig.campos);
  const [dados, camposLocais, pessoas, ligacoes] = await Promise.all([dadosQuadro(q.id), listarCampos([q.id]), pessoasDoQuadro(q), listarLigacoesMembros()]);
  const conteudo = await conteudoDoQuadro(q.id, dados.tarefas.map((t) => t.id));
  let camposMudaram = false;
  try {
    // 0) FUSÃO com o board EXISTENTE (uma vez): casa pelo NOME; o que só existe lá entra na fila de ENTRADA.
    if (campos.fundir) {
      await fundirBoard(chamada, cliente, q, lig, campos, dados, camposLocais as CampoTarefa[], conteudo.descr);
      camposMudaram = true;
      await getDb().update(trelloQuadros).set({ campos: JSON.stringify(campos) }).where(eq(trelloQuadros.quadroId, q.id));
      v = await vinculosDoQuadro(q.id);
    }
    // 1) LISTAS (na ordem; as arquivadas nascem fechadas).
    for (const l of dados.listas) {
      if (tem("lista", l.id)) continue;
      if (!cabe(l.arquivada ? 2 : 1)) break;
      const r = await chamada(() => cliente.post<{ id: string }>("/lists", { name: l.nome, idBoard: lig.boardId, pos: "bottom" }));
      if (l.arquivada) await chamada(() => cliente.put(`/lists/${r.id}/closed`, { value: true }));
      novos.push({ tipo: "lista", localId: l.id, trelloId: r.id });
    }
    // 2) ETIQUETAS (a cor da paleta = a do Trello).
    for (const e of dados.etiquetas) {
      if (tem("etiqueta", e.id) || !cabe()) continue;
      const r = await chamada(() => cliente.post<{ id: string }>("/labels", { name: e.nome, color: corTrelloDeHex(e.cor, PALETA_ETIQUETAS) ?? "blue", idBoard: lig.boardId }));
      novos.push({ tipo: "etiqueta", localId: e.id, trelloId: r.id });
    }
    // 3) CAMPOS PERSONALIZADOS: Prioridade (lista), Estimativa (número), Ticket (texto) + os do quadro, no MESMO tipo.
    const criarCampo = async (nome: string, tipo: string, opcoes: string[] = []) => {
      const r = await chamada(() =>
        cliente.post<{ id: string; options?: { id: string; value: { text: string } }[] }>("/customFields", undefined, {
          idModel: lig.boardId,
          modelType: "board",
          name: nome,
          type: tipo,
          pos: "bottom",
          display_cardFront: true,
          ...(tipo === "list" ? { options: opcoes.map((t, i) => ({ value: { text: t }, pos: (i + 1) * 1024 })) } : {}),
        }),
      );
      if (r.options?.length) campos.opcoes[r.id] = Object.fromEntries(r.options.map((o) => [o.id, o.value.text]));
      campos.tipos = { ...(campos.tipos ?? {}), [r.id]: tipo };
      camposMudaram = true;
      return r.id;
    };
    if (!campos.prioridade && cabe()) campos.prioridade = await criarCampo(CAMPO_PRIORIDADE, "list", Object.values(PRIORIDADE_TRELLO));
    if (!campos.estimativa && cabe()) campos.estimativa = await criarCampo(CAMPO_ESTIMATIVA, "number");
    if (!campos.ticket && cabe()) campos.ticket = await criarCampo(CAMPO_TICKET, "text");
    for (const c of camposLocais as CampoTarefa[]) {
      if (campos.porCampo[c.id] || !cabe()) continue;
      campos.porCampo[c.id] = await criarCampo(c.nome, TIPO_CAMPO_TRELLO[c.tipo], c.opcoes);
    }
    // 4) MEMBROS do board: as pessoas do quadro ligadas a um membro (no quadro privado, só o dono).
    const noQuadro = new Set(pessoas.map((p) => p.id));
    const noBoard = new Set(campos.membrosBoard ?? []);
    for (const l of ligacoes) {
      if (!noQuadro.has(l.usuarioId) || noBoard.has(l.membroId) || !cabe()) continue;
      try {
        await chamada(() => cliente.put(`/boards/${lig.boardId}/members/${l.membroId}`, { type: "normal" }));
      } catch (e) {
        if (!(e instanceof ErroTrello) || e.transitorio) throw e;
      }
      noBoard.add(l.membroId);
      campos.membrosBoard = [...noBoard];
      camposMudaram = true;
    }
    // 5) CARTÕES (só o essencial; o resto vai no passo 6). Na ordem das listas e dos cartões.
    const ordemLista = new Map(dados.listas.map((l, i) => [l.id, i]));
    const cartoes = [...dados.tarefas].sort((a, b) => (ordemLista.get(a.listaId) ?? 0) - (ordemLista.get(b.listaId) ?? 0) || a.ordem - b.ordem);
    for (const t of cartoes) {
      if (tem("tarefa", t.id)) continue;
      const idList = idDe("lista", t.listaId);
      if (!idList || !cabe()) break;
      const r = await chamada(() => cliente.post<{ id: string; shortUrl: string }>("/cards", { idList, name: t.titulo.slice(0, 16384), pos: "bottom" }));
      novos.push({ tipo: "tarefa", localId: t.id, trelloId: r.id, retrato: JSON.stringify({ pendente: true, url: r.shortUrl }) });
    }
    if (novos.length) await gravarVinculos(q.id, novos.splice(0));
    // 6) DETALHES de cada cartão criado: valores, campos, anexos (links, vínculos) → o RETRATO.
    const mapa = await mapaDoQuadro(q.id, campos);
    const vv = await vinculosDoQuadro(q.id);
    for (const t of cartoes) {
      const vc = vv("tarefa").get(t.id);
      if (!vc?.retrato?.includes('"pendente":true')) continue;
      const url = (JSON.parse(vc.retrato) as { url: string }).url;
      const d = conteudo.descr.get(t.id);
      const val = valoresDaTarefa(tarefaParaCartao(t, d), mapa, PALETA_ETIQUETAS);
      const camposComValor = Object.entries(val.campos).filter(([, x]) => x != null);
      const anexos = [
        ...(d?.links ?? []).map((l) => ({ url: l.url, name: l.titulo || l.url })),
        ...t.vinculos.flatMap((vi) => {
          if (vi.tipo === "tarefa") {
            const outro = vv("tarefa").get(vi.id)?.retrato;
            const u = outro ? (JSON.parse(outro) as { url?: string }).url : null;
            return u ? [{ url: u, name: vi.rotulo ?? "Tarefa" }] : [];
          }
          return [{ url: `${origem}${hrefVinculo(vi)}`, name: vi.rotulo ?? vi.tipo }];
        }),
      ];
      // Um cartão com mais detalhes que o orçamento inteiro segue sozinho numa etapa (senão nunca andaria).
      if (gasto > 0 && !cabe(2 + camposComValor.length + anexos.length)) break;
      await chamada(() =>
        cliente.put(`/cards/${vc.trelloId}`, {
          desc: val.desc,
          start: val.start,
          due: val.due,
          dueComplete: val.dueComplete,
          dueReminder: val.dueReminder ?? -1,
          idLabels: val.idLabels.join(","),
          idMembers: val.idMembers.join(","),
          closed: val.closed,
          isTemplate: val.isTemplate,
        }),
      );
      if (val.cover) await chamada(() => cliente.put(`/cards/${vc.trelloId}`, undefined, { cover: { color: val.cover, size: "normal" } }));
      for (const [cf, valor] of camposComValor) {
        const tipo = campos.tipos?.[cf] ?? (campos.opcoes[cf] ? "list" : "text");
        await chamada(() => cliente.put(`/cards/${vc.trelloId}/customField/${cf}/item`, undefined, corpoValorCampo(tipo, valor, campos.opcoes[cf])));
      }
      for (const a of anexos) await chamada(() => cliente.post(`/cards/${vc.trelloId}/attachments`, { url: a.url, name: a.name.slice(0, 256) }));
      novos.push({ tipo: "tarefa", localId: t.id, trelloId: vc.trelloId, retrato: JSON.stringify({ v: val, url, anexos: anexos.map((a) => a.url), nova: true } satisfies RetratoCartao) });
    }
    // 7) CHECKLISTS e ITENS (feito, prazo, responsável) — só dos cartões CRIADOS agora (os casados na fusão acertam o
    // conteúdo pela sincronização, casando pelo nome).
    const ehNova = (tarefaId: number) => cartaoNovo(vv("tarefa").get(tarefaId)?.retrato);
    for (const c of conteudo.checklists) {
      const card = vv("tarefa").get(c.tarefaId);
      if (!card || !ehNova(c.tarefaId) || tem("checklist", c.id) || !cabe()) continue;
      const r = await chamada(() => cliente.post<{ id: string }>("/checklists", { idCard: card.trelloId, name: c.nome }));
      novos.push({ tipo: "checklist", localId: c.id, trelloId: r.id });
    }
    for (const i of conteudo.itens) {
      const cl = i.checklistId != null ? idDe("checklist", i.checklistId) : undefined;
      if (!cl || !ehNova(i.tarefaId) || tem("item", i.id) || !cabe()) continue;
      const r = await chamada(() =>
        cliente.post<{ id: string }>(`/checklists/${cl}/checkItems`, {
          name: i.texto.slice(0, 16384),
          checked: i.feito,
          pos: "bottom",
          due: dataParaTrello(i.prazo),
          idMember: i.responsavelId != null ? mapa.membros.get(i.responsavelId) : undefined,
        }),
      );
      novos.push({ tipo: "item", localId: i.id, trelloId: r.id });
    }
    // 8) COMENTÁRIOS (pela conta institucional, com o nome de quem escreveu aqui).
    for (const c of conteudo.comentarios) {
      const card = vv("tarefa").get(c.tarefaId);
      if (!card || !ehNova(c.tarefaId) || tem("comentario", c.id) || !cabe()) continue;
      const r = await chamada(() => cliente.post<{ id: string }>(`/cards/${card.trelloId}/actions/comments`, { text: `**${c.usuarioNome ?? "PCA"} (PCA):** ${c.texto}`.slice(0, 16384) }));
      novos.push({ tipo: "comentario", localId: c.id, trelloId: r.id });
    }
  } finally {
    await gravarVinculos(q.id, novos);
    if (camposMudaram) await getDb().update(trelloQuadros).set({ campos: JSON.stringify(campos) }).where(eq(trelloQuadros.quadroId, q.id));
  }
  // O progresso (pelo que já tem vínculo).
  const f = await vinculosDoQuadro(q.id);
  const prontos = [...f("tarefa").values()].filter((x) => x.retrato && !x.retrato.includes('"pendente":true')).length;
  // Checklists/itens/comentários contam só os dos cartões CRIADOS (sem vínculo de cartão ainda = também a criar).
  const aCriar = (tarefaId: number) => !f("tarefa").has(tarefaId) || cartaoNovo(f("tarefa").get(tarefaId)?.retrato);
  const conta = <T extends { id: number; tarefaId: number }>(xs: T[], tipo: string) => {
    const ys = xs.filter((x) => aCriar(x.tarefaId));
    return [ys.filter((x) => f(tipo).has(x.id)).length, ys.length] as [number, number];
  };
  const [clA, clB] = conta(conteudo.checklists, "checklist");
  const [itA, itB] = conta(
    conteudo.itens.filter((i) => i.checklistId != null),
    "item",
  );
  const progresso: Progresso = {
    listas: [f("lista").size, dados.listas.length],
    etiquetas: [f("etiqueta").size, dados.etiquetas.length],
    cartoes: [prontos, dados.tarefas.length],
    checklists: [clA + itA, clB + itB],
    comentarios: conta(conteudo.comentarios, "comentario"),
  };
  const faltaCampos = !campos.prioridade || !campos.estimativa || !campos.ticket || (camposLocais as CampoTarefa[]).some((c) => !campos.porCampo[c.id]);
  const restante = Object.values(progresso).reduce((s, [a, b]) => s + Math.max(0, b - a), 0) + (faltaCampos ? 1 : 0);
  if (!restante) await getDb().update(trelloQuadros).set({ estado: "ativo", sincronizadoEm: sql`(CURRENT_TIMESTAMP)`, ultimoErro: null }).where(eq(trelloQuadros.quadroId, q.id));
  return { progresso, restante };
}

/** LIGA o quadro a um board EXISTENTE da conta (a fusão acontece na 1ª etapa). */
export async function ligarBoard(cliente: ClienteTrello, q: Quadro, usuarioId: number, origem: string, boardId: string): Promise<Ligacao> {
  const b = await cliente.get<{ id: string; url: string; closed: boolean }>(`/boards/${boardId}`, { fields: "url,closed" });
  if (b.closed) throw new ErroTrello("Este quadro está fechado no Trello — reabra-o lá para ligar.", 409);
  const [outro] = await getDb().select({ q: trelloQuadros.quadroId }).from(trelloQuadros).where(eq(trelloQuadros.boardId, b.id));
  if (outro) throw new ErroTrello("Este quadro do Trello já está ligado a outro quadro daqui.", 409);
  await getDb()
    .insert(trelloQuadros)
    .values({ quadroId: q.id, boardId: b.id, boardUrl: b.url, estado: "vinculando", criadoPor: usuarioId, campos: JSON.stringify({ porCampo: {}, opcoes: {}, origem, fundir: true }) });
  return (await ligacaoDoQuadro(q.id)) as Ligacao;
}

type CartaoFusao = CartaoApi & { shortUrl: string };
const CAMPOS_CARTAO_API = "name,desc,idList,start,due,dueComplete,dueReminder,closed,isTemplate,cover,idLabels,idMembers,dateLastActivity,shortUrl";

/**
 * A FUSÃO inicial com um board existente: casa LISTAS e ETIQUETAS pelo nome, os CAMPOS personalizados pelo nome + tipo e os
 * CARTÕES pelo título dentro da lista casada. Cada par ganha o vínculo com o RETRATO do lado mais ANTIGO (a reconciliação
 * leva o mais recente ao outro — a regra do conflito) e entra na fila; o que só existe lá entra na fila de ENTRADA (vira
 * item daqui quando a ligação terminar); o que só existe aqui é criado lá pelas etapas seguintes.
 */
async function fundirBoard(
  chamada: <T>(f: () => Promise<T>) => Promise<T>,
  cliente: ClienteTrello,
  q: Quadro,
  lig: Ligacao,
  campos: CamposBoard,
  dados: Awaited<ReturnType<typeof dadosQuadro>>,
  camposLocais: CampoTarefa[],
  descr: Map<number, { descricao: string | null; notas: string[] }>,
) {
  const b = lig.boardId;
  const listas = await chamada(() => cliente.get<{ id: string; name: string; closed: boolean }[]>(`/boards/${b}/lists`, { filter: "all", fields: "name,closed" }));
  const etiquetas = await chamada(() => cliente.get<{ id: string; name: string; color: string | null }[]>(`/boards/${b}/labels`, { fields: "name,color", limit: 1000 }));
  const cfs = await chamada(() => cliente.get<{ id: string; name: string; type: string; options?: { id: string; value: { text: string } }[] }[]>(`/boards/${b}/customFields`));
  const cards = await chamada(() => cliente.get<CartaoFusao[]>(`/boards/${b}/cards/all`, { fields: CAMPOS_CARTAO_API, customFieldItems: true }));
  const membros = await chamada(() => cliente.get<{ id: string }[]>(`/boards/${b}/members`, { fields: "id" }));
  // Listas e etiquetas.
  const cl = casarPorNome(dados.listas, listas, (l) => l.nome, (x) => x.name);
  const ce = casarPorNome(dados.etiquetas, etiquetas, (e) => e.nome, (x) => x.name);
  await gravarVinculos(q.id, [
    ...cl.pares.map(([l, x]) => ({ tipo: "lista", localId: l.id, trelloId: x.id, retrato: JSON.stringify({ name: x.name, closed: x.closed }) })),
    ...ce.pares.map(([e, x]) => ({ tipo: "etiqueta", localId: e.id, trelloId: x.id, retrato: JSON.stringify({ name: x.name, color: x.color }) })),
  ]);
  for (const x of cl.soLa) await enfileirar(q.id, "entrada", "lista", x.id);
  const usadas = new Set(cards.flatMap((c) => c.idLabels));
  for (const x of ce.soLa) if (x.name.trim() || usadas.has(x.id)) await enfileirar(q.id, "entrada", "etiqueta", x.id);
  // Campos personalizados (mesmo nome + tipo): os nossos três e os do quadro.
  const usados = new Set<string>();
  const adotar = (nome: string, tipo: string) => {
    const c = campoDoBoard(nome, tipo, cfs, usados);
    if (!c) return undefined;
    usados.add(c.id);
    campos.tipos = { ...(campos.tipos ?? {}), [c.id]: c.type };
    if (c.options?.length) campos.opcoes[c.id] = Object.fromEntries(c.options.map((o) => [o.id, o.value.text]));
    return c.id;
  };
  campos.prioridade ??= adotar(CAMPO_PRIORIDADE, "list");
  campos.estimativa ??= adotar(CAMPO_ESTIMATIVA, "number");
  campos.ticket ??= adotar(CAMPO_TICKET, "text");
  for (const c of camposLocais) if (!campos.porCampo[c.id]) {
    const id = adotar(c.nome, TIPO_CAMPO_TRELLO[c.tipo]);
    if (id) campos.porCampo[c.id] = id;
  }
  campos.membrosBoard = [...new Set([...(campos.membrosBoard ?? []), ...membros.map((m) => m.id)])];
  // Cartões: pelo título DENTRO da lista casada.
  const listaDe = new Map(cl.pares.map(([l, x]) => [x.id, l.id]));
  const cc = casarPorNome(dados.tarefas, cards, (t) => t.titulo, (c) => c.name, (t) => t.listaId, (c) => listaDe.get(c.idList) ?? null);
  const mapa = await mapaDoQuadro(q.id, campos);
  await gravarVinculos(
    q.id,
    cc.pares.map(([t, c]) => {
      const local = valoresDaTarefa(tarefaParaCartao(t, descr.get(t.id)), mapa, PALETA_ETIQUETAS);
      const trello = valoresDoCartao(c, mapa);
      const v = retratoDaFusao(local, trello, t.atualizadoEm ? `${t.atualizadoEm.replace(" ", "T")}Z` : null, c.dateLastActivity ?? null);
      return { tipo: "tarefa", localId: t.id, trelloId: c.id, retrato: JSON.stringify({ v, url: c.shortUrl, anexos: [] } satisfies RetratoCartao) };
    }),
  );
  for (const [t] of cc.pares) await enfileirar(q.id, "saida", "tarefa", String(t.id));
  for (const c of cc.soLa) await enfileirar(q.id, "entrada", "tarefa", c.id);
  campos.fundir = undefined;
}

/** Os boards ABERTOS da conta institucional (para "ligar"), com os já ligados marcados. */
export async function boardsDaConta(cliente: ClienteTrello) {
  const bs = await cliente.get<{ id: string; name: string; url: string; dateLastActivity: string | null; idOrganization: string | null }[]>("/members/me/boards", {
    filter: "open",
    fields: "name,url,dateLastActivity,idOrganization",
  });
  const ligados = new Set((await getDb().select({ b: trelloQuadros.boardId }).from(trelloQuadros)).map((x) => x.b));
  return bs.map((x) => ({ id: x.id, nome: x.name, url: x.url, ultimaAtividade: x.dateLastActivity, ligado: ligados.has(x.id) }));
}

/** DESLIGA o quadro do Trello: tira o aviso (webhook) e os vínculos; os dois lados ficam como estão. */
export async function desligarQuadro(cliente: ClienteTrello | null, quadroId: number) {
  const lig = await ligacaoDoQuadro(quadroId);
  if (lig?.webhookId && cliente) await cliente.del(`/webhooks/${lig.webhookId}`).catch(() => null);
  await getDb().delete(trelloQuadros).where(eq(trelloQuadros.quadroId, quadroId));
}

/** O quadro tem ligação (e o estado) — para a faixa e a Configuração. */
export async function estadoTrello(quadroId: number) {
  const lig = await ligacaoDoQuadro(quadroId);
  if (!lig) return null;
  const [p] = await getDb()
    .select({ n: sql<number>`COUNT(*)`, erros: sql<number>`COALESCE(SUM(CASE WHEN ${trelloFila.erro} IS NOT NULL THEN 1 ELSE 0 END), 0)` })
    .from(trelloFila)
    .where(eq(trelloFila.quadroId, quadroId));
  return { estado: lig.estado, boardUrl: lig.boardUrl, sincronizadoEm: lig.sincronizadoEm, ultimoErro: lig.ultimoErro, pendentes: p?.n ?? 0, erros: p?.erros ?? 0 };
}

/**
 * GARANTE o aviso (webhook) do board: sem segredo da aplicação, não cria (não daria para conferir a assinatura). O caminho
 * leva um token aleatório — o banco guarda só o hash. O Trello confere o endereço (HEAD) ao criar.
 */
export async function garantirWebhook(cliente: ClienteTrello, lig: Ligacao, origem: string, temSegredo: boolean): Promise<string | null> {
  if (lig.webhookId || !temSegredo) return lig.webhookId;
  const { hashToken, novoToken } = await import("./trello-sync-core");
  const token = novoToken();
  const w = await cliente.post<{ id: string }>("/webhooks", undefined, {
    callbackURL: `${origem}/api/integracoes/trello/webhook/${token}`,
    idModel: lig.boardId,
    description: `PCA — quadro ${lig.quadroId}`,
  });
  await getDb().update(trelloQuadros).set({ webhookId: w.id, webhookTokenHash: await hashToken(token) }).where(eq(trelloQuadros.quadroId, lig.quadroId));
  return w.id;
}
