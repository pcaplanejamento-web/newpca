"use client";

import { useEffect, useRef } from "react";
import { TURNSTILE_SCRIPT } from "@/lib/cloudflare-core";

// Widget do Cloudflare Turnstile (captcha). Carrega o script SÓ quando montado (ou seja,
// só quando o ADM ativou o captcha) e devolve o token via `onToken`. Componente do DS —
// única forma de embutir esse serviço externo; nada de script global no layout.

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let carregando: Promise<void> | null = null;
function carregarScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (carregando) return carregando;
  carregando = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SCRIPT;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar o Turnstile."));
    document.head.appendChild(s);
  });
  return carregando;
}

export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    carregarScript()
      .then(() => {
        if (cancelado || !ref.current || !window.turnstile) return;
        idRef.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (t: string) => onToken(t),
          "error-callback": () => onToken(null),
          "expired-callback": () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      cancelado = true;
      if (idRef.current && window.turnstile) {
        try {
          window.turnstile.remove(idRef.current);
        } catch {
          /* ignora */
        }
      }
    };
  }, [siteKey, onToken]);

  return <div ref={ref} className="flex justify-center" />;
}
