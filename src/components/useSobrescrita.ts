"use client";

import { useMemo } from "react";
import { type ComparacaoDfd, compararDfd } from "@/lib/comparar-protocolo";
import type { DfdParseado } from "@/lib/parse-dfd-comum";
import {
  aplicarEscolha,
  aplicarTodas,
  blocoDe,
  comparacaoEscolha,
  entradasEscolha,
  estadoEscolha,
  outrasDiferencas,
  resumoEscolhas,
} from "@/lib/sobrescrita-dfd";
import type { EscolhaSobrescritaProps } from "./ComparacaoReenvio";

/**
 * ESCOLHA POR DADO da SOBRESCRITA de um DFD — o hook dos hosts (importação avulsa, banner do DFD gravado e
 * protocolo): a comparação gravado × NOVO (o arquivo — estável), as entradas escolhíveis e as props do
 * painel "Diferenças" (`EscolhaSobrescritaProps`), aplicando cada escolha no DFD de TRABALHO por
 * `onTrabalho` (o host decide como gravar o rascunho). `resumo` = o que foi mantido/editado (histórico).
 * Tudo memoizado pelo gravado/novo/trabalho (o host re-renderiza à vontade — ex.: o progresso da análise —
 * sem recomparar DFDs de centenas de itens). Sem gravado/novo/trabalho ⇒ `null` (não é uma sobrescrita).
 */
export function useSobrescrita({
  gravado,
  novo,
  trabalho,
  onTrabalho,
  bloqueado = false,
  unidade,
  anoPca,
}: {
  /** O DFD GRAVADO (mesmo número) — na forma editável. */
  gravado: DfdParseado | null;
  /** O DFD NOVO como veio do arquivo (sem as edições da tela). */
  novo: DfdParseado | null;
  /** O DFD de TRABALHO (o que a tela mostra/edita e o que será gravado). */
  trabalho: DfdParseado | null;
  onTrabalho: (fn: (d: DfdParseado) => DfdParseado) => void;
  bloqueado?: boolean;
  /** Unidade gravada × a de trabalho (aparece em "Outras alterações"). */
  unidade?: { gravado: number | null; trabalho: number | null; rotulo: (id: number | null) => string };
  /** Ano do PCA gravado × o de trabalho (o do processo). */
  anoPca?: { gravado: number | null; trabalho: number | null };
}): {
  /** As diferenças ESCOLHÍVEIS (gravado × novo). */
  comparacao: ComparacaoDfd;
  /** O que muda DE FATO ao sobrescrever (gravado × trabalho, com unidade/ano) — o contador "Diferenças (N)". */
  final: ComparacaoDfd;
  entradas: ReturnType<typeof entradasEscolha>;
  escolha: EscolhaSobrescritaProps;
  resumo: ReturnType<typeof resumoEscolhas>;
} | null {
  const comparacao = useMemo(() => (gravado && novo ? comparacaoEscolha(gravado, novo) : null), [gravado, novo]);
  const entradas = useMemo(() => (comparacao ? entradasEscolha(comparacao) : []), [comparacao]);
  const porChave = useMemo(() => new Map(entradas.map((e) => [e.chave, e])), [entradas]);
  // O estado de cada escolha no DFD de trabalho (uma vez por mudança dele — o painel só consulta o mapa).
  const estados = useMemo(
    () => (gravado && novo && trabalho ? new Map(entradas.map((e) => [e.chave, estadoEscolha(e, trabalho, gravado, novo)])) : null),
    [entradas, trabalho, gravado, novo],
  );
  const resumo = useMemo(() => (gravado && novo && trabalho ? resumoEscolhas(entradas, trabalho, gravado, novo) : null), [entradas, trabalho, gravado, novo]);
  const [ug, ut, ag, at] = [unidade?.gravado ?? null, unidade?.trabalho ?? null, anoPca?.gravado ?? null, anoPca?.trabalho ?? null];
  const rotulo = unidade?.rotulo;
  // Tudo o que muda ao sobrescrever que NÃO é escolha do arquivo (unidade, ano, total, edições à mão). O rótulo
  // da unidade é uma função do render: o resultado só depende dos ids (nas dependências).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `rotulo` muda de identidade a cada render do host.
  const final = useMemo(
    () => (gravado && trabalho ? compararDfd({ ...gravado, reparticaoId: ug, anoPca: ag }, { ...trabalho, reparticaoId: ut, anoPca: at }, rotulo) : null),
    [gravado, trabalho, ug, ut, ag, at],
  );
  const outras = useMemo(() => (final ? outrasDiferencas(final, entradas) : null), [final, entradas]);
  if (!comparacao || !gravado || !novo || !trabalho || !estados || !resumo || !final) return null;
  const escolha: EscolhaSobrescritaProps = {
    estado: (chave) => estados.get(chave) ?? null,
    onEscolher: (chave, lado) => {
      const e = porChave.get(chave);
      if (e) onTrabalho((d) => aplicarEscolha(e, lado, d, gravado, novo));
    },
    onTodos: (lado, bloco) => onTrabalho((d) => aplicarTodas(bloco ? entradas.filter((e) => blocoDe(e) === bloco) : entradas, lado, d, gravado, novo)),
    bloqueado,
    outras,
  };
  return { comparacao, final, entradas, escolha, resumo };
}
