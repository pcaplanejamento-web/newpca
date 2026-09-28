/**
 * Núcleo PURO da SINCRONIZAÇÃO com o Trello (sem `getDb`/env — testável): a correspondência adaptativa PCA ↔ Trello, o
 * retrato da última sincronização, as diferenças e o conflito. As chamadas à API ficam em `trello-api.ts`; o banco, em
 * `trello-sync.ts`.
 */
import { casarMembro } from "./trello-import.ts";
import { norm } from "./parse-dfd-comum.ts";

// ─── MEMBROS (pessoa do sistema ↔ membro do Trello) ────────────────────────────────────────────────────────

export type MembroTrelloLeve = { id: string; username: string; fullName: string };
export type LigacaoMembro = { usuarioId: number; membroId: string; usuarioTrello: string | null; nome: string | null };

/**
 * A SUGESTÃO de ligação de cada pessoa AINDA sem membro: o membro do Trello cujo nome (ou usuário = apelido) casa com UMA só
 * pessoa (`casarMembro`, a régua da importação) — e só quando esse membro casa com uma pessoa só e ainda não está ligado.
 */
export function sugerirMembros(
  pessoas: { id: number; nome: string; apelido?: string | null }[],
  membros: MembroTrelloLeve[],
  ligacoes: Pick<LigacaoMembro, "usuarioId" | "membroId">[],
): Record<number, string> {
  const ligadas = new Set(ligacoes.map((l) => l.usuarioId));
  const usados = new Set(ligacoes.map((l) => l.membroId));
  const livres = pessoas.filter((p) => !ligadas.has(p.id));
  const porPessoa = new Map<number, string[]>();
  for (const m of membros) {
    if (usados.has(m.id)) continue;
    const id = casarMembro({ nome: m.fullName, usuario: m.username }, livres);
    if (id != null) porPessoa.set(id, [...(porPessoa.get(id) ?? []), m.id]);
  }
  const saida: Record<number, string> = {};
  for (const [id, ms] of porPessoa) if (ms.length === 1) saida[id] = ms[0];
  return saida;
}

// ─── CORES (a paleta das etiquetas daqui É a do Trello: 10 cores × 3 tons) ─────────────────────────────────

/** Os nomes das cores do Trello, na MESMA ordem das colunas da `PALETA_ETIQUETAS`. */
export const CORES_TRELLO = ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "black"] as const;
const TONS_TRELLO = ["_light", "", "_dark"] as const;

const rgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** O índice do hex mais próximo numa lista (distância RGB). */
function maisProximo(hex: string, lista: readonly string[]): number {
  const a = rgb(hex);
  if (!a) return -1;
  let melhor = -1;
  let dist = Number.POSITIVE_INFINITY;
  lista.forEach((h, i) => {
    const b = rgb(h);
    if (!b) return;
    const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    if (d < dist) {
      dist = d;
      melhor = i;
    }
  });
  return melhor;
}

/** A cor de ETIQUETA do Trello ("green_light", "green", "green_dark"…) para um hex — exata na paleta, senão a mais próxima. */
export function corTrelloDeHex(hex: string | null | undefined, paleta: readonly string[]): string | null {
  if (!hex) return null;
  const i = maisProximo(hex, paleta);
  return i < 0 ? null : `${CORES_TRELLO[i % 10]}${TONS_TRELLO[Math.floor(i / 10)] ?? ""}`;
}
/** O hex da paleta para uma cor de etiqueta do Trello (sem cor = `null`). */
export function hexDeCorTrello(cor: string | null | undefined, paleta: readonly string[]): string | null {
  if (!cor) return null;
  const [base, tom] = cor.split("_");
  const col = CORES_TRELLO.indexOf(base as (typeof CORES_TRELLO)[number]);
  if (col < 0) return null;
  const linha = tom === "light" ? 0 : tom === "dark" ? 2 : 1;
  return paleta[linha * 10 + col] ?? null;
}
/** A cor da CAPA do cartão no Trello (só os nomes base) — a coluna da paleta mais próxima. */
export function corCapaTrello(hex: string | null | undefined, paleta: readonly string[]): string | null {
  if (!hex) return null;
  const i = maisProximo(hex, paleta);
  return i < 0 ? null : CORES_TRELLO[i % 10];
}

