/**
 * FLUXOS DE AUTOMAÇÃO (estilo N8N) — núcleo PURO (testado em `tests/fluxo-core.test.ts`).
 *
 * Um fluxo = NÓS ligados por CONEXÕES. Cada nó recebe LISTAS de itens por porta de entrada e devolve listas por porta de
 * saída. O motor (`executarFluxo`) é orientado a EVENTOS: um nó roda quando TODAS as conexões que chegam a uma porta dele
 * entregaram nesta rodada (toda saída é SEMPRE entregue, mesmo vazia — assim um SE com um ramo vazio não trava a junção).
 * O único ciclo aceito passa pelo nó LAÇO (porta "volta"): ele entrega um lote por vez e só termina quando a fila acaba —
 * a "recursão até o fim". Todo nó tem a saída implícita "erro"; ligada, o erro segue por ela; sem ela, o fluxo PARA e
 * aponta o nó. Tetos impedem laço infinito e volume descontrolado.
 */

export type Item = Record<string, unknown>;
export type Portas = Record<string, Item[]>;

export type NoFluxo = { id: string; tipo: string; nome?: string; config: Record<string, unknown>; x: number; y: number; desativado?: boolean };
export type Conexao = { de: string; saida: string; para: string; entrada: string };
export type Grafo = { v: 1; nos: NoFluxo[]; conexoes: Conexao[] };

export const GRAFO_VAZIO: Grafo = { v: 1, nos: [], conexoes: [] };
export const SAIDA_ERRO = "erro";
export const PORTA_VOLTA = "volta";
export const TIPO_LACO = "logica.laco";

export const MAX_NOS = 120;
export const MAX_CONEXOES = 300;
export const MAX_ITENS = 20_000;
export const MAX_PASSOS = 2_000;
export const MAX_ITERACOES_LACO = 500;

// ———————————————————————————————————————————————— definição de nós (o registro mora em fluxo-nos.ts)

export type TipoCampo = "texto" | "textoLongo" | "numero" | "selecao" | "booleano" | "caminho" | "lista";
export type CampoNo = {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  opcoes?: { valor: string; rotulo: string }[];
  padrao?: unknown;
  obrigatorio?: boolean;
  ajuda?: string;
  /** Mostra o campo só quando outro campo tem um destes valores. */
  quando?: { campo: string; valores: string[] };
};
export type CategoriaNo = "gatilho" | "centi" | "sistema" | "leitura" | "logica" | "dados" | "erros" | "saida";

export type ContextoNo = {
  /** Pedido à extensão da Centi (a ponte da tela). */
  centi: (acao: string, dados: unknown, ms: number) => Promise<Record<string, unknown> & { ok?: boolean; erro?: string; interrompido?: boolean }>;
  /** Chamada às APIs do próprio sistema (mesma origem). */
  api: (caminho: string, init?: { method?: string; body?: unknown }) => Promise<Record<string, unknown> & { ok?: boolean; error?: string }>;
  /** Mensagem de andamento do nó (a tela mostra). */
  aviso: (texto: string) => void;
  cancelado: () => boolean;
  /** Recursos do host (mapa de entidades, protocolos carregados, leitura de PDF…) — cada nó confere o que precisa. */
  host: Record<string, unknown>;
};

export type DefNo = {
  tipo: string;
  categoria: CategoriaNo;
  rotulo: string;
  descricao: string;
  icone: string;
  entradas: string[];
  saidas: string[];
  campos: CampoNo[];
  /** Rótulos das portas (padrão = o nome). */
  rotulosPortas?: Record<string, string>;
  /** Um só por fluxo (o Início). */
  unico?: boolean;
  /** Roda mesmo com TODAS as entradas vazias (o padrão é pular — como no N8N). */
  rodaSemItens?: boolean;
  /** Entrega só as portas devolvidas (o Laço: "lote" e "fim" não saem juntos). */
  entregaParcial?: boolean;
  executar: (entradas: Portas, config: Record<string, unknown>, ctx: ContextoNo, estado: EstadoNo) => Promise<Portas>;
};
/** Memória de um nó durante UMA execução (o laço guarda a fila e o acumulado). */
export type EstadoNo = Record<string, unknown>;
export type Registro = ReadonlyMap<string, DefNo>;

// ———————————————————————————————————————————————— leitura tolerante do grafo

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);

