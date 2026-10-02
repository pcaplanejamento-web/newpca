// AUTOMAÇÃO CENTI — "LER A TELA PROTOCOLO" (núcleo PURO, testado). A extensão APRENDE clicando: o ADM, na aba da
// automação, escolhe os departamentos, clica em Pesquisar, abre as abas (A Receber · Em Análise · Analisado · Em Transito)
// e, se quiser os PDFs, emite o de um protocolo. A extensão guarda o pedido COMPLETO de cada CONSULTA (método, caminho,
// corpo — nunca cabeçalhos) com o resumo da resposta; daqui sai o MODELO salvo para todos os ADMs e, depois, a leitura:
// repetir cada consulta (com as páginas), achatar as linhas, mapear as colunas e juntar as abas. Nada é gravado na Centi.

/** Um pedido que a extensão aprendeu (centi-anexo.js → registroDoAprendiz). */
export type PedidoAprendido =
  | { tipo: "consulta"; metodo: string; caminho: string; corpo: unknown; resposta: { lista: string[]; total: number; linhas: Record<string, string>[] }; em?: string }
  | { tipo: "operacao"; metodo: string; caminho: string; corpo: { ModuleKey: number; Guid?: string; Params: { Key: string; Value: unknown }[] }; em?: string }
  | { tipo: "arquivo"; metodo: string; caminho: string; em?: string };

export const COLUNAS_TELA = ["id", "processo", "data", "usuario", "origem", "destino", "assunto", "interessado"] as const;
export type ColunaTela = (typeof COLUNAS_TELA)[number];
export const ROTULO_COLUNA: Record<ColunaTela, string> = {
  id: "ID",
  processo: "Processo",
  data: "Data",
  usuario: "Usuário origem",
  origem: "Depto. origem",
  destino: "Depto. destino",
  assunto: "Assunto",
  interessado: "Interessado",
};

/** Uma CONSULTA do modelo (uma aba da Tela Protocolo). */
export type ConsultaTela = { rotulo: string; metodo: "GET" | "POST"; caminho: string; corpo: unknown; lista: string[] };
/** A EMISSÃO do PDF de um protocolo: a operação aprendida, com o parâmetro que leva o protocolo (o campo da linha). */
export type EmissaoTela = { moduleKey: number; guid: string; params: { Key: string; Value: string }[]; param: string; campo: string };
export type ModeloTela = {
  consultas: ConsultaTela[];
  colunas: Partial<Record<ColunaTela, string>>;
  emissao: EmissaoTela | null;
  em: string | null;
};

export const MAX_CONSULTAS_TELA = 8;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** O mesmo filtro da extensão (consultaPermitida): só a API restauth, verbo de leitura, nunca de escrita/arquivo. */
const VERBO_ESCRITA = /(save|delete|remove|exclu|insert|update|upload|send|tramit|assin|sign|cancel|import|exec|commit|aprov|approv|confirm|logout|login)/i;
const VERBO_LEITURA = /^(load\w*|list\w*|get\w*|search\w*|query\w*|find\w*|filter\w*|grid\w*|pesquis\w*|consult\w*|count\w*|page\w*|select\w*|lookup\w*|combo\w*|tree\w*|view\w*)$/i;
const VERBO_ARQUIVO = /^(getbinlink|getbin|getfile)$/i;

