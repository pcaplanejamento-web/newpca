/**
 * A CENTI — o núcleo PURO do PEDIDO e da RESPOSTA das APIs públicas do portal de transparência (sem banco/DOM, testado em
 * `tests/centi-resposta.test.ts`): os parâmetros com os marcadores, o endereço (só o domínio da Centi) e a leitura da
 * resposta (o JSON dentro de texto e as aspas sem escape que a Centi manda). Nada aqui chama a Centi.
 *
 * O pedido é `POST {urlBase}/{endpoint}/{uf}/{tenant}` com o corpo = os `parametros`, em que os marcadores `{ano}`,
 * `{inicio}`, `{fim}` e `{pagina}` são trocados pelos valores do pedido (o texto que é SÓ o marcador vira o valor com o tipo
 * dele; dentro de um texto, a troca é textual — "01/01/{ano}").
 */

/** Só o host oficial da Centi (e os subdomínios dela) — nunca outro site. */
export const HOSTS_PERMITIDOS = ["centi.com.br"] as const;

/** O endereço de uma API da Centi. */
export type EnderecoCenti = { urlBase: string; endpoint: string; uf: string; tenant: string };

/** Os parâmetros (um OBJETO JSON) ou o motivo de não serem válidos. */
export function lerParametros(texto: string): { ok: true; valor: Record<string, unknown> } | { ok: false; motivo: string } {
  let v: unknown;
  try {
    v = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: "Os parâmetros não são um JSON válido." };
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, motivo: "Os parâmetros têm de ser um objeto JSON ({ … })." };
  return { ok: true, valor: v as Record<string, unknown> };
}

/** Os marcadores ({ano}, {inicio}…) usados nos parâmetros. */
export function marcadoresUsados(parametros: unknown): string[] {
  const achados = new Set<string>();
  const visitar = (x: unknown) => {
    if (typeof x === "string") for (const m of x.matchAll(/\{([a-z]+)\}/g)) achados.add(m[1]);
    else if (Array.isArray(x)) x.forEach(visitar);
    else if (x && typeof x === "object") Object.values(x).forEach(visitar);
  };
  visitar(parametros);
  return [...achados].sort();
}

/** Os marcadores que os parâmetros aceitam. */
export const MARCADORES = ["ano", "inicio", "fim", "pagina"] as const;

/**
 * Troca os marcadores pelos valores do pedido (o texto que é SÓ o marcador vira o valor com o tipo dele). Com o {ano},
 * o período {inicio}/{fim} (dd/mm/aaaa) é o ano inteiro quando o pedido não diz outro — a importação o divide em semanas.
 */
export function montarCorpo(parametros: unknown, vars: Record<string, number | string>): unknown {
  if (typeof vars.ano === "number" && vars.inicio == null) vars = { inicio: `01/01/${vars.ano}`, fim: `31/12/${vars.ano}`, ...vars };
  return trocarMarcadores(parametros, vars);
}

