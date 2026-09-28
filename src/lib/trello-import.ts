import { stripAccents } from "./normalize.ts";

/**
 * IMPORTAR DO TRELLO (puro — sem banco nem JSX): lê o JSON exportado de um quadro do Trello ("Menu → Imprimir, exportar
 * e compartilhar → Exportar como JSON") e o converte no que o quadro daqui grava — listas, etiquetas (cor do Trello →
 * hex), cartões (título, descrição, prazo com hora em Brasília, concluído no lugar, arquivado, template), checklists
 * nomeados com os itens marcados, comentários (autor e data preservados), links anexados (o link para OUTRO cartão do
 * mesmo quadro vira vínculo tarefa ↔ tarefa; os demais, blocos Link) e os membros (casados com as pessoas do grupo).
 * Tolerante: campo ausente ou de tipo errado = vazio; nada lança.
 */

export type ListaTrello = { chave: string; nome: string; arquivada: boolean };
export type EtiquetaTrello = { chave: string; nome: string; cor: string };
export type MembroTrello = { chave: string; nome: string; usuario: string };
export type ComentarioTrello = { autor: string; data: string | null; texto: string };
export type CartaoTrello = {
  chave: string;
  lista: string;
  titulo: string;
  descricao: string;
  inicio: string | null;
  prazo: string | null;
  prazoHora: string | null;
  concluida: boolean;
  arquivada: boolean;
  template: boolean;
  etiquetas: string[];
  membros: string[];
  checklists: { nome: string; itens: string[]; feitos: boolean[] }[];
  links: { url: string; titulo: string }[];
  /** Outros cartões DESTE quadro citados nos anexos (vínculo tarefa ↔ tarefa). */
  vinculos: string[];
  comentarios: ComentarioTrello[];
};
export type ImportacaoTrello = { nome: string; listas: ListaTrello[]; etiquetas: EtiquetaTrello[]; membros: MembroTrello[]; cartoes: CartaoTrello[] };

/** As cores do Trello (e as variações `_dark`/`_light`) → hex; sem cor = cinza. */
const CORES: Record<string, string> = {
  green: "#16a34a",
  yellow: "#ca8a04",
  orange: "#ea580c",
  red: "#dc2626",
  purple: "#9333ea",
  blue: "#2563eb",
  sky: "#0891b2",
  lime: "#65a30d",
  pink: "#db2777",
  black: "#334155",
};
export const corTrello = (c: unknown) => (typeof c === "string" && CORES[c.split("_")[0]]) || "#64748b";

/** Tetos (os mesmos do quadro daqui). */
const MAX_TITULO = 200;
const MAX_DESCRICAO = 10_000;
const MAX_COMENTARIO = 5000;
const MAX_ITEM = 300;
const MAX_NOME_CHECKLIST = 80;