export function consultaPermitida(caminho: string, metodo: string): boolean {
  if (!/^(GET|POST)$/.test(metodo)) return false;
  const m = /^restauth\/([^/?#]+)/i.exec(caminho);
  return !!m && VERBO_LEITURA.test(m[1]) && !VERBO_ESCRITA.test(m[1]) && !VERBO_ARQUIVO.test(m[1]);
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Qualquer JSON → modelo válido (ou null): só consultas de leitura, corpo até 16 KB, colunas e emissão conferidas. */
export function coerceModeloTela(v: unknown): ModeloTela | null {
  const o = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!o || !Array.isArray(o.consultas)) return null;
  const consultas: ConsultaTela[] = [];
  for (const c of o.consultas.slice(0, MAX_CONSULTAS_TELA)) {
    const x = (c ?? {}) as Record<string, unknown>;
    const metodo = x.metodo === "POST" ? "POST" : x.metodo === "GET" ? "GET" : null;
    const caminho = texto(x.caminho, 1000);
    if (!metodo || !consultaPermitida(caminho, metodo)) continue;
    const corpo = metodo === "POST" ? (x.corpo ?? null) : null;
    if (corpo !== null && (typeof corpo !== "object" || JSON.stringify(corpo).length > 16384)) continue;
    const lista = Array.isArray(x.lista) ? x.lista.filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 80)).slice(0, 8) : [];
    consultas.push({ rotulo: texto(x.rotulo, 40) || `Consulta ${consultas.length + 1}`, metodo, caminho, corpo, lista });
  }
  if (!consultas.length) return null;
  const colunas: ModeloTela["colunas"] = {};
  const cs = (o.colunas && typeof o.colunas === "object" ? o.colunas : {}) as Record<string, unknown>;
  for (const k of COLUNAS_TELA) {
    const t = texto(cs[k], 120);
    if (t) colunas[k] = t;
  }
  const e = (o.emissao && typeof o.emissao === "object" ? o.emissao : null) as Record<string, unknown> | null;
  const params = Array.isArray(e?.params)
    ? (e.params as unknown[])
        .map((p) => p as { Key?: unknown; Value?: unknown })
        .filter((p) => typeof p?.Key === "string")
        .slice(0, 80)
        .map((p) => ({ Key: String(p.Key).slice(0, 80), Value: String(p.Value ?? "").slice(0, 200) }))
    : [];
  const emissao =
    e && Number.isInteger(e.moduleKey) && (e.moduleKey as number) > 0 && GUID.test(texto(e.guid, 40)) && texto(e.param, 80) && texto(e.campo, 120) && params.length
      ? { moduleKey: e.moduleKey as number, guid: texto(e.guid, 40).toLowerCase(), params, param: texto(e.param, 80), campo: texto(e.campo, 120) }
      : null;
  if (emissao && !params.some((p) => p.Key === emissao.param)) return { consultas, colunas, emissao: null, em: texto(o.em, 40) || null };
  return { consultas, colunas, emissao, em: texto(o.em, 40) || null };
}

// ---------------------------------------------------------------- APRENDER: do que a extensão guardou ao modelo

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Os campos (as chaves) das linhas de uma consulta, na ordem em que aparecem. */
export function camposDaConsulta(p: Extract<PedidoAprendido, { tipo: "consulta" }>): string[] {
  const vistos = new Set<string>();
  for (const l of p.resposta.linhas) for (const k of Object.keys(l)) vistos.add(k);
  return [...vistos];
}

/** Uma consulta parece a lista de protocolos? (algum campo de processo/protocolo). */
const pareceProtocolos = (campos: string[]) => campos.some((c) => /processo|protocolo/.test(norm(c)));

