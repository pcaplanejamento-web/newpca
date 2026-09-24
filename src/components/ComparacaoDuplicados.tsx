"use client";

import { useState } from "react";
import type { ComparacaoDfd } from "@/lib/comparar-protocolo";
import { brl, num } from "@/lib/format";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { BlocoDiff, DiffItem, DiffLinha } from "./ComparacaoReenvio";
import { IconAlert, IconCheck, IconChevronDown, IconCompare, IconFile, IconSpinner } from "./icons";

/** Um DFD do processo na comparação de duplicados: rótulo ("DFD 1586 · Planej. 640"), onde está no PDF e totais. */
export type DfdDuplicadoResumo = {
  rotulo: string;
  local?: string | null;
  itens: number | null;
  valor: number | null;
  descartado: boolean;
};

/** OUTRO DFD duplicado do aberto: + o motivo (mesmo nº/planejamento) e a comparação aberto × ele (`null` = lendo). */
export type DfdDuplicadoOutro = DfdDuplicadoResumo & {
  key: number;
  motivo: string;
  comparacao: ComparacaoDfd | null;
  /** Falha ao ler o outro DFD (não dá para comparar). */
  erro?: string | null;
};

const ROTULOS: readonly [string, string] = ["Este (aberto)", "O outro"];
const ROTULOS_ITEM = { novo: "Só no outro", removido: "Só neste", alterado: "Diferente" } as const;

/** Linha de totais de um DFD (onde está no PDF · itens · valor). */
function totais(r: DfdDuplicadoResumo): string {
  return [r.local, r.itens != null ? `${num(r.itens)} ${r.itens === 1 ? "item" : "itens"}` : null, r.valor != null ? brl(r.valor) : null]
    .filter(Boolean)
    .join(" · ");
}

/** As diferenças do DFD aberto para o outro (cabeçalho, seções, assinaturas e itens) — a régua do reenvio. */
function Diferencas({ c, erro }: { c: ComparacaoDfd | null; erro?: string | null }) {
  if (erro)
    return (
      <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
        Não foi possível ler este DFD para comparar: {erro}
      </Callout>
    );
  if (!c)
    return (
      <Callout kind="info" icon={<IconSpinner className="h-4 w-4" />}>
        Lendo o DFD para comparar…
      </Callout>
    );
  if (c.total === 0)
    return (
      <Callout kind="ok" icon={<IconCheck className="h-4 w-4" />}>
        Idênticos — nenhuma diferença (qualquer um serve).
      </Callout>
    );
  return (
    <div className="space-y-4">
      {c.campos.length > 0 && (
        <BlocoDiff titulo="Cabeçalho" qtd={c.campos.length}>
          {c.campos.map((d) => (
            <DiffLinha key={d.campo} d={d} rotulos={ROTULOS} compacto />
          ))}
        </BlocoDiff>
      )}
      {c.secoes.length > 0 && (
        <BlocoDiff titulo="Seções" qtd={c.secoes.length}>
          {c.secoes.map((d) => (
            <DiffLinha key={d.campo} d={d} rotulos={ROTULOS} compacto />
          ))}
        </BlocoDiff>
      )}
      {c.assinaturas && (
        <BlocoDiff titulo="Assinaturas" qtd={1}>
          <DiffLinha d={c.assinaturas} rotulos={ROTULOS} compacto />
        </BlocoDiff>
      )}
      {c.itens.length > 0 && (
        <BlocoDiff titulo="Itens" qtd={c.itens.length}>
          {c.itens.map((it, k) => (
            <DiffItem key={it.chave ?? `${it.tipo}:${it.item}:${k}`} it={it} rotulos={ROTULOS} compacto rotulosTipo={ROTULOS_ITEM} />
          ))}
        </BlocoDiff>
      )}
    </div>
  );
}

/**
 * DFDs DUPLICADOS no processo (mesmo nº de DFD ou de planejamento) — painel da direita do DFD aberto na protocolação:
 * o aberto × CADA duplicado dele, campo a campo (a régua do reenvio), e a ESCOLHA de qual fica — "Manter este"
 * descarta os que conflitam com o escolhido (saem da protocolação e da somatória; dá para trocar/restaurar). O erro
 * "DFD duplicado" some assim que sobra um. Alvos ≥ 44px, empilha no celular.
 */
