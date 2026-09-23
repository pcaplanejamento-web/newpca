"use client";

import { useEffect, useState } from "react";
import type { LinhaAuditoria } from "@/lib/auditoria";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import type { MensagemDfd } from "@/lib/dfd-tratamento";
import type { DfdParseado } from "@/lib/parse-dfd-comum";
import { Button } from "./Button";
import type { PainelDfd } from "./DfdConferir";
import { Historico } from "./Historico";
import { ItemDetalhe } from "./ItemDetalhe";
import { MensagensDfd } from "./MensagensDfd";
import { IconLayers } from "./icons";

/** Título do painel da direita do DFD (mensagens / item / histórico). */
export function tituloPainelDfd(painel: PainelDfd | null, dfd: DfdParseado | null, numero: string): string {
  if (painel?.tipo === "historico") return `Histórico — DFD ${numero}`;
  if (painel?.tipo === "item") return `Item ${dfd?.itens[painel.idx]?.item ?? painel.idx + 1} — DFD ${numero}`;
  return `Mensagens — DFD ${numero}`;
}

/**
 * Rodapé do painel da direita quando mostra um ITEM: "Ver DFD" (fecha o item e volta ao DFD — no
 * celular só um painel aparece por vez) e, no DFD solto, "Ver protocolo" (sobe ao processo de origem).
 */
export function RodapePainelItem({ onVerDfd, onVerProtocolo }: { onVerDfd: () => void; onVerProtocolo?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={onVerDfd}>
        Ver DFD
      </Button>
      {onVerProtocolo && (
        <Button variant="secondary" onClick={onVerProtocolo}>
          <IconLayers className="h-4 w-4" /> Ver protocolo
        </Button>
      )}
    </div>
  );
}

/**
 * Conteúdo do painel da DIREITA do banner do DFD — o MESMO na análise e no gravado: as MENSAGENS da
 * conferência (clicar rola/destaca no DFD), o detalhe do ITEM selecionado (cadeado por campo, remover
 * item) ou o HISTÓRICO de alterações (só DFD gravado — `dfdId`; carregado sob demanda).
 */
export function DfdPainelDireito({
  painel,
  dfd,
  numero,
  mensagens,
  onIrPara,
  conformidade,
  regras,
  editavel = false,
  onEditarItem,
  onRemoverItem,
  dfdId = null,
}: {
  painel: PainelDfd | null;
  dfd: DfdParseado | null;
  numero: string;
  mensagens: MensagemDfd[];
  onIrPara: (m: MensagemDfd) => void;
  conformidade?: Map<string, ConferenciaItem>;
  regras?: RegrasAvaliacao;
  editavel?: boolean;
  onEditarItem?: (idx: number, patch: Partial<DfdParseado["itens"][number]>) => void;
  onRemoverItem?: (idx: number) => void;
  /** DFD gravado (id) — habilita o histórico. */
  dfdId?: number | null;
}) {
  const [historico, setHistorico] = useState<LinhaAuditoria[] | null>(null);
  const verHistorico = painel?.tipo === "historico" && dfdId != null;
  useEffect(() => {
    if (!verHistorico) return;
    const ac = new AbortController();
    setHistorico(null);
    fetch(`/api/dfd/${dfdId}/historico`, { signal: ac.signal })
      .then((r) => r.json() as Promise<{ ok?: boolean; historico?: LinhaAuditoria[] }>)
      .then((j) => {
        if (!ac.signal.aborted) setHistorico(j.ok ? (j.historico ?? []) : []);
      })
      .catch(() => {
        if (!ac.signal.aborted) setHistorico([]);
      });
    return () => ac.abort();
  }, [verHistorico, dfdId]);

  if (verHistorico) {
    return <Historico entradas={historico ?? []} vazio={historico === null ? "Carregando…" : "Sem histórico deste DFD."} />;
  }
  const item = painel?.tipo === "item" ? dfd?.itens[painel.idx] : undefined;
  if (painel?.tipo === "item" && item) {
    const idx = painel.idx;
    return (
      <ItemDetalhe
        key={idx}
        item={item}
        conformidade={conformidade}
        regras={regras}
        tipo={dfd?.tipo ?? null}
        editavel={editavel}
        onChange={editavel && onEditarItem ? (patch) => onEditarItem(idx, patch) : undefined}
        onRemover={editavel && onRemoverItem ? () => onRemoverItem(idx) : undefined}
      />
    );
  }
  return <MensagensDfd mensagens={mensagens} numero={numero} tipo={dfd?.tipo} onIrPara={onIrPara} />;
}