function trocarMarcadores(parametros: unknown, vars: Record<string, number | string>): unknown {
  if (typeof parametros === "string") {
    const so = parametros.match(/^\{([a-z]+)\}$/);
    if (so && so[1] in vars) return vars[so[1]];
    return parametros.replace(/\{([a-z]+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  }
  if (Array.isArray(parametros)) return parametros.map((p) => trocarMarcadores(p, vars));
  if (parametros && typeof parametros === "object") {
    return Object.fromEntries(Object.entries(parametros).map(([k, v]) => [k, trocarMarcadores(v, vars)]));
  }
  return parametros;
}

function hostPermitido(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return HOSTS_PERMITIDOS.some((p) => h === p || h.endsWith(`.${p}`));
}

/** A URL base: HTTPS, host da Centi, sem usuário/senha, porta, busca nem âncora. */
export function urlBaseValida(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && !u.port && hostPermitido(u.hostname);
  } catch {
    return false;
  }
}

/** O endereço do pedido. */
export function urlDaApi(a: EnderecoCenti): string {
  return `${a.urlBase.replace(/\/+$/, "")}/${a.endpoint}/${a.uf}/${a.tenant}`;
}

// ---------------------------------------------------------------------------------------------------------------
// O TESTE: lê a resposta da 1ª página (nada é gravado)
// ---------------------------------------------------------------------------------------------------------------

export type ResultadoTeste = {
  ok: boolean;
  status: number;
  ms: number;
  url: string;
  corpo: unknown;
  /** Quantos registros vieram nesta página. */
  itens: number;
  /** O total que a própria API informa (`TotalRegistros`), quando informa. */
  total: number | null;
  campos: string[];
  /** Os primeiros registros, com os valores encurtados. */
  amostra: Record<string, string>[];
  /** O que deu errado (ou o aviso do que veio). */
  mensagem: string | null;
};

export const AMOSTRA_TESTE = 5;
const MAX_VALOR = 160;

// ---------------------------------------------------------------------------------------------------------------
// LEITURA DA RESPOSTA — a Centi devolve o JSON DENTRO DE UMA STRING ("[\r\n {…}]") e, nele, aspas sem escape nos
// textos livres (ex.: … O "BRASIL CUP CAPOEIRA" QUE …). Nada disso pode derrubar a leitura.
// ---------------------------------------------------------------------------------------------------------------

const ehEspaco = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;

function proximoNaoEspaco(t: string, i: number): number {
  while (i < t.length && ehEspaco(t.charCodeAt(i))) i++;
  return i;
}

/** A aspa em `i` FECHA a string? Só quando o que vem depois é estrutura: ":", "}", "]", o fim, ou "," seguida de uma
 * CHAVE ("Nome":), de "{"/"[" ou de um valor (número, true/false/null). Senão é uma aspa DENTRO do texto. */
function aspaFecha(t: string, i: number): boolean {
  const k = proximoNaoEspaco(t, i + 1);
  if (k >= t.length) return true;
  const c = t[k];
  if (c === ":" || c === "}" || c === "]") return true;
  if (c !== ",") return false;
  const p = proximoNaoEspaco(t, k + 1);
  if (p >= t.length) return true;
  const d = t[p];
  if (d === "{" || d === "[" || d === "-" || (d >= "0" && d <= "9") || t.startsWith("true", p) || t.startsWith("false", p) || t.startsWith("null", p)) return true;
  if (d !== '"') return false;
  let q = p + 1;
  while (q < t.length && t[q] !== '"' && t[q] !== "\\" && q - p < 80) q++;
  if (t[q] !== '"') return false;
  const r = proximoNaoEspaco(t, q + 1);
  return t[r] === ":";
}

/** Conserta o JSON da Centi: escapa as aspas e os controles DENTRO dos textos (cópia por trechos — linear; fora dos
 * textos, salta direto para a próxima aspa). */
export function repararJsonCenti(t: string): string {
  const out: string[] = [];
  let ini = 0;
  let i = t.indexOf('"');
  while (i >= 0 && i < t.length) {
    // Dentro de um texto: anda até a aspa que o fecha.
    for (i++; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c === 0x5c) i++;
      else if (c === 0x22) {
        if (aspaFecha(t, i)) break;
        out.push(t.slice(ini, i), '\\"');
        ini = i + 1;
      } else if (c < 0x20) {
        out.push(t.slice(ini, i), c === 0x0a ? "\\n" : c === 0x0d ? "\\r" : c === 0x09 ? "\\t" : "");
        ini = i + 1;
      }
    }
    i = t.indexOf('"', i + 1);
  }
  out.push(t.slice(ini));
  return out.join("");
}

/** Lê o JSON da resposta: direto; senão consertado; e, se o que veio é um TEXTO com JSON dentro, lê esse texto também. */
export function lerJsonCenti(texto: string): { ok: true; valor: unknown; reparado: boolean } | { ok: false; erro: string } {
  let atual = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  let reparado = false;
  for (let nivel = 0; nivel < 3; nivel++) {
    let v: unknown;
    try {
      v = JSON.parse(atual);
    } catch (e1) {
      try {
        v = JSON.parse(repararJsonCenti(atual));
        reparado = true;
      } catch {
        return { ok: false, erro: e1 instanceof Error ? e1.message : "JSON inválido" };
      }
    }
    const t = typeof v === "string" ? v.trim() : "";
    if (t.startsWith("[") || t.startsWith("{")) {
      atual = t;
      continue;
    }
    return { ok: true, valor: v, reparado };
  }
  return { ok: false, erro: "JSON dentro de JSON em excesso" };
}

const ehRegistro = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x);
const ehLista = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.length > 0 && v.every(ehRegistro);

