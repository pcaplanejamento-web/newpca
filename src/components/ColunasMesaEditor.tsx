"use client";

import { useState } from "react";
import {
  alternarColunaOculta,
  CATALOGO_COLUNAS_MESA,
  type ColunaMesaInfo,
  coerceDetalhes,
  type DetalhesPapel,
  ROTULO_TABELA_MESA,
  TABELAS_MESA,
  type TabelaMesa,
} from "@/lib/papeis-detalhes-core";
import { Badge } from "./Badge";
import { IconLock } from "./icons";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";

/** O que o controle próprio de uma coluna diz (a coluna segue o controle, não a lista). */
function estadoControle(d: DetalhesPapel, c: ColunaMesaInfo): string {
  if (c.controle === "responsavel") return d.mesa.responsavel.ver ? "Visível (controle Responsável)" : "Oculta (controle Responsável)";
  if (c.controle === "distribuicao") return d.mesa.distribuicao ? "Visível (controle Distribuição)" : "Oculta (controle Distribuição)";
  return d.mesa.valores ? "Visível (controle Valores)" : "Oculta (controle Valores)";
}

const SO: Record<"sistema" | "pca", string> = { sistema: "Só na Mesa do sistema", pca: "Só na Mesa do PCA" };

/**
 * As COLUNAS das 4 tabelas das Mesas (a do sistema e a de cada PCA) que o papel vê — a seção "Colunas" dos detalhes do
 * papel. Por tabela (`Segmented`), cada coluna do catálogo (`CATALOGO_COLUNAS_MESA`): as FIXAS (identificador ou conteúdo
 * do documento) com o cadeado e o motivo; as que seguem um controle próprio (Responsável, Distribuição, Valores) com o
 * estado dele; as demais com a chave Visível/Oculta — "dado" some de TUDO na Mesa (listas, banners, Dashboard, histórico),
 * "coluna" some das tabelas (o documento aberto segue completo). Controlado; sem `onChange` = só leitura; `original` = o
 * gravado (as linhas que mudaram ficam marcadas).
 */
export function ColunasMesaEditor({ valor, original, onChange }: { valor: DetalhesPapel; original?: DetalhesPapel; onChange?: (d: DetalhesPapel) => void }) {
  const [tabela, setTabela] = useState<TabelaMesa>("protocolos");
  const v = coerceDetalhes(valor);
  const o = original ? coerceDetalhes(original) : v;
  const ocultas = (d: DetalhesPapel, t: TabelaMesa) => d.mesa.colunasOcultas[t].length;
  return (
    <div className="space-y-3">
      <Segmented<TabelaMesa>
        value={tabela}
        onChange={setTabela}
        ariaLabel="Tabela da Mesa"
        options={TABELAS_MESA.map((t) => ({
          value: t,
          label: `${ROTULO_TABELA_MESA[t]}${ocultas(v, t) ? ` (${ocultas(v, t)})` : ""}`,
          curto: t === "consolidada" ? `Consolid.${ocultas(v, t) ? ` (${ocultas(v, t)})` : ""}` : undefined,
        }))}
      />
      <ul className="divide-y divide-border" aria-label={`Colunas — ${ROTULO_TABELA_MESA[tabela]}`}>
        {CATALOGO_COLUNAS_MESA[tabela].map((c) => {
          const oculta = v.mesa.colunasOcultas[tabela].includes(c.chave);
          const alterado = oculta !== o.mesa.colunasOcultas[tabela].includes(c.chave);
          return (
            <li
              key={c.chave}
              className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-l-2 py-1.5 pl-3 ${alterado ? "border-accent" : "border-transparent"}`}
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-text">
                  {c.rotulo}
                  {c.so && <Badge tone="slate">{SO[c.so]}</Badge>}
                  {alterado && <span className="sr-only">(alterado)</span>}
                </p>
                <p className="text-[12px] leading-snug text-muted">
                  {c.classe === "fixa"
                    ? c.motivo
                    : c.controle
                      ? "Segue o controle próprio (em Pessoas e linhas ou Valores)."
                      : c.classe === "dado"
                        ? "Oculta, some de tudo na Mesa: listas, banners, Dashboard, filtros, exportação e histórico."
                        : "Oculta, some das tabelas, dos filtros, da exportação e das edições; o documento aberto segue completo."}
                </p>
              </div>
              {c.classe === "fixa" ? (
                <span className="inline-flex min-h-11 items-center gap-1.5 text-[12.5px] text-faint lg:min-h-9">
                  <IconLock className="h-3.5 w-3.5" aria-hidden />
                  Sempre visível
                </span>
              ) : c.controle ? (
                <span className="inline-flex min-h-11 items-center text-[12.5px] text-muted lg:min-h-9">{estadoControle(v, c)}</span>
              ) : (
                <Switch
                  checked={!oculta}
                  disabled={!onChange}
                  onChange={(ver) => onChange?.(alternarColunaOculta(v, tabela, c.chave, !ver))}
                  label={oculta ? "Oculta" : "Visível"}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
