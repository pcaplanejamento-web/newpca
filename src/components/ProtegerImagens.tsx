"use client";

import { useEffect } from "react";

/** Toda imagem do sistema (logo, fotos, capas, fundos): não se arrasta nem se copia pelo menu do botão direito.
 *  O CSS (globals.css, `img`) tira o arrasto no Chrome/Safari; aqui o Firefox e o "Copiar imagem". Sem UI. */
export function ProtegerImagens() {
  useEffect(() => {
    const ehImagem = (e: Event) => {
      const t = e.target as Element | null;
      return !!t && (t.tagName === "IMG" || t.tagName === "PICTURE" || (t.tagName === "svg" && !!t.closest("[data-marca]")));
    };
    const bloquear = (e: Event) => {
      if (ehImagem(e)) e.preventDefault();
    };
    document.addEventListener("dragstart", bloquear, true);
    document.addEventListener("contextmenu", bloquear, true);
    return () => {
      document.removeEventListener("dragstart", bloquear, true);
      document.removeEventListener("contextmenu", bloquear, true);
    };
  }, []);
  return null;
}
