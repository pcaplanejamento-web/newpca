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
const VERBO_ARQUIVO = /^(getbinlink|getbincache|getbin|getfile)$/i;

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

// ---------------------------------------------------------------- A TELA OPERADA PELA EXTENSÃO (repartições → Em Análise)

/** Um protocolo da aba "Em Análise", como a extensão o leu da grade da Centi. */
export type ProtocoloEmAnalise = {
  chave: string;
  protocolo: string;
  ano: string;
  /** O Id do protocolo na Centi (o "Id:" da capa) — dos dados da grade; vazio quando a grade não o traz. */
  id: string;
  /** A data de entrada na repartição, como a grade mostra. */
  entrada: string;
  departamento: string;
  interessado: string;
  solicitante: string;
  natureza: string;
};

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** As linhas que a extensão devolveu → protocolos limpos (nº sem zeros à esquerda, ano de 4 dígitos), sem repetir. */
export function normalizarProtocolosTela(v: unknown): ProtocoloEmAnalise[] {
  const r = new Map<string, ProtocoloEmAnalise>();
  for (const x of Array.isArray(v) ? v.slice(0, 5000) : []) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const protocolo = soDigitos(o.protocolo).replace(/^0+(?=\d)/, "").slice(0, 12);
    if (!protocolo) continue;
    const ano = /^\d{4}$/.test(soDigitos(o.ano)) ? soDigitos(o.ano) : "";
    const t = (k: string) => String(o[k] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    const chave = `${protocolo}/${ano}`;
    const id = soDigitos(o.id).replace(/^0+(?=\d)/, "");
    if (!r.has(chave))
      r.set(chave, {
        chave,
        protocolo,
        ano,
        id: id.length <= 12 ? id : "",
        entrada: t("entrada").slice(0, 40),
        departamento: t("departamento"),
        interessado: t("interessado"),
        solicitante: t("solicitante"),
        natureza: t("natureza"),
      });
  }
  return [...r.values()];
}

/** O protocolo do SISTEMA com o mesmo nº (e o mesmo ano, quando os dois têm) — "156844/2026" ou "156844". */
export function noSistemaTela<T extends { numero: string; idExterno?: string | null }>(
  sistema: readonly T[],
): (p: Pick<ProtocoloEmAnalise, "protocolo" | "ano"> & { id?: string | null }) => T | null {
  const comAno = new Map<string, T>();
  const semAno = new Map<string, T>();
  const qualquer = new Map<string, T>();
  const porId = new Map<string, T>();
  for (const s of sistema) {
    const id = soDigitos(s.idExterno).replace(/^0+/, "");
    if (id) porId.set(id, s);
    const { numero, ano } = numeroDoProcesso(s.numero);
    if (!numero) continue;
    if (ano) comAno.set(`${numero}/${ano}`, s);
    else semAno.set(numero, s);
    if (!qualquer.has(numero)) qualquer.set(numero, s);
  }
  // O Id da Centi (lido do cadastro) decide; sem ele, o nº — os dois com ano = o ano tem de bater (o 156844/2025 não é o
  // 156844/2026); sem ano de um lado, vale o nº.
  return (p) => {
    const id = soDigitos(p.id).replace(/^0+/, "");
    if (id && porId.has(id)) return porId.get(id) ?? null;
    return (p.ano ? (comAno.get(`${p.protocolo}/${p.ano}`) ?? semAno.get(p.protocolo)) : qualquer.get(p.protocolo)) ?? null;
  };
}

/** Os dados do cadastro do protocolo na Centi (lidos pela extensão na Tela Protocolo). */
export type DadosCentiProtocolo = { id: string | null; campos: { rotulo: string; valor: string }[] };

/** O que a extensão devolveu → dados limpos (até 80 campos; rótulo ≤ 60 e valor ≤ 2000, sem repetir o rótulo). */
export function dadosCentiValidos(v: unknown): DadosCentiProtocolo | null {
  const o = v && typeof v === "object" ? (v as { id?: unknown; campos?: unknown }) : null;
  if (!o || !Array.isArray(o.campos)) return null;
  const vistos = new Set<string>();
  const campos: DadosCentiProtocolo["campos"] = [];
  for (const c of o.campos.slice(0, 80)) {
    const x = c && typeof c === "object" ? (c as { rotulo?: unknown; valor?: unknown }) : {};
    const rotulo = typeof x.rotulo === "string" ? x.rotulo.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!rotulo || vistos.has(rotulo)) continue;
    vistos.add(rotulo);
    campos.push({ rotulo, valor: typeof x.valor === "string" ? x.valor.trim().slice(0, 2000) : "" });
  }
  const id = soDigitos(o.id).replace(/^0+/, "");
  return { id: id && id.length <= 12 ? id : null, campos };
}

