"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { LinhaAuditoria } from "@/lib/auditoria";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import type { ComparacaoDfd } from "@/lib/comparar-protocolo";
import type { MensagemDfd } from "@/lib/dfd-tratamento";
import type { DfdParseado } from "@/lib/parse-dfd-comum";
import { Button } from "./Button";
import { ComparacaoDfdView } from "./ComparacaoReenvio";
import type { PainelDfd } from "./DfdConferir";
import { Historico } from "./Historico";
import { ItemDetalhe } from "./ItemDetalhe";
import { MensagensDfd } from "./MensagensDfd";
import { IconFile, IconLayers } from "./icons";

/** Título do painel da direita do DFD (mensagens / item / histórico). */
export function tituloPainelDfd(painel: PainelDfd | null, dfd: DfdParseado | null, numero: string): string {
  if (painel?.tipo === "historico") return `Histórico — DFD ${numero}`;
  if (painel?.tipo === "diferencas") return `Diferenças — DFD ${numero}`;
  if (painel?.tipo === "item") return `Item ${dfd?.itens[painel.idx]?.item ?? painel.idx + 1} — DFD ${numero}`;
  return `Mensagens — DFD ${numero}`;
}

/**
 * Rodapé de um banner de ITEM — o do painel da direita do DFD e o do banner SÓ do item (lista "Itens" da
 * Mesa): "Ver DFD" (no painel da direita fecha o item e volta ao DFD — no celular só um painel aparece
 * por vez; no banner do item, o DFD entra pela direita), "Ver protocolo" (sobe ao processo de origem) e,
 * no banner do item, Fechar + a ação principal (Salvar alterações).
 */
export function RodapePainelItem({
  onVerDfd,
  onVerProtocolo,
  onFechar,
  principal,
  bloqueado = false,
}: {
  onVerDfd?: () => void;
  onVerProtocolo?: () => void;
  onFechar?: () => void;
  principal?: ReactNode;
  bloqueado?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onVerDfd && (
        <Button variant="secondary" onClick={onVerDfd} disabled={bloqueado}>
          <IconFile className="h-4 w-4" /> Ver DFD
        </Button>
      )}
      {onVerProtocolo && (
        <Button variant="secondary" onClick={onVerProtocolo} disabled={bloqueado}>
          <IconLayers className="h-4 w-4" /> Ver protocolo
        </Button>
      )}
      {(onFechar || principal) && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {onFechar && (
            <Button variant="secondary" onClick={onFechar} disabled={bloqueado}>
              Fechar
            </Button>
          )}
          {principal}
        </div>
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
  comparacao = null,
  herdados,
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
  /** (reenvio) diferenças deste DFD em relação ao gravado — painel "Diferenças". */
  comparacao?: ComparacaoDfd | null;
  /** (reenvio) tratamentos herdados do gravado (o PDF não trazia). */
  herdados?: string[];
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

  if (painel?.tipo === "diferencas") return <ComparacaoDfdView comparacao={comparacao} herdados={herdados} />;
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
