import type { BlocoDoc } from "./documento-pdf-core.ts";
import { brl, num } from "./format.ts";
import {
  type AcaoVinculo,
  type AlvoVinculo,
  mapaVinculos,
  SEM_ACAO,
  semVinculo,
  type UnidadeOrcamento,
  unidadeDoLancamento,
  type VinculoOrcamento,
} from "./orcamento-vinculo.ts";

/**
 * Os VÍNCULOS de UMA unidade cadastrada (a linha do orçamento do PCA) — núcleo PURO (testável): cada unidade do orçamento
 * ligada a ela com TODAS as ações e o DESTINO de cada uma (esta unidade · outra · sem vínculo), as ações SEM vínculo
 * separadas e os blocos do PDF. A MESMA régua do comparativo (`unidadeDoLancamento`).
 */

/** Uma ação com o destino: `alvoId` = a unidade cadastrada que a recebe; `null` = sem vínculo. */
export type AcaoComDestino = { acao: AcaoVinculo; alvoId: number | null };
export type UnidadeLigada = { unidade: UnidadeOrcamento; vinculo: VinculoOrcamento; acoes: AcaoComDestino[]; valor: number };
/** As ações SEM vínculo de uma unidade do orçamento (o que falta vincular). */
export type SemVinculoUnidade = { unidade: UnidadeOrcamento; acoes: AcaoVinculo[]; valor: number; vinculada: boolean; sugestaoId: number | null };
export type VinculosDaLinha = {
  /** As unidades do orçamento ligadas à unidade cadastrada (na linha "Sem vínculo", vazio). */
  ligadas: UnidadeLigada[];
  /** As ações sem vínculo: das unidades ligadas (unidade cadastrada) ou de TODO o orçamento (linha "Sem vínculo"). */
  semVinculo: SemVinculoUnidade[];
  /** Dotação que chega à unidade (Σ das ações com destino = ela). */
  valorVinculado: number;
  valorSemVinculo: number;
  acoesSemVinculo: number;
};

const textoAcao = (a: AcaoVinculo) => (a.chave === SEM_ACAO ? null : a.texto);

/** Os vínculos da linha: `alvoId` = a unidade cadastrada; `null` = a linha "Sem vínculo" (todo o orçamento). `alvos` = as
 * unidades cadastradas (a SUGESTÃO para a unidade do orçamento sem vínculo nenhum). */
export function vinculosDaLinha(
  unidades: UnidadeOrcamento[],
  vinculos: VinculoOrcamento[],
  alvoId: number | null,
  alvos: AlvoVinculo[] = [],
): VinculosDaLinha {
  const mapa = mapaVinculos(vinculos);
  const porChave = new Map(unidades.map((u) => [u.chave, u]));
  const ligadas: UnidadeLigada[] = [];
  if (alvoId != null)
    for (const v of vinculos) {
      const u = porChave.get(v.chave);
      if (!u || v.alvoId !== alvoId) continue;
      const acoes = u.acoes.map((acao) => ({ acao, alvoId: unidadeDoLancamento(mapa, u.texto, textoAcao(acao)) }));
      ligadas.push({ unidade: u, vinculo: v, acoes, valor: acoes.reduce((s, a) => s + (a.alvoId === alvoId ? a.acao.valorInicial : 0), 0) });
    }
  ligadas.sort((a, b) => a.unidade.texto.localeCompare(b.unidade.texto, "pt-BR"));
  const chavesLigadas = new Set(ligadas.map((l) => l.unidade.chave));
  const sem = semVinculo(unidades, vinculos, alvos)
    .filter((p) => alvoId == null || chavesLigadas.has(p.unidade.chave))
    .map((p) => ({ unidade: p.unidade, acoes: p.acoes, valor: p.valorInicial, vinculada: p.vinculada, sugestaoId: p.sugestaoId }));
  return {
    ligadas,
    semVinculo: sem,
    valorVinculado: ligadas.reduce((s, l) => s + l.valor, 0),
    valorSemVinculo: sem.reduce((s, p) => s + p.valor, 0),
    acoesSemVinculo: sem.reduce((s, p) => s + p.acoes.length, 0),
  };
}

/** A dica "quem está sem vínculo", ORGANIZADA: por unidade do orçamento, as ações (até `max` no total) + quantas ficaram de fora. */
export function listaSemVinculo(sem: SemVinculoUnidade[], max = 12): { grupos: { unidade: string; acoes: AcaoVinculo[] }[]; resto: number } {
  const grupos: { unidade: string; acoes: AcaoVinculo[] }[] = [];
  let usadas = 0;
  let resto = 0;
  for (const p of sem) {
    const vis = p.acoes.slice(0, Math.max(0, max - usadas));
    usadas += vis.length;
    resto += p.acoes.length - vis.length;
    if (vis.length) grupos.push({ unidade: p.unidade.texto, acoes: vis });
  }
  return { grupos, resto };
}