/** O nome do PDF emitido de um protocolo da Tela Protocolo ("Protocolo 97608 - 2026.pdf"). */
export const nomePdfEmAnalise = (p: Pick<ProtocoloEmAnalise, "protocolo" | "ano">) => `Protocolo ${p.protocolo}${p.ano ? ` - ${p.ano}` : ""}.pdf`;

/** A escolha lembrada no aparelho, só com as repartições que a Centi ainda lista. */
export function departamentosEscolhidosValidos(escolhidos: unknown, disponiveis: readonly string[]): string[] {
  const set = new Set(disponiveis);
  return Array.isArray(escolhidos) ? [...new Set(escolhidos.filter((x): x is string => typeof x === "string" && set.has(x)))] : [];
}

// ---------------------------------------------------------------- A EMISSÃO DOS DOCUMENTOS DO PROTOCOLO "POR CÓDIGO"
/**
 * O "Emitir documentos" APRENDIDO da própria tela da Centi (o operation que ela mandou na 1ª emissão acompanhada): o
 * ModuleKey, o Guid, os parâmetros, QUAL deles leva o Id do protocolo e os demais que são DO PROTOCOLO (o nº, o ano,
 * "nº/ano" e a data de hoje) — dali em diante a extensão emite direto, como o Emitir DFD (as travas são forçadas na
 * extensão), preenchendo esses campos com os do protocolo pedido. `v: 2` = o modelo com os campos (o antigo, só com o
 * Id, levava o nº/ano/data do protocolo de onde foi aprendido — é descartado e aprendido de novo).
 */
export type CampoEmissao = "protocolo" | "ano" | "protocoloAno" | "hoje-dmy" | "hoje-iso";
export type EmissaoProtocolo = {
  v: 2;
  moduleKey: number;
  guid: string;
  params: { Key: string; Value: string }[];
  param: string;
  campos: Record<string, CampoEmissao>;
};
/** O protocolo da emissão: o Id na Centi, o nº e o ano (+ hoje, "AAAA-MM-DD" em Brasília). */
export type AlvoEmissao = { id: string | null | undefined; protocolo?: string | null; ano?: string | null; hoje: string };

const CAMPOS_EMISSAO: readonly CampoEmissao[] = ["protocolo", "ano", "protocoloAno", "hoje-dmy", "hoje-iso"];
const semZeros = (s: unknown) => soDigitos(s).replace(/^0+(?=\d)/, "");
const dmyDe = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const ehIsoDia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** O campo do protocolo que um parâmetro carrega (igualdade EXATA com os dados do protocolo ensinado); nenhum = null. */
function campoDoParametro(p: { Key: string; Value: string }, a: AlvoEmissao): CampoEmissao | null {
  const v = p.Value.trim();
  const prot = semZeros(a.protocolo);
  const ano = /^\d{4}$/.test(String(a.ano ?? "")) ? String(a.ano) : "";
  if (prot && /^\d+$/.test(v) && semZeros(v) === prot) return "protocolo";
  const pa = /^0*(\d+)\s*\/\s*(\d{4})$/.exec(v);
  if (prot && ano && pa && pa[1] === prot && pa[2] === ano) return "protocoloAno";
  // O ANO do protocolo só num parâmetro que se chama "ano…" — o exercício é da sessão, não do protocolo.
  const chave = p.Key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (ano && v === ano && chave.includes("ano") && !chave.includes("exerc")) return "ano";
  if (ehIsoDia(a.hoje)) {
    if (v.includes(dmyDe(a.hoje))) return "hoje-dmy";
    if (v.startsWith(a.hoje)) return "hoje-iso";
  }
  return null;
}