/** As consultas aprendidas que trazem PROTOCOLOS, sem repetir (mesmo método + caminho + corpo), na ordem em que vieram. */
export function consultasDeProtocolos(pedidos: readonly PedidoAprendido[]): Extract<PedidoAprendido, { tipo: "consulta" }>[] {
  const vistas = new Set<string>();
  const r: Extract<PedidoAprendido, { tipo: "consulta" }>[] = [];
  for (const p of pedidos) {
    if (p.tipo !== "consulta" || !consultaPermitida(p.caminho, p.metodo) || !pareceProtocolos(camposDaConsulta(p))) continue;
    const k = `${p.metodo} ${p.caminho} ${JSON.stringify(p.corpo ?? null)}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    r.push(p);
  }
  return r.slice(0, MAX_CONSULTAS_TELA);
}

const ABAS_TELA: [RegExp, string][] = [
  [/receb/, "A Receber"],
  [/analisad/, "Analisado"],
  [/analis/, "Em Análise"],
  [/transit/, "Em Trânsito"],
];
/** O nome da aba da consulta: pelo texto do corpo/caminho (receber, análise, analisado, trânsito); senão "Consulta N". */
export function rotuloDaConsulta(p: { caminho: string; corpo: unknown }, i: number): string {
  const t = norm(`${p.caminho} ${JSON.stringify(p.corpo ?? "")}`);
  for (const [re, nome] of ABAS_TELA) if (re.test(t)) return nome;
  return `Consulta ${i + 1}`;
}

const SUGESTOES: Record<ColunaTela, RegExp[]> = {
  id: [/^id$/, /\.id$/, /^key$/, /^codigo$/],
  processo: [/^processo$/, /numero.?processo/, /processo/, /protocolo/],
  data: [/^data$/, /data/, /date/],
  usuario: [/usuario.?origem/, /usuario/, /user/],
  origem: [/departamento.?origem/, /depto.?origem/, /origem/],
  destino: [/departamento.?destino/, /depto.?destino/, /destino/],
  assunto: [/assunto/, /objeto/],
  interessado: [/interessado/, /requerente/],
};
/** O mapa sugerido coluna → campo (o 1º padrão que casa, sem usar o mesmo campo duas vezes). */
export function sugerirColunas(campos: readonly string[]): Partial<Record<ColunaTela, string>> {
  const r: Partial<Record<ColunaTela, string>> = {};
  const usados = new Set<string>();
  for (const col of COLUNAS_TELA)
    for (const re of SUGESTOES[col]) {
      const c = campos.find((x) => !usados.has(x) && re.test(norm(x)));
      if (c) {
        r[col] = c;
        usados.add(c);
        break;
      }
    }
  return r;
}

/** A EMISSÃO aprendida: a operação que gerou um arquivo, com o parâmetro cujo valor é o de um campo de uma linha das
 * consultas (o protocolo que o ADM emitiu ao ensinar). Sem par = null (a emissão não é repetível). */
export function emissaoAprendida(pedidos: readonly PedidoAprendido[], consultas: readonly Extract<PedidoAprendido, { tipo: "consulta" }>[], colunas: Partial<Record<ColunaTela, string>>): EmissaoTela | null {
  const op = [...pedidos].reverse().find((p): p is Extract<PedidoAprendido, { tipo: "operacao" }> => p.tipo === "operacao");
  if (!op || !GUID.test(String(op.corpo.Guid ?? ""))) return null;
  const params = op.corpo.Params.map((p) => ({ Key: String(p.Key), Value: String(p.Value ?? "") }));
  const linhas = consultas.flatMap((c) => c.resposta.linhas);
  // Prefere o campo do ID (depois o do processo); depois qualquer campo — sempre um valor com cara de identificador.
  const preferidos = [colunas.id, colunas.processo].filter((x): x is string => !!x);
  const valeComoId = (v: string) => /^[\w./-]{2,40}$/.test(v) && /\d/.test(v);
  for (const campoPreferido of [...preferidos, null])
    for (const p of params) {
      if (!valeComoId(p.Value)) continue;
      for (const l of linhas) {
        const campo = campoPreferido ? (l[campoPreferido] === p.Value ? campoPreferido : null) : (Object.keys(l).find((k) => l[k] === p.Value) ?? null);
        if (campo) return { moduleKey: op.corpo.ModuleKey, guid: String(op.corpo.Guid).toLowerCase(), params, param: p.Key, campo };
      }
    }
  return null;
}

/** O MODELO a partir do que a extensão aprendeu (as colunas sugeridas — o ADM ajusta antes de salvar). */
export function modeloDoAprendiz(pedidos: readonly PedidoAprendido[], agora: Date): { modelo: ModeloTela | null; campos: string[]; total: number } {
  const cs = consultasDeProtocolos(pedidos);
  if (!cs.length) return { modelo: null, campos: [], total: 0 };
  const campos = [...new Set(cs.flatMap(camposDaConsulta))];
  const colunas = sugerirColunas(campos);
  const consultas: ConsultaTela[] = cs.map((c, i) => ({
    rotulo: rotuloDaConsulta(c, i),
    metodo: c.metodo === "POST" ? "POST" : "GET",
    caminho: c.caminho,
    corpo: c.metodo === "POST" ? c.corpo : null,
    lista: c.resposta.lista,
  }));
  return {
    modelo: { consultas, colunas, emissao: emissaoAprendida(pedidos, cs, colunas), em: agora.toISOString() },
    campos,
    total: cs.reduce((s, c) => s + c.resposta.total, 0),
  };
}

// ---------------------------------------------------------------- LER: a resposta de cada consulta

/** Uma linha em "chave → texto" — o MESMO achatamento da extensão (linhaPlana): {Fields:[{Key,Value}]} incluído. */
export function linhaPlana(o: unknown): Record<string, string> {
  const r: Record<string, string> = {};
  const segredo = /token|senha|password|passwd|authorization|refresh|cookie|secret/i;
  const ir = (v: unknown, pre: string, prof: number) => {
    if (Object.keys(r).length >= 60 || prof > 3 || v == null || Array.isArray(v)) return;
    if (typeof v === "object") {
      const x = v as Record<string, unknown>;
      if (Array.isArray(x.Fields))
        for (const f of x.Fields as { Key?: unknown; Value?: unknown }[]) if (f && typeof f.Key === "string" && !segredo.test(f.Key)) ir(f.Value, pre ? `${pre}.${f.Key}` : f.Key, prof + 1);
      for (const [k, y] of Object.entries(x)) if (k !== "Fields" && !segredo.test(k)) ir(y, pre ? `${pre}.${k}` : k, prof + 1);
      return;
    }
    if (pre) r[pre] = String(v).slice(0, 200);
  };
  ir(o, "", 0);
  return r;
}

/** Segue o caminho da lista na resposta ("@Chave" = um campo do padrão Fields); sem lista = []. */
export function itensDaLista(j: unknown, caminho: readonly string[]): unknown[] {
  let v: unknown = j;
  for (const passo of caminho) {
    if (v == null || typeof v !== "object") return [];
    if (passo.startsWith("@")) {
      const fs = (v as { Fields?: { Key?: unknown; Value?: unknown }[] }).Fields;
      v = Array.isArray(fs) ? fs.find((f) => f?.Key === passo.slice(1))?.Value : undefined;
    } else v = (v as Record<string, unknown>)[passo];
  }
  return Array.isArray(v) ? v : [];
}

/** Um protocolo lido da Tela Protocolo. */
export type ProtocoloTela = {
  chave: string;
  id: string;
  processo: string;
  numero: string | null;
  ano: string | null;
  data: string;
  usuario: string;
  origem: string;
  destino: string;
  assunto: string;
  interessado: string;
  abas: string[];
  bruto: Record<string, string>;
};

/** "156844/2026" → nº e ano (o processo pode vir com outros textos em volta). */
export function numeroDoProcesso(t: string): { numero: string | null; ano: string | null } {
  const m = /(\d{1,12})\s*\/\s*(\d{4})/.exec(t);
  if (m) return { numero: m[1].replace(/^0+(?=\d)/, ""), ano: m[2] };
  const s = /^\s*(\d{1,12})\s*$/.exec(t);
  return { numero: s ? s[1].replace(/^0+(?=\d)/, "") : null, ano: null };
}

/** As linhas de UMA resposta, com as colunas do modelo. */
export function lerLinhas(j: unknown, consulta: Pick<ConsultaTela, "lista" | "rotulo">, colunas: ModeloTela["colunas"]): ProtocoloTela[] {
  const r: ProtocoloTela[] = [];
  for (const item of itensDaLista(j, consulta.lista)) {
    const bruto = linhaPlana(item);
    const v = (c: ColunaTela) => (colunas[c] ? (bruto[colunas[c] as string] ?? "") : "").trim();
    const id = v("id");
    const processo = v("processo");
    if (!id && !processo) continue;
    const { numero, ano } = numeroDoProcesso(processo);
    r.push({
      chave: id ? `id:${id}` : `p:${processo}`,
      id,
      processo,
      numero,
      ano,
      data: v("data"),
      usuario: v("usuario"),
      origem: v("origem"),
      destino: v("destino"),
      assunto: v("assunto"),
      interessado: v("interessado"),
      abas: [consulta.rotulo],
      bruto,
    });
  }
  return r;
}

/** Junta as abas: o MESMO protocolo (pelo ID; sem ele, pelo processo) em várias abas = uma linha com as abas. */
export function juntarProtocolos(listas: readonly ProtocoloTela[][]): ProtocoloTela[] {
  const m = new Map<string, ProtocoloTela>();
  for (const l of listas)
    for (const p of l) {
      const ja = m.get(p.chave);
      if (!ja) m.set(p.chave, { ...p, abas: [...p.abas] });
      else for (const a of p.abas) if (!ja.abas.includes(a)) ja.abas.push(a);
    }
  return [...m.values()];
}

// ---------------------------------------------------------------- PÁGINAS

const TAMANHO = /^(take|top|pagesize|page_size|limit|rows|registros|quantidade|itensporpagina|tamanhopagina)$/i;
const DESLOCAMENTO = /^(skip|offset|start|inicio|first)$/i;
const PAGINA = /^(page|pagina|pageindex|pagenumber|numeropagina)$/i;

type Achado = { onde: "query" | "corpo"; chave: string; valor: number };
function acharNumero(caminho: string, corpo: unknown, re: RegExp): Achado | null {
  const q = caminho.indexOf("?");
  if (q >= 0)
    for (const [k, v] of new URLSearchParams(caminho.slice(q + 1)))
      if (re.test(k) && /^\d{1,7}$/.test(v)) return { onde: "query", chave: k, valor: Number(v) };
  if (corpo && typeof corpo === "object" && !Array.isArray(corpo))
    for (const [k, v] of Object.entries(corpo as Record<string, unknown>))
      if (re.test(k) && (typeof v === "number" || (typeof v === "string" && /^\d{1,7}$/.test(v)))) return { onde: "corpo", chave: k, valor: Number(v) };
  return null;
}
function trocar(caminho: string, corpo: unknown, a: Achado, novo: number): { caminho: string; corpo: unknown } {
  if (a.onde === "query") {
    const q = caminho.indexOf("?");
    const ps = new URLSearchParams(caminho.slice(q + 1));
    ps.set(a.chave, String(novo));
    return { caminho: `${caminho.slice(0, q)}?${ps.toString()}`, corpo };
  }
  const c = { ...(corpo as Record<string, unknown>) };
  c[a.chave] = typeof c[a.chave] === "string" ? String(novo) : novo;
  return { caminho, corpo: c };
}

/** A PRÓXIMA PÁGINA de uma consulta (a resposta veio cheia — `recebidas` = o tamanho da página); sem paginação = null. */
export function proximaPagina(caminho: string, corpo: unknown, recebidas: number): { caminho: string; corpo: unknown } | null {
  const tam = acharNumero(caminho, corpo, TAMANHO);
  if (!tam || tam.valor <= 0 || recebidas < tam.valor) return null;
  const desl = acharNumero(caminho, corpo, DESLOCAMENTO);
  if (desl) return trocar(caminho, corpo, desl, desl.valor + tam.valor);
  const pag = acharNumero(caminho, corpo, PAGINA);
  if (pag) return trocar(caminho, corpo, pag, pag.valor + 1);
  return null;
}
export const MAX_PAGINAS_TELA = 40;

// ---------------------------------------------------------------- EMITIR

/** O corpo da emissão do PDF de UM protocolo: a operação aprendida com o parâmetro do protocolo trocado (as travas de
 * não anexar/assinar/enviar a extensão força). Sem o valor do campo na linha = null. */
export function corpoEmissao(e: EmissaoTela, p: Pick<ProtocoloTela, "bruto">): { ModuleKey: number; Guid: string; Params: { Key: string; Value: string }[] } | null {
  const valor = p.bruto[e.campo];
  if (!valor) return null;
  return { ModuleKey: e.moduleKey, Guid: e.guid, Params: e.params.map((x) => (x.Key === e.param ? { Key: x.Key, Value: valor } : x)) };
}

/** O nome do PDF do protocolo: "SIGLA - Protocolo 156844 - 2026.pdf" (sigla = o depto. de origem, quando houver). */
export function nomePdfProtocolo(p: Pick<ProtocoloTela, "numero" | "ano" | "id" | "origem">): string {
  const base = p.numero ? `Protocolo ${p.numero}${p.ano ? ` - ${p.ano}` : ""}` : `Protocolo Id ${p.id}`;
  const sigla = p.origem.split(/\s+-\s+/)[0]?.trim();
  const nome = `${sigla && sigla.length <= 20 ? `${sigla} - ` : ""}${base}`.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 150);
  return `${nome}.pdf`;
}
