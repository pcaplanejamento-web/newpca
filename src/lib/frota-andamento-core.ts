import type { LoteCenti, PassoLote } from "./empenhos-core.ts";
import { codigoLegivel } from "./volus-core.ts";

/**
 * A FROTA (Vólus) no painel das importações ao vivo (puro, testado): a frota não tem card nem lote — o que o servidor sabe
 * são os CURSORES da atualização automática (travado = lendo agora) e o HISTÓRICO das leituras (`frota_leituras`). Este
 * núcleo monta UMA entrada no formato das importações da Centi (`LoteAoVivo`), com id fixo negativo (nunca colide com um
 * lote), a fração do ciclo e os últimos períodos lidos como os passos.
 */

/** O id da entrada da frota no painel (os lotes da Centi são positivos). */
export const ID_FROTA_AO_VIVO = -1;

export type CursorFrotaAoVivo = {
  contrato: string;
  tipo: string;
  travaAte: string | null;
  cicloInicio: string | null;
  proximo: string | null;
  /** Falhas seguidas e até quando espera (a automática tenta de novo depois) — o "Falhou" do painel vem daqui. */
  falhas?: number;
  esperaAte?: string | null;
  ultimoErro?: string | null;
};
/** Um passo da frota: o rótulo (contrato · tipo) fica sempre na `mensagem`; o erro, no campo próprio. */
export type PassoFrotaAoVivo = Omit<PassoLote, "corpo"> & { erro?: string | null };
export type LeituraFrotaAoVivo = {
  id: number;
  contrato: string;
  tipo: string;
  inicio: string;
  fim: string;
  origem: string;
  estado: string;
  registros: number;
  novos: number;
  alterados: number;
  iguais: number;
  fora: number;
  bytes: number;
  ms: number;
  erro: string | null;
  por: string | null;
  em: string;
};

export type FrotaAoVivo = LoteCenti & {
  cardId: null;
  cardNome: string;
  tipo: "frotas";
  doCron: boolean;
  fracao: number;
  leitura: null;
  passos: PassoFrotaAoVivo[];
  pedidos: number;
  erros: number;
  bytes: number;
};

const ULTIMOS = 8;

/** Lendo = algum cursor com a trava no futuro (a automática está lendo um período agora). */
export const cursoresLendo = (cs: readonly CursorFrotaAoVivo[], agoraIso: string) => cs.filter((c) => c.travaAte != null && c.travaAte > agoraIso);
/** Em ESPERA depois de um erro (a automática tenta de novo na hora marcada): o "Falhou" com o contrato. */
export const cursoresComErro = (cs: readonly CursorFrotaAoVivo[], agoraIso: string) => cs.filter((c) => (c.falhas ?? 0) > 0 && c.esperaAte != null && c.esperaAte > agoraIso);
const rotuloCursor = (c: { contrato: string; tipo: string }) => `${codigoLegivel(c.contrato)} · ${c.tipo}`;

