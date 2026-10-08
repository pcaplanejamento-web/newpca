"use client";

import { type CSSProperties, useEffect } from "react";
import { ATRIBUTO_COBRIR, type Bloqueios, cssProtecao, OPACIDADE_MARCA, SELETOR_CAMPO, svgMarcaDagua } from "@/lib/protecao-core";

/** A MARCA D'ÁGUA de quem vê (nome · matrícula · data e hora) sobre toda a tela: na tela, abaixo do que o olho percebe (a
 * captura a guarda — aparece ao realçar o contraste); no papel, legível. Não captura o toque nem o clique. `inline` = dentro
 * do próprio quadro, com a opacidade do papel (o catálogo). */
export function MarcaDagua({ texto, inline = false }: { texto: string; inline?: boolean }) {
  const estilo = { backgroundImage: svgMarcaDagua(texto, inline ? OPACIDADE_MARCA.papel : OPACIDADE_MARCA.tela), "--marca-papel": svgMarcaDagua(texto, OPACIDADE_MARCA.papel) } as CSSProperties;
  return (
    <div
      aria-hidden="true"
      data-marca-dagua=""
      style={estilo}
      className={`pointer-events-none select-none ${inline ? "h-40 rounded-card border border-border bg-surface" : "fixed inset-0 z-[95]"}`}
    />
  );
}

function ehCampo(alvo: EventTarget | null): boolean {
  const el = alvo instanceof Element ? alvo : alvo instanceof Node ? alvo.parentElement : null;
  return !!el?.closest(SELETOR_CAMPO);
}

/**
 * PROTEÇÃO DE DADOS (Configurações → Proteção de dados): aplica os bloqueios do ADM em TODA a tela, INVISÍVEL no uso — nada
 * aparece nem muda na tela. O CSS global vai no HTML do servidor (vale desde a 1ª pintura e nos banners por portal) e os
 * ouvintes só dos bloqueios ligados:
 * - impressão: o `@media print` entrega a página em branco com o aviso;
 * - captura: no PrtScn, a imagem copiada é trocada por nada na área de transferência, em silêncio (colar não traz nada).
 * As ferramentas que salvam a imagem em arquivo e a foto pelo celular nenhum site alcança — a MARCA D'ÁGUA (invisível na
 * tela) identifica quem capturou. "Ocultar ao sair da janela" (`foco`) é a única opção que se vê: cobre a tela enquanto a
 * janela está sem foco. Os campos editáveis seguem selecionáveis e os botões "Copiar" do sistema funcionam.
 */
export function ProtecaoDados({ selecao, print, foco, marca, quem }: Bloqueios & { quem: string }) {
  useEffect(() => {
    const html = document.documentElement;
    const tirar: (() => void)[] = [];
    const ouvir = (alvo: EventTarget, tipo: string, f: (e: Event) => void) => {
      alvo.addEventListener(tipo, f, true);
      tirar.push(() => alvo.removeEventListener(tipo, f, true));
    };
    const descobrir = () => html.removeAttribute(ATRIBUTO_COBRIR);

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
      ouvir(window, "keyup", (e) => {
        // A imagem já foi copiada pelo sistema: troca por nada, em silêncio.
        if ((e as KeyboardEvent).key === "PrintScreen") navigator.clipboard?.writeText("").catch(() => {});
      });
    }

    if (foco) {
      const cobrir = () => html.setAttribute(ATRIBUTO_COBRIR, "");
      // Só a JANELA (o `blur` dos campos também passa pela janela na captura — eles não contam).
      ouvir(window, "blur", (e) => {
        if (e.target === window) cobrir();
      });
      ouvir(document, "visibilitychange", () => {
        if (document.visibilityState === "hidden") cobrir();
      });
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