/** Qualquer JSON → um grafo válido na FORMA (nós com id único, conexões entre nós existentes, sem repetir). */
export function lerGrafo(v: unknown): Grafo {
  const o = (v && typeof v === "object" ? v : {}) as { nos?: unknown; conexoes?: unknown };
  const nos: NoFluxo[] = [];
  const ids = new Set<string>();
  for (const n of Array.isArray(o.nos) ? o.nos : []) {
    if (!n || typeof n !== "object" || nos.length >= MAX_NOS) continue;
    const x = n as Record<string, unknown>;
    const id = texto(x.id, 40);
    const tipo = texto(x.tipo, 60);
    if (!id || !tipo || ids.has(id)) continue;
    ids.add(id);
    const config = x.config && typeof x.config === "object" && !Array.isArray(x.config) ? (x.config as Record<string, unknown>) : {};
    nos.push({ id, tipo, nome: texto(x.nome, 80) || undefined, config, x: numero(x.x), y: numero(x.y), desativado: x.desativado === true || undefined });
  }
  const conexoes: Conexao[] = [];
  const vistas = new Set<string>();
  for (const c of Array.isArray(o.conexoes) ? o.conexoes : []) {
    if (!c || typeof c !== "object" || conexoes.length >= MAX_CONEXOES) continue;
    const x = c as Record<string, unknown>;
    const k: Conexao = { de: texto(x.de, 40), saida: texto(x.saida, 40) || "saida", para: texto(x.para, 40), entrada: texto(x.entrada, 40) || "entrada" };
    const chave = `${k.de}|${k.saida}|${k.para}|${k.entrada}`;
    if (!ids.has(k.de) || !ids.has(k.para) || k.de === k.para || vistas.has(chave)) continue;
    vistas.add(chave);
    conexoes.push(k);
  }
  return { v: 1, nos, conexoes };
}

export type ProblemaGrafo = { no?: string; texto: string; nivel: "erro" | "atencao" };

/** As portas (com a saída "erro" implícita) — ou null quando o tipo não existe. */
export function portasDo(def: DefNo | undefined): { entradas: string[]; saidas: string[] } | null {
  return def ? { entradas: def.entradas, saidas: [...def.saidas, SAIDA_ERRO] } : null;
}

/** Os problemas do fluxo (erros impedem executar; atenções não). */
export function validarGrafo(g: Grafo, reg: Registro): ProblemaGrafo[] {
  const p: ProblemaGrafo[] = [];
  const nome = (n: NoFluxo) => n.nome || reg.get(n.tipo)?.rotulo || n.tipo;
  const porId = new Map(g.nos.map((n) => [n.id, n]));
  if (!g.nos.some((n) => reg.get(n.tipo)?.categoria === "gatilho")) p.push({ texto: "O fluxo precisa de um Início.", nivel: "erro" });
  const unicos = new Map<string, number>();
  for (const n of g.nos) {
    const d = reg.get(n.tipo);
    if (!d) {
      p.push({ no: n.id, texto: `Tipo de nó desconhecido: ${n.tipo}.`, nivel: "erro" });
      continue;
    }
    if (d.unico) unicos.set(n.tipo, (unicos.get(n.tipo) ?? 0) + 1);
    for (const c of d.campos)
      if (c.obrigatorio && campoVisivel(c, n.config) && vazio(n.config[c.chave] ?? c.padrao))
        p.push({ no: n.id, texto: `${nome(n)}: preencha “${c.rotulo}”.`, nivel: "erro" });
    if (d.entradas.length && !g.conexoes.some((c) => c.para === n.id) && !n.desativado)
      p.push({ no: n.id, texto: `${nome(n)} não recebe nada (ligue uma entrada).`, nivel: "atencao" });
  }
  for (const [tipo, q] of unicos) if (q > 1) p.push({ texto: `Só pode haver um nó “${reg.get(tipo)?.rotulo}”.`, nivel: "erro" });
  for (const c of g.conexoes) {
    const a = porId.get(c.de);
    const b = porId.get(c.para);
    const pa = portasDo(a && reg.get(a.tipo));
    const pb = portasDo(b && reg.get(b.tipo));
    if (pa && !pa.saidas.includes(c.saida)) p.push({ no: c.de, texto: `Saída “${c.saida}” não existe.`, nivel: "erro" });
    if (pb && !pb.entradas.includes(c.entrada)) p.push({ no: c.para, texto: `Entrada “${c.entrada}” não existe.`, nivel: "erro" });
  }
  if (temCicloSemLaco(g, reg)) p.push({ texto: "Há um ciclo fora de um Laço — use o nó Laço (porta “volta”) para repetir.", nivel: "erro" });
  return p;
}