/** A lista de registros de uma resposta: a própria lista, ou a MAIOR lista de objetos dentro dela (`data`, `result`,
 * `$values`… em qualquer nível). Lista vazia vale (nenhum registro no período). */
export function registrosDaResposta(j: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(j)) return j.length === 0 || ehLista(j) ? (j as Record<string, unknown>[]) : null;
  let melhor: Record<string, unknown>[] | null = null;
  let vazia = false;
  const visitar = (v: unknown, nivel: number) => {
    if (!ehRegistro(v) || nivel > 4) return;
    for (const x of Object.values(v as Record<string, unknown>)) {
      if (Array.isArray(x)) {
        if (ehLista(x)) {
          if (!melhor || x.length > melhor.length) melhor = x;
        } else if (x.length === 0) vazia = true;
      } else visitar(x, nivel + 1);
    }
  };
  visitar(j, 0);
  return melhor ?? (vazia ? [] : null);
}

/** O RAIO-X da resposta que não traz lista (para o passo dizer o que veio): o tipo, as chaves e o começo do texto. */
export function esqueletoResposta(texto: string, valor?: unknown): string {
  const comeco = texto.trim().slice(0, 160).replace(/\s+/g, " ");
  if (valor === undefined) return `começa com: ${comeco || "(vazio)"}`;
  if (Array.isArray(valor)) return `uma lista com ${valor.length} item(ns) que não são registros; começa com: ${comeco}`;
  if (ehRegistro(valor)) {
    const chaves = Object.entries(valor as Record<string, unknown>)
      .slice(0, 12)
      .map(([k, v]) => `${k} (${Array.isArray(v) ? `lista de ${v.length}` : v === null ? "nulo" : typeof v})`);
    return `um objeto com ${chaves.join(", ")}`;
  }
  return `um ${typeof valor}: ${String(valor).slice(0, 160)}`;
}

function curto(v: unknown): string {
  if (v == null) return "";
  const t = typeof v === "object" ? JSON.stringify(v) : String(v);
  return t.length > MAX_VALOR ? `${t.slice(0, MAX_VALOR - 1)}…` : t;
}

/** Resume a resposta do teste: quantos vieram, o total informado, os campos e uma amostra. */
export function resumoResposta(texto: string): Pick<ResultadoTeste, "itens" | "total" | "campos" | "amostra" | "mensagem"> {
  const lido = lerJsonCenti(texto);
  if (!lido.ok) {
    const inicio = texto.trim().slice(0, 120);
    return { itens: 0, total: null, campos: [], amostra: [], mensagem: inicio ? `A resposta não é JSON (${lido.erro}): "${inicio}…"` : "A resposta veio vazia." };
  }
  const j = lido.valor;
  const regs = registrosDaResposta(j);
  if (!regs) return { itens: 0, total: null, campos: [], amostra: [], mensagem: `A resposta não traz uma lista de registros — veio ${esqueletoResposta(texto, j)}.` };
  const campos: string[] = [];
  for (const r of regs.slice(0, 20)) for (const k of Object.keys(r)) if (!campos.includes(k)) campos.push(k);
  const bruto = regs[0]?.TotalRegistros ?? (j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>).TotalRegistros : undefined);
  const total = bruto != null && Number.isFinite(Number(bruto)) ? Number(bruto) : null;
  const amostra = regs.slice(0, AMOSTRA_TESTE).map((r) => Object.fromEntries(campos.map((c) => [c, curto(r[c])])));
  return { itens: regs.length, total, campos, amostra, mensagem: regs.length ? null : "A API respondeu, mas sem registros para esse pedido." };
}
