"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/Button";
import { ColorField } from "@/components/ColorField";
import { IconPalette } from "@/components/icons";
import { Segmented } from "@/components/Segmented";

// Theme Playground (spec §39.25): edita os CSS vars ao vivo em
// document.documentElement — todo o catálogo reflete na hora. Desenho por cards,
// com componentes do próprio design system (Segmented, ColorField, Button).
const root = () => document.documentElement;

function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-control border border-border bg-surface-2 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
        {titulo}
      </div>
      {children}
    </div>
  );
}

export function TokenEditor() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [accent, setAccent] = useState("#4f46e5");
  const [radius, setRadius] = useState(14);
  const [density, setDensity] = useState("default");
  const [motion, setMotion] = useState("default");
  const [elevation, setElevation] = useState("ring");
  const [kpi, setKpi] = useState("outline");
  useEffect(() => setMounted(true), []);

  const tema = mounted && resolvedTheme === "dark" ? "dark" : "light";

  function mudarAccent(v: string) {
    setAccent(v);
    root().style.setProperty("--accent", v);
  }
  function mudarRadius(v: number) {
    setRadius(v);
    root().style.setProperty("--radius-card", `${v}px`);
    root().style.setProperty("--radius-control", `${Math.max(6, v - 4)}px`);
    root().style.setProperty("--radius-chip", `${Math.max(4, v - 5)}px`);
  }
  function attr(a: string, v: string, set: (s: string) => void) {
    set(v);
    if (v === "default") root().removeAttribute(a);
    else root().setAttribute(a, v);
  }
  // Elevação (ring/soft) e KPIs (outline/filled): o valor "padrão" remove o attr.
  function attrPadrao(a: string, v: string, padrao: string, set: (s: string) => void) {
    set(v);
    if (v === padrao) root().removeAttribute(a);
    else root().setAttribute(a, v);
  }
  function resetar() {
    for (const p of ["--accent", "--radius-card", "--radius-control", "--radius-chip"]) {
      root().style.removeProperty(p);
    }
    root().removeAttribute("data-density");
    root().removeAttribute("data-motion");
    root().removeAttribute("data-elevation");
    root().removeAttribute("data-kpi");
    setAccent("#4f46e5");
    setRadius(14);
    setDensity("default");
    setMotion("default");
    setElevation("ring");
    setKpi("outline");
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
            <IconPalette className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-text">Theme Playground</h2>
            <p className="text-[12px] text-muted">Edite os tokens e veja o catálogo mudar ao vivo</p>
          </div>
        </div>
        <Button variant="ghost" onClick={resetar}>
          Restaurar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo titulo="Tema">
          <Segmented
            value={tema}
            onChange={(v) => setTheme(v)}
            options={[
              { value: "light", label: "Claro" },
              { value: "dark", label: "Escuro" },
            ]}
          />
        </Campo>

        <Campo titulo="Cor de destaque">
          <ColorField value={accent} onChange={mudarAccent} label="Accent" />
        </Campo>

        <Campo titulo={`Raio dos cards · ${radius}px`}>
          <input
            type="range"
            aria-label="Raio dos cards"
            min={0}
            max={24}
            value={radius}
            onChange={(e) => mudarRadius(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--accent)]"
          />
        </Campo>

        <Campo titulo="Densidade">
          <Segmented
            value={density}
            onChange={(v) => attr("data-density", v, setDensity)}
            options={[
              { value: "compact", label: "Compacta" },
              { value: "default", label: "Padrão" },
              { value: "comfortable", label: "Confortável" },
            ]}
          />
        </Campo>

        <Campo titulo="Elevação dos cards">
          <Segmented
            value={elevation}
            onChange={(v) => attrPadrao("data-elevation", v, "ring", setElevation)}
            options={[
              { value: "ring", label: "Anel" },
              { value: "soft", label: "Sombra suave" },
            ]}
          />
        </Campo>

        <Campo titulo="Estilo dos KPIs">
          <Segmented
            value={kpi}
            onChange={(v) => attrPadrao("data-kpi", v, "outline", setKpi)}
            options={[
              { value: "outline", label: "Contorno" },
              { value: "filled", label: "Preenchido" },
            ]}
          />
        </Campo>

        <Campo titulo="Animações">
          <Segmented
            value={motion}
            onChange={(v) => attr("data-motion", v, setMotion)}
            options={[
              { value: "off", label: "Off" },
              { value: "reduced", label: "Reduzido" },
              { value: "default", label: "Padrão" },
              { value: "smooth", label: "Suave" },
            ]}
          />
        </Campo>
      </div>
    </div>
  );
}
