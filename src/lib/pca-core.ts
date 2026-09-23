import { MESES, normPrevisao, stripAccents } from "./normalize.ts";
import { norm } from "./parse-dfd-comum.ts";

/**
 * PCA como ESPAÇO — núcleo PURO (sem `getDb`/JSX → testável). O PCA tem uma FONTE (`lista` =
 * planilhas importadas | `protocolo` = DFDs vinculados a partir dos protocolos), um STATUS
 * (`preview`/`publicado`) e, na fonte protocolo, o que se vincula é o **DFD** (o protocolo é o
 * veículo). Cada DFD vinculado tem uma AÇÃO; a CAMADA (preview/publicado) em que ele conta vem da
 * SITUAÇÃO do protocolo de origem (Configurações → Situações).
 */

export type FontePca = "lista" | "protocolo";
export type StatusPca = "preview" | "publicado";
export type CamadaPca = "preview" | "publicado";
export type AcaoDfdPca = "incorporar" | "substituir" | "excluir";

export const ROTULO_FONTE: Record<FontePca, string> = { lista: "Lista pronta", protocolo: "Protocolos" };
export const ROTULO_STATUS: Record<StatusPca, string> = { preview: "Preview", publicado: "Publicado" };
export const ROTULO_ACAO: Record<AcaoDfdPca, string> = {
  incorporar: "Incorporar",
  substituir: "Substituir",
  excluir: "Excluir",
};
export const ACOES_DFD_PCA: AcaoDfdPca[] = ["incorporar", "substituir", "excluir"];

export function coerceFonte(v: unknown): FontePca {
  return v === "protocolo" ? "protocolo" : "lista";
}
export function coerceStatus(v: unknown): StatusPca {
  return v === "publicado" ? "publicado" : "preview";
}
export function coerceCamada(v: unknown): CamadaPca {
  return v === "publicado" ? "publicado" : "preview";
}
export function coerceAcao(v: unknown): AcaoDfdPca {
  return v === "substituir" || v === "excluir" ? v : "incorporar";
}

/**
 * AÇÃO sugerida pelo ASSUNTO do protocolo: EXCLUSÃO → excluir; ALTERAÇÃO → substituir (o DFD de
 * mesmo planejamento); o resto (INCLUSÃO, vazio) → incorporar. Só SUGERE — o usuário confirma.
 */
export function acaoSugerida(assunto: string | null | undefined): AcaoDfdPca {
  const s = norm(assunto);
  if (/\bEXCLUS/.test(s)) return "excluir";
  if (/\bALTERA/.test(s)) return "substituir";
  return "incorporar";
}

/** Fatos de UM protocolo candidato a entrar no PCA (apurados no servidor ou na tela). */
export type FatosMover = {
  /** A situação do protocolo permite mover? (`null` = sem situação). */
  situacaoPermite: boolean | null;
  situacaoNome?: string | null;
  anoProtocolo: number | null;
  anoPca: number | null;
  /** Nº de DFDs do protocolo. */
  totalDfds: number;
  /** Nº de DFDs do protocolo já vinculados a OUTRO PCA. */
  dfdsEmOutroPca: number;
  /** O PCA é de fonte `protocolo`? */
  fonteProtocolo: boolean;
};

/**
 * Motivos que IMPEDEM mover o protocolo para o PCA (vazio = pode). As travas: fonte do PCA =
 * protocolo; situação que permite mover; `ano_pca` do protocolo = ano do PCA; ter DFD; e um DFD
 * só pode estar em UM PCA.
 */
export function motivosNaoMover(f: FatosMover): string[] {
  const m: string[] = [];
  if (!f.fonteProtocolo) m.push("O PCA é de lista pronta (não recebe protocolos)");
  if (f.situacaoPermite == null) m.push("Protocolo sem situação");
  else if (!f.situacaoPermite) m.push(`A situação "${f.situacaoNome ?? "—"}" não permite mover para o PCA`);
  if (f.anoPca == null) m.push("O PCA não tem ano definido");
  else if (f.anoProtocolo == null) m.push("Protocolo sem ano do PCA");
  else if (f.anoProtocolo !== f.anoPca) m.push(`Protocolo marcado com o PCA ${f.anoProtocolo} (este é ${f.anoPca})`);
  if (f.totalDfds === 0) m.push("Protocolo sem DFDs");
  else if (f.dfdsEmOutroPca >= f.totalDfds) m.push("Os DFDs já estão em outro PCA");
  return m;
}