const vazio = (v: unknown) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

export function campoVisivel(c: CampoNo, config: Record<string, unknown>): boolean {
  if (!c.quando) return true;
  const v = config[c.quando.campo];
  return c.quando.valores.includes(String(v ?? ""));
}

/** Ciclo que NÃO passa pela porta "volta" de um Laço (o único ciclo permitido). */
export function temCicloSemLaco(g: Grafo, reg: Registro): boolean {
  const arestas = g.conexoes.filter((c) => !(c.entrada === PORTA_VOLTA && g.nos.find((n) => n.id === c.para)?.tipo === TIPO_LACO));
  void reg;
  const adj = new Map<string, string[]>();
  for (const c of arestas) adj.set(c.de, [...(adj.get(c.de) ?? []), c.para]);
  const cor = new Map<string, 0 | 1 | 2>();
  const visita = (id: string): boolean => {
    cor.set(id, 1);
    for (const p of adj.get(id) ?? []) {
      const k = cor.get(p) ?? 0;
      if (k === 1 || (k === 0 && visita(p))) return true;
    }
    cor.set(id, 2);
    return false;
  };
  return g.nos.some((n) => (cor.get(n.id) ?? 0) === 0 && visita(n.id));
}

// ———————————————————————————————————————————————— dados: caminhos, expressões, comparação

