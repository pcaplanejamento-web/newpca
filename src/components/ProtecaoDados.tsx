"use client";

import { useEffect, useState } from "react";
import { type Bloqueios, cssProtecao, SELETOR_CAMPO } from "@/lib/protecao-core";
import { IconLock } from "./icons";
import { toast } from "./Toast";

type Motivo = "print" | "foco";

const TEXTO: Record<Motivo, { titulo: string; texto: string }> = {
  print: { titulo: "Captura bloqueada", texto: "Os dados do sistema são protegidos pela administração." },
  foco: { titulo: "Conteúdo protegido", texto: "Toque para voltar ao sistema." },
};

/** A CORTINA que cobre a tela na tentativa de captura/impressão ou quando a janela perde o foco. `inline` = no lugar (o
 * catálogo), sem cobrir a página. */
export function CortinaProtecao({ motivo, inline = false, onFechar }: { motivo: Motivo; inline?: boolean; onFechar?: () => void }) {
  const t = TEXTO[motivo];
  const corpo = (
    <>
      <IconLock className="h-8 w-8 text-muted" />
      <p className="text-[15px] font-semibold text-text">{t.titulo}</p>
      <p className="text-[13px] text-muted">{t.texto}</p>
    </>
  );
  if (inline) return <div className="grid min-h-40 place-items-center content-center gap-2 rounded-card border border-border bg-surface p-[var(--pad-card)] text-center">{corpo}</div>;
  return (
    <button
      type="button"
      onClick={onFechar}
      className="fixed inset-0 z-[200] grid cursor-default place-items-center content-center gap-2 bg-surface p-[var(--pad-canvas)] text-center print:hidden"
    >
      {corpo}
    </button>
  );
}

function ehCampo(alvo: EventTarget | null): boolean {
  const el = alvo instanceof Element ? alvo : alvo instanceof Node ? alvo.parentElement : null;
  return !!el?.closest(SELETOR_CAMPO);
}

/**
 * PROTEÇÃO DE DADOS (Configurações → Proteção de dados): aplica os bloqueios do ADM em TODA a tela — o CSS global vai no
 * HTML do servidor (vale desde a 1ª pintura e nos banners por portal) e os ouvintes só dos bloqueios ligados. Os campos
 * editáveis seguem selecionáveis e os botões "Copiar" do sistema funcionam (área de transferência pela API, ou por um
 * campo). O navegador não impede a tecla Print do sistema nem a foto pelo celular: a captura é dificultada e desencorajada.
 */
export function ProtecaoDados({ selecao, print, foco }: Bloqueios) {
  const [cortina, setCortina] = useState<Motivo | null>(null);

  useEffect(() => {
    const tirar: (() => void)[] = [];
    const ouvir = (alvo: EventTarget, tipo: string, f: (e: Event) => void) => {
      alvo.addEventListener(tipo, f, true);
      tirar.push(() => alvo.removeEventListener(tipo, f, true));
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
        if (el?.closest("img, a") || (window.getSelection()?.toString() ?? "") !== "" || !el) e.preventDefault();
      });
    }
    let tempo: ReturnType<typeof setTimeout> | undefined;
    const cobrir = (m: Motivo, ms?: number) => {
      setCortina(m);
      clearTimeout(tempo);
      if (ms) tempo = setTimeout(() => setCortina((c) => (c === m ? null : c)), ms);
    };
    if (print) {
      const capturou = () => {
        navigator.clipboard?.writeText("").catch(() => {});
        cobrir("print", 2000);
        toast.warning("Captura de tela bloqueada.");
      };
      ouvir(window, "keydown", (ev) => {
        const e = ev as KeyboardEvent;
        const k = (e.key ?? "").toLowerCase();
        const mod = e.ctrlKey || e.metaKey;
        if (mod && k === "p") {
          e.preventDefault();
          e.stopPropagation();
          toast.warning("Impressão bloqueada.");
        } else if ((e.metaKey && e.shiftKey && ["3", "4", "5"].includes(k)) || (mod && e.shiftKey && k === "s")) {
          capturou();
        }
      });
      ouvir(window, "keyup", (e) => {
        if ((e as KeyboardEvent).key === "PrintScreen") capturou();
      });
      ouvir(window, "beforeprint", () => cobrir("print"));
      ouvir(window, "afterprint", () => setCortina((c) => (c === "print" ? null : c)));
    }
    if (foco) {
      ouvir(window, "blur", () => cobrir("foco"));
      ouvir(document, "visibilitychange", () => {
        if (document.visibilityState === "hidden") cobrir("foco");
      });
      ouvir(window, "focus", () => setCortina((c) => (c === "foco" ? null : c)));
    }
    return () => {
      clearTimeout(tempo);
      for (const f of tirar) f();
    };
  }, [selecao, print, foco]);

  const css = cssProtecao({ selecao, print, foco });
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: CSS 100% estático gerado por cssProtecao (sem dados do usuário). */}
      {css && <style id="protecao-dados" dangerouslySetInnerHTML={{ __html: css }} />}
      {cortina && <CortinaProtecao motivo={cortina} onFechar={() => setCortina(null)} />}
    </>
  );
}