// ---------------------------------------------------------------------------
// Consolidação
// ---------------------------------------------------------------------------

/** Um DFD vinculado ao PCA, com o necessário para consolidar. */
export type LinhaVinculo = {
  dfdId: number;
  /** Nº de planejamento (a chave de substituição/exclusão); vazio = o DFD só se representa. */
  planejamento: string | null;
  acao: AcaoDfdPca;
  camada: CamadaPca;
  /** Ordem cronológica (protocolação/vínculo) — texto ISO ou número; menor = antes. */
  ordem: string | number;
};

export type AvisoConsolidacao = { dfdId: number; mensagem: string };

export type Consolidacao = {
  /** DFDs VIGENTES (1 por planejamento). */
  vigentes: number[];
  /** DFDs que saíram por substituição/exclusão (substituído → quem o tirou). */
  retirados: Map<number, number>;
  avisos: AvisoConsolidacao[];
};

const chavePlan = (l: LinhaVinculo) => {
  const p = norm(l.planejamento).replace(/\D/g, "") || norm(l.planejamento);
  return p ? `p:${p}` : `d:${l.dfdId}`;
};

/**
 * CONSOLIDA os DFDs do PCA na camada pedida (`publicado` = só os de protocolos em situação
 * publicada; `preview` = todos). Em ordem cronológica: INCORPORAR põe o DFD; SUBSTITUIR troca o
 * DFD de mesmo planejamento (sem par ⇒ entra como incorporar + aviso); EXCLUIR tira o de mesmo
 * planejamento (sem par ⇒ aviso; o DFD de exclusão nunca é vigente).
 */
export function consolidarPca(linhas: LinhaVinculo[], camada: CamadaPca): Consolidacao {
  const lista = linhas
    .filter((l) => camada === "preview" || l.camada === "publicado")
    .slice()
    .sort((a, b) => (a.ordem < b.ordem ? -1 : a.ordem > b.ordem ? 1 : a.dfdId - b.dfdId));
  const atual = new Map<string, number>();
  const retirados = new Map<number, number>();
  const avisos: AvisoConsolidacao[] = [];
  for (const l of lista) {
    const k = chavePlan(l);
    const anterior = atual.get(k);
    if (l.acao === "excluir") {
      if (anterior == null) avisos.push({ dfdId: l.dfdId, mensagem: "Exclusão sem DFD correspondente no PCA" });
      else {
        retirados.set(anterior, l.dfdId);
        atual.delete(k);
      }
      continue;
    }
    if (l.acao === "substituir" && anterior == null)
      avisos.push({ dfdId: l.dfdId, mensagem: "Substituição sem DFD correspondente — entrou como incorporação" });
    if (l.acao === "incorporar" && anterior != null)
      avisos.push({ dfdId: l.dfdId, mensagem: "Planejamento repetido — o mais recente prevalece" });
    if (anterior != null) retirados.set(anterior, l.dfdId);
    atual.set(k, l.dfdId);
  }
  return { vigentes: [...atual.values()], retirados, avisos };
}

// ---------------------------------------------------------------------------
// Previsão → mês do cronograma
// ---------------------------------------------------------------------------

type SecaoLike = { titulo?: string | null; texto?: string | null };

/**
 * Mês/ano da PREVISÃO DE ENTREGA do DFD (seção 5) para o cronograma: `{ano, mes}` ou
 * `{ano, anual:true}` (recorrente — distribuído pelos 12 meses) ou `null` (sem previsão).
 */