/** O valor no caminho ("dfd.planejamento", "itens.0.codigo") — ou undefined. */
export function resolverCaminho(item: unknown, caminho: string): unknown {
  if (!caminho.trim()) return item;
  let v: unknown = item;
  for (const parte of caminho.split(".")) {
    if (v == null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[parte.trim()];
  }
  return v;
}

/** Os caminhos de campos de uma amostra de itens (o seletor "dado buscado" do editor). */
export function caminhosDosItens(itens: readonly Item[], max = 60): string[] {
  const s = new Set<string>();
  const anda = (o: unknown, base: string, prof: number) => {
    if (!o || typeof o !== "object" || Array.isArray(o) || prof > 2) return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const c = base ? `${base}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) anda(v, c, prof + 1);
      else s.add(c);
      if (s.size >= max) return;
    }
  };
  for (const it of itens.slice(0, 20)) anda(it, "", 0);
  return [...s];
}

/** `{{campo}}` no texto → o valor do item. */
export function interpolar(t: string, item: Item): string {
  return t.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, c: string) => {
    const v = resolverCaminho(item, c);
    return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

export const normTexto = (v: unknown) =>
  (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v))
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** Número em pt-BR ("1.234,56") ou en ("1234.56") — null se não for número. */
export function numeroDe(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let t = v.replace(/[R$\s]/g, "");
  if (!t) return null;
  if (/,\d{1,4}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const OPERADORES = [
  { valor: "igual", rotulo: "é igual a" },
  { valor: "diferente", rotulo: "é diferente de" },
  { valor: "contem", rotulo: "contém" },
  { valor: "nao_contem", rotulo: "não contém" },
  { valor: "comeca", rotulo: "começa com" },
  { valor: "maior", rotulo: "é maior que" },
  { valor: "menor", rotulo: "é menor que" },
  { valor: "maior_igual", rotulo: "é maior ou igual a" },
  { valor: "menor_igual", rotulo: "é menor ou igual a" },
  { valor: "vazio", rotulo: "está vazio" },
  { valor: "nao_vazio", rotulo: "não está vazio" },
  { valor: "na_lista", rotulo: "está na lista (separe por ;)" },
] as const;
export type Operador = (typeof OPERADORES)[number]["valor"];

/** A comparação de UM valor (sem caixa/acento; números pt-BR ou en). */
export function comparar(a: unknown, op: string, b: unknown): boolean {
  const ta = normTexto(a);
  const tb = normTexto(b);
  const na = numeroDe(a);
  const nb = numeroDe(b);
  const ambosNum = na != null && nb != null;
  switch (op) {
    case "igual":
      return ambosNum ? na === nb : ta === tb;
    case "diferente":
      return ambosNum ? na !== nb : ta !== tb;
    case "contem":
      return ta.includes(tb);
    case "nao_contem":
      return !ta.includes(tb);
    case "comeca":
      return ta.startsWith(tb);
    case "maior":
      return ambosNum ? na > nb : ta > tb;
    case "menor":
      return ambosNum ? na < nb : ta < tb;
    case "maior_igual":
      return ambosNum ? na >= nb : ta >= tb;
    case "menor_igual":
      return ambosNum ? na <= nb : ta <= tb;
    case "vazio":
      return !ta;
    case "nao_vazio":
      return !!ta;
    case "na_lista":
      return tb.split(";").map((x) => x.trim()).filter(Boolean).includes(ta);
    default:
      return false;
  }
}

/** A chave de junção: só dígitos quando o valor é numérico ("0123" = "123"), senão o texto normalizado. */
export function chaveJuncao(v: unknown): string {
  const t = normTexto(v);
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t;
}

// ———————————————————————————————————————————————— frequência (Brasília, UTC−3 fixo)

export type Frequencia =
  | { tipo: "manual" }
  | { tipo: "intervalo"; minutos: number }
  | { tipo: "diario"; hora: string; diasUteis?: boolean }
  | { tipo: "semanal"; hora: string; dias: number[] }
  | { tipo: "mensal"; hora: string; dia: number };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MIN_INTERVALO = 5;

export function lerFrequencia(v: unknown): Frequencia {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const hora = typeof o.hora === "string" && HORA.test(o.hora) ? o.hora : "08:00";
  switch (o.tipo) {
    case "intervalo": {
      const m = typeof o.minutos === "number" ? Math.round(o.minutos) : 60;
      return { tipo: "intervalo", minutos: Math.min(10_080, Math.max(MIN_INTERVALO, m)) };
    }
    case "diario":
      return { tipo: "diario", hora, diasUteis: o.diasUteis === true || undefined };
    case "semanal": {
      const dias = [...new Set((Array.isArray(o.dias) ? o.dias : []).filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
      return { tipo: "semanal", hora, dias: dias.length ? dias : [1] };
    }
    case "mensal": {
      const d = typeof o.dia === "number" ? Math.round(o.dia) : 1;
      return { tipo: "mensal", hora, dia: Math.min(28, Math.max(1, d)) };
    }
    default:
      return { tipo: "manual" };
  }
}

const OFFSET_MS = 3 * 3600_000; // Brasília = UTC−3

/** A próxima execução DEPOIS de `agora` (ISO em UTC) — null no manual. */
export function proximaExecucao(f: Frequencia, agora: Date): string | null {
  if (f.tipo === "manual") return null;
  if (f.tipo === "intervalo") return new Date(agora.getTime() + f.minutos * 60_000).toISOString();
  const [hh, mm] = f.hora.split(":").map(Number);
  const local = new Date(agora.getTime() - OFFSET_MS); // os campos UTC deste Date = o relógio de Brasília
  for (let d = 0; d <= 62; d++) {
    const c = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + d, hh, mm));
    const quando = c.getTime() + OFFSET_MS;
    if (quando <= agora.getTime()) continue;
    const dow = c.getUTCDay();
    if (f.tipo === "diario" && f.diasUteis && (dow === 0 || dow === 6)) continue;
    if (f.tipo === "semanal" && !f.dias.includes(dow)) continue;
    if (f.tipo === "mensal" && c.getUTCDate() !== f.dia) continue;
    return new Date(quando).toISOString();
  }
  return null;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function rotuloFrequencia(f: Frequencia): string {
  switch (f.tipo) {
    case "manual":
      return "Manual";
    case "intervalo":
      return f.minutos % 60 === 0 ? `A cada ${f.minutos / 60} h` : `A cada ${f.minutos} min`;
    case "diario":
      return `${f.diasUteis ? "Dias úteis" : "Todo dia"} às ${f.hora}`;
    case "semanal":
      return `${f.dias.map((d) => DIAS[d]).join(", ")} às ${f.hora}`;
    case "mensal":
      return `Todo dia ${f.dia} às ${f.hora}`;
  }
}

// ———————————————————————————————————————————————— o MOTOR

export type EstadoExecNo = "fila" | "rodando" | "ok" | "erro" | "ignorado";
export type PassoExec = {
  no: string;
  estado: EstadoExecNo;
  itens: number;
  /** Execuções do nó (o corpo de um laço roda várias vezes). */
  vezes: number;
  ms: number;
  erro?: string;
  /** Amostra da última saída (até 50 itens por porta) — a tela mostra e o editor tira os caminhos. */
  amostra?: Portas;
  aviso?: string;
};
export type ResultadoExec = {
  estado: "concluido" | "falhou" | "cancelado";
  passos: Record<string, PassoExec>;
  erro?: string;
  noErro?: string;
  /** Erros APONTADOS (nó "Apontar erros") — o relatório da execução. */
  apontados: Item[];
  inicio: string;
  fim: string;
};

const AMOSTRA = 50;
const amostrar = (p: Portas): Portas => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.slice(0, AMOSTRA)]));

/**
 * Executa o fluxo. `onPasso` recebe o estado de cada nó a cada mudança (a tela anima). Não lança: falhas viram o resultado.
 * `inicio` = o id do nó de partida (padrão: todos os gatilhos).
 */
export async function executarFluxo(
  g: Grafo,
  reg: Registro,
  ctx: Omit<ContextoNo, "aviso">,
  onPasso?: (p: PassoExec) => void,
  agora: () => Date = () => new Date(),
): Promise<ResultadoExec> {
  const inicio = agora().toISOString();
  const passos: Record<string, PassoExec> = {};
  const apontados: Item[] = [];
  const fim = (r: Omit<ResultadoExec, "passos" | "apontados" | "inicio" | "fim">): ResultadoExec => ({ ...r, passos, apontados, inicio, fim: agora().toISOString() });
  const problemas = validarGrafo(g, reg).filter((p) => p.nivel === "erro");
  if (problemas.length) return fim({ estado: "falhou", erro: problemas.map((p) => p.texto).join(" "), noErro: problemas[0].no });

  const nos = new Map(g.nos.map((n) => [n.id, n]));
  const entrando = (id: string, porta: string) => g.conexoes.filter((c) => c.para === id && c.entrada === porta);
  // Caixa de entrada: o que cada conexão já entregou nesta rodada do nó.
  const caixa = new Map<string, Map<string, Item[]>>(); // nó → (chave da conexão → itens)
  const chaveC = (c: Conexao) => `${c.de}|${c.saida}|${c.entrada}`;
  const estados = new Map<string, EstadoNo>();
  const fila: string[] = [];
  const marcar = (id: string, p: Partial<PassoExec>) => {
    const atual = passos[id] ?? { no: id, estado: "fila", itens: 0, vezes: 0, ms: 0 };
    passos[id] = { ...atual, ...p };
    onPasso?.(passos[id]);
  };
  for (const n of g.nos) marcar(n.id, { estado: "fila" });

  /** A porta está pronta quando TODAS as conexões que chegam a ela entregaram. */
  const prontaPorta = (id: string, porta: string) => {
    const cs = entrando(id, porta);
    const cx = caixa.get(id);
    return cs.length > 0 && cs.every((c) => cx?.has(chaveC(c)));
  };
  const pronto = (id: string): boolean => {
    const n = nos.get(id);
    const d = n && reg.get(n.tipo);
    if (!n || !d) return false;
    if (n.tipo === TIPO_LACO) return prontaPorta(id, "entrada") || prontaPorta(id, PORTA_VOLTA);
    const ligadas = d.entradas.filter((p) => entrando(id, p).length);
    return ligadas.length > 0 && ligadas.every((p) => prontaPorta(id, p));
  };
  const entregar = (de: string, saidas: Portas) => {
    for (const c of g.conexoes.filter((x) => x.de === de)) {
      if (!(c.saida in saidas)) continue;
      const itens = saidas[c.saida];
      const cx = caixa.get(c.para) ?? new Map<string, Item[]>();
      cx.set(chaveC(c), itens);
      caixa.set(c.para, cx);
      if (pronto(c.para) && !fila.includes(c.para)) fila.push(c.para);
    }
  };
  const recolher = (id: string, d: DefNo): Portas => {
    const cx = caixa.get(id) ?? new Map();
    const ent: Portas = {};
    const n = nos.get(id);
    // O laço consome UMA porta por vez (volta antes de entrada nova).
    const portas = n?.tipo === TIPO_LACO ? (prontaPorta(id, PORTA_VOLTA) ? [PORTA_VOLTA] : ["entrada"]) : d.entradas;
    for (const p of portas) {
      ent[p] = entrando(id, p).flatMap((c) => cx.get(chaveC(c)) ?? []);
      for (const c of entrando(id, p)) cx.delete(chaveC(c));
    }
    return ent;
  };

  for (const n of g.nos) if (reg.get(n.tipo)?.categoria === "gatilho" && !n.desativado) fila.push(n.id);
  let passosTotais = 0;
  while (fila.length) {
    if (ctx.cancelado()) return fim({ estado: "cancelado", erro: "Interrompido." });
    const id = fila.shift() as string;
    const n = nos.get(id) as NoFluxo;
    const d = reg.get(n.tipo) as DefNo;
    if (++passosTotais > MAX_PASSOS) return fim({ estado: "falhou", erro: `Passos demais (${MAX_PASSOS}) — confira o laço.`, noErro: id });
    const ent = d.categoria === "gatilho" ? {} : recolher(id, d);
    const anterior = passos[id];
    if (n.desativado) {
      // Desativado: repassa a 1ª entrada pela 1ª saída (como no N8N).
      const repasse = Object.values(ent)[0] ?? [];
      marcar(id, { estado: "ignorado", itens: repasse.length });
      entregar(id, Object.fromEntries(d.saidas.map((s, i) => [s, i === 0 ? repasse : []])));
      continue;
    }
    if (d.categoria !== "gatilho" && !d.rodaSemItens && Object.values(ent).every((l) => !l.length)) {
      // Nada chegou (ramo vazio de um SE, por exemplo): o nó não roda e repassa vazio.
      marcar(id, { estado: anterior?.estado === "ok" ? "ok" : "ignorado" });
      entregar(id, Object.fromEntries([...d.saidas, SAIDA_ERRO].map((s) => [s, []])));
      continue;
    }
    const t0 = Date.now();
    marcar(id, { estado: "rodando", vezes: (anterior?.vezes ?? 0) + 1, aviso: undefined });
    const estado = estados.get(id) ?? {};
    estados.set(id, estado);
    let saidas: Portas;
    try {
      saidas = await d.executar(ent, n.config, { ...ctx, aviso: (t) => marcar(id, { aviso: t.slice(0, 200) }) }, estado);
      for (const [porta, itens] of Object.entries(saidas)) {
        if (itens.length > MAX_ITENS) throw new Error(`Itens demais na saída “${porta}” (${itens.length}; máximo ${MAX_ITENS}).`);
        if (porta === "__apontados") apontados.push(...itens);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      marcar(id, { estado: "erro", erro: msg, ms: (anterior?.ms ?? 0) + Date.now() - t0 });
      if (ctx.cancelado()) return fim({ estado: "cancelado", erro: "Interrompido." });
      if (g.conexoes.some((c) => c.de === id && c.saida === SAIDA_ERRO)) {
        const erroItem: Item = { erro: msg, no: n.nome || d.rotulo, entrada: Object.values(ent)[0]?.length ?? 0 };
        entregar(id, { ...Object.fromEntries(d.saidas.map((s) => [s, []])), [SAIDA_ERRO]: [erroItem] });
        continue;
      }
      return fim({ estado: "falhou", erro: `${n.nome || d.rotulo}: ${msg}`, noErro: id });
    }
    const total = d.saidas.reduce((s, p) => s + (saidas[p]?.length ?? 0), 0);
    marcar(id, { estado: "ok", itens: total, ms: (anterior?.ms ?? 0) + Date.now() - t0, amostra: amostrar(saidas), erro: undefined });
    const publicas = Object.fromEntries(Object.entries(saidas).filter(([k]) => k !== "__apontados"));
    entregar(id, d.entregaParcial ? publicas : { ...Object.fromEntries([...d.saidas, SAIDA_ERRO].map((s) => [s, []])), ...publicas });
  }
  return fim({ estado: "concluido" });
}

/** O resumo curto de uma execução (lista de fluxos). */
export function resumoExecucao(r: ResultadoExec): { estado: ResultadoExec["estado"]; erro?: string; nos: number; erros: number; apontados: number; inicio: string; fim: string } {
  const ps = Object.values(r.passos);
  return {
    estado: r.estado,
    erro: r.erro?.slice(0, 300),
    nos: ps.filter((p) => p.estado === "ok").length,
    erros: ps.filter((p) => p.estado === "erro").length,
    apontados: r.apontados.length,
    inicio: r.inicio,
    fim: r.fim,
  };
}

/** Um id curto e único para nó novo. */
export function novoIdNo(g: Grafo, tipo: string): string {
  const base = tipo.split(".").pop() || "no";
  for (let i = 1; ; i++) {
    const id = `${base}${i}`;
    if (!g.nos.some((n) => n.id === id)) return id;
  }
}