/** Os FUNDOS de cor do board do Trello (a cor aproximada de cada um). */
export const FUNDOS_TRELLO: Record<string, string> = {
  blue: "#0079bf",
  orange: "#d29034",
  green: "#519839",
  red: "#b04632",
  purple: "#89609e",
  pink: "#cd5a91",
  lime: "#4bbf6b",
  sky: "#00aecc",
  grey: "#838c91",
};
/** O fundo do board mais próximo da cor do quadro (a 1ª cor do degradê, se houver). */
export function fundoTrello(cor: string, gradiente?: { cores: string[] } | null): string {
  const base = gradiente?.cores?.[0] ?? cor;
  const nomes = Object.keys(FUNDOS_TRELLO);
  const i = maisProximo(base, Object.values(FUNDOS_TRELLO));
  return i < 0 ? "blue" : nomes[i];
}

// ─── DATAS (Brasília ↔ UTC) ────────────────────────────────────────────────────────────────────────────────

/** Meio-dia de Brasília: o "dia inteiro" daqui (o Trello sempre guarda data + hora). */
export const HORA_DIA_INTEIRO = "12:00";

/** O `due`/`start` do Trello (ISO UTC) para a data "AAAA-MM-DD" + hora "HH:MM" de Brasília (sem hora = 12:00). */
export function dataParaTrello(data: string | null | undefined, hora?: string | null): string | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const h = hora && /^\d{2}:\d{2}$/.test(hora) ? hora : HORA_DIA_INTEIRO;
  return new Date(`${data}T${h}:00-03:00`).toISOString();
}
/** A data + hora de Brasília de um ISO do Trello (inválido = `null`). */
export function dataDoTrello(iso: string | null | undefined): { data: string; hora: string } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t - 3 * 3600_000).toISOString();
  return { data: d.slice(0, 10), hora: d.slice(11, 16) };
}

// ─── DESCRIÇÃO + NOTAS ─────────────────────────────────────────────────────────────────────────────────────

/** O separador FIXO entre a descrição e as NOTAS da tarefa na descrição do cartão. */
export const SEPARADOR_NOTAS = "\n\n---\n**Notas (PCA)**\n";
const ENTRE_NOTAS = "\n\n·\n\n";

/** A descrição do cartão: a da tarefa + as NOTAS numa seção própria, depois do separador. */
export function descricaoComNotas(descricao: string | null | undefined, notas: string[]): string {
  const d = (descricao ?? "").trimEnd();
  const ns = notas.map((n) => n.trim()).filter(Boolean);
  return ns.length ? `${d}${SEPARADOR_NOTAS}\n${ns.join(ENTRE_NOTAS)}` : d;
}
/** A volta: a descrição da tarefa e as notas (sem o separador = tudo é descrição). */
export function separarNotas(desc: string | null | undefined): { descricao: string; notas: string[] } {
  const t = desc ?? "";
  const i = t.indexOf(SEPARADOR_NOTAS);
  if (i < 0) return { descricao: t.trimEnd(), notas: [] };
  return {
    descricao: t.slice(0, i).trimEnd(),
    notas: t
      .slice(i + SEPARADOR_NOTAS.length)
      .split(ENTRE_NOTAS)
      .map((n) => n.trim())
      .filter(Boolean),
  };
}

// ─── CARTÃO: os valores comparáveis (no "espaço" do Trello) ────────────────────────────────────────────────

