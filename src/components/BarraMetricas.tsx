"use client";

import type { ReactNode } from "react";
import { DADOS_METRICAS, type DadoMetricas, type FiltroMetricas, MEDIDAS_METRICAS, type MedidaMetricas } from "@/lib/mesa-metricas";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { SelectField } from "./Field";
import { IconCalendar, IconInfo, IconLayers, IconUsers } from "./icons";
import { PeriodoPicker } from "./PeriodoPicker";

/**
 * BARRA DE MÉTRICAS do Dashboard da Mesa (logo abaixo das KPIs): o PERÍODO (o seletor de período do sistema — atalhos,
 * ano, mês e intervalo DE/ATÉ), o DADO (o que as barras do gráfico mostram) e a MEDIDA (o tamanho delas) + a Ajuda (?).
 * Vale para o gráfico e para o desempenho por pessoa. Controlada. Embaixo, o `resumo` (a linha do recorte) e o `aviso`
 * (o foco do Responsável do topo). No celular: o período (largura cheia) + a Ajuda numa linha e Dado e Medida em linhas
 * próprias — lado a lado a partir de 400px (os rótulos inteiros, 44px); do `sm` em diante, uma linha só.
 */
export function BarraMetricas({
  filtro,
  onFiltro,
  anos,
  resumo,
  aviso,
}: {
  filtro: FiltroMetricas;
  onFiltro: (f: FiltroMetricas) => void;
  /** Os anos do seletor de período (os com dados + o atual, do mais novo ao mais antigo). */
  anos: number[];
  resumo?: ReactNode;
  aviso?: ReactNode;
}) {
  const set = (p: Partial<FiltroMetricas>) => onFiltro({ ...filtro, ...p });
  return (
    <section aria-label="Filtros das métricas" className="space-y-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap">
        <PeriodoPicker value={filtro.periodo} anos={anos} onChange={(periodo) => set({ periodo })} className="w-full min-w-0 sm:w-auto" />
        <div className="col-span-2 row-start-2 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:contents">
          <SelectField compacto label="Dado" value={filtro.dado} onChange={(e) => set({ dado: e.target.value as DadoMetricas })}>
            {DADOS_METRICAS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </SelectField>
          <SelectField compacto label="Medida" value={filtro.medida} onChange={(e) => set({ medida: e.target.value as MedidaMetricas })}>
            {MEDIDAS_METRICAS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </SelectField>
        </div>
        <Ajuda titulo="Métricas da Mesa">
          <TopicoAjuda icone={<IconCalendar className="h-4 w-4" />} titulo="Período">
            Todo o período, hoje, esta semana (domingo a sábado), este mês, um ano, um mês de um ano ou um intervalo DE/ATÉ.
            Os protocolos entram pela data da protocolação (dia de Brasília); as correções e as ações, pela data em que
            aconteceram.
          </TopicoAjuda>
          <TopicoAjuda icone={<IconLayers className="h-4 w-4" />} titulo="Dado e medida">
            O dado escolhe as barras do gráfico (responsável, quem protocolou, natureza, tipo de DFD, situação, estado,
            unidade, tempo na Mesa ou data); a medida, o tamanho delas (protocolos, DFDs, itens, valor, correções ou ações).
            Em tipo de DFD e unidade, o protocolo com DFDs diferentes conta em cada barra — o total conta uma vez. Toque numa
            barra ou numa linha para ver a origem (a soma da lista = o número).
          </TopicoAjuda>
          <TopicoAjuda icone={<IconUsers className="h-4 w-4" />} titulo="Pessoas, correções e ações">
            A pessoa é o responsável — ou quem protocolou, com esse dado escolhido (o desempenho por pessoa segue a mesma).
            Correção = cada reenvio do protocolo (o processo devolvido que volta corrigido). Ação = a execução feita nos
            protocolos da Mesa (edições no banner, em massa e na tabela, vínculos, exclusões e sobrescritas de DFD), de quem a
            fez — nas barras de pessoa, a ação é de quem executou, qualquer que seja o responsável do protocolo.
          </TopicoAjuda>
          <TopicoAjuda icone={<IconInfo className="h-4 w-4" />} titulo="Só a Mesa">
            Tudo vem da execução da Mesa: protocolos enviados a um PCA e DFDs sem protocolo ficam de fora; o Assunto do topo
            continua valendo. Com uma pessoa no Responsável do topo, as métricas mostram só essa pessoa — os mesmos números da
            linha dela com “Todos”.
          </TopicoAjuda>
        </Ajuda>
      </div>
      {(resumo || aviso) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
          {resumo}
          {aviso}
        </div>
      )}
    </section>
  );
}
