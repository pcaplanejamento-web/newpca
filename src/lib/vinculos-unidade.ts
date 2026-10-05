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

/** O texto da dica "quem está sem vínculo": uma linha por unidade do orçamento com as ações (até `max` ações no total). */
export function textoSemVinculo(sem: SemVinculoUnidade[], max = 25): string {
  const linhas: string[] = [];
  let usadas = 0;
  let resto = 0;
  for (const p of sem) {
    const cabe = Math.max(0, max - usadas);
    const vis = p.acoes.slice(0, cabe);
    usadas += vis.length;
    resto += p.acoes.length - vis.length;
    if (vis.length) linhas.push(`${p.unidade.texto}: ${vis.map((a) => a.texto).join("; ")}`);
  }
  if (resto > 0) linhas.push(`… e mais ${num(resto)} ação(ões)`);
  return linhas.join("\n");
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

/** Os blocos do PDF "Vínculos da unidade" (o gerador `documento-pdf`, A4). `rotuloAlvo` = "SIGLA" de uma unidade cadastrada. */
export function blocosVinculosDaLinha(
  linha: { titulo: string; nome: string; anoOrcamento: string },
  v: VinculosDaLinha,
  rotuloAlvo: (id: number) => string,
): BlocoDoc[] {
  const AMBAR = "#b45309";
  const blocos: BlocoDoc[] = [
    { tipo: "titulo", texto: linha.titulo },
    { tipo: "paragrafo", texto: `${linha.nome ? `${linha.nome} · ` : ""}orçamento ${linha.anoOrcamento} (sem o filtro da visão)`, cor: "muted" },
    {
      tipo: "destaques",
      itens: [
        { rotulo: "Unidades do orçamento", valor: num(v.ligadas.length) },
        { rotulo: "Dotação vinculada", valor: brl(v.valorVinculado) },
        { rotulo: "Ações sem vínculo", valor: num(v.acoesSemVinculo), cor: v.acoesSemVinculo ? AMBAR : undefined },
        { rotulo: "Dotação sem vínculo", valor: brl(v.valorSemVinculo), cor: v.valorSemVinculo ? AMBAR : undefined },
      ],
    },
  ];
  if (v.ligadas.length) {
    blocos.push({ tipo: "secao", texto: "Unidades do orçamento vinculadas" });
    for (const l of v.ligadas) {
      blocos.push({ tipo: "subsecao", texto: l.unidade.texto, detalhe: brl(l.valor) });
      blocos.push({
        tipo: "tabela",
        colunas: [
          { titulo: "Ação", peso: 5 },
          { titulo: "Destino", peso: 2 },
          { titulo: "Dotação", peso: 2, alinhar: "right" },
        ],
        linhas: l.acoes.map((a) => {
          const destino = a.alvoId == null ? "Sem vínculo" : rotuloAlvo(a.alvoId);
          return { celulas: [a.acao.texto, destino, brl(a.acao.valorInicial)], cores: [null, a.alvoId == null ? AMBAR : null, null] };
        }),
      });
    }
  }
  blocos.push({ tipo: "secao", texto: "Ações sem vínculo" });
  blocos.push({
    tipo: "tabela",
    colunas: [
      { titulo: "Unidade do orçamento", peso: 4 },
      { titulo: "Ação", peso: 4 },
      { titulo: "Dotação", peso: 2, alinhar: "right" },
    ],
    linhas: v.semVinculo.flatMap((p) => p.acoes.map((a) => ({ celulas: [p.unidade.texto, a.texto, brl(a.valorInicial)], cores: [null, AMBAR, null] }))),
    vazio: "Nenhuma — todas as ações estão vinculadas.",
  });
  return blocos;
}