/** Prioridade ↔ as opções do campo "Prioridade" do board. */
export const PRIORIDADE_TRELLO = { baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" } as const;
export const CAMPO_PRIORIDADE = "Prioridade";
export const CAMPO_ESTIMATIVA = "Estimativa (h)";
export const CAMPO_TICKET = "Ticket";

/**
 * Os VALORES de um cartão que a sincronização compara — o mesmo formato para a tarefa daqui (convertida) e para o cartão do
 * Trello (lido), e para o RETRATO. Ids = os do TRELLO (lista, etiquetas, membros, campos). Listas em ordem (comparação
 * estável).
 */
export type ValoresCartao = {
  name: string;
  desc: string;
  idList: string;
  start: string | null;
  due: string | null;
  dueComplete: boolean;
  dueReminder: number | null;
  closed: boolean;
  isTemplate: boolean;
  cover: string | null;
  idLabels: string[];
  idMembers: string[];
  /** Os campos personalizados: id do campo NO TRELLO → o valor como texto (`null` = vazio). */
  campos: Record<string, string | null>;
};
export type CampoCartao = keyof ValoresCartao;
export const CAMPOS_CARTAO: CampoCartao[] = ["name", "desc", "idList", "start", "due", "dueComplete", "dueReminder", "closed", "isTemplate", "cover", "idLabels", "idMembers", "campos"];

/** Normaliza (listas ordenadas, campos sem vazios) — a base da comparação. */
export function normalizarValores(v: ValoresCartao): ValoresCartao {
  const campos: Record<string, string | null> = {};
  for (const k of Object.keys(v.campos).sort()) if (v.campos[k] != null && v.campos[k] !== "") campos[k] = v.campos[k];
  return { ...v, desc: v.desc.trimEnd(), idLabels: [...v.idLabels].sort(), idMembers: [...v.idMembers].sort(), campos };
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Os campos em que `a` difere de `b` (os dois normalizados). */
export function diferencas(a: ValoresCartao, b: ValoresCartao | null): CampoCartao[] {
  if (!b) return [...CAMPOS_CARTAO];
  const na = normalizarValores(a);
  const nb = normalizarValores(b);
  return CAMPOS_CARTAO.filter((k) => !igual(na[k], nb[k]));
}

export type Descartado = { campo: CampoCartao; lado: "pca" | "trello"; valor: unknown };
/**
 * A RECONCILIAÇÃO campo a campo contra o RETRATO: o que mudou só aqui vai para o Trello; só lá, vem para cá; nos DOIS (com
 * valores diferentes), VENCE O MAIS RECENTE (`localEm` × `trelloEm`, ISO) e o outro vira `descartados` (para o histórico).
 * Sem retrato (1ª vez), vence o mais recente inteiro. `retrato` novo = o estado combinado.
 */
export function reconciliar(
  retrato: ValoresCartao | null,
  local: ValoresCartao,
  trello: ValoresCartao,
  localEm: string | null,
  trelloEm: string | null,
): { paraTrello: CampoCartao[]; paraLocal: CampoCartao[]; retrato: ValoresCartao; descartados: Descartado[] } {
  const l = normalizarValores(local);
  const t = normalizarValores(trello);
  const base = retrato ? normalizarValores(retrato) : null;
  const localVence = (Date.parse(localEm ?? "") || 0) >= (Date.parse(trelloEm ?? "") || 0);
  const paraTrello: CampoCartao[] = [];
  const paraLocal: CampoCartao[] = [];
  const descartados: Descartado[] = [];
  const final = { ...t } as Record<CampoCartao, unknown>;
  for (const k of CAMPOS_CARTAO) {
    if (igual(l[k], t[k])) continue;
    const mudouAqui = !base || !igual(l[k], base[k]);
    const mudouLa = !base || !igual(t[k], base[k]);
    const aqui = mudouAqui && (!mudouLa || localVence);
    if (aqui) {
      paraTrello.push(k);
      final[k] = l[k];
      if (mudouLa && base) descartados.push({ campo: k, lado: "trello", valor: t[k] });
    } else {
      paraLocal.push(k);
      if (mudouAqui && base) descartados.push({ campo: k, lado: "pca", valor: l[k] });
    }
  }
  return { paraTrello, paraLocal, retrato: final as ValoresCartao, descartados };
}

// ─── MAPA do quadro (ids daqui → ids do Trello) e a conversão tarefa → cartão ──────────────────────────────

/** Tipos dos campos personalizados do Trello (os MESMOS 5 daqui). */
export const TIPO_CAMPO_TRELLO = { texto: "text", numero: "number", data: "date", lista: "list", checkbox: "checkbox" } as const;
export type TipoCampoLocal = keyof typeof TIPO_CAMPO_TRELLO;

/** Os campos personalizados criados no board (gravados em `trello_quadros.campos`). */
export type CamposBoard = {
  prioridade?: string;
  estimativa?: string;
  ticket?: string;
  /** Campo daqui → campo do Trello. */
  porCampo: Record<number, string>;
  /** Campo do Trello → opção (id) → texto — as listas (inclui a Prioridade). */
  opcoes: Record<string, Record<string, string>>;
  /** Os membros do Trello já postos no board. */
  membrosBoard?: string[];
  /** Campo do Trello → o tipo na API (text/number/date/list/checkbox). */
  tipos?: Record<string, string>;
  /** O endereço do sistema (os links dos vínculos nos anexos — o processador roda sem requisição). */
  origem?: string;
  /** Ligado a um board EXISTENTE: falta a FUSÃO inicial (casar pelo nome). */
  fundir?: boolean;
};
export const CAMPOS_BOARD_VAZIO: CamposBoard = { porCampo: {}, opcoes: {} };
export function lerCamposBoard(v: unknown): CamposBoard {
  try {
    const o = (typeof v === "string" ? JSON.parse(v) : v) as Partial<CamposBoard> | null;
    if (!o || typeof o !== "object") return { ...CAMPOS_BOARD_VAZIO };
    const s = (x: unknown) => (typeof x === "string" && x ? x : undefined);
    return {
      prioridade: s(o.prioridade),
      estimativa: s(o.estimativa),
      ticket: s(o.ticket),
      porCampo: o.porCampo && typeof o.porCampo === "object" ? { ...o.porCampo } : {},
      opcoes: o.opcoes && typeof o.opcoes === "object" ? { ...o.opcoes } : {},
      membrosBoard: Array.isArray(o.membrosBoard) ? o.membrosBoard.filter((x): x is string => typeof x === "string") : [],
      origem: s(o.origem),
      tipos: o.tipos && typeof o.tipos === "object" ? { ...o.tipos } : {},
      ...(o.fundir === true ? { fundir: true } : {}),
    };
  } catch {
    return { ...CAMPOS_BOARD_VAZIO };
  }
}

/** O mapa de ids do quadro ligado. */
export type MapaQuadro = {
  listas: Map<number, string>;
  etiquetas: Map<number, string>;
  membros: Map<number, string>;
  campos: CamposBoard;
};

/** A tarefa como a conversão precisa (o resumo do quadro + a descrição e as notas dos blocos). */
export type TarefaParaCartao = {
  titulo: string;
  descricao: string | null;
  notas: string[];
  listaId: number;
  ticket: number;
  prioridade: keyof typeof PRIORIDADE_TRELLO;
  inicio: string | null;
  prazo: string | null;
  prazoHora: string | null;
  lembreteMin: number | null;
  concluidaEm: string | null;
  arquivada: boolean;
  template: boolean;
  capa?: string | null;
  etiquetas: number[];
  pessoas: number[];
  estimativaH: number | null;
  campos?: Record<number, string>;
};

const numeroTexto = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? null : String(Number(n.toFixed(2))));

/** A TAREFA daqui nos valores do cartão (o "espaço" do Trello). Ids sem ligação ficam de fora. */
export function valoresDaTarefa(t: TarefaParaCartao, m: MapaQuadro, paleta: readonly string[]): ValoresCartao {
  const campos: Record<string, string | null> = {};
  if (m.campos.prioridade) campos[m.campos.prioridade] = PRIORIDADE_TRELLO[t.prioridade] ?? null;
  if (m.campos.estimativa) campos[m.campos.estimativa] = numeroTexto(t.estimativaH);
  if (m.campos.ticket) campos[m.campos.ticket] = `#${t.ticket}`;
  for (const [local, valor] of Object.entries(t.campos ?? {})) {
    const cf = m.campos.porCampo[Number(local)];
    if (cf) campos[cf] = valor || null;
  }
  const ids = <K>(xs: K[], mapa: Map<K, string>) => xs.flatMap((x) => (mapa.has(x) ? [mapa.get(x) as string] : []));
  return normalizarValores({
    name: t.titulo,
    desc: descricaoComNotas(t.descricao, t.notas),
    idList: m.listas.get(t.listaId) ?? "",
    start: dataParaTrello(t.inicio),
    due: dataParaTrello(t.prazo, t.prazoHora),
    dueComplete: !!t.concluidaEm,
    dueReminder: t.prazo ? t.lembreteMin : null,
    closed: t.arquivada,
    isTemplate: t.template,
    cover: corCapaTrello(t.capa, paleta),
    idLabels: ids(t.etiquetas, m.etiquetas),
    idMembers: ids(t.pessoas, m.membros),
    campos,
  });
}

/** O cartão do Trello como a API devolve (os campos que a sincronização lê). */
export type CartaoApi = {
  id: string;
  name: string;
  desc: string;
  idList: string;
  start: string | null;
  due: string | null;
  dueComplete: boolean;
  dueReminder: number | null;
  closed: boolean;
  isTemplate: boolean;
  cover?: { color?: string | null } | null;
  idLabels: string[];
  idMembers: string[];
  dateLastActivity?: string;
  customFieldItems?: { idCustomField: string; idValue?: string | null; value?: { text?: string; number?: string; date?: string; checked?: string } | null }[];
};

/** O CARTÃO do Trello nos valores comparáveis (os campos pelo tipo; lista = o texto da opção). */
export function valoresDoCartao(c: CartaoApi, m: MapaQuadro): ValoresCartao {
  const campos: Record<string, string | null> = {};
  for (const it of c.customFieldItems ?? []) {
    const v = it.value ?? {};
    const texto = it.idValue
      ? (m.campos.opcoes[it.idCustomField]?.[it.idValue] ?? null)
      : v.text != null
        ? v.text
        : v.number != null
          ? numeroTexto(Number(v.number))
          : v.date != null
            ? (dataDoTrello(v.date)?.data ?? null)
            : v.checked != null
              ? v.checked === "true"
                ? "1"
                : null
              : null;
    campos[it.idCustomField] = texto;
  }
  return normalizarValores({
    name: c.name ?? "",
    desc: c.desc ?? "",
    idList: c.idList,
    start: c.start ? dataParaTrello(dataDoTrello(c.start)?.data) : null,
    due: c.due ? new Date(c.due).toISOString() : null,
    dueComplete: !!c.dueComplete,
    dueReminder: c.due && c.dueReminder != null && c.dueReminder >= 0 ? c.dueReminder : null,
    closed: !!c.closed,
    isTemplate: !!c.isTemplate,
    cover: c.cover?.color ?? null,
    idLabels: c.idLabels ?? [],
    idMembers: c.idMembers ?? [],
    campos,
  });
}

/** O retrato gravado de um cartão: os valores + o link do cartão + os anexos criados. */
export type RetratoCartao = { v: ValoresCartao; url: string; anexos: string[]; nova?: boolean };
export function lerRetratoCartao(s: string | null | undefined): RetratoCartao | null {
  try {
    const o = s ? (JSON.parse(s) as RetratoCartao) : null;
    return o && typeof o === "object" && o.v ? o : null;
  } catch {
    return null;
  }
}

/** O corpo do VALOR de um campo personalizado no formato da API de cada tipo (vazio = limpar). */
export function corpoValorCampo(tipo: string, valor: string | null, opcoes: Record<string, string> | undefined) {
  if (valor == null || valor === "") return tipo === "list" ? { idValue: "" } : { value: "" };
  if (tipo === "list") return { idValue: Object.entries(opcoes ?? {}).find(([, t]) => t === valor)?.[0] ?? "" };
  if (tipo === "number") return { value: { number: valor } };
  if (tipo === "date") return { value: { date: dataParaTrello(valor) } };
  if (tipo === "checkbox") return { value: { checked: valor === "1" ? "true" : "false" } };
  return { value: { text: valor } };
}

// ─── A VOLTA: o que veio do Trello vira alteração na tarefa ────────────────────────────────────────────────

/** As alterações que o cartão do Trello pede na tarefa daqui (só os campos pedidos). */
export type PatchTarefa = {
  titulo?: string;
  descricao?: string | null;
  notas?: string[];
  listaId?: number;
  inicio?: string | null;
  prazo?: string | null;
  prazoHora?: string | null;
  lembreteMin?: number | null;
  concluida?: boolean;
  arquivada?: boolean;
  template?: boolean;
  capa?: string | null;
  etiquetas?: number[];
  pessoas?: number[];
  prioridade?: keyof typeof PRIORIDADE_TRELLO;
  estimativaH?: number | null;
  /** Campo daqui → valor (`null` = limpar). */
  campos?: Record<number, string | null>;
};

const inverso = <K>(m: Map<K, string>) => new Map([...m].map(([k, v]) => [v, k]));

/**
 * Os `campos` do cartão (os que o Trello mudou) viram o PATCH da tarefa. Etiqueta/membro/lista sem ligação ficam de fora;
 * as pessoas daqui SEM membro do Trello continuam (o Trello não as conhece); o Ticket é só de ida.
 */
export function patchDoCartao(
  campos: CampoCartao[],
  v: ValoresCartao,
  m: MapaQuadro,
  atual: { pessoas: number[]; etiquetas: number[] },
  paleta: readonly string[],
): PatchTarefa {
  const p: PatchTarefa = {};
  for (const k of campos) {
    if (k === "name") p.titulo = v.name.trim().slice(0, 200) || "Sem título";
    else if (k === "desc") {
      const s = separarNotas(v.desc);
      p.descricao = s.descricao || null;
      p.notas = s.notas;
    } else if (k === "idList") {
      const l = inverso(m.listas).get(v.idList);
      if (l != null) p.listaId = l;
    } else if (k === "start") p.inicio = dataDoTrello(v.start)?.data ?? null;
    else if (k === "due") {
      const d = dataDoTrello(v.due);
      p.prazo = d?.data ?? null;
      p.prazoHora = d && d.hora !== HORA_DIA_INTEIRO ? d.hora : null;
    } else if (k === "dueComplete") p.concluida = v.dueComplete;
    else if (k === "dueReminder") p.lembreteMin = v.dueReminder;
    else if (k === "closed") p.arquivada = v.closed;
    else if (k === "isTemplate") p.template = v.isTemplate;
    else if (k === "cover") p.capa = hexDeCorTrello(v.cover, paleta);
    else if (k === "idLabels") {
      const inv = inverso(m.etiquetas);
      const doTrello = v.idLabels.flatMap((x) => (inv.has(x) ? [inv.get(x) as number] : []));
      p.etiquetas = [...new Set([...atual.etiquetas.filter((e) => !m.etiquetas.has(e)), ...doTrello])];
    } else if (k === "idMembers") {
      const inv = inverso(m.membros);
      const doTrello = v.idMembers.flatMap((x) => (inv.has(x) ? [inv.get(x) as number] : []));
      p.pessoas = [...new Set([...atual.pessoas.filter((u) => !m.membros.has(u)), ...doTrello])];
    } else if (k === "campos") {
      const c = m.campos;
      if (c.prioridade) {
        const texto = v.campos[c.prioridade];
        const pr = (Object.entries(PRIORIDADE_TRELLO).find(([, t]) => t === texto)?.[0] ?? "media") as keyof typeof PRIORIDADE_TRELLO;
        p.prioridade = pr;
      }
      if (c.estimativa) {
        const n = Number(v.campos[c.estimativa]);
        p.estimativaH = v.campos[c.estimativa] != null && Number.isFinite(n) ? n : null;
      }
      const valores: Record<number, string | null> = {};
      for (const [local, cf] of Object.entries(c.porCampo)) valores[Number(local)] = v.campos[cf] ?? null;
      p.campos = valores;
    }
  }
  return p;
}

/** O ITEM de checklist comparável (os dois lados e o retrato). */
export type ValoresItem = { name: string; state: "complete" | "incomplete"; due: string | null; idMember: string | null };
export const itemIgual = (a: ValoresItem, b: ValoresItem | null) => !!b && a.name === b.name && a.state === b.state && (a.due ?? null) === (b.due ?? null) && (a.idMember ?? null) === (b.idMember ?? null);

/** Rótulos dos campos (o histórico dos conflitos). */
export const ROTULO_CAMPO_CARTAO: Record<CampoCartao, string> = {
  name: "Título",
  desc: "Descrição",
  idList: "Lista",
  start: "Início",
  due: "Prazo",
  dueComplete: "Concluída",
  dueReminder: "Lembrete",
  closed: "Arquivada",
  isTemplate: "Template",
  cover: "Capa",
  idLabels: "Etiquetas",
  idMembers: "Responsáveis",
  campos: "Campos personalizados",
};

// ─── WEBHOOK (os avisos do Trello) ─────────────────────────────────────────────────────────────────────────

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A ASSINATURA do aviso do Trello: base64(HMAC-SHA1(segredo da aplicação, corpo + URL do callback)). Comparação em tempo constante. */
export async function assinaturaWebhookValida(segredo: string, corpo: string, urlCallback: string, assinatura: string | null): Promise<boolean> {
  if (!segredo || !assinatura) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const esperado = b64(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo + urlCallback)));
  if (esperado.length !== assinatura.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ assinatura.charCodeAt(i);
  return dif === 0;
}