export function previsaoDoDfd(
  secoes: SecaoLike[] | null | undefined,
  anoPca: number | null,
): { ano: number; mes: number } | { ano: number; anual: true } | null {
  const s = (secoes ?? []).find((x) => norm(x.titulo).includes("PREVISAO DE ENTREGA"));
  if (!s) return null;
  const { valor, anual } = normPrevisao(s.texto, anoPca);
  if (!valor) return null;
  const ano = Number(valor.match(/(20\d{2})/)?.[1] ?? anoPca ?? Number.NaN);
  if (!Number.isFinite(ano)) return null;
  if (anual) return { ano, anual: true };
  const nomeMes = stripAccents(valor.split("/")[0] ?? "");
  const mes = MESES.findIndex((m) => stripAccents(m) === nomeMes) + 1;
  return mes >= 1 ? { ano, mes } : null;
}

// ---------------------------------------------------------------------------
// Agregação do dashboard (as MESMAS formas de `queries.ts`)
// ---------------------------------------------------------------------------

/** Um item já achatado para o dashboard. */
export type ItemDashboard = {
  id: number;
  codigoProduto: string | null;
  sequencial: number | null;
  nome: string | null;
  unidadeMedida: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number;
  classificacao: string;
  /** Previsão (mês/ano; `anual` = distribuir nos 12 meses). */
  previsao: { ano: number; mes: number } | { ano: number; anual: true } | null;
  /** Sigla da unidade (requisitante). */
  unidade: string | null;
  /** Rótulo complementar (ex.: "DFD 123"). */
  origem: string | null;
};

export type ResumoDash = {
  total: number;
  count: number;
  ticket: number;
  maiorNome: string | null;
  maiorValor: number;
  numUnidades: number;
};
export type FatiaDash = { label: string; total: number; count: number };
export type PontoDash = { ano: number; mes: number; total: number; count: number };
export type TopDash = {
  nome: string | null;
  valor: number;
  quantidade: number | null;
  unidadeMedida: string | null;
  codigo: string | null;
};

function fatias(itens: ItemDashboard[], chave: (i: ItemDashboard) => string, ordem: "total" | "count"): FatiaDash[] {
  const m = new Map<string, FatiaDash>();
  for (const i of itens) {
    const k = chave(i) || "—";
    const f = m.get(k) ?? { label: k, total: 0, count: 0 };
    f.total += i.valorTotal;
    f.count += 1;
    m.set(k, f);
  }
  return [...m.values()].sort((a, b) => b[ordem] - a[ordem] || a.label.localeCompare(b.label, "pt-BR"));
}

/** Resumo/fatias/cronograma/top a partir de uma lista de itens — espelha as consultas SQL. */
export function agregarDashboard(itens: ItemDashboard[], topN = 10) {
  let total = 0;
  let maior: ItemDashboard | null = null;
  const unidades = new Set<string>();
  const meses = new Map<string, PontoDash>();
  const soma = (ano: number, mes: number, v: number, c: number) => {
    const k = `${ano}-${mes}`;
    const p = meses.get(k) ?? { ano, mes, total: 0, count: 0 };
    p.total += v;
    p.count += c;
    meses.set(k, p);
  };
  for (const i of itens) {
    total += i.valorTotal;
    if (!maior || i.valorTotal > maior.valorTotal) maior = i;
    if (i.unidade) unidades.add(i.unidade);
    const p = i.previsao;
    if (p && "anual" in p) for (let m = 1; m <= 12; m++) soma(p.ano, m, i.valorTotal / 12, 1 / 12);
    else if (p) soma(p.ano, p.mes, i.valorTotal, 1);
  }
  const count = itens.length;
  const resumo: ResumoDash = {
    total,
    count,
    ticket: count > 0 ? total / count : 0,
    maiorNome: maior?.nome ?? null,
    maiorValor: maior?.valorTotal ?? 0,
    numUnidades: unidades.size,
  };
  const porMes = [...meses.values()]
    .map((p) => ({ ...p, count: Math.round(p.count) }))
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const top: TopDash[] = itens
    .slice()
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, topN)
    .map((i) => ({ nome: i.nome, valor: i.valorTotal, quantidade: i.quantidade, unidadeMedida: i.unidadeMedida, codigo: i.unidade }));
  return {
    resumo,
    porClassificacao: fatias(itens, (i) => i.classificacao, "total"),
    porUnidadeMedida: fatias(itens, (i) => i.unidadeMedida ?? "", "count"),
    porMes,
    top,
  };
}