const txt = (v: unknown, max = 10_000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** O instante ISO do Trello (UTC) no horário de BRASÍLIA (UTC−3): a data "AAAA-MM-DD" e a hora "HH:MM". */
export function dataHoraTrello(v: unknown): { data: string; hora: string } | null {
  if (typeof v !== "string") return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return null;
  const iso = new Date(ms - 3 * 3_600_000).toISOString();
  return { data: iso.slice(0, 10), hora: iso.slice(11, 16) };
}

/** O código curto de um cartão num endereço do Trello ("https://trello.com/c/AbC123/…" → "AbC123"). */
export const codigoCartaoTrello = (url: string) => /trello\.com\/c\/([A-Za-z0-9]+)/.exec(url)?.[1] ?? null;

/** Lê o JSON exportado. `null` = não é um quadro do Trello. */
export function lerTrello(json: unknown): ImportacaoTrello | null {
  if (!json || typeof json !== "object") return null;
  const b = json as Record<string, unknown>;
  if (!Array.isArray(b.lists) || !Array.isArray(b.cards)) return null;
  const listas = arr(b.lists)
    .filter((l) => typeof l.id === "string")
    .sort((x, y) => pos(x.pos) - pos(y.pos))
    .map((l) => ({ chave: String(l.id), nome: txt(l.name, 60) || "Lista", arquivada: l.closed === true }));
  const idsListas = new Set(listas.map((l) => l.chave));
  const etiquetas = arr(b.labels)
    .filter((e) => typeof e.id === "string")
    .map((e) => ({ chave: String(e.id), nome: txt(e.name, 30) || "Sem nome", cor: corTrello(e.color) }));
  const membros = arr(b.members)
    .filter((m) => typeof m.id === "string")
    .map((m) => ({ chave: String(m.id), nome: txt(m.fullName, 120), usuario: txt(m.username, 60) }));
  const checklists = arr(b.checklists);
  const comentarios = arr(b.actions).filter((a) => a.type === "commentCard");
  const cartoesBrutos = arr(b.cards).filter((c) => typeof c.id === "string" && idsListas.has(String(c.idList)));
  const porCodigo = new Map(cartoesBrutos.filter((c) => typeof c.shortLink === "string").map((c) => [String(c.shortLink), String(c.id)]));
  const cartoes: CartaoTrello[] = cartoesBrutos
    .sort((x, y) => pos(x.pos) - pos(y.pos))
    .map((c) => {
      const id = String(c.id);
      const due = dataHoraTrello(c.due);
      const start = dataHoraTrello(c.start);
      const links: { url: string; titulo: string }[] = [];
      const vinculos: string[] = [];
      for (const a of arr(c.attachments)) {
        const url = txt(a.url, 1000);
        if (!/^https?:\/\//i.test(url)) continue;
        const outro = porCodigo.get(codigoCartaoTrello(url) ?? "");
        if (outro && outro !== id) {
          if (!vinculos.includes(outro)) vinculos.push(outro);
        } else if (!outro) links.push({ url, titulo: txt(a.name, 120) });
      }
      return {
        chave: id,
        lista: String(c.idList),
        titulo: txt(c.name, MAX_TITULO) || "(Sem título)",
        descricao: txt(c.desc, MAX_DESCRICAO),
        inicio: start && due && start.data > due.data ? null : (start?.data ?? null),
        prazo: due?.data ?? null,
        prazoHora: due?.hora ?? null,
        concluida: c.dueComplete === true,
        arquivada: c.closed === true,
        template: c.isTemplate === true,
        etiquetas: Array.isArray(c.idLabels) ? c.idLabels.filter((x): x is string => typeof x === "string") : [],
        membros: Array.isArray(c.idMembers) ? c.idMembers.filter((x): x is string => typeof x === "string") : [],
        checklists: checklists
          .filter((k) => k.idCard === id)
          .sort((x, y) => pos(x.pos) - pos(y.pos))
          .slice(0, 20)
          .map((k) => {
            const itens = arr(k.checkItems)
              .sort((x, y) => pos(x.pos) - pos(y.pos))
              .filter((i) => txt(i.name))
              .slice(0, 100);
            return { nome: txt(k.name, MAX_NOME_CHECKLIST) || "Checklist", itens: itens.map((i) => txt(i.name, MAX_ITEM)), feitos: itens.map((i) => i.state === "complete") };
          }),
        links: links.slice(0, 20),
        vinculos,
        comentarios: comentarios
          .filter((a) => (a.data as Record<string, unknown> | undefined)?.card && ((a.data as Record<string, Record<string, unknown>>).card.id === id))
          .map((a) => ({
            autor: txt((a.memberCreator as Record<string, unknown> | undefined)?.fullName, 80) || "Trello",
            data: typeof a.date === "string" && !Number.isNaN(Date.parse(a.date)) ? new Date(a.date).toISOString() : null,
            texto: txt((a.data as Record<string, unknown>).text, MAX_COMENTARIO),
          }))
          .filter((x) => x.texto)
          .sort((x, y) => (x.data ?? "").localeCompare(y.data ?? "")),
      };
    });
  return { nome: txt(b.name, 80) || "Quadro do Trello", listas, etiquetas, membros, cartoes };
}

const chave = (s: string) => stripAccents(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * O membro do Trello → a PESSOA do grupo: nome completo igual (sem acento/caixa), ou o usuário/nome igual ao apelido —
 * só quando UMA pessoa casa (nunca adivinha). `null` = sem par (a pessoa escolhe na prévia).
 */
export function casarMembro(m: Pick<MembroTrello, "nome" | "usuario">, pessoas: { id: number; nome: string; apelido?: string | null }[]): number | null {
  const nome = chave(m.nome);
  const usuario = chave(m.usuario);
  const por = (f: (p: (typeof pessoas)[number]) => boolean) => {
    const achou = pessoas.filter(f);
    return achou.length === 1 ? achou[0].id : null;
  };
  return (
    (nome ? por((p) => chave(p.nome) === nome) : null) ??
    (nome || usuario ? por((p) => !!p.apelido && [nome, usuario].includes(chave(p.apelido))) : null)
  );
}

/** Os números da prévia. */
export function resumoTrello(t: ImportacaoTrello) {
  return {
    listas: t.listas.length,
    cartoes: t.cartoes.length,
    arquivados: t.cartoes.filter((c) => c.arquivada).length,
    templates: t.cartoes.filter((c) => c.template).length,
    etiquetas: t.etiquetas.length,
    checklists: t.cartoes.reduce((n, c) => n + c.checklists.length, 0),
    comentarios: t.cartoes.reduce((n, c) => n + c.comentarios.length, 0),
    vinculos: t.cartoes.reduce((n, c) => n + c.vinculos.length, 0),
  };
}

/** Cartões por chamada da importação. */
export const LOTE_IMPORTACAO = 20;
