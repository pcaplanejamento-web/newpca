/**
 * Os ESTADOS REAIS de cada DFD do "Baixar/anexar DFDs" e a CONTAGEM ÚNICA (puro, testado). A linha diz exatamente o passo
 * em que o DFD está — emitindo na Centi, conferindo o PDF, unindo, aguardando a confirmação, anexando — e o fim real
 * (anexado/salvo, já estava, falhou, interrompido). A barra da Análise, o painel de segundo plano, a análise ao vivo e o
 * ícone da extensão leem TODOS a `contagemDfds` — os números nunca se contradizem.
 */
import type { TarefaCenti } from "./automacao-centi-core.ts";

export type EstadoDfd =
  | "fila"
  | "emitindo"
  | "conferindo"
  | "unindo"
  | "aguardando"
  | "anexando"
  | "ok"
  | "ja"
  | "falha"
  | "interrompido"
  | "pulado"
  | "repetido";

export type LinhaDfd = TarefaCenti & { estado: EstadoDfd; erro?: string; amostra?: string; entidade?: string; entidadePrevista?: boolean };

/** Os estados EM CURSO (o DFD está sendo tratado agora). */
const EM_CURSO = new Set<EstadoDfd>(["emitindo", "conferindo", "unindo", "aguardando", "anexando"]);
/** Os estados FINAIS de um DFD válido (o que a barra conta como concluído). */
const FINAIS = new Set<EstadoDfd>(["ok", "ja", "falha", "interrompido"]);

export const emCursoDfd = (e: EstadoDfd) => EM_CURSO.has(e);
export const finalDfd = (e: EstadoDfd) => FINAIS.has(e);
/** Fora da conta: o DFD sem planejamento e o repetido não são emitidos. */
export const validoDfd = (e: EstadoDfd) => e !== "pulado" && e !== "repetido";

type Tom = "slate" | "blue" | "amber" | "emerald" | "red";
/** O rótulo, a cor (token) e o tom (selo) de cada estado. `anexar` = o destino é um protocolo da Centi. */
export function visualEstadoDfd(e: EstadoDfd, anexar: boolean): { rotulo: string; cor: string; tom: Tom } {
  switch (e) {
    case "fila":
      return { rotulo: "Na fila", cor: "var(--muted)", tom: "slate" };
    case "emitindo":
      return { rotulo: "Emitindo na Centi…", cor: "var(--info)", tom: "blue" };
    case "conferindo":
      return { rotulo: "Conferindo o PDF…", cor: "var(--info)", tom: "blue" };
    case "unindo":
      return { rotulo: "No PDF unido", cor: "var(--info)", tom: "blue" };
    case "aguardando":
      return { rotulo: "Aguardando sua confirmação", cor: "var(--warn)", tom: "amber" };
    case "anexando":
      return { rotulo: "Anexando na Centi…", cor: "var(--info)", tom: "blue" };
    case "ok":
      return { rotulo: anexar ? "Anexado" : "Salvo", cor: "var(--ok)", tom: "emerald" };
    case "ja":
      return { rotulo: "Já estava", cor: "var(--ok)", tom: "emerald" };
    case "falha":
      return { rotulo: "Falhou", cor: "var(--danger)", tom: "red" };
    case "interrompido":
      return { rotulo: "Interrompido", cor: "var(--warn)", tom: "amber" };
    case "pulado":
      return { rotulo: "Sem planejamento", cor: "var(--warn)", tom: "amber" };
    case "repetido":
      return { rotulo: anexar ? "Não anexado" : "Não baixado", cor: "var(--warn)", tom: "amber" };
  }
}

/** A referência curta de uma linha. */
export const refDfd = (l: Pick<LinhaDfd, "id" | "dfd">) => `Planej. ${l.id || "—"}${l.dfd ? ` · DFD ${l.dfd}` : ""}`;

export type ContagemDfds = {
  /** Os DFDs válidos (sem os pulados/repetidos). */
  total: number;
  concluidas: number;
  emCurso: number;
  fila: number;
  ok: number;
  ja: number;
  falhas: number;
  interrompidas: number;
  /** A linha em curso (a 1ª) — o que está acontecendo agora. */
  atual?: LinhaDfd;
};

/** A CONTAGEM ÚNICA (a barra, o painel, o ícone): total = concluídas + em curso + fila. */
export function contagemDfds(linhas: readonly LinhaDfd[]): ContagemDfds {
  const c: ContagemDfds = { total: 0, concluidas: 0, emCurso: 0, fila: 0, ok: 0, ja: 0, falhas: 0, interrompidas: 0 };
  for (const l of linhas) {
    if (!validoDfd(l.estado)) continue;
    c.total++;
    if (l.estado === "fila") c.fila++;
    else if (EM_CURSO.has(l.estado)) {
      c.emCurso++;
      c.atual ??= l;
    } else {
      c.concluidas++;
      if (l.estado === "ok") c.ok++;
      else if (l.estado === "ja") c.ja++;
      else if (l.estado === "falha") c.falhas++;
      else c.interrompidas++;
    }
  }
  return c;
}

/** O resumo da barra: "12 anexado(s) · 4 já estavam · 1 falhou — 17 de 46". */
export function textoContagem(c: ContagemDfds, anexar: boolean): string {
  const partes = [`${c.ok} ${anexar ? "anexado(s)" : "salvo(s)"}`];
  if (c.ja) partes.push(`${c.ja} já estava(m)`);
  if (c.falhas) partes.push(`${c.falhas} falhou(aram)`);
  if (c.interrompidas) partes.push(`${c.interrompidas} interrompido(s)`);
  return `${partes.join(" · ")} — ${c.concluidas} de ${c.total}`;
}

/** O andamento dos DFDs (o painel de segundo plano): concluídos / total (a MESMA conta da barra) e as linhas. */
export function andamentoDfds(
  linhas: readonly LinhaDfd[],
  anexar = false,
): { feito: number; total: number; atual?: string; itens: { rotulo: string; estado: "ok" | "falhou" | "rodando" | "fila"; detalhe?: string }[] } {
  const c = contagemDfds(linhas);
  const estado = (e: EstadoDfd) => (e === "fila" ? "fila" : EM_CURSO.has(e) ? "rodando" : e === "falha" || e === "interrompido" ? "falhou" : "ok");
  return {
    feito: c.concluidas,
    total: c.total,
    atual: c.atual ? `${visualEstadoDfd(c.atual.estado, anexar).rotulo.replace(/…$/, "")} · ${refDfd(c.atual)}` : undefined,
    itens: linhas
      .filter((l) => validoDfd(l.estado))
      .map((l) => ({ rotulo: refDfd(l), estado: estado(l.estado), detalhe: l.erro ?? visualEstadoDfd(l.estado, anexar).rotulo })),
  };
}

/** A ENTIDADE PREVISTA de um DFD antes de emitir — a MESMA ordem do emissor: a cadastrada no órgão (no formato da
 * aberta), a do mapa do aparelho, a aberta. A emissão confirma (ou troca) a entidade real. */
export function entidadePrevista(
  orgao: string | null,
  cadastradas: Record<string, string>,
  mapa: Record<string, string>,
  aberta: string | null,
  formato: (valor: string, aberta: string | null) => string,
): string | null {
  const fixa = orgao ? cadastradas[orgao] : undefined;
  if (fixa) return formato(fixa, aberta);
  return (orgao ? mapa[orgao] : undefined) ?? aberta ?? null;
}
