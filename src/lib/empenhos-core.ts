/**
 * EMPENHOS da Centi — o núcleo PURO da importação (testado em `tests/empenhos.test.ts`): um registro do portal → a
 * linha do banco, a CHAVE (a MESMA da tabela — ano|órgão gestor|número), a leitura de uma página e a CONFERÊNCIA do
 * lote. As falhas do Dattago que este núcleo evita: a deduplicação com chave diferente da do banco (o lote inteiro era
 * recusado), o registro sem número gravado como "0" (colisão — aqui é RECUSADO e contado) e a importação contada como
 * completa sem bater com o total que a própria Centi informa.
 */
import { esqueletoResposta, lerJsonCenti, lerParametros, montarCorpo, registrosDaResposta } from "./centi-resposta-core.ts";
import { parseValorPlanilha } from "./parse-orcamento-comum.ts";
import { MESES_PERIODO } from "./periodo.ts";

/** Teto de páginas de um lote (proteção: uma API que repete a mesma página nunca prende o lote). */
export const MAX_PAGINAS = 500;

/**
 * A VERSÃO DO LEITOR (`linhaEmpenho` + `valor` + `lerPaginaEmpenhos`). Mudou a forma de ler um campo? Some 1: cada lote e
 * cada empenho guardam a versão que os leu, o sistema avisa os anos lidos por um leitor anterior e a próxima importação
 * regrava todos (a versão entra na comparação do "mudou") — sem apagar nada por migração.
 */
export const LEITOR_EMPENHOS = 1;

/** Um empenho com valor negativo ou acima disto é SUSPEITO (erro de leitura) — a conclusão não promove o lote. */
export const LIMITE_VALOR_EMPENHO = 1_000_000_000;

/** Por quanto tempo a aba que conduz o lote o segura sem dar notícia (cada página renova). */
export const SEGUNDOS_CONDUCAO = 120;

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
  /** Σ do valor empenhado das linhas aceitas da página. */
  soma: number;
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
  const soma = linhas.reduce((t, l) => t + l.valorEmpenhado, 0);
  return { recebidos: regs.length, linhas, recusados, repetidos, total, soma, reparado: lido.reparado };
}

