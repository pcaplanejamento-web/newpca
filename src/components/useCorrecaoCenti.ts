"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RetratoCenti } from "@/lib/conferencia-dfd-centi";

type Retorno = { ok?: boolean; error?: string; retrato?: RetratoCenti | null };

/**
 * CORRIGIR O DFD PELA CENTI (banner do DFD gravado e o DFD ao lado do protocolo): busca o RETRATO guardado na conferência
 * e entrega ao `DfdUploadForm` (`centi`) — as escolhas da sobrescrita viram "Manter sistema | Usar Centi". Depois de gravar,
 * a conferência é refeita com o retrato (`recalcular`). `pedido` = pedida de FORA (o painel da coluna Centi): abre assim
 * que o DFD estiver carregado.
 */
export function useCorrecaoCenti({
  dfdId,
  pronto,
  pedido = false,
  onAtendido,
  onErro,
}: {
  dfdId: number | null;
  /** O DFD está carregado, sem rascunho e sem gravação em curso. */
  pronto: boolean;
  /** A correção foi pedida de FORA para ESTE DFD (o painel da coluna Centi): abre assim que estiver pronto. */
  pedido?: boolean;
  /** O pedido de fora foi atendido (o host o esquece — não reabre). */
  onAtendido?: () => void;
  onErro: (msg: string) => void;
}) {
  const [centi, setCenti] = useState<{ retrato: RetratoCenti; n: number; onGravado: () => Promise<void> } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const n = useRef(0);

  const corrigir = useCallback(async () => {
    if (dfdId == null) return;
    setBuscando(true);
    try {
      const r = await fetch(`/api/dfd/${dfdId}/conferencia-centi?retrato=1`);
      const j = (await r.json().catch(() => ({}))) as Retorno;
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível ler os dados guardados da Centi.");
      if (!j.retrato)
        throw new Error("Os dados da Centi deste DFD não estão guardados — reconfira na Centi (a conferência passa a guardá-los) e tente de novo.");
      const id = dfdId;
      setCenti({
        retrato: j.retrato,
        n: ++n.current,
        onGravado: async () => {
          await fetch(`/api/dfd/${id}/conferencia-centi`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ acao: "recalcular" }),
          });
        },
      });
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Não foi possível ler os dados guardados da Centi.");
    } finally {
      setBuscando(false);
    }
  }, [dfdId, onErro]);

  // O pedido de FORA vale uma vez, quando o DFD estiver pronto.
  useEffect(() => {
    if (!pronto || !pedido) return;
    onAtendido?.();
    void corrigir();
  }, [pedido, pronto, corrigir, onAtendido]);
  // Outro DFD: nada do anterior fica.
  // biome-ignore lint/correctness/useExhaustiveDependencies: zera só na troca do DFD.
  useEffect(() => {
    setCenti(null);
  }, [dfdId]);

  return { centi, buscando, corrigir };
}
