"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/Button";
import { IconMoon, IconSun } from "@/components/icons";

// Theme Playground (spec §39.25): edita os CSS vars ao vivo em
// document.documentElement — todo o catálogo reflete na hora. É o mesmo editor
// reutilizado no painel do ADM (persistência é outra camada).
const root = () => document.documentElement;
const selCls =
  "h-[var(--h-control-sm)] rounded-control border border-border-2 bg-surface px-2 text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";

export function TokenEditor() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [accent, setAccent] = useState("#4f46e5");
  const [radius, setRadius] = useState(14);
  const [density, setDensity] = useState("default");
  const [motion, setMotion] = useState("default");
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  function mudarAccent(v: string) {
    setAccent(v);
    root().style.setProperty("--accent", v);
  }
  function mudarRadius(v: number) {
    setRadius(v);
    root().style.setProperty("--radius-card", `${v}px`);
    root().style.setProperty("--radius-control", `${Math.max(6, v - 4)}px`);
  }
  function mudarAttr(attr: string, v: string, set: (s: string) => void) {
    set(v);
    if (v === "default") root().removeAttribute(attr);
    else root().setAttribute(attr, v);
  }
  function resetar() {
    for (const p of ["--accent", "--radius-card", "--radius-control"]) root().style.removeProperty(p);
    root().removeAttribute("data-density");
    root().removeAttribute("data-motion");
    setAccent("#4f46e5");
    setRadius(14);
    setDensity("default");
    setMotion("default");
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-ring">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-text">Theme Playground</h2>
        <span className="text-[11px] text-faint">edita os tokens ao vivo</span>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <span className={labelCls}>Tema</span>
          <Button
            variant="secondary"
            icon={isDark ? <IconSun className="h-4 w-4" /> : <IconMoon className="h-4 w-4" />}
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? "Escuro" : "Claro"}
          </Button>
        </div>
        <div>
          <span className={labelCls}>Accent</span>
          <input
            type="color"
            aria-label="Cor de destaque"
            value={accent}
            onChange={(e) => mudarAccent(e.target.value)}
            className="h-[var(--h-control-sm)] w-16 cursor-pointer rounded-control border border-border-2 bg-surface p-1"
          />
        </div>
        <div>
          <span className={labelCls}>Raio · {radius}px</span>
          <input
            type="range"
            aria-label="Raio dos cards"
            min={0}
            max={24}
            value={radius}
            onChange={(e) => mudarRadius(Number(e.target.value))}
            className="w-40 accent-[var(--accent)]"
          />
        </div>
        <div>
          <span className={labelCls}>Densidade</span>
          <select
            value={density}
            onChange={(e) => mudarAttr("data-density", e.target.value, setDensity)}
            className={selCls}
          >
            <option value="compact">Compacta</option>
            <option value="default">Padrão</option>
            <option value="comfortable">Confortável</option>
          </select>
        </div>
        <div>
          <span className={labelCls}>Motion</span>
          <select
            value={motion}
            onChange={(e) => mudarAttr("data-motion", e.target.value, setMotion)}
            className={selCls}
          >
            <option value="off">Desativado</option>
            <option value="reduced">Reduzido</option>
            <option value="default">Padrão</option>
            <option value="smooth">Suave</option>
          </select>
        </div>
        <Button variant="ghost" onClick={resetar}>
          Restaurar
        </Button>
      </div>
    </div>
  );
}
