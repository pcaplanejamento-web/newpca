/**
 * EMPENHOS da Centi — o núcleo PURO da importação (testado em `tests/empenhos.test.ts`): um registro do portal → a
 * linha do banco, a CHAVE (a MESMA da tabela — ano|órgão gestor|número), a leitura de uma página e a CONFERÊNCIA do
 * lote. As falhas do Dattago que este núcleo evita: a deduplicação com chave diferente da do banco (o lote inteiro era
 * recusado), o registro sem número gravado como "0" (colisão — aqui é RECUSADO e contado) e a importação contada como
 * completa sem bater com o total que a própria Centi informa.
 */
import { esqueletoResposta, lerJsonCenti, lerParametros, montarCorpo, registrosDaResposta } from "./centi-apis-core.ts";
import { parseValorPlanilha } from "./parse-orcamento-comum.ts";
import { MESES_PERIODO } from "./periodo.ts";

/** Teto de páginas de um lote (proteção: uma API que repete a mesma página nunca prende o lote). */
export const MAX_PAGINAS = 500;

export type LinhaEmpenho = {
  chave: string;
  ano: number;
  srcId: number | null;
  numero: string;
  data: string | null;
  orgaoGestor: string;
  unidadeOrcamentaria: string | null;
  fornecedor: string | null;
  cpfCnpj: string | null;
  modalidade: string | null;
  licitacao: string | null;
  funcao: string | null;
  subfuncao: string | null;
  programa: string | null;
  acao: string | null;
  elemento: string | null;
  subelemento: string | null;
  fonte: string | null;
  valorEmpenhado: number;
  valorAnulado: number;
  valorLiquidado: number;
  valorPago: number;
  saldoPagar: number;
  historico: string | null;
};

