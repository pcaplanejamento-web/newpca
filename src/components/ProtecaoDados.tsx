"use client";

import { useEffect } from "react";
import { ATRIBUTO_COBRIR, type Bloqueios, cssProtecao, SELETOR_CAMPO, svgMarcaDagua } from "@/lib/protecao-core";
import { toast } from "./Toast";

/** A MARCA D'ÁGUA de quem vê (nome · matrícula · data e hora) sobre toda a tela — não captura o toque nem o clique. `inline`
 * = dentro do próprio quadro (o catálogo). */
export function MarcaDagua({ texto, inline = false }: { texto: string; inline?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none print:hidden ${inline ? "h-40 rounded-card border border-border bg-surface" : "fixed inset-0 z-[95]"}`}
      style={{ backgroundImage: svgMarcaDagua(texto) }}
    />
  );
}

function ehCampo(alvo: EventTarget | null): boolean {
  const el = alvo instanceof Element ? alvo : alvo instanceof Node ? alvo.parentElement : null;
  return !!el?.closest(SELETOR_CAMPO);
}

const ehMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * PROTEÇÃO DE DADOS (Configurações → Proteção de dados): aplica os bloqueios do ADM em TODA a tela — o CSS global vai no
 * HTML do servidor (vale desde a 1ª pintura e nos banners por portal) e os ouvintes só dos bloqueios ligados. A COBERTURA
 * é um atributo no `<html>` posto DIRETO pelo ouvinte (`ATRIBUTO_COBRIR`, sem esperar o React) e sai ANTES dos atalhos de
 * captura: ao pressionar a tecla Windows (Win+Shift+S, Win+PrtScn) ou Cmd+Shift no Mac. A tecla PrtScn sozinha e a foto
 * pelo celular o navegador não alcança — a MARCA D'ÁGUA identifica quem capturou. Os campos editáveis seguem selecionáveis
 * e os botões "Copiar" do sistema funcionam.
 */
export function ProtecaoDados({ selecao, print, foco, marca, quem }: Bloqueios & { quem: string }) {
  useEffect(() => {
    const html = document.documentElement;
    const tirar: (() => void)[] = [];
    const ouvir = (alvo: EventTarget, tipo: string, f: (e: Event) => void) => {
      alvo.addEventListener(tipo, f, true);
      tirar.push(() => alvo.removeEventListener(tipo, f, true));
    };
    let tempo: ReturnType<typeof setTimeout> | undefined;
    const cobrir = (ms?: number) => {
      clearTimeout(tempo);
      html.setAttribute(ATRIBUTO_COBRIR, "");
      if (ms) tempo = setTimeout(descobrir, ms);
    };
    const descobrir = () => {
      clearTimeout(tempo);
      html.removeAttribute(ATRIBUTO_COBRIR);
    };

    if (selecao) {
      const fora = (e: Event) => {
        if (!ehCampo(e.target) && !ehCampo(document.activeElement)) e.preventDefault();
      };
      ouvir(document, "copy", fora);
      ouvir(document, "cut", fora);
      ouvir(document, "selectstart", (e) => {
        if (!ehCampo(e.target)) e.preventDefault();
      });
      ouvir(document, "contextmenu", (e) => {
        if (!ehCampo(e.target)) e.preventDefault();
      });
      ouvir(document, "dragstart", (e) => {
        const el = e.target instanceof Element ? e.target : null;
        if (el?.closest('[draggable="true"]')) return;
        if (!el || el.closest("img, a") || (window.getSelection()?.toString() ?? "") !== "") e.preventDefault();
      });
    }

    if (print) {
      const mac = ehMac();
      ouvir(window, "keydown", (ev) => {
        const e = ev as KeyboardEvent;
        const k = (e.key ?? "").toLowerCase();
        // ANTES da captura: a tecla Windows (Win+Shift+S, Win+PrtScn) ou Cmd+Shift no Mac (Cmd+Shift+3/4/5).
        if ((!mac && k === "meta") || (mac && e.metaKey && e.shiftKey)) cobrir();
        if ((e.ctrlKey || e.metaKey) && k === "p") {
          e.preventDefault();
          e.stopPropagation();
          toast.warning("Impressão bloqueada.");
        }
      });
      ouvir(window, "keyup", (ev) => {
        const e = ev as KeyboardEvent;
        if (e.key === "PrintScreen") {
          navigator.clipboard?.writeText("").catch(() => {});
          cobrir(1500);
          toast.warning("Captura de tela bloqueada.");
        } else if (e.key === "Meta" || e.key === "Shift") {
          // Soltou o atalho: a captura já foi feita (coberta); devolve a tela logo depois.
          if (html.hasAttribute(ATRIBUTO_COBRIR) && document.hasFocus()) cobrir(600);
        }
      });
      ouvir(window, "beforeprint", () => cobrir());
      ouvir(window, "afterprint", descobrir);
    }

    if (foco) {
      // Só a JANELA (o `blur` dos campos também passa pela janela na captura — eles não contam).
      ouvir(window, "blur", (e) => {
        if (e.target === window) cobrir();
      });
      ouvir(document, "visibilitychange", () => {
        if (document.visibilityState === "hidden") cobrir();
      });
    }
    if (print || foco) {
      // A janela voltou (a ferramenta de captura fechou) ou foi tocada: devolve a tela.
      ouvir(window, "focus", (e) => {
        if (e.target === window) descobrir();
      });
      ouvir(window, "pointerdown", () => document.hasFocus() && descobrir());
    }

    return () => {
      for (const f of tirar) f();
      descobrir();
    };
  }, [selecao, print, foco]);

  const css = cssProtecao({ selecao, print, foco, marca });
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: CSS 100% estático gerado por cssProtecao (sem dados do usuário). */}
      {css && <style id="protecao-dados" dangerouslySetInnerHTML={{ __html: css }} />}
      {marca && <MarcaDagua texto={quem} />}
    </>
  );
}
