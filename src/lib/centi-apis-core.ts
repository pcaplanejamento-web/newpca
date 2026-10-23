/**
 * APIS DA CENTI — o cadastro das APIs públicas do portal de transparência (Integrações → "APIs da Centi"). Núcleo
 * PURO (sem banco/DOM, testado em `tests/centi-apis.test.ts`): os tipos, a validação, os pedidos de um ano e a leitura
 * da resposta do TESTE. Nada aqui chama a Centi.
 *
 * O pedido é `POST {urlBase}/{endpoint}/{uf}/{tenant}` com o corpo = os `parametros`, em que os marcadores `{ano}`,
 * `{orgao}`, `{fonte}` e `{pagina}` são trocados pelos valores do pedido (o texto que é SÓ o marcador vira número; dentro
 * de um texto, a troca é textual — "01/01/{ano}"). A `divisao` diz como o ano é dividido: o ano inteiro, um pedido por
 * ÓRGÃO (o idOrgao = o "ID da entidade na Centi" de cada órgão ESCOLHIDO do cadastro — nenhum escolhido = todos os que
 * têm o código) ou um por FONTE (a `lista`). Os órgãos e as unidades escolhidos também dizem o que será guardado.
 */

export type DivisaoApi = "ano" | "orgao" | "fonte";

export const DIVISOES: { valor: DivisaoApi; rotulo: string; marcador: string | null }[] = [
  { valor: "ano", rotulo: "Ano inteiro", marcador: null },
  { valor: "orgao", rotulo: "Um pedido por órgão", marcador: "{orgao}" },
  { valor: "fonte", rotulo: "Um pedido por fonte", marcador: "{fonte}" },
];

/** As frequências da atualização automática (minutos). */
export const FREQUENCIAS: { valor: number; rotulo: string }[] = [
  { valor: 60, rotulo: "A cada 1 hora" },
  { valor: 120, rotulo: "A cada 2 horas" },
  { valor: 240, rotulo: "A cada 4 horas" },
  { valor: 720, rotulo: "A cada 12 horas" },
  { valor: 1440, rotulo: "Uma vez por dia" },
];

export const OPCOES_ANOS: { valor: number; rotulo: string }[] = [
  { valor: 1, rotulo: "Só o atual" },
  { valor: 2, rotulo: "Atual e anterior" },
  { valor: 3, rotulo: "Últimos 3 anos" },
];

export const LIMITES_API = { nome: 60, descricao: 400, endpoint: 80, uf: 4, tenant: 40, parametros: 2000, lista: 200, escopo: 500 } as const;

/** Só o host oficial da Centi (e os subdomínios dela) — nunca outro site. */
export const HOSTS_PERMITIDOS = ["centi.com.br"] as const;

export type ApiCenti = {
  id: number;
  chave: string;
  nome: string;
  descricao: string;
  urlBase: string;
  endpoint: string;
  uf: string;
  tenant: string;
  divisao: DivisaoApi;
  paginado: boolean;
  parametros: string;
  /** As fontes (divisão por fonte). */
  lista: number[];
  /** Os órgãos e as unidades do CADASTRO (ids) — vazio = todos. */
  orgaos: number[];
  unidades: number[];
  ativa: boolean;
  implementada: boolean;
  frequenciaMin: number;
  diasUteis: boolean;
  horaInicio: string;
  horaFim: string;
  anos: number;
  ordem: number;
  ultimaExecucao: string | null;
  ultimoStatus: string | null;
  ultimaContagem: number | null;
  ultimoTotal: number | null;
};

/** Os campos que o ADM edita. */
export type EdicaoApi = Pick<
  ApiCenti,
  | "nome"
  | "descricao"
  | "urlBase"
  | "endpoint"
  | "uf"
  | "tenant"
  | "divisao"
  | "paginado"
  | "parametros"
  | "lista"
  | "orgaos"
  | "unidades"
  | "ativa"
  | "frequenciaMin"
  | "diasUteis"
  | "horaInicio"
  | "horaFim"
  | "anos"
>;

/** Um órgão do cadastro com o código dele na Centi (o idOrgao do portal; sem código = não entra nos pedidos). */
export type OrgaoDoCadastro = { id: number; sigla: string; nome: string; codigoCenti: number | null };
export type UnidadeDoCadastro = { id: number; codigo: string; nome: string; orgaoId: number | null };

