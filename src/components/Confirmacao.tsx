"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";

type Pedido = { titulo: string; texto?: ReactNode; confirmar: string; cancelar: string; perigo: boolean };

/**
 * CONFIRMAÇÃO do sistema — no lugar do `confirm()` do navegador: um card FLUTUANTE padrão (`AvisoFlutuante` com as ações
 * Cancelar/Confirmar), no canto inferior, sem bloquear a tela. `confirmar({titulo, texto, confirmar, perigo})` devolve uma
 * Promise<boolean> (fechar = não; `cancelar` = o rótulo do "não"); `confirmacao` é o elemento a renderizar no componente que pergunta. Um pedido novo
 * responde "não" ao anterior e o componente que DESMONTA responde "não" à pendente (nunca fica uma pergunta pendurada).
 */
export function useConfirmacao() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const montado = useRef(true);
  const responder = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setPedido(null);
  }, []);
  const confirmar = useCallback(
    (p: { titulo: string; texto?: ReactNode; confirmar?: string; cancelar?: string; perigo?: boolean }) =>
      new Promise<boolean>((resolve) => {
        if (!montado.current) return resolve(false);
        resolver.current?.(false);
        resolver.current = resolve;
        setPedido({ titulo: p.titulo, texto: p.texto, confirmar: p.confirmar ?? "Confirmar", cancelar: p.cancelar ?? "Cancelar", perigo: p.perigo ?? false });
      }),
    [],
  );
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      resolver.current?.(false);
      resolver.current = null;
    };
  }, []);
  const confirmacao = pedido ? (
    <AvisoFlutuante
      kind={pedido.perigo ? "danger" : "warn"}
      titulo={pedido.titulo}
      onClose={() => responder(false)}
      acoes={
        <>
          <Button size="sm" variant="ghost" onClick={() => responder(false)}>
            {pedido.cancelar}
          </Button>
          <Button size="sm" variant={pedido.perigo ? "danger" : "primary"} onClick={() => responder(true)}>
            {pedido.confirmar}
          </Button>
        </>
      }
    >
      {pedido.texto}
    </AvisoFlutuante>
  ) : null;
  /** Como `confirmar`, mas `null` quando o componente DESMONTOU antes de responder (ninguém viu a pergunta — quem chama
   * pergunta de outro jeito; nunca um "não" que ninguém deu). */
  const perguntar = useCallback(
    async (p: Parameters<typeof confirmar>[0]): Promise<boolean | null> => {
      if (!montado.current) return null;
      const r = await confirmar(p);
      return montado.current ? r : null;
    },
    [confirmar],
  );
  return { confirmar, perguntar, confirmacao };
}