/** As ações sem vínculo por unidade CADASTRADA (as das unidades do orçamento ligadas a ela) — a dica da coluna Vínculos. */
export function semVinculoPorAlvo(unidades: UnidadeOrcamento[], vinculos: VinculoOrcamento[]): Map<number, SemVinculoUnidade[]> {
  const out = new Map<number, SemVinculoUnidade[]>();
  const alvosDe = new Map<string, Set<number>>();
  for (const v of vinculos) alvosDe.set(v.chave, (alvosDe.get(v.chave) ?? new Set()).add(v.alvoId));
  for (const p of semVinculo(unidades, vinculos, [])) {
    const item = { unidade: p.unidade, acoes: p.acoes, valor: p.valorInicial, vinculada: p.vinculada, sugestaoId: null };
    for (const alvo of alvosDe.get(p.unidade.chave) ?? []) out.set(alvo, [...(out.get(alvo) ?? []), item]);
  }
  return out;
}

/**
 * Os blocos do PDF "Vínculos da unidade" (o gerador `documento-pdf`, A4) — DUAS tabelas, cada uma com a linha TOTAL: as
 * ações VINCULADAS à unidade (unidade do orçamento · ação · dotação) e as SEM VÍNCULO das mesmas unidades do orçamento; no
 * topo os KPIs (total = vinculado + sem vínculo). As ações que vão a OUTRA unidade não entram (são dela). Na linha "Sem
 * vínculo" do comparativo (sem unidade), só a tabela sem vínculo.
 */
export function blocosVinculosDaLinha(linha: { titulo: string; nome: string; anoOrcamento: string }, v: VinculosDaLinha, comUnidade: boolean): BlocoDoc[] {
  const AMBAR = "#b45309";
  const colunas = [
    { titulo: "Unidade do orçamento", peso: 4 },
    { titulo: "Ação", peso: 5 },
    { titulo: "Dotação", peso: 2, alinhar: "right" as const },
  ];
  const total = (n: number, valor: number) => ({ celulas: [`TOTAL (${num(n)} ${n === 1 ? "ação" : "ações"})`, "", brl(valor)], destaque: true });
  const vinculadas = comUnidade
    ? v.ligadas.flatMap((l) => l.acoes.filter((a) => a.alvoId === l.vinculo.alvoId).map((a) => ({ unidade: l.unidade.texto, acao: a.acao })))
    : [];
  const sem = v.semVinculo.flatMap((p) => p.acoes.map((a) => ({ unidade: p.unidade.texto, acao: a })));
  const blocos: BlocoDoc[] = [
    { tipo: "titulo", texto: linha.titulo },
    { tipo: "paragrafo", texto: `${linha.nome ? `${linha.nome} · ` : ""}orçamento ${linha.anoOrcamento} (sem o filtro da visão)`, cor: "muted" },
    {
      tipo: "destaques",
      itens: [
        { rotulo: "Total", valor: brl(v.valorVinculado + v.valorSemVinculo), detalhe: `${num(vinculadas.length + sem.length)} ação(ões)` },
        ...(comUnidade ? [{ rotulo: "Vinculado", valor: brl(v.valorVinculado), detalhe: `${num(vinculadas.length)} ação(ões) · ${num(v.ligadas.length)} unidade(s) do orçamento` }] : []),
        { rotulo: "Sem vínculo", valor: brl(v.valorSemVinculo), detalhe: `${num(sem.length)} ação(ões)`, cor: sem.length ? AMBAR : undefined },
      ],
    },
  ];
  if (comUnidade)
    blocos.push(
      { tipo: "secao", texto: "Ações vinculadas" },
      {
        tipo: "tabela",
        colunas,
        linhas: vinculadas.length ? [...vinculadas.map((x) => ({ celulas: [x.unidade, x.acao.texto, brl(x.acao.valorInicial)] })), total(vinculadas.length, v.valorVinculado)] : [],
        vazio: "Nenhuma ação vinculada a esta unidade.",
      },
    );
  blocos.push(
    { tipo: "secao", texto: "Ações sem vínculo" },
    {
      tipo: "tabela",
      colunas,
      linhas: sem.length
        ? [...sem.map((x) => ({ celulas: [x.unidade, x.acao.texto, brl(x.acao.valorInicial)], cores: [null, AMBAR, null] })), total(sem.length, v.valorSemVinculo)]
        : [],
      vazio: "Nenhuma — todas as ações estão vinculadas.",
    },
  );
  return blocos;
}
