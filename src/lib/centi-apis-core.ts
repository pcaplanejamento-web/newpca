/**
 * APIS DA CENTI — o cadastro das APIs públicas do portal de transparência (Integrações → "APIs da Centi"). Núcleo
 * PURO (sem banco/DOM, testado em `tests/centi-apis.test.ts`): os tipos, a validação e a PRÉVIA do pedido. Nada aqui
 * chama a Centi — o cadastro só descreve COMO cada API será lida quando a importação dela existir.
 *
 * O pedido é `POST {urlBase}/{endpoint}/{uf}/{tenant}` com o corpo = os `parametros`, em que os marcadores `{ano}`,
 * `{orgao}`, `{fonte}` e `{pagina}` são trocados pelos valores da tarefa (o valor INTEIRO "{ano}" vira número; dentro
 * de um texto, a troca é textual — "01/01/{ano}"). A `divisao` diz como o ano é dividido em tarefas: o ano inteiro,
 * um pedido por órgão ou um por fonte (os itens da `lista`); `paginado` = a API devolve páginas (`pagina`).
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
  { valor: 1, rotulo: "Só o ano atual" },
  { valor: 2, rotulo: "O ano atual e o anterior" },
  { valor: 3, rotulo: "Os 3 últimos anos" },
];

export const LIMITES_API = { nome: 60, descricao: 400, endpoint: 80, uf: 4, tenant: 40, parametros: 2000, lista: 200 } as const;

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
  lista: number[];
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
  "nome" | "descricao" | "urlBase" | "endpoint" | "uf" | "tenant" | "divisao" | "paginado" | "parametros" | "lista" | "ativa" | "frequenciaMin" | "diasUteis" | "horaInicio" | "horaFim" | "anos"
>;

export function lerDivisao(v: unknown): DivisaoApi {
  return v === "orgao" || v === "fonte" ? v : "ano";
}

/** A lista gravada (JSON de inteiros positivos, sem repetir). Inválida = vazia. */
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

const MARCADORES = ["ano", "orgao", "fonte", "pagina"];

/** Troca os marcadores pelos valores da tarefa (o texto que é SÓ o marcador vira o valor com o tipo dele). */
export function montarCorpo(parametros: unknown, vars: Record<string, number>): unknown {
  if (typeof parametros === "string") {
    const so = parametros.match(/^\{([a-z]+)\}$/);
    if (so && so[1] in vars) return vars[so[1]];
    return parametros.replace(/\{([a-z]+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  }
  if (Array.isArray(parametros)) return parametros.map((p) => montarCorpo(p, vars));
  if (parametros && typeof parametros === "object") {
    return Object.fromEntries(Object.entries(parametros).map(([k, v]) => [k, montarCorpo(v, vars)]));
  }
  return parametros;
}

function hostPermitido(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return HOSTS_PERMITIDOS.some((p) => h === p || h.endsWith(`.${p}`));
}

/** A URL base: HTTPS, host da Centi, sem usuário/senha, busca nem âncora. */
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

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const SEGMENTO = /^[A-Za-z0-9_-]+$/;

/** O motivo de a edição não valer (null = vale) — a MESMA régua na tela e no servidor. */
export function motivoApiInvalida(e: EdicaoApi, implementada: boolean): string | null {
  if (!e.nome.trim()) return "Informe o nome da API.";
  if (!urlBaseValida(e.urlBase)) return "A URL base tem de ser HTTPS do domínio da Centi (centi.com.br).";
  if (!SEGMENTO.test(e.endpoint)) return "O endpoint só aceita letras, números, - e _.";
  if (!SEGMENTO.test(e.uf) || !SEGMENTO.test(e.tenant)) return "UF e município só aceitam letras, números, - e _.";
  const p = lerParametros(e.parametros);
  if (!p.ok) return p.motivo;
  const usados = marcadoresUsados(p.valor);
  const desconhecido = usados.find((m) => !MARCADORES.includes(m));
  if (desconhecido) return `Marcador desconhecido: {${desconhecido}} (use {ano}, {orgao}, {fonte} ou {pagina}).`;
  const marcador = DIVISOES.find((d) => d.valor === e.divisao)?.marcador;
  if (marcador && !e.parametros.includes(marcador)) return `Com "${DIVISOES.find((d) => d.valor === e.divisao)?.rotulo}", os parâmetros precisam do marcador ${marcador}.`;
  if (e.divisao !== "ano" && e.lista.length === 0) return e.divisao === "orgao" ? "Informe os órgãos (idOrgao)." : "Informe as fontes.";
  if (!FREQUENCIAS.some((f) => f.valor === e.frequenciaMin)) return "Frequência inválida.";
  if (!OPCOES_ANOS.some((o) => o.valor === e.anos)) return "Quantidade de anos inválida.";
  if (!HORA.test(e.horaInicio) || !HORA.test(e.horaFim)) return "Horário inválido (use HH:MM).";
  if (e.horaInicio >= e.horaFim) return "O horário de início tem de ser antes do fim.";
  if (e.ativa && !implementada) return "Esta API ainda não tem a importação pronta — ela poderá ser ligada quando chegar.";
  return null;
}

/** Quantos pedidos um ano custa (sem contar as páginas). */
export function pedidosPorAno(a: Pick<ApiCenti, "divisao" | "lista">): number {
  return a.divisao === "ano" ? 1 : a.lista.length;
}

/** A PRÉVIA do 1º pedido de um ano (só para mostrar; nada é enviado). */
export function previaPedido(a: Pick<ApiCenti, "urlBase" | "endpoint" | "uf" | "tenant" | "divisao" | "lista" | "paginado" | "parametros">, ano: number) {
  const p = lerParametros(a.parametros);
  const vars: Record<string, number> = { ano };
  if (a.divisao === "orgao" && a.lista[0] != null) vars.orgao = a.lista[0];
  if (a.divisao === "fonte" && a.lista[0] != null) vars.fonte = a.lista[0];
  if (a.paginado) vars.pagina = 1;
  return { url: urlDaApi(a), corpo: p.ok ? montarCorpo(p.valor, vars) : null, erro: p.ok ? null : p.motivo };
}

/** O estado da API na tela. */
export function estadoApi(a: Pick<ApiCenti, "ativa" | "implementada" | "ultimoStatus">): { rotulo: string; tom: "slate" | "emerald" | "amber" | "red" } {
  if (!a.implementada) return { rotulo: "Em preparação", tom: "slate" };
  if (!a.ativa) return { rotulo: "Desligada", tom: "slate" };
  if (a.ultimoStatus === "falhou") return { rotulo: "Com erro", tom: "red" };
  if (a.ultimoStatus === "parcial") return { rotulo: "Parcial", tom: "amber" };
  return { rotulo: "Ativa", tom: "emerald" };
}

export function rotuloFrequencia(min: number, diasUteis: boolean, inicio: string, fim: string): string {
  const f = FREQUENCIAS.find((x) => x.valor === min)?.rotulo ?? `A cada ${min} min`;
  return `${f}${diasUteis ? ", dias úteis" : ""}, ${inicio}–${fim}`;
}
