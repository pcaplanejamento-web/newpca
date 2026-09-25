"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";

type Pedido = { titulo: string; texto?: ReactNode; confirmar: string; perigo: boolean };

/**
 * CONFIRMAÇÃO do sistema — no lugar do `confirm()` do navegador: um card FLUTUANTE padrão (`AvisoFlutuante` com as ações
 * Cancelar/Confirmar), no canto inferior, sem bloquear a tela. `confirmar({titulo, texto, confirmar, perigo})` devolve uma
 * Promise<boolean> (fechar = não); `confirmacao` é o elemento a renderizar no componente que pergunta. Um pedido novo
 * responde "não" ao anterior (nunca fica uma pergunta pendurada).
 */
export function useConfirmacao() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const responder = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setPedido(null);
  }, []);
  const confirmar = useCallback(
    (p: { titulo: string; texto?: ReactNode; confirmar?: string; perigo?: boolean }) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setPedido({ titulo: p.titulo, texto: p.texto, confirmar: p.confirmar ?? "Confirmar", perigo: p.perigo ?? false });
      }),
    [],
  );
  const confirmacao = pedido ? (
    <AvisoFlutuante
      kind={pedido.perigo ? "danger" : "warn"}
      titulo={pedido.titulo}
      onClose={() => responder(false)}
      acoes={
        <>
          <Button size="sm" variant="ghost" onClick={() => responder(false)}>
            Cancelar
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
  return { confirmar, confirmacao };
}
