"use client";

import type { ReactNode } from "react";
import {
  coerceDetalhes,
  type DetalhesPapel,
  type LinhasMesa,
  LINHAS_MESA,
  MODELOS_DETALHES,
  NIVEIS_RESPONSAVEL,
  type NivelResponsavel,
  ROTULO_LINHAS,
  ROTULO_NIVEL_RESPONSAVEL,
} from "@/lib/papeis-detalhes-core";
import { Callout } from "./Callout";
import { SelectField } from "./Field";
import { IconInfo } from "./icons";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";

/** Uma linha do editor: o controle + o que ele faz; marcada quando difere do gravado (`alterado`). */
function Linha({ titulo, ajuda, alterado, children }: { titulo: string; ajuda: ReactNode; alterado: boolean; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col gap-2 border-l-2 py-2.5 pl-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${alterado ? "border-accent" : "border-transparent"}`}
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-text">
          {titulo}
          {alterado && <span className="sr-only"> (alterado)</span>}
        </p>
        <p className="text-[12.5px] leading-snug text-muted">{ajuda}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const RESUMO_ALTERAR: Record<NivelResponsavel, string> = {
  nao: "Só vê o Responsável; não troca em nenhum lugar (célula, banner, massa, padrão ao protocolar).",
  si: "Assume o protocolo SEM responsável e solta o seu; tomar o de outra pessoa exige “Qualquer pessoa do grupo”.",
  grupo: "Escolhe qualquer pessoa ativa do grupo (como antes).",
};

/**
 * EDITOR dos DETALHES do papel — o controle FINO dentro das telas que o papel abre (as ações ficam na
 * `MatrizCapacidades`). Os detalhes só RETIRAM acesso; o Administrador os ignora. Controlado (`valor` → `onChange` com o
 * conjunto normalizado — as implicações do núcleo valem na hora: sem ver o Responsável não se altera; sem Responsável e
 * sem Distribuição não há desempenho por pessoa). Sem `onChange` = só leitura. `original` = o gravado (as linhas que
 * mudaram ficam marcadas).
 *
 * Seção "Pessoas e linhas": o Responsável (ver · alterar em 3 níveis), a Distribuição, as LINHAS da Mesa ("só os meus",
 * aplicado no servidor) e o desempenho por pessoa do Dashboard.
 */
export function DetalhesPapelEditor({ valor, original, onChange }: { valor: DetalhesPapel; original?: DetalhesPapel; onChange?: (d: DetalhesPapel) => void }) {
  const v = coerceDetalhes(valor);
  const o = original ? coerceDetalhes(original) : v;
  const so = !onChange;
  const mudar = (mesa: Partial<DetalhesPapel["mesa"]>) => onChange?.(coerceDetalhes({ ...v, mesa: { ...v.mesa, ...mesa } }));
  const m = v.mesa;
  const semPessoas = !m.responsavel.ver && !m.distribuicao;
  return (
    <div className="space-y-[var(--gap-block)]">
      {!so && (
        <SelectField
          label="Começar de"
          value=""
          onChange={(e) => {
            const modelo = MODELOS_DETALHES.find((x) => x.id === e.target.value);
            if (modelo) onChange?.(coerceDetalhes(modelo.detalhes));
          }}
        >
          <option value="">Escolha um modelo…</option>
          {MODELOS_DETALHES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome} — {x.descricao}
            </option>
          ))}
        </SelectField>
      )}

      <section aria-labelledby="det-pessoas" className="rounded-card border border-border bg-surface p-[var(--pad-card)]">
        <h4 id="det-pessoas" className="text-[14px] font-bold text-text">
          Pessoas e linhas
        </h4>
        <p className="mb-1 text-[12.5px] text-muted">Na Mesa do sistema e na Mesa de cada PCA. O que fica oculto não sai do servidor.</p>
        <div className="divide-y divide-border">
          <Linha
            titulo="Ver o Responsável"
            ajuda="A coluna, o filtro do topo, a célula, o Dashboard e o histórico da troca. Oculto, também não altera."
            alterado={m.responsavel.ver !== o.mesa.responsavel.ver}
          >
            <Switch
              checked={m.responsavel.ver}
              disabled={so}
              onChange={(ver) => mudar({ responsavel: { ...m.responsavel, ver } })}
              label={m.responsavel.ver ? "Visível" : "Oculto"}
            />
          </Linha>
          <Linha titulo="Alterar o Responsável" ajuda={RESUMO_ALTERAR[m.responsavel.alterar]} alterado={m.responsavel.alterar !== o.mesa.responsavel.alterar}>
            <Segmented<NivelResponsavel>
              value={m.responsavel.alterar}
              disabled={so || !m.responsavel.ver}
              onChange={(alterar) => mudar({ responsavel: { ...m.responsavel, alterar } })}
              ariaLabel="Alterar o Responsável"
              options={NIVEIS_RESPONSAVEL.map((n) => ({
                value: n,
                label: ROTULO_NIVEL_RESPONSAVEL[n],
                curto: n === "nao" ? "Não" : n === "si" ? "Só para si" : "Qualquer um",
              }))}
            />
          </Linha>
          <Linha
            titulo="Ver a Distribuição"
            ajuda={
              m.distribuicao
                ? "Quem protocolou: a coluna Distribuição e o Dado “Quem protocolou” do Dashboard."
                : "Oculta: some a coluna, o Dado do Dashboard e o autor da protocolação no histórico."
            }
            alterado={m.distribuicao !== o.mesa.distribuicao}
          >
            <Switch checked={m.distribuicao} disabled={so} onChange={(distribuicao) => mudar({ distribuicao })} label={m.distribuicao ? "Visível" : "Oculta"} />
          </Linha>
          <Linha
            titulo="Linhas da Mesa"
            ajuda={
              m.linhas === "meus"
                ? "Só os protocolos em que a pessoa é o Responsável ou que ela protocolou (e os DFDs e itens deles) — nas listas, nos banners, nas buscas e nas gravações."
                : "Todos os protocolos das unidades que o grupo alcança."
            }
            alterado={m.linhas !== o.mesa.linhas}
          >
            <Segmented<LinhasMesa>
              value={m.linhas}
              disabled={so}
              onChange={(linhas) => mudar({ linhas })}
              ariaLabel="Linhas da Mesa"
              options={LINHAS_MESA.map((l) => ({ value: l, label: ROTULO_LINHAS[l], curto: l === "todos" ? "Todos" : undefined }))}
            />
          </Linha>
          <Linha
            titulo="Desempenho por pessoa"
            ajuda={
              semPessoas
                ? "Sem o Responsável e sem a Distribuição, não há por quem agrupar."
                : "No Dashboard da Mesa: os Dados por pessoa, a medida Ações e a tabela “Desempenho por pessoa”."
            }
            alterado={m.desempenho !== o.mesa.desempenho}
          >
            <Switch
              checked={m.desempenho}
              disabled={so || semPessoas}
              onChange={(desempenho) => mudar({ desempenho })}
              label={m.desempenho ? "Visível" : "Oculto"}
            />
          </Linha>
        </div>
      </section>

      {m.linhas === "meus" && (m.responsavel.alterar === "grupo" || !m.responsavel.ver) && (
        <Callout kind="info" icon={<IconInfo className="h-4 w-4" />}>
          {m.responsavel.ver
            ? "Com “Só os meus”, passar um protocolo a outra pessoa o tira da Mesa de quem passou (continua na dela se foi ela quem protocolou)."
            : "Com “Só os meus” e o Responsável oculto, a pessoa não vê quem responde pelos protocolos que ela protocolou."}
        </Callout>
      )}
    </div>
  );
}