/** O hash (SHA-256 hex) do token do caminho do callback — o banco guarda só o hash. */
export async function hashToken(token: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}
/** Um token novo (32 bytes, hex) para o caminho do callback. */
export function novoToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

/** O que um aviso do Trello pede: qual item sincronizar (ou nada). As ações da conta institucional = eco (ignoradas). */
export function alvoDoAviso(
  acao: { type?: string; idMemberCreator?: string; data?: { card?: { id?: string }; list?: { id?: string }; label?: { id?: string } } } | null | undefined,
  contaId: string,
): { tipo: "tarefa" | "lista" | "etiqueta"; alvo: string } | null {
  if (!acao?.type || (contaId && acao.idMemberCreator === contaId)) return null;
  const d = acao.data ?? {};
  if (/Label$/.test(acao.type) && !d.card && d.label?.id) return { tipo: "etiqueta", alvo: d.label.id };
  if (d.card?.id) return { tipo: "tarefa", alvo: d.card.id };
  if (/List$/.test(acao.type) && d.list?.id) return { tipo: "lista", alvo: d.list.id };
  if (d.label?.id) return { tipo: "etiqueta", alvo: d.label.id };
  return null;
}

// ─── FUSÃO com um board EXISTENTE ──────────────────────────────────────────────────────────────────────────