/** O operation da tela + o protocolo emitido → o modelo (o parâmetro cujo valor é o Id + os campos do protocolo). */
export function emissaoDoPedido(corpo: unknown, a: AlvoEmissao): EmissaoProtocolo | null {
  const alvo = semZeros(a.id);
  const c = (corpo && typeof corpo === "object" ? corpo : null) as { ModuleKey?: unknown; Guid?: unknown; Params?: unknown } | null;
  if (!alvo || !c || !Number.isInteger(c.ModuleKey) || !GUID.test(String(c.Guid ?? "")) || !Array.isArray(c.Params)) return null;
  const params = c.Params.filter((x): x is { Key: unknown; Value: unknown } => !!x && typeof x === "object")
    .map((x) => ({ Key: String(x.Key ?? "").slice(0, 80), Value: String(x.Value ?? "").slice(0, 400) }))
    .filter((x) => x.Key)
    .slice(0, 60);
  const p = params.find((x) => semZeros(x.Value) === alvo && /^\d+$/.test(x.Value.trim()));
  if (!p) return null;
  const campos: Record<string, CampoEmissao> = {};
  for (const x of params) {
    if (x.Key === p.Key || ehParamAssincrono(x.Key)) continue;
    const campo = campoDoParametro(x, a);
    if (campo) campos[x.Key] = campo;
  }
  return { v: 2, moduleKey: c.ModuleKey as number, guid: String(c.Guid).toLowerCase(), params, param: p.Key, campos };
}

/** O modelo guardado (config do servidor) validado; inválido ou do formato antigo (sem `v: 2`) = null. */
export function coerceEmissaoProtocolo(v: unknown): EmissaoProtocolo | null {
  const o = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (o?.v !== 2 || !Number.isInteger(o.moduleKey) || (o.moduleKey as number) <= 0 || !GUID.test(String(o.guid ?? "")) || !Array.isArray(o.params)) return null;
  const params = o.params
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ Key: String(x.Key ?? "").slice(0, 80), Value: String(x.Value ?? "").slice(0, 400) }))
    .filter((x) => x.Key)
    .slice(0, 60);
  const param = String(o.param ?? "");
  if (!params.some((x) => x.Key === param)) return null;
  const brutos = o.campos && typeof o.campos === "object" ? (o.campos as Record<string, unknown>) : {};
  const campos: Record<string, CampoEmissao> = {};
  for (const [k, c] of Object.entries(brutos))
    if (k !== param && params.some((x) => x.Key === k) && CAMPOS_EMISSAO.includes(c as CampoEmissao)) campos[k] = c as CampoEmissao;
  return { v: 2, moduleKey: o.moduleKey as number, guid: String(o.guid).toLowerCase(), params, param, campos };
}

/** O parâmetro do modo ASSÍNCRONO do "Emitir documentos" (sem acento/caixa: Assincrono, Assync…, Async…). */
export const ehParamAssincrono = (key: string) =>
  /^(assincron|assync|async)/.test(
    key
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase(),
  );

/** O "não" no MESMO formato do valor capturado (true→false, 1→0, S→N, Sim→Não, Y→N); desconhecido = "0". */
export function valorSincrono(v: string): string {
  const t = v.trim();
  const n = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (n === "true" || n === "false") return t[0] === "T" ? (t === "TRUE" ? "FALSE" : "False") : "false";
  if (n === "sim" || n === "nao") return t === t.toUpperCase() ? "NÃO" : "Não";
  if (n === "s" || n === "n") return t === t.toLowerCase() ? "n" : "N";
  if (n === "y") return t === "y" ? "n" : "N";
  return "0";
}

/** O corpo do operation para emitir os documentos do protocolo pedido: o Id, o nº/ano e a data de hoje nos campos do
 * protocolo; sempre SÍNCRONO — no modo assíncrono a Centi gera o documento em segundo plano e a chave devolvida não aponta
 * para um arquivo pronto. Sem o Id = null; um campo do protocolo sem o dado (nº/ano desconhecidos) fica como aprendido. */