/** A fração do ciclo dos cursores (os dias já lidos de cada um ÷ os dias do ciclo). */
export function fracaoDosCursores(cs: readonly CursorFrotaAoVivo[], hoje: string): number {
  const dia = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`) / 86_400_000;
  let feito = 0;
  let total = 0;
  for (const c of cs) {
    if (!c.cicloInicio) continue;
    const ini = dia(c.cicloInicio);
    const ate = dia(hoje) + 1;
    const prox = c.proximo ? dia(c.proximo) : ate;
    if (!(ate > ini)) continue;
    total += ate - ini;
    feito += Math.min(ate, Math.max(ini, prox)) - ini;
  }
  return total > 0 ? Math.min(0.99, feito / total) : 0;
}

/**
 * A entrada da frota (ou null sem nada a mostrar): os cursores lendo e as leituras recentes (já filtradas por quem chama —
 * as dos últimos minutos, ou as da última importação consultada).
 */
export function frotaAoVivo(cursores: readonly CursorFrotaAoVivo[], leituras: readonly LeituraFrotaAoVivo[], agoraIso: string): FrotaAoVivo | null {
  const lendo = cursoresLendo(cursores, agoraIso);
  const comErro = cursoresComErro(cursores, agoraIso);
  if (!lendo.length && !leituras.length) return null;
  const ordenadas = [...leituras].sort((a, b) => b.id - a.id);
  const ultima = ordenadas[0];
  const doCron = lendo.length > 0 || ultima?.origem === "auto";
  const erros = ordenadas.filter((l) => l.estado === "erro").length;
  // Falhou = algum cursor em espera depois de um erro (não a última leitura de qualquer contrato — um tropeço que já passou
  // não é falha, e o erro de um contrato não some porque outro leu depois).
  const estado: LoteCenti["estado"] = lendo.length ? "lendo" : comErro.length ? "falhou" : "promovido";
  const iniciadoEm = ordenadas.at(-1)?.em ?? agoraIso.slice(0, 19).replace("T", " ");
  const ano = Number((ultima?.inicio ?? agoraIso).slice(0, 4));
  const soma = (f: (l: LeituraFrotaAoVivo) => number) => ordenadas.reduce((s, l) => s + f(l), 0);
  const emCurso = lendo.map(rotuloCursor).join(", ");
  return {
    id: ID_FROTA_AO_VIVO,
    ano,
    estado,
    modo: "dados",
    orgaosCenti: null,
    paginas: ordenadas.length,
    recebidos: soma((l) => l.registros),
    unicos: soma((l) => l.registros),
    recusados: 0,
    totalInformado: null,
    soma: null,
    leitor: 0,
    conduzido: lendo.length > 0,
    automatica: doCron,
    inseridos: soma((l) => l.novos),
    atualizados: soma((l) => l.alterados),
    removidos: null,
    ausentes: null,
    fora: soma((l) => l.fora),
    mensagem: lendo.length
      ? `Lendo a Vólus: ${emCurso}`
      : comErro.length
        ? `Em espera depois de erro: ${comErro.map((c) => `${rotuloCursor(c)}${c.ultimoErro ? ` (${c.ultimoErro})` : ""}`).join("; ")} — a atualização automática tenta de novo.`
        : `Concluída: ${soma((l) => l.registros).toLocaleString("pt-BR")} registros lidos, ${soma((l) => l.novos).toLocaleString("pt-BR")} novos, ${soma((l) => l.alterados).toLocaleString("pt-BR")} alterados.`,
    iniciadoPor: doCron ? "Atualização automática" : (ultima?.por ?? "—"),
    iniciadoEm,
    vistoEm: ultima?.em ?? iniciadoEm,
    concluidoEm: lendo.length ? null : (ultima?.em ?? null),
    cardId: null,
    cardNome: "Frotas (Vólus)",
    tipo: "frotas",
    doCron,
    fracao: lendo.length ? fracaoDosCursores(lendo, agoraIso.slice(0, 10)) : 1,
    leitura: null,
    passos: ordenadas.slice(0, ULTIMOS).map((l) => ({
      id: l.id,
      inicio: l.inicio,
      fim: l.fim,
      pagina: 1,
      estado: l.estado === "erro" ? "erro" : l.estado === "dividido" ? "dividido" : "ok",
      fimPeriodo: true,
      status: null,
      bytes: l.bytes,
      ms: l.ms,
      recebidos: l.registros,
      novos: l.novos,
      recusados: 0,
      repetidos: 0,
      total: null,
      soma: null,
      mensagem: rotuloCursor(l),
      erro: l.estado === "erro" ? (l.erro ?? "Falhou") : null,
      resNovos: l.novos,
      resAlterados: l.alterados,
      resIguais: l.iguais,
      resSemVinculo: l.fora,
      em: l.em,
    })),
    pedidos: ordenadas.length,
    erros,
    bytes: soma((l) => l.bytes),
  };
}
