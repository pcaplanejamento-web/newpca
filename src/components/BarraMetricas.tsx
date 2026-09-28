"use client";

import type { ReactNode } from "react";
import {
  type FiltroMetricas,
  MEDIDAS_METRICAS,
  type MedidaMetricas,
  PESSOAS_METRICAS,
  type PessoaMetricas,
  ROTULO_TIPO_METRICAS,
  recorteFiltrado,
  TIPOS_DFD_METRICAS,
  type TipoDfdMetricas,
} from "@/lib/mesa-metricas";
import { Ajuda, TopicoAjuda } from "./Ajuda";
import { Button } from "./Button";
import { IconCalendar, IconFile, IconInfo, IconLayers, IconUsers } from "./icons";
import { NavegadorPeriodo } from "./NavegadorPeriodo";
import { Segmented } from "./Segmented";
import { SeletorFiltro } from "./SeletorFiltro";

const TODOS = "__todos";

/**
 * BARRA DE MÉTRICAS do Dashboard da Mesa (logo abaixo das KPIs) — vale para TODOS os quadros abaixo dela: o PERÍODO
 * (Tudo | Ano | Mês | Semana | Dia, com navegação e o salto a qualquer data), a MEDIDA (protocolos, DFDs, itens ou
 * valor), a PESSOA (Responsável ou Distribuição) e os filtros de NATUREZA e TIPO DE DFD (só o ícone, accent quando
 * ativos) + "Limpar" e a Ajuda (?). Controlada. Embaixo, o `resumo` (a linha do recorte) e o `aviso` (ex.: o foco do
 * Responsável do topo).
 */
export function BarraMetricas({
  filtro,
  onFiltro,
  hoje,
  naturezas,
  diasComDados,
  resumo,
  aviso,
}: {
  filtro: FiltroMetricas;
  onFiltro: (f: FiltroMetricas) => void;
  /** Hoje (AAAA-MM-DD, Brasília). */
  hoje: string;
  /** As naturezas presentes na Mesa (as opções do filtro). */
  naturezas: string[];
  /** Os dias com protocolação no recorte — o ponto no seletor de data. */
  diasComDados?: Set<string>;
  resumo?: ReactNode;
  aviso?: ReactNode;
}) {
  const set = (p: Partial<FiltroMetricas>) => onFiltro({ ...filtro, ...p });
  // A natureza escolhida sempre aparece nas opções (mesmo que nenhum protocolo a tenha mais).
  const opsNatureza = filtro.natureza != null && !naturezas.includes(filtro.natureza) ? [...naturezas, filtro.natureza] : naturezas;
  return (
    <section aria-label="Filtros das métricas" className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <NavegadorPeriodo
          periodo={filtro.periodo}
          data={filtro.ref}
          hoje={hoje}
          diasComDados={diasComDados}
          onChange={({ periodo, data }) => set({ periodo, ref: data })}
        />
        <Segmented<MedidaMetricas>
          ariaLabel="Medida das métricas"
          value={filtro.medida}
          options={MEDIDAS_METRICAS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(medida) => set({ medida })}
        />
        <Segmented<PessoaMetricas>
          ariaLabel="Pessoa das métricas"
          value={filtro.pessoa}
          options={PESSOAS_METRICAS.map((o) => ({ value: o.value, label: o.label, curto: o.value === "distribuicao" ? "Distrib." : "Resp." }))}
          onChange={(pessoa) => set({ pessoa })}
        />
        <div className="flex items-center gap-1.5">
          <SeletorFiltro
            icone={<IconLayers className="h-4 w-4" />}
            rotulo="Natureza"
            valor={filtro.natureza ?? TODOS}
            opcoes={[{ valor: TODOS, rotulo: "Todas as naturezas" }, ...opsNatureza.map((n) => ({ valor: n, rotulo: n }))]}
            onChange={(v) => set({ natureza: v === TODOS ? null : v })}
            ativo={filtro.natureza != null}
          />
          <SeletorFiltro
            icone={<IconFile className="h-4 w-4" />}
            rotulo="Tipo de DFD"
            valor={filtro.tipo ?? TODOS}
            opcoes={[{ valor: TODOS, rotulo: "Todos os tipos de DFD" }, ...TIPOS_DFD_METRICAS.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_METRICAS[t] }))]}
            onChange={(v) => set({ tipo: v === TODOS ? null : (v as TipoDfdMetricas) })}
            ativo={filtro.tipo != null}
          />
          {recorteFiltrado(filtro) && (
            <Button variant="ghost" size="sm" onClick={() => set({ natureza: null, tipo: null })}>
              Limpar
            </Button>
          )}
          <Ajuda titulo="Métricas da Mesa">
            <TopicoAjuda icone={<IconCalendar className="h-4 w-4" />} titulo="Período">
              Tudo = os protocolos na Mesa agora. Ano, Mês, Semana (segunda a domingo) e Dia = os protocolados naquela
              janela (dia de Brasília); as setas andam pela janela, tocar no período abre o calendário para saltar a
              qualquer dia, semana, mês ou ano, e “Hoje” volta ao período atual. Vale para todos os quadros abaixo — as
              tabelas mostram o dia, a semana, o mês, o ano e a Mesa lado a lado, com o período escolhido em destaque.
            </TopicoAjuda>
            <TopicoAjuda icone={<IconLayers className="h-4 w-4" />} titulo="Medida, natureza e tipo">
              A medida decide o que as tabelas e a evolução somam: protocolos, DFDs, itens ou o valor dos DFDs. A natureza é
              a categoria do assunto (Inclusão, Exclusão, Alteração não onerosa ou Outros) com o ano do PCA; o tipo de DFD
              recorta os protocolos que têm DFDs daquele tipo (e soma só eles).
            </TopicoAjuda>
            <TopicoAjuda icone={<IconUsers className="h-4 w-4" />} titulo="Pessoa, correções e ações">
              Responsável = quem responde pela execução; Distribuição = quem protocolou. Correção = cada reenvio do protocolo
              (o processo devolvido que volta corrigido), pela data do reenvio. Ações = a execução que cada pessoa fez nos
              protocolos da Mesa (edições no banner, em massa e na tabela, vínculos, exclusões e sobrescritas de DFD) —
              contadas em toda a Mesa, qualquer que seja o responsável do protocolo.
            </TopicoAjuda>
            <TopicoAjuda icone={<IconInfo className="h-4 w-4" />} titulo="Só a Mesa">
              Tudo vem da execução da Mesa: protocolos enviados a um PCA e DFDs sem protocolo ficam de fora; o Assunto do
              topo continua valendo. Com o Responsável do topo numa pessoa, as métricas mostram só ela, no papel escolhido
              em Pessoa (os protocolos dela ou os que protocolou) — os mesmos números da linha dela com “Todos”. Toque num
              número para ver a origem dele.
            </TopicoAjuda>
          </Ajuda>
        </div>
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
