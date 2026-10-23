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

/** O pedido do TESTE: o período é JANEIRO (o ano inteiro não cabe numa resposta — a importação também lê mês a mês). */
export function varsDoTeste(vars: Record<string, number>): Record<string, number | string> {
  return typeof vars.ano === "number" ? { ...vars, inicio: `01/01/${vars.ano}`, fim: `31/01/${vars.ano}` } : vars;
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

/** A lista de registros de uma resposta: a própria lista, ou a 1ª lista de objetos dentro dela (`data`, `result`…). */
export function registrosDaResposta(j: unknown): Record<string, unknown>[] | null {
  const ehLista = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every((x) => x && typeof x === "object" && !Array.isArray(x));
  if (ehLista(j)) return j;
  if (j && typeof j === "object") {
    for (const v of Object.values(j)) if (ehLista(v) && v.length) return v;
    for (const v of Object.values(j)) if (ehLista(v)) return v;
  }
  return null;
}

function curto(v: unknown): string {
  if (v == null) return "";
  const t = typeof v === "object" ? JSON.stringify(v) : String(v);
  return t.length > MAX_VALOR ? `${t.slice(0, MAX_VALOR - 1)}…` : t;
}

/** Resume a resposta do teste: quantos vieram, o total informado, os campos e uma amostra. */
export function resumoResposta(texto: string): Pick<ResultadoTeste, "itens" | "total" | "campos" | "amostra" | "mensagem"> {
  let j: unknown;
  try {
    j = JSON.parse(texto);
  } catch {
    const inicio = texto.trim().slice(0, 120);
    return { itens: 0, total: null, campos: [], amostra: [], mensagem: inicio ? `A resposta não é JSON: "${inicio}…"` : "A resposta veio vazia." };
  }
  const regs = registrosDaResposta(j);
  if (!regs) return { itens: 0, total: null, campos: [], amostra: [], mensagem: "A resposta não traz uma lista de registros." };
  const campos: string[] = [];
  for (const r of regs.slice(0, 20)) for (const k of Object.keys(r)) if (!campos.includes(k)) campos.push(k);
  const bruto = regs[0]?.TotalRegistros ?? (j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>).TotalRegistros : undefined);
  const total = bruto != null && Number.isFinite(Number(bruto)) ? Number(bruto) : null;
  const amostra = regs.slice(0, AMOSTRA_TESTE).map((r) => Object.fromEntries(campos.map((c) => [c, curto(r[c])])));
  return { itens: regs.length, total, campos, amostra, mensagem: regs.length ? null : "A API respondeu, mas sem registros para esse pedido." };
}