function texto(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/**
 * Valor em R$: número como veio; texto da Centi em pt-BR, SEMPRE com a vírgula decimal ("100,000" = R$ 100 — três casas;
 * "1.021,070" = R$ 1.021,07). Só a vírgula = a vírgula É o decimal (nunca milhar: a régua genérica de planilha leria
 * "100,000" como cem mil). Com ponto e vírgula, o último é o decimal; só pontos, a régua de planilha. Vazio/inválido = 0.
 */
export function valor(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const t = String(v ?? "").trim();
  if (t.includes(",") && !t.includes(".")) {
    const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
    const n = Number.parseFloat(t.replace(/[^\d,]/g, "").replace(",", "."));
    return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : 0;
  }
  return parseValorPlanilha(t) ?? 0;
}

/** Data da Centi (dd/mm/aaaa, com ou sem hora, ou ISO) → AAAA-MM-DD; inválida = null. */
export function dataIso(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const [a, m, d] = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2].padStart(2, "0"), br[1].padStart(2, "0")] : [];
  if (!a) return null;
  const dt = new Date(`${a}-${m}-${d}T12:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.getUTCDate() !== Number(d) ? null : `${a}-${m}-${d}`;
}

/** A CHAVE do empenho — a mesma da tabela (única): ano|órgão gestor|número. */
export function chaveEmpenho(ano: number, orgaoGestor: string, numero: string): string {
  return `${ano}|${orgaoGestor}|${numero}`;
}

/** Um registro do portal → a linha (ou o motivo da recusa: sem número não entra — nunca vira "0"). */
export function linhaEmpenho(item: Record<string, unknown>, ano: number): { linha: LinhaEmpenho } | { recusado: string } {
  const numero = texto(item.Numero);
  if (!numero) return { recusado: "sem número" };
  const orgaoGestor = texto(item.OrgaoGestor) ?? "";
  const id = Number(item.Id);
  return {
    linha: {
      chave: chaveEmpenho(ano, orgaoGestor, numero),
      ano,
      srcId: Number.isInteger(id) && id > 0 ? id : null,
      numero,
      data: dataIso(item.Data),
      orgaoGestor,
      unidadeOrcamentaria: texto(item.UnidadeOrcamentaria),
      fornecedor: texto(item.Fornecedor),
      cpfCnpj: texto(item.CpfCnpjCredor),
      modalidade: texto(item.LicitacaoModalidade),
      licitacao: texto(item.IdLicitacaoDispensaAdesao),
      funcao: texto(item.Funcao),
      subfuncao: texto(item.SubFuncao),
      programa: texto(item.Programa),
      acao: texto(item.Acao),
      elemento: texto(item.Elemento),
      subelemento: texto(item.SubElemento),
      fonte: texto(item.FonteRecurso),
      valorEmpenhado: valor(item.ValorEmpenhado),
      valorAnulado: valor(item.ValorAnulacao),
      valorLiquidado: valor(item.ValorLiquidado),
      valorPago: valor(item.ValorPago),
      saldoPagar: valor(item.SaldoPagar),
      historico: texto(item.Historico),
    },
  };
}

export type PaginaLida = {
  /** Quantos registros vieram na página (aceitos + recusados). */
  recebidos: number;
  linhas: LinhaEmpenho[];
  recusados: number;
  /** Repetidos DENTRO da página (a mesma chave). */
  repetidos: number;
  total: number | null;
  /** A Centi mandou o JSON com aspas/controles sem escape nos textos — a leitura consertou. */
  reparado: boolean;
};

/** Lê uma página da resposta (JSON). Lança `Error` se a resposta não for uma lista de registros. */
export function lerPaginaEmpenhos(textoResposta: string, ano: number): PaginaLida {
  const lido = lerJsonCenti(textoResposta);
  if (!lido.ok) throw new Error(`A resposta da Centi não é JSON (${lido.erro}) — ${esqueletoResposta(textoResposta)}.`);
  const j = lido.valor;
  const regs = registrosDaResposta(j);
  if (!regs) throw new Error(`A resposta da Centi não traz uma lista de registros — veio ${esqueletoResposta(textoResposta, j)}.`);
  const vistas = new Set<string>();
  const linhas: LinhaEmpenho[] = [];
  let recusados = 0;
  let repetidos = 0;
  for (const r of regs) {
    const l = linhaEmpenho(r, ano);
    if ("recusado" in l) {
      recusados++;
      continue;
    }
    if (vistas.has(l.linha.chave)) {
      repetidos++;
      continue;
    }
    vistas.add(l.linha.chave);
    linhas.push(l.linha);
  }
  const bruto = regs[0]?.TotalRegistros ?? (j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>).TotalRegistros : undefined);
  const total = bruto != null && Number.isFinite(Number(bruto)) ? Number(bruto) : null;
  return { recebidos: regs.length, linhas, recusados, repetidos, total, reparado: lido.reparado };
}

/**
 * O PERÍODO de um pedido (datas AAAA-MM-DD, inclusive). A Centi devolve o ano inteiro de uma vez — grande demais para
 * uma resposta (só janeiro de 2026 veio com 8 MB) —, então o ano é lido SEMANA A SEMANA (1–7, 8–14, 15–21, 22–fim de cada
 * mês: respostas de ~2 MB, que o Worker lê e o D1 guarda) e o período ainda grande demais é dividido ao meio, até um dia. Cada período tem o PRÓPRIO total informado pela Centi; a conferência soma os totais.
 */
export type Periodo = { inicio: string; fim: string };

const DIA_MS = 86_400_000;
const paraMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const paraIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const diaSeguinte = (iso: string) => paraIso(paraMs(iso) + DIA_MS);

/** AAAA-MM-DD → dd/mm/aaaa (o formato que a Centi espera). */
export function diaBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function anoInteiro(ano: number): Periodo {
  return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
}

/** Os parâmetros usam o período ({inicio} e {fim})? Sem eles, o ano só pode ser lido inteiro. */
export function usaPeriodo(parametros: string): boolean {
  return parametros.includes("{inicio}") && parametros.includes("{fim}");
}

/** Os dias do período (inclusive). */
export function diasDoPeriodo(p: Periodo): number {
  return Math.round((paraMs(p.fim) - paraMs(p.inicio)) / DIA_MS) + 1;
}

/** Corta um intervalo nas SEMANAS de cada mês (1–7, 8–14, 15–21, 22–último dia) — nunca atravessa a virada do mês. */
function emSemanas(p: Periodo): Periodo[] {
  const r: Periodo[] = [];
  let ini = p.inicio;
  while (ini <= p.fim) {
    const d = new Date(paraMs(ini));
    const dia = d.getUTCDate();
    const corte = dia <= 7 ? 7 : dia <= 14 ? 14 : dia <= 21 ? 21 : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const ultimo = paraIso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), corte));
    const fim = ultimo < p.fim ? ultimo : p.fim;
    r.push({ inicio: ini, fim });
    ini = diaSeguinte(fim);
  }
  return r;
}

/** O que falta ler do ano: as LACUNAS entre os períodos já lidos, na ordem. */
export function lacunasDoAno(ano: number, lidos: Periodo[]): Periodo[] {
  const ano0 = anoInteiro(ano);
  const r: Periodo[] = [];
  let cursor = ano0.inicio;
  for (const p of [...lidos].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    if (p.inicio > cursor) r.push({ inicio: cursor, fim: paraIso(paraMs(p.inicio) - DIA_MS) });
    const depois = diaSeguinte(p.fim);
    if (depois > cursor) cursor = depois;
  }
  if (cursor <= ano0.fim) r.push({ inicio: cursor, fim: ano0.fim });
  return r;
}

/** Os períodos a pedir: o que falta do ano, semana a semana (sem o {inicio}/{fim}, o ano inteiro de uma vez). */
export function periodosAPedir(ano: number, lidos: Periodo[], comPeriodo: boolean): Periodo[] {
  if (!comPeriodo) return lidos.length ? [] : [anoInteiro(ano)];
  return lacunasDoAno(ano, lidos).flatMap(emSemanas);
}

/** Divide o período ao meio (o de um dia não se divide). */
export function dividirPeriodo(p: Periodo): [Periodo, Periodo] | null {
  const dias = diasDoPeriodo(p);
  if (dias < 2) return null;
  const meio = paraIso(paraMs(p.inicio) + (Math.ceil(dias / 2) - 1) * DIA_MS);
  return [
    { inicio: p.inicio, fim: meio },
    { inicio: diaSeguinte(meio), fim: p.fim },
  ];
}

/** "Mai/2026" (o mês inteiro), "05/05/2026" (um dia), "01/05 a 15/05/2026" (outro intervalo), "2026 inteiro". */
export function rotuloPeriodo(p: Periodo): string {
  const ano = p.inicio.slice(0, 4);
  if (p.inicio === `${ano}-01-01` && p.fim === `${ano}-12-31`) return `${ano} inteiro`;
  if (p.inicio === p.fim) return diaBR(p.inicio);
  if (p.inicio.endsWith("-01") && p.inicio.slice(0, 7) === p.fim.slice(0, 7) && diaSeguinte(p.fim).endsWith("-01")) {
    return `${MESES_PERIODO[Number(p.inicio.slice(5, 7)) - 1]}/${ano}`;
  }
  return `${diaBR(p.inicio).slice(0, 5)} a ${diaBR(p.fim)}`;
}

/** O corpo do pedido de uma página: os parâmetros com o ano e o período e, a partir da 2ª página, a `pagina` (a 1ª vai
 * sem ela — como a Centi espera). Os parâmetros com o marcador {pagina} recebem o número em todas. */
export function corpoDaPagina(parametros: string, ano: number, pagina: number, periodo: Periodo = anoInteiro(ano)): unknown {
  const p = lerParametros(parametros);
  if (!p.ok) throw new Error(p.motivo);
  const corpo = montarCorpo(p.valor, { ano, pagina, inicio: diaBR(periodo.inicio), fim: diaBR(periodo.fim) }) as Record<string, unknown>;
  if (pagina > 1 && !parametros.includes("{pagina}")) return { ...corpo, pagina };
  return corpo;
}

/** O total do PERÍODO informado pela página (o período sem nenhum registro tem total 0 — a Centi não manda o campo). */
export function totalDoPeriodo(p: PaginaLida, pagina: number): number | null {
  if (p.total != null) return p.total;
  return pagina === 1 && p.recebidos === 0 ? 0 : null;
}

export type SituacaoLote = { recebidos: number; unicos: number; recusados: number; totalInformado: number | null; paginas: number };

/** Ler mais uma página do PERÍODO? Para quando chegou ao total dele, quando a página veio vazia (ou, sem o total, sem
 * nada novo) ou no teto. `recebidos`/`paginas` = o que o período já leu, contando esta página. */
export function continuarPeriodo(s: { recebidos: number; paginas: number; total: number | null }, ultima: { recebidos: number; novos: number }): boolean {
  if (ultima.recebidos === 0 || s.paginas >= MAX_PAGINAS) return false;
  if (s.total == null) return ultima.novos > 0;
  return s.recebidos < s.total;
}

/** Que tipo de erro: `grande` = dividir o período · `resposta` = a Centi respondeu algo que não é a lista (não adianta
 * repetir) · `rede` = repetir com espera (tempo esgotado, a Centi fora, 5xx). */
export type TipoErro = "grande" | "resposta" | "rede";
export function tipoDoErro(mensagem: string): TipoErro {
  if (/grande demais/i.test(mensagem)) return "grande";
  if (/não é JSON|lista de registros|respondeu 4\d\d/i.test(mensagem)) return "resposta";
  return "rede";
}

/** Um PASSO do lote (um pedido à Centi) — o que a tela mostra ao vivo e o histórico guarda. */
export type EstadoPasso = "ok" | "erro" | "dividido";
export type PassoLote = {
  id: number;
  inicio: string;
  fim: string;
  pagina: number;
  estado: EstadoPasso;
  fimPeriodo: boolean;
  status: number | null;
  bytes: number | null;
  ms: number | null;
  recebidos: number;
  novos: number;
  recusados: number;
  repetidos: number;
  total: number | null;
  mensagem: string | null;
  corpo: string | null;
  em: string;
};

export const ROTULO_ESTADO_PASSO: Record<EstadoPasso, { rotulo: string; tom: "emerald" | "red" | "amber" }> = {
  ok: { rotulo: "Lida", tom: "emerald" },
  erro: { rotulo: "Erro", tom: "red" },
  dividido: { rotulo: "Dividida", tom: "amber" },
};

type PassoMin = Pick<PassoLote, "inicio" | "fim" | "estado" | "fimPeriodo" | "pagina">;

/** Os períodos CONCLUÍDOS (a última página lida marcou o fim do período) — o que a retomada e a conferência usam. */
export function periodosLidos(passos: PassoMin[]): Periodo[] {
  const vistos = new Map<string, Periodo>();
  for (const p of passos) if (p.estado === "ok" && p.fimPeriodo) vistos.set(`${p.inicio}|${p.fim}`, { inicio: p.inicio, fim: p.fim });
  return [...vistos.values()];
}

/** Onde retomar: o período começado e não concluído (e a próxima página), se houver. */
export function periodoEmCurso(passos: PassoMin[]): { periodo: Periodo; pagina: number } | null {
  const feitos = new Set(periodosLidos(passos).map((p) => `${p.inicio}|${p.fim}`));
  let em: { periodo: Periodo; pagina: number } | null = null;
  for (const p of passos) {
    if (p.estado !== "ok" || feitos.has(`${p.inicio}|${p.fim}`)) continue;
    const mesmo = em && em.periodo.inicio === p.inicio && em.periodo.fim === p.fim;
    if (!mesmo || p.pagina + 1 > (em?.pagina ?? 0)) em = { periodo: { inicio: p.inicio, fim: p.fim }, pagina: p.pagina + 1 };
  }
  return em;
}

/**
 * A CONFERÊNCIA do lote: só é completo quando os registros DISTINTOS (+ os recusados, que a Centi também conta) alcançam
 * o total que a Centi informou. Contar os recebidos não basta: uma página repetida faria "bater" com registros faltando.
 */
export function conferirLote(s: SituacaoLote): { completo: true } | { completo: false; motivo: string } {
  if (s.totalInformado == null) return { completo: false, motivo: "A Centi não informou o total de registros — não dá para conferir." };
  const contados = s.unicos + s.recusados;
  if (contados >= s.totalInformado) return { completo: true };
  const repetidos = s.recebidos - contados;
  return {
    completo: false,
    motivo: `Faltam registros: ${contados} distintos de ${s.totalInformado} informados pela Centi${repetidos > 0 ? ` (${repetidos} vieram repetidos)` : ""}${s.paginas >= MAX_PAGINAS ? ` — parou no teto de ${MAX_PAGINAS} páginas` : ""}.`,
  };
}

export type EstadoLote = "lendo" | "promovido" | "parcial" | "falhou" | "cancelado";

export const ROTULO_ESTADO_LOTE: Record<EstadoLote, { rotulo: string; tom: "blue" | "emerald" | "amber" | "red" | "slate" }> = {
  lendo: { rotulo: "Lendo", tom: "blue" },
  promovido: { rotulo: "Importado", tom: "emerald" },
  parcial: { rotulo: "Parcial", tom: "amber" },
  falhou: { rotulo: "Falhou", tom: "red" },
  cancelado: { rotulo: "Cancelado", tom: "slate" },
};

/** Sem atividade há mais que isto, o lote "lendo" é considerado abandonado (outro pode começar). */
export const MINUTOS_LOTE_PARADO = 30;

/** Os anos que a API mantém (o atual e os anteriores, conforme o cadastro). */
export function anosDaApi(anoAtual: number, anos: number): number[] {
  return Array.from({ length: Math.max(1, anos) }, (_, i) => anoAtual - i);
}

export type LoteCenti = {
  id: number;
  ano: number;
  estado: EstadoLote;
  paginas: number;
  recebidos: number;
  unicos: number;
  recusados: number;
  totalInformado: number | null;
  inseridos: number | null;
  atualizados: number | null;
  removidos: number | null;
  mensagem: string | null;
  iniciadoPor: string;
  iniciadoEm: string;
  vistoEm: string;
  concluidoEm: string | null;
};
