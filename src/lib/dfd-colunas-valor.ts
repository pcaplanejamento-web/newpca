/**
 * Os VALORES das colunas da planilha de DFDs (filtro, ordenação, exportação) — puros, a fonte ÚNICA da `PlanilhaDfds` e da
 * automação "Verificar DFDs na Centi": os filtros da tabela da aba "DFDs" são GRAVADOS (não os ids) e reaplicados aos DFDs
 * de AGORA na execução (também a agendada) — `filtrarDfdsPelaTabela`. Testado em `tests/dfd-colunas-valor.test.ts`.
 */
import { aceiteVale, contarDivergencias, deltaValorDoMotivo, divergenciasDoMotivo, lerAceite, notaConferencia, tiposDoMotivo } from "./conferencia-dfd-centi.ts";
import { dataIsoBrasilia } from "./format.ts";
import { planejamentoDfd } from "./parse-dfd-comum.ts";
import { aplicarFiltros, type ColunaDados, type FiltroValor } from "./tabela-filtros.ts";

/** O rótulo da conferência com a Centi gravada no DFD. */
export const rotuloConferencia = (s: string | null | undefined) => (s === "convergente" ? "Convergente" : s === "divergente" ? "Divergente" : "Não conferido");
/** O rótulo do FILTRO da conferência DESATUALIZADA (o DFD mudou depois dela). */
export const ROTULO_RECONFERIR = "Reconferir";
/** O rótulo do CONVERGENTE COM NOTA (sem as seções 8 a 10 na Centi — não comparadas): âmbar, com a nota no painel. */
export const ROTULO_COM_NOTA = "Convergente*";
/** O rótulo da divergência ACEITA (a Centi é que está errada — vale enquanto o motivo for o mesmo). */
export const ROTULO_RESSALVA = "Convergente com ressalva";
/** O texto curto do selo da divergência aceita. */
export const ROTULO_RESSALVA_CURTO = "Com ressalva";

/** A divergência foi ACEITA (o aceite gravado é deste MESMO motivo). */
export const comRessalva = (s: string | null | undefined, motivo: string | null | undefined, aceite: string | null | undefined) =>
  aceiteVale(s, motivo ?? null, lerAceite(aceite));

/** Os valores do FILTRO da coluna Centi: o status, "Reconferir" quando desatualizada e, no divergente, cada TIPO de
 * divergência ("Divergente · Valor total") — ou, ACEITA, "Convergente com ressalva" (os tipos seguem filtráveis). */
export const valoresConferencia = (s: string | null | undefined, motivo?: string | null, desatualizada = false, ressalva = false): string[] => [
  ressalva && s === "divergente" ? ROTULO_RESSALVA : notaConferencia(s, motivo) ? ROTULO_COM_NOTA : rotuloConferencia(s),
  ...(desatualizada && (s === "convergente" || s === "divergente") ? [ROTULO_RECONFERIR] : []),
  ...(s === "divergente" ? tiposDoMotivo(motivo).map((t) => `Divergente · ${t}`) : []),
];

/** O que a coluna "Centro de Custo" mostra sem o dado. */
export const SEM_CENTRO_CUSTO = "Sem centro de custo";

/** Os campos de uma linha da planilha de DFDs que as colunas filtráveis leem (a `LinhaDfd` da tela tem estes). */
export type LinhaDfdValores = {
  numero: string;
  planejamento: string | null;
  sigla: string;
  tipo: string | null;
  itens: number | null;
  valor: number | null;
  protocolo?: string | null;
  execucao?: string | null;
  centroCusto?: { texto: string | null } | null;
  conferencia?: { status: string | null; motivo: string | null; em?: string | null; desatualizada?: boolean; aceite?: string | null };
};

type Coluna = { filter: "values"; valores: (r: LinhaDfdValores) => string[] } | { filter: "range"; numero: (r: LinhaDfdValores) => number | null } | { filter: "date"; data: (r: LinhaDfdValores) => string };

const um = (f: (r: LinhaDfdValores) => string) => ({ filter: "values" as const, valores: (r: LinhaDfdValores) => [f(r)] });

/** A régua de cada coluna filtrável (a chave = a `key` da coluna na planilha). */
export const VALOR_COLUNA_DFD: Record<string, Coluna> = {
  planejamento: um((r) => planejamentoDfd(r.planejamento) ?? "—"),
  numero: um((r) => r.numero),
  sigla: um((r) => r.sigla),
  tipo: um((r) => r.tipo ?? "—"),
  itens: um((r) => String(r.itens ?? "")),
  valor: { filter: "range", numero: (r) => r.valor },
  protocolo: um((r) => r.protocolo ?? "—"),
  execucao: um((r) => r.execucao ?? "Não verificado"),
  centroCusto: um((r) => r.centroCusto?.texto || SEM_CENTRO_CUSTO),
  conferenciaCenti: {
    filter: "values",
    valores: (r) =>
      valoresConferencia(r.conferencia?.status, r.conferencia?.motivo, r.conferencia?.desatualizada, comRessalva(r.conferencia?.status, r.conferencia?.motivo, r.conferencia?.aceite)),
  },
  divergenciasCenti: {
    filter: "range",
    numero: (r) => (r.conferencia?.status === "divergente" ? contarDivergencias(divergenciasDoMotivo(r.conferencia.motivo)) : r.conferencia?.status ? 0 : null),
  },
  deltaCenti: { filter: "range", numero: (r) => deltaValorDoMotivo(r.conferencia?.motivo) },
  conferidoCenti: { filter: "date", data: (r) => (r.conferencia?.em ? dataIsoBrasilia(r.conferencia.em) : "") },
};

/** O valor (texto) de UMA coluna — o `value` da planilha. */
export const valorDaColunaDfd = (chave: string, r: LinhaDfdValores): string => {
  const c = VALOR_COLUNA_DFD[chave];
  if (!c) return "";
  return c.filter === "values" ? (c.valores(r)[0] ?? "") : c.filter === "date" ? c.data(r) : String(c.numero(r) ?? "");
};

/**
 * As linhas que passam nos FILTROS gravados (a mesma régua da tabela — `aplicarFiltros`). `null` = algum filtro é de uma
 * coluna sem régua aqui (quem chama usa a reserva — os ids vistos na tabela).
 */
export function filtrarDfdsPelaTabela<T extends LinhaDfdValores>(linhas: T[], filtros: Record<string, FiltroValor>): T[] | null {
  const chaves = Object.keys(filtros);
  if (!chaves.length) return linhas;
  if (chaves.some((k) => !VALOR_COLUNA_DFD[k])) return null;
  const cols = chaves.map((k): ColunaDados => {
    const c = VALOR_COLUNA_DFD[k];
    if (c.filter === "values") return { tipo: "values", vals: linhas.map((r) => c.valores(r)) };
    if (c.filter === "range") return { tipo: "range", vals: linhas.map((r) => c.numero(r)) };
    return { tipo: "date", vals: linhas.map((r) => c.data(r)) };
  });
  const r = aplicarFiltros(
    linhas.length,
    cols,
    chaves.map((k) => filtros[k]),
  );
  return r.passam.map((i) => linhas[i]);
}
