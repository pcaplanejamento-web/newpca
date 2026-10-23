"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { atalhoDeCaptura, type TipoEvento } from "@/lib/acessos-core";
import { ondeDaRota } from "@/lib/presenca-core";
import { retratoTrilha } from "./trilha-store";

/** Envia um evento ao histórico da pessoa (best-effort; `sendBeacon` sobrevive à saída da página). */
export function registrarEvento(tipo: TipoEvento, texto = "", origem: "navegador" | "sistema" = "navegador") {
  if (typeof window === "undefined" || !ativo) return;
  const { detalhe, abertos } = retratoTrilha();
  const rota = location.pathname + location.search;
  const corpo = JSON.stringify({
    tipo,
    rota: rota.slice(0, 300),
    tela: ondeDaRota(location.pathname, location.search, detalhe ?? "").rotulo.slice(0, 120),
    itens: abertos.map((a) => a.rotulo).join(" › ").slice(0, 600),
    texto: texto.slice(0, 20_000),
    origem,
  });
  try {
    const blob = new Blob([corpo], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/perfil/eventos", blob)) return;
  } catch {}
  void fetch("/api/perfil/eventos", { method: "POST", headers: { "content-type": "application/json" }, body: corpo, keepalive: true }).catch(() => {});
}

let ativo = false;

/** Proteção de dados → "Registrar cópias, capturas e impressões": ouve a cópia (o texto), os atalhos de captura e a
 * impressão e grava no histórico de acesso da pessoa a tela e os banners abertos. Sem UI. */
export function RegistroProtecao({ ligado }: { ligado: boolean }) {
  usePathname();
  useEffect(() => {
    ativo = ligado;
    if (!ligado) return;
    const copia = () => registrarEvento("copia", document.getSelection()?.toString() ?? "");
    // O PrintScreen do Windows só dispara o keyup; os atalhos com Cmd/Win + Shift, o keydown — cada um conta uma vez.
    const tecla = (e: KeyboardEvent) => {
      if ((e.key === "PrintScreen") === (e.type === "keyup") && atalhoDeCaptura(e)) registrarEvento("captura");
    };
    const imprimir = () => registrarEvento("impressao");
    document.addEventListener("copy", copia, true);
    document.addEventListener("cut", copia, true);
    window.addEventListener("keyup", tecla, true);
    window.addEventListener("keydown", tecla, true);
    window.addEventListener("beforeprint", imprimir);
    return () => {
      ativo = false;
      document.removeEventListener("copy", copia, true);
      document.removeEventListener("cut", copia, true);
      window.removeEventListener("keyup", tecla, true);
      window.removeEventListener("keydown", tecla, true);
      window.removeEventListener("beforeprint", imprimir);
    };
  }, [ligado]);
  return null;
}