export function ComparacaoDuplicados({
  atual,
  outros,
  pendente,
  onManter,
  onAbrir,
  bloqueado = false,
}: {
  /** O DFD ABERTO ao lado. */
  atual: DfdDuplicadoResumo;
  outros: DfdDuplicadoOutro[];
  /** Ainda falta escolher (o aberto e algum duplicado dele seguem no processo). */
  pendente: boolean;
  /** Manter um DFD — `null` = o aberto; senão a `key` do outro. */
  onManter: (key: number | null) => void;
  /** Abrir o outro DFD ao lado (para conferir por inteiro). */
  onAbrir?: (key: number) => void;
  bloqueado?: boolean;
}) {
  // Diferenças abertas por DFD (o 1º já vem aberto — o caso comum é UM duplicado).
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set(outros.slice(0, 1).map((o) => o.key)));
  const alternar = (k: number) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const motivos = [...new Set(outros.map((o) => o.motivo))].join(" / ");

  return (
    <div className="space-y-4">
      {pendente ? (
        <Callout kind="warn" icon={<IconAlert className="h-5 w-5" />}>
          <p className="font-semibold">DFD duplicado no processo — escolha qual fica</p>
          <p className="opacity-90">
            Este DFD tem o {motivos} de {outros.length === 1 ? "outro DFD" : `${outros.length} outros DFDs`} do PDF. Compare as diferenças e use
            "Manter este" no que deve seguir: os demais saem da protocolação e da somatória (dá para trocar depois).
          </p>
        </Callout>
      ) : atual.descartado ? (
        <Callout kind="info" icon={<IconCompare className="h-5 w-5" />}>
          Este DFD foi descartado — segue o duplicado escolhido. Para trocar, use "Manter este" aqui em cima.
        </Callout>
      ) : (
        <Callout kind="ok" icon={<IconCheck className="h-5 w-5" />}>
          Resolvido — este DFD segue no processo e os duplicados foram descartados (dá para trocar abaixo).
        </Callout>
      )}

      {/* O DFD aberto */}
      <section className="rounded-card border border-accent/40 bg-accent-soft p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold text-text">
              {atual.rotulo} <span className="text-xs font-medium text-accent">(aberto)</span>
            </p>
            <p className="text-xs text-muted">{totais(atual)}</p>
          </div>
          {atual.descartado ? <Badge tone="slate">Descartado</Badge> : !pendente ? <Badge tone="emerald">Segue</Badge> : null}
          {(pendente || atual.descartado) && (
            <Button onClick={() => onManter(null)} disabled={bloqueado} icon={<IconCheck className="h-4 w-4" />}>
              Manter este
            </Button>
          )}
        </div>
      </section>

      {/* Cada duplicado: resumo + escolha + diferenças (aberto × ele) */}
      {outros.map((o) => {
        const aberto = abertos.has(o.key);
        const total = o.comparacao?.total;
        return (
          <section key={o.key} className="rounded-card border border-border bg-surface p-3 shadow-ring">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-bold text-text">{o.rotulo}</span>
              <Badge tone="amber">{o.motivo}</Badge>
              {o.descartado ? <Badge tone="slate">Descartado</Badge> : !pendente ? <Badge tone="emerald">Segue</Badge> : null}
            </div>
            <p className="mt-0.5 text-xs text-muted">{totais(o)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {(pendente || o.descartado) && (
                <Button variant="secondary" onClick={() => onManter(o.key)} disabled={bloqueado} icon={<IconCheck className="h-4 w-4" />}>
                  Manter este
                </Button>
              )}
              {onAbrir && (
                <Button variant="ghost" onClick={() => onAbrir(o.key)} disabled={bloqueado} icon={<IconFile className="h-4 w-4" />}>
                  Abrir
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => alternar(o.key)}
                aria-expanded={aberto}
                icon={<IconChevronDown className={`h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`} />}
              >
                {aberto ? "Ocultar diferenças" : `Ver diferenças${total != null ? ` (${num(total)})` : ""}`}
              </Button>
            </div>
            {aberto && (
              <div className="mt-3 border-t border-border pt-3">
                <Diferencas c={o.comparacao} erro={o.erro} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