export function edicaoDaApi(a: ApiCenti): EdicaoApi {
  const { nome, descricao, urlBase, endpoint, uf, tenant, divisao, paginado, parametros, lista, orgaos, unidades, ativa, frequenciaMin, diasUteis, horaInicio, horaFim, anos } = a;
  return { nome, descricao, urlBase, endpoint, uf, tenant, divisao, paginado, parametros, lista, orgaos, unidades, ativa, frequenciaMin, diasUteis, horaInicio, horaFim, anos };
}

export function lerDivisao(v: unknown): DivisaoApi {
  return v === "orgao" || v === "fonte" ? v : "ano";
}

/** O "ID da entidade na Centi" do cadastro ("02") → o número do portal (2); vazio/inválido = null. */
export function codigoCenti(v: string | null | undefined): number | null {
  const n = Number((v ?? "").trim());
  return (v ?? "").trim() && Number.isInteger(n) && n > 0 ? n : null;
}

/** Uma lista gravada (JSON de inteiros positivos, sem repetir). Inválida = vazia. */
export function lerLista(v: unknown): number[] {
  let bruto: unknown = v;
  if (typeof v === "string") {
    try {
      bruto = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(bruto)) return [];
  const out: number[] = [];
  for (const x of bruto) {
    const n = Number(x);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

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

/** Os marcadores ({ano}, {orgao}…) usados nos parâmetros. */
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

const MARCADORES = ["ano", "inicio", "fim", "orgao", "fonte", "pagina"];

/**
 * Troca os marcadores pelos valores do pedido (o texto que é SÓ o marcador vira o valor com o tipo dele). Com o {ano},
 * o período {inicio}/{fim} (dd/mm/aaaa) é o ano inteiro quando o pedido não diz outro — a importação o divide em meses.
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
export function urlDaApi(a: Pick<ApiCenti, "urlBase" | "endpoint" | "uf" | "tenant">): string {
  return `${a.urlBase.replace(/\/+$/, "")}/${a.endpoint}/${a.uf}/${a.tenant}`;
}

/** Os códigos (idOrgao) dos órgãos escolhidos — nenhum escolhido = todos os do cadastro que têm o código. */
export function codigosDosOrgaos(escolhidos: number[], cadastro: OrgaoDoCadastro[]): number[] {
  const usar = escolhidos.length ? cadastro.filter((o) => escolhidos.includes(o.id)) : cadastro;
  return [...new Set(usar.map((o) => o.codigoCenti).filter((c): c is number => c != null))].sort((a, b) => a - b);
}

/** Os órgãos escolhidos SEM código na Centi (não entram nos pedidos — a tela avisa). */
export function orgaosSemCodigo(escolhidos: number[], cadastro: OrgaoDoCadastro[]): OrgaoDoCadastro[] {
  return cadastro.filter((o) => escolhidos.includes(o.id) && o.codigoCenti == null);
}

/** Os valores de cada pedido de um ano (sem as páginas). */
export function pedidosDoAno(e: Pick<EdicaoApi, "divisao" | "lista" | "orgaos">, ano: number, cadastro: OrgaoDoCadastro[]): Record<string, number>[] {
  if (e.divisao === "orgao") return codigosDosOrgaos(e.orgaos, cadastro).map((orgao) => ({ ano, orgao }));
  if (e.divisao === "fonte") return e.lista.map((fonte) => ({ ano, fonte }));
  return [{ ano }];
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const SEGMENTO = /^[A-Za-z0-9_-]+$/;

/** O motivo de a edição não valer (null = vale) — a MESMA régua na tela e no servidor. */
export function motivoApiInvalida(e: EdicaoApi, implementada: boolean, cadastro: OrgaoDoCadastro[]): string | null {
  if (!e.nome.trim()) return "Informe o nome da API.";
  if (!urlBaseValida(e.urlBase)) return "A URL base tem de ser HTTPS do domínio da Centi (centi.com.br).";
  if (!SEGMENTO.test(e.endpoint)) return "O endpoint só aceita letras, números, - e _.";
  if (!SEGMENTO.test(e.uf) || !SEGMENTO.test(e.tenant)) return "UF e município só aceitam letras, números, - e _.";
  const p = lerParametros(e.parametros);
  if (!p.ok) return p.motivo;
  const desconhecido = marcadoresUsados(p.valor).find((m) => !MARCADORES.includes(m));
  if (desconhecido) return `Marcador desconhecido: {${desconhecido}} (use {ano}, {inicio}, {fim}, {orgao}, {fonte} ou {pagina}).`;
  const divisao = DIVISOES.find((d) => d.valor === e.divisao);
  if (divisao?.marcador && !e.parametros.includes(divisao.marcador)) return `Com "${divisao.rotulo}", os parâmetros precisam do marcador ${divisao.marcador}.`;
  if (e.divisao === "orgao" && codigosDosOrgaos(e.orgaos, cadastro).length === 0) {
    return "Nenhum órgão escolhido tem o ID da entidade na Centi (Órgãos e Unidades).";
  }
  if (e.divisao === "fonte" && e.lista.length === 0) return "Informe as fontes.";
  if (!FREQUENCIAS.some((f) => f.valor === e.frequenciaMin)) return "Frequência inválida.";
  if (!OPCOES_ANOS.some((o) => o.valor === e.anos)) return "Quantidade de anos inválida.";
  if (!HORA.test(e.horaInicio) || !HORA.test(e.horaFim)) return "Horário inválido (use HH:MM).";
  if (e.horaInicio >= e.horaFim) return "O horário de início tem de ser antes do fim.";
  if (e.ativa && !implementada) return "Esta API ainda não tem a importação pronta — ela poderá ser ligada quando chegar.";
  return null;
}

/** O pedido do TESTE: a 1ª SEMANA do ano (01/01 a 07/01) — o ano inteiro e até um mês passam do tamanho de uma resposta;
 * a importação também lê semana a semana. */
export function varsDoTeste(vars: Record<string, number>): Record<string, number | string> {
  return typeof vars.ano === "number" ? { ...vars, inicio: `01/01/${vars.ano}`, fim: `07/01/${vars.ano}` } : vars;
}

/** A PRÉVIA de um pedido do ano (o 1º, por padrão — só para mostrar; nada é enviado). */
export function previaPedido(e: EdicaoApi, ano: number, cadastro: OrgaoDoCadastro[], indice = 0) {
  const p = lerParametros(e.parametros);
  const pedidos = pedidosDoAno(e, ano, cadastro);
  const vars = pedidos[Math.min(Math.max(0, indice), pedidos.length - 1)];
  return {
    url: urlDaApi(e),
    corpo: p.ok && vars ? montarCorpo(p.valor, varsDoTeste(vars)) : null,
    erro: p.ok ? (vars ? null : "Nenhum pedido: escolha os órgãos (com o ID da Centi) ou as fontes.") : p.motivo,
    pedidos,
  };
}

/** As APIs cuja importação MANUAL já existe (as demais seguem "Em preparação"). */
export const IMPORTAVEIS = ["empenhos"] as const;

export function importavel(chave: string): boolean {
  return (IMPORTAVEIS as readonly string[]).includes(chave);
}

/** O estado da API na tela. */
export function estadoApi(a: Pick<ApiCenti, "chave" | "ativa" | "implementada" | "ultimoStatus">): { rotulo: string; tom: "slate" | "emerald" | "amber" | "red" | "blue" } {
  if (!a.implementada) {
    if (!importavel(a.chave)) return { rotulo: "Em preparação", tom: "slate" };
    if (a.ultimoStatus === "parcial" || a.ultimoStatus === "falhou") return { rotulo: "Última importação incompleta", tom: "amber" };
    return { rotulo: "Importação manual", tom: "blue" };
  }
  if (!a.ativa) return { rotulo: "Desligada", tom: "slate" };
  if (a.ultimoStatus === "falhou") return { rotulo: "Com erro", tom: "red" };
  if (a.ultimoStatus === "parcial") return { rotulo: "Parcial", tom: "amber" };
  return { rotulo: "Ativa", tom: "emerald" };
}

export function rotuloFrequencia(min: number, diasUteis: boolean, inicio: string, fim: string): string {
  const f = FREQUENCIAS.find((x) => x.valor === min)?.rotulo ?? `A cada ${min} min`;
  return `${f}${diasUteis ? ", dias úteis" : ""}, ${inicio}–${fim}`;
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