/**
 * O PERÍODO de um pedido (datas AAAA-MM-DD, inclusive). A Centi devolve o ano inteiro de uma vez — grande demais para
 * uma resposta (só janeiro de 2026 veio com 8 MB) —, então o ano é lido SEMANA A SEMANA (1–7, 8–14, 15–21, 22–fim de cada
 * mês: respostas de ~0,7 MB — até 1 MB, leve para o Worker) e o período ainda grande demais é dividido ao meio, até um dia. Cada período tem o PRÓPRIO total informado pela Centi; a conferência soma os totais.
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

/** Hoje (AAAA-MM-DD) no horário de Brasília (UTC−3) — a régua ÚNICA do "hoje" dos empenhos. */
export function hojeIso(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** O período lido do ano: SEMPRE o ano inteiro, de 01/01 a 31/12 (também no ano atual). `_hoje` fica por compatibilidade. */
export function periodoDoAno(ano: number, _hoje?: string): Periodo {
  return anoInteiro(ano);
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

/** O que falta ler do ano (de 01/01 a 31/12, também no ano atual): as LACUNAS entre os períodos já lidos, na ordem. */
export function lacunasDoAno(ano: number, lidos: Periodo[], hoje?: string): Periodo[] {
  const ano0 = periodoDoAno(ano, hoje);
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
export function periodosAPedir(ano: number, lidos: Periodo[], comPeriodo: boolean, hoje?: string): Periodo[] {
  if (!comPeriodo) return lidos.length ? [] : [anoInteiro(ano)];
  return lacunasDoAno(ano, lidos, hoje).flatMap(emSemanas);
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
export function totalDoPeriodo(p: Pick<PaginaLida, "total" | "recebidos">, pagina: number): number | null {
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
  soma: number | null;
  mensagem: string | null;
  corpo: string | null;
  /** O RESULTADO da página, conferido em tempo real com o banco: novos · alterados · iguais (não ocupam o staging) · sem
   * vínculo (não gravados). null = passo de antes da conferência em tempo real ou que não leu registros. */
  resNovos: number | null;
  resAlterados: number | null;
  resIguais: number | null;
  resSemVinculo: number | null;
  em: string;
};

/** O passo como a leitura o registra (o RESULTADO vem da conferência no banco, no mesmo lote). */
export type PassoNovo = Omit<PassoLote, "id" | "em" | "resNovos" | "resAlterados" | "resIguais" | "resSemVinculo">;

/** O resultado de uma página (ou a soma das lidas): o texto da coluna Resultado. null = sem resultado. */
export function textoResultado(r: { resNovos: number | null; resAlterados: number | null; resIguais: number | null; resSemVinculo: number | null }): string | null {
  if (r.resNovos == null && r.resAlterados == null && r.resIguais == null && r.resSemVinculo == null) return null;
  const n = (x: number | null) => (x ?? 0).toLocaleString("pt-BR");
  return `${n(r.resNovos)} novos · ${n(r.resAlterados)} alterados · ${n(r.resIguais)} iguais · ${n(r.resSemVinculo)} sem vínculo`;
}

/**
 * O RESULTADO ATÉ AGORA do lote, pela soma dos passos lidos (a última leitura de cada página — a mesma régua da soma do
 * lote). Os registros que aparecem em dois períodos contam nos dois.
 */
export function resultadoDosPassos(passos: readonly PassoLote[]): { resNovos: number; resAlterados: number; resIguais: number; resSemVinculo: number; paginas: number } {
  const ultimo = new Map<string, PassoLote>();
  for (const p of passos) if (p.estado === "ok" && p.resNovos != null) ultimo.set(`${p.inicio}|${p.fim}|${p.pagina}`, p);
  const r = { resNovos: 0, resAlterados: 0, resIguais: 0, resSemVinculo: 0, paginas: ultimo.size };
  for (const p of ultimo.values()) {
    r.resNovos += p.resNovos ?? 0;
    r.resAlterados += p.resAlterados ?? 0;
    r.resIguais += p.resIguais ?? 0;
    r.resSemVinculo += p.resSemVinculo ?? 0;
  }
  return r;
}

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

/**
 * O que falta dos períodos COMEÇADOS e não concluídos. Empenhos (`paginas` ausente): a próxima página de cada período (as
 * páginas de um período são lidas em sequência). LIQUIDAÇÕES (`paginas` = quantos órgãos o lote lê): TODAS as páginas
 * (órgãos) do período que ainda não foram lidas — os órgãos são lidos em PARALELO, então pode faltar uma do meio.
 */
export function pedidosEmCurso(passos: PassoMin[], paginas?: number): { periodo: Periodo; pagina: number }[] {
  const feitos = new Set(periodosLidos(passos).map((p) => `${p.inicio}|${p.fim}`));
  const porPeriodo = new Map<string, { periodo: Periodo; lidas: Set<number> }>();
  for (const p of passos) {
    const k = `${p.inicio}|${p.fim}`;
    if (p.estado !== "ok" || feitos.has(k)) continue;
    const em = porPeriodo.get(k) ?? { periodo: { inicio: p.inicio, fim: p.fim }, lidas: new Set<number>() };
    em.lidas.add(p.pagina);
    porPeriodo.set(k, em);
  }
  const r: { periodo: Periodo; pagina: number }[] = [];
  for (const { periodo, lidas } of porPeriodo.values()) {
    if (paginas == null) r.push({ periodo, pagina: Math.max(...lidas) + 1 });
    else for (let n = 1; n <= paginas; n++) if (!lidas.has(n)) r.push({ periodo, pagina: n });
  }
  return r;
}

/** Onde retomar: o primeiro período começado e não concluído (e a próxima página), se houver. */
export function periodoEmCurso(passos: PassoMin[], paginas?: number): { periodo: Periodo; pagina: number } | null {
  return pedidosEmCurso(passos, paginas)[0] ?? null;
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

export type EstadoLote = "lendo" | "promovido" | "parcial" | "falhou" | "cancelado" | "unidades";

/** `dados` = importa os registros (só os vinculados) · `unidades` = só PUXA o catálogo da Centi (órgãos gestores, unidades
 * orçamentárias e ações), sem gravar nenhum empenho · `liquidacoes` = as LIQUIDAÇÕES de UM órgão da Centi (`liquidacoes-core.ts`). */
export type ModoLote = "dados" | "unidades" | "liquidacoes";

export const ROTULO_ESTADO_LOTE: Record<EstadoLote, { rotulo: string; tom: "blue" | "emerald" | "amber" | "red" | "slate" }> = {
  lendo: { rotulo: "Lendo", tom: "blue" },
  promovido: { rotulo: "Importado", tom: "emerald" },
  parcial: { rotulo: "Parcial", tom: "amber" },
  falhou: { rotulo: "Falhou", tom: "red" },
  cancelado: { rotulo: "Cancelado", tom: "slate" },
  unidades: { rotulo: "Catálogo lido", tom: "blue" },
};

/** Sem atividade há mais que isto, o lote "lendo" é considerado abandonado (outro pode começar). */
export const MINUTOS_LOTE_PARADO = 30;

export type LoteCenti = {
  id: number;
  ano: number;
  estado: EstadoLote;
  modo: ModoLote;
  /** LIQUIDAÇÕES: os órgãos da Centi do lote, na ordem — a "página" N do período é o N-ésimo órgão. */
  orgaosCenti: number[] | null;
  paginas: number;
  recebidos: number;
  unicos: number;
  recusados: number;
  totalInformado: number | null;
  soma: number | null;
  leitor: number;
  /** Outra aba (ou outra pessoa) está conduzindo o lote agora. */
  conduzido: boolean;
  inseridos: number | null;
  atualizados: number | null;
  removidos: number | null;
  /** Os registros SEM vínculo no card — lidos e conferidos, NÃO gravados. */
  fora: number | null;
  mensagem: string | null;
  iniciadoPor: string;
  iniciadoEm: string;
  vistoEm: string;
  concluidoEm: string | null;
};

/** Os valores de um empenho fora do esperado (a mensagem da conclusão) — `n` = quantos no lote. */
export function motivoValoresSuspeitos(n: number): string | null {
  if (!n) return null;
  return `${n} empenho(s) com valor negativo ou acima de R$ ${LIMITE_VALOR_EMPENHO.toLocaleString("pt-BR")} — a leitura parece errada; nada foi gravado. Confira os passos e importe de novo.`;
}

/**
 * QUEDA suspeita em relação à última importação concluída do MESMO ano no card: os empenhos de um ano só crescem
 * (anulações são raras), então a soma abaixo de `limites.soma`% ou os registros abaixo de `limites.registros`% da anterior
 * pedem a confirmação de quem importa (as REGRAS do card; 0 = não confere).
 */
export function quedaSuspeita(
  anterior: { soma: number | null; unicos: number } | null,
  atual: { soma: number | null; unicos: number },
  limites: { soma: number; registros: number } = { soma: 80, registros: 90 },
): string | null {
  if (!anterior) return null;
  const partes: string[] = [];
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (limites.soma > 0 && anterior.soma != null && anterior.soma > 0 && (atual.soma ?? 0) < (anterior.soma * limites.soma) / 100) {
    partes.push(`a soma empenhada caiu de ${brl(anterior.soma)} para ${brl(atual.soma ?? 0)}`);
  }
  if (limites.registros > 0 && anterior.unicos > 0 && atual.unicos < (anterior.unicos * limites.registros) / 100) {
    partes.push(`os empenhos caíram de ${anterior.unicos.toLocaleString("pt-BR")} para ${atual.unicos.toLocaleString("pt-BR")}`);
  }
  return partes.length ? `Em relação à última importação concluída, ${partes.join(" e ")}.` : null;
}

// ---------------------------------------------------------------------------------------------------------------
// A ATUALIZAÇÃO AUTOMÁTICA (cron) — a mesma leitura da importação manual, conduzida pelo servidor em poucas páginas por
// passada; DESLIGADA por padrão (o card só entra ligado na Configuração dele).
// ---------------------------------------------------------------------------------------------------------------

/** O condutor da atualização automática (o token da trava do lote — uma aba nunca o usa) e quem aparece como autor. */
export const CONDUTOR_AUTO = "atualizacao-automatica";
export const QUEM_AUTO = "Atualização automática";
/** Páginas lidas por passada (o cron roda a cada 5 min) — cabe no limite de consultas e de CPU do Worker. */
export const PAGINAS_POR_PASSADA = 3;
/** Erros seguidos no MESMO pedido (um por passada) antes de a atualização automática desistir do lote. */
export const MAX_ERROS_AUTO = 3;

const chaveP = (p: Periodo) => `${p.inicio}|${p.fim}`;

/**
 * O PRÓXIMO pedido do lote: a página seguinte do período começado; senão o 1º período que falta — o período DIVIDIDO
 * (grande demais) dá lugar às metades, até um dia. null = o ano todo lido (é a hora de concluir).
 */
export function proximoPedido(ano: number, passos: PassoMin[], comPeriodo: boolean, paginas?: number): { periodo: Periodo; pagina: number } | null {
  const emCurso = periodoEmCurso(passos, paginas);
  if (emCurso) return emCurso;
  const lidos = periodosLidos(passos);
  const lidosSet = new Set(lidos.map(chaveP));
  const divididos = new Set(passos.filter((p) => p.estado === "dividido").map(chaveP));
  const abrir = (p: Periodo): Periodo | null => {
    if (lidosSet.has(chaveP(p))) return null;
    const metades = divididos.has(chaveP(p)) ? dividirPeriodo(p) : null;
    if (!metades) return p;
    for (const m of metades) {
      const r = abrir(m);
      if (r) return r;
    }
    return null;
  };
  for (const p of periodosAPedir(ano, lidos, comPeriodo)) {
    const r = abrir(p);
    if (r) return { periodo: r, pagina: 1 };
  }
  return null;
}

/** Quantos ERROS seguidos (os últimos passos) o MESMO pedido já teve. */
export function errosSeguidos(passos: PassoMin[], pedido: { periodo: Periodo; pagina: number }): number {
  let n = 0;
  for (let i = passos.length - 1; i >= 0; i--) {
    const p = passos[i];
    if (p.estado !== "erro" || p.inicio !== pedido.periodo.inicio || p.fim !== pedido.periodo.fim || p.pagina !== pedido.pagina) break;
    n++;
  }
  return n;
}

/** "AAAA-MM-DD HH:MM:SS" (UTC, o do SQLite) → ms. */
const msSql = (s: string) => Date.parse(`${s.replace(" ", "T")}Z`);

/**
 * É a HORA de começar uma atualização? Dentro do horário (Brasília), só em dia útil quando o cadastro pede, e passada a
 * frequência desde a última leitura concluída. O lote que já está lendo segue sem esperar a janela.
 */
export function cardNaHora(
  card: { frequenciaMin: number; diasUteis: boolean; horaInicio: string; horaFim: string; ultimaExecucao: string | null },
  agora: { ms: number; hora: string; diaUtil: boolean },
): boolean {
  if (agora.hora < card.horaInicio || agora.hora > card.horaFim) return false;
  if (card.diasUteis && !agora.diaUtil) return false;
  if (!card.ultimaExecucao) return true;
  const ultima = msSql(card.ultimaExecucao);
  return !Number.isFinite(ultima) || agora.ms - ultima >= card.frequenciaMin * 60_000;
}

/** O ANO da vez entre os mantidos: o que nunca foi lido (o mais recente primeiro); senão o lido há mais tempo. */
export function anoDaVez(anos: number[], ultimaPorAno: Map<number, string>): number {
  const nunca = anos.find((a) => !ultimaPorAno.has(a));
  if (nunca != null) return nunca;
  return [...anos].sort((a, b) => (ultimaPorAno.get(a) ?? "").localeCompare(ultimaPorAno.get(b) ?? "") || b - a)[0];
}