export function corpoEmissaoProtocolo(e: EmissaoProtocolo, a: AlvoEmissao): { ModuleKey: number; Guid: string; Params: { Key: string; Value: string }[] } | null {
  const v = semZeros(a.id);
  if (!v) return null;
  const prot = semZeros(a.protocolo);
  const ano = /^\d{4}$/.test(String(a.ano ?? "")) ? String(a.ano) : "";
  const hoje = ehIsoDia(a.hoje) ? a.hoje : "";
  const valor = (x: { Key: string; Value: string }): string => {
    if (x.Key === e.param) return v;
    if (ehParamAssincrono(x.Key)) return valorSincrono(x.Value);
    switch (e.campos[x.Key]) {
      case "protocolo":
        return prot || x.Value;
      case "ano":
        return ano || x.Value;
      case "protocoloAno":
        return prot && ano ? `${prot}/${ano}` : x.Value;
      case "hoje-dmy":
        return hoje ? x.Value.replace(/\d{2}\/\d{2}\/\d{4}/, dmyDe(hoje)) : x.Value;
      case "hoje-iso":
        return hoje ? x.Value.replace(/^\d{4}-\d{2}-\d{2}/, hoje) : x.Value;
      default:
        return x.Value;
    }
  };
  return { ModuleKey: e.moduleKey, Guid: e.guid, Params: e.params.map((x) => ({ Key: x.Key, Value: valor(x) })) };
}

/** O mesmo modelo (para só gravar no servidor quando mudou). */
export const mesmaEmissao = (a: EmissaoProtocolo | null, b: EmissaoProtocolo | null) =>
  !!a &&
  !!b &&
  a.moduleKey === b.moduleKey &&
  a.guid === b.guid &&
  a.param === b.param &&
  JSON.stringify(a.params.map((x) => x.Key)) === JSON.stringify(b.params.map((x) => x.Key)) &&
  JSON.stringify(Object.entries(a.campos).sort()) === JSON.stringify(Object.entries(b.campos).sort());

// ---------------------------------------------------------------- A LEITURA EM LOTE (emitir + ler cada protocolo)
/** O resultado da leitura AUTOMÁTICA de um protocolo emitido (o PDF lido no navegador; a análise completa abre à parte). */
export type LeituraProtocolo = {
  estado: "ok" | "atencao" | "falha";
  /** O que aparece na célula (curto). */
  texto: string;
  dfds: number;
  numerosDfd: string[];
  valorCapa: number | null;
  assunto: string | null;
  anoPca: number | null;
};

/**
 * CONFERE o PDF emitido contra o protocolo pedido (a segurança do lote: nunca analisar o documento de OUTRO protocolo) e
 * resume a leitura: a capa tem de existir com o MESMO nº (e ano) e, quando os dois lados têm, o MESMO Id; sem DFDs =
 * atenção.
 */
export function conferirLeituraProtocolo(
  p: { protocolo: string; ano: string; id?: string | null },
  capa: { numero: string | null; idExterno: string | null; valorCapa: number | null; assunto: string | null; anoPca: number | null },
  dfds: string[],
): LeituraProtocolo {
  const base = { dfds: dfds.length, numerosDfd: dfds, valorCapa: capa.valorCapa, assunto: capa.assunto, anoPca: capa.anoPca };
  const m = /^0*(\d+)\s*(?:\/\s*(\d{4}))?/.exec(String(capa.numero ?? "").trim());
  if (!m) return { ...base, estado: "falha", texto: "O PDF não tem a capa do processo." };
  const prot = semZeros(p.protocolo);
  if (m[1] !== prot || (m[2] && /^\d{4}$/.test(p.ano) && m[2] !== p.ano))
    return { ...base, estado: "falha", texto: `O PDF é do protocolo ${capa.numero}, não do ${p.protocolo}/${p.ano}.` };
  const idCapa = semZeros(capa.idExterno);
  const idPedido = semZeros(p.id);
  if (idCapa && idPedido && idCapa !== idPedido) return { ...base, estado: "falha", texto: `O PDF tem o Id ${idCapa}, não o ${idPedido}.` };
  if (!dfds.length) return { ...base, estado: "atencao", texto: "Sem DFDs no PDF" };
  return { ...base, estado: "ok", texto: `${dfds.length} DFD(s)` };
}

/** Falha que vale UMA nova tentativa (rede, Centi fora do ar, sem resposta) — nunca uma recusa ou um PDF errado. */
export const falhaTransitoria = (erro: string) =>
  /n[aã]o respondeu|sem resposta|rede|demorou|tempo|timeout|\b5\d\d\b|indispon|inesperado/i.test(erro) && !/recus|permiss|bloquead|inv[aá]lid/i.test(erro);