/**
 * CASA dois conjuntos pelo NOME (sem acento/caixa/espaços extras) e, opcionalmente, por um GRUPO (ex.: a lista do cartão):
 * cada item casa no máximo UM do outro lado, na ordem (o 1º "Checklist" daqui com o 1º de lá). Nome vazio não casa.
 */
export function casarPorNome<A, B>(
  aqui: A[],
  la: B[],
  nomeA: (a: A) => string,
  nomeB: (b: B) => string,
  grupoA: (a: A) => string | number | null = () => "",
  grupoB: (b: B) => string | number | null = () => "",
): { pares: [A, B][]; soAqui: A[]; soLa: B[] } {
  const livres = new Map<string, B[]>();
  const chave = (g: string | number | null, n: string) => `${g ?? ""}\u0000${norm(n).replace(/\s+/g, " ").trim()}`;
  for (const b of la) {
    if (!norm(nomeB(b)).trim()) continue;
    const k = chave(grupoB(b), nomeB(b));
    livres.set(k, [...(livres.get(k) ?? []), b]);
  }
  const pares: [A, B][] = [];
  const soAqui: A[] = [];
  const usados = new Set<B>();
  for (const a of aqui) {
    const g = grupoA(a);
    const fila = norm(nomeA(a)).trim() && g !== null ? livres.get(chave(g, nomeA(a))) : undefined;
    const b = fila?.shift();
    if (b === undefined) soAqui.push(a);
    else {
      pares.push([a, b]);
      usados.add(b);
    }
  }
  return { pares, soAqui, soLa: la.filter((b) => !usados.has(b)) };
}

/**
 * O RETRATO de um par casado na fusão: o lado MAIS ANTIGO — assim só o lado mais recente aparece como "mudado" e a
 * reconciliação leva as diferenças dele ao outro (a regra do conflito: vence o mais recente). Empate = vence daqui.
 */
export function retratoDaFusao(local: ValoresCartao, trello: ValoresCartao, localEm: string | null, trelloEm: string | null): ValoresCartao {
  return (Date.parse(localEm ?? "") || 0) >= (Date.parse(trelloEm ?? "") || 0) ? trello : local;
}

/** O campo do Trello que serve para um campo daqui (mesmo nome e mesmo tipo na API). */
export function campoDoBoard<C extends { id: string; name: string; type: string }>(nome: string, tipo: string, deLa: C[], usados: Set<string>): C | null {
  return deLa.find((c) => !usados.has(c.id) && c.type === tipo && norm(c.name).trim() === norm(nome).trim()) ?? null;
}
