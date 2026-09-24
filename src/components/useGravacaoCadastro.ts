"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "./Toast";

/** O desfecho de uma gravação: a mensagem ao usuário e se foi só EM PARTE (aviso âmbar em vez de sucesso); `null` = sem
 * aviso (ex.: reordenar — a lista já mostra o resultado). */
export type Desfecho = { msg: string; parcial?: boolean } | null;

/**
 * Gravações de um CADASTRO da tela (Catálogo → Unidades de medida | Classificações): UMA por vez — uma chamada no meio
 * de outra é ignorada (a trava é uma ref: dois toques no mesmo quadro não passam) —, o desfecho no aviso flutuante e o
 * cadastro RECARREGADO depois (também na falha: outra pessoa pode ter mudado algo; `recarregarNoSucesso=false` quando a
 * tela já mostra o resultado). `recarregar` não lança (a falha dele é da tela). Devolve `true` quando gravou.
 */
export function useGravacaoCadastro(recarregar: () => Promise<unknown>) {
  const ocupado = useRef(false);
  const [salvando, setSalvando] = useState(false);
  const executar = useCallback(
    async (acao: () => Promise<Desfecho>, recarregarNoSucesso = true): Promise<boolean> => {
      if (ocupado.current) return false;
      ocupado.current = true;
      setSalvando(true);
      let gravou = false;
      try {
        const d = await acao();
        gravou = true;
        if (d?.parcial) toast.warning(d.msg, 8000);
        else if (d) toast.success(d.msg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível gravar.");
      }
      try {
        if (!gravou || recarregarNoSucesso) await recarregar();
      } finally {
        ocupado.current = false;
        setSalvando(false);
      }
      return gravou;
    },
    [recarregar],
  );
  return { salvando, executar };
}
