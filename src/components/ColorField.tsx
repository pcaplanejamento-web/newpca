"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { hexToHsv, hsvToHex, normalizeHex } from "@/lib/color";
import { Dropdown } from "./Dropdown";
import { IconCheck } from "./icons";

// Seletor de cor (spec do usuário): área HSV + trilho de matiz + hex + conta-gotas
// (EyeDropper API quando disponível) + swatches salvos (localStorage). Por token.
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

const PRESETS = [
  "#4f46e5", "#2563eb", "#0d9488", "#16a34a", "#ca8a04", "#d97706", "#ea580c",
  "#dc2626", "#db2777", "#9333ea", "#1c1c22", "#8a8a80",
];
const LS_KEY = "pca-swatches";

function lerSalvos(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function ColorField({
  value,
  onChange,
  label = "Cor",
}: {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}) {
  const [h, setH] = useState(0);
  const [s, setS] = useState(0);
  const [v, setV] = useState(0);
  const [hex, setHex] = useState(value);
  const [salvos, setSalvos] = useState<string[]>([]);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // sincroniza HSV a partir do valor externo
  useEffect(() => {
    const hsv = hexToHsv(value);
    if (hsv) {
      setH(hsv[0]);
      setS(hsv[1]);
      setV(hsv[2]);
    }
    setHex(value);
  }, [value]);
  useEffect(() => setSalvos(lerSalvos()), []);

  function emitir(nh: number, ns: number, nv: number) {
    setH(nh);
    setS(ns);
    setV(nv);
    const novo = hsvToHex(nh, ns, nv);
    setHex(novo);
    onChange(novo);
  }

  function pontoArea(e: ReactPointerEvent) {
    const el = areaRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ns = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100;
    const nv = (1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))) * 100;
    emitir(h, ns, nv);
  }

  function aplicarHex(txt: string) {
    setHex(txt);
    const n = normalizeHex(txt);
    if (n) {
      const hsv = hexToHsv(n);
      if (hsv) emitir(hsv[0], hsv[1], hsv[2]);
    }
  }

  async function contaGotas() {
    const ED = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!ED) return;
    try {
      const res = await new ED().open();
      const n = normalizeHex(res.sRGBHex);
      if (n) aplicarHex(n);
    } catch {
      /* cancelado */
    }
  }

  function salvarCor() {
    const n = normalizeHex(hex);
    if (!n) return;
    const novos = [n, ...salvos.filter((c) => c !== n)].slice(0, 12);
    setSalvos(novos);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(novos));
    } catch {
      /* ignora */
    }
  }

  const temED = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <Dropdown
      ariaLabel={label}
      triggerClassName="gap-2 rounded-control border border-border-2 bg-surface px-2 py-1.5"
      trigger={
        <>
          <span
            className="h-5 w-5 shrink-0 rounded-[6px] border border-border-2"
            style={{ background: value }}
          />
          <span className="font-mono text-[12px] text-text-2">{value}</span>
        </>
      }
      width={252}
    >
      {(close) => (
        <div className="p-1">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-text">{label}</span>
            <button
              type="button"
              aria-label="Concluir"
              onClick={close}
              className="rounded-md p-1 text-text-2 hover:bg-surface-2"
            >
              <IconCheck className="h-4 w-4" />
            </button>
          </div>

          {/* Área saturação × valor */}
          <div
            ref={areaRef}
            className="relative h-[132px] w-full cursor-crosshair touch-none overflow-hidden rounded-control border border-border-2"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h} 100% 50%))`,
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragging.current = true;
              pontoArea(e);
            }}
            onPointerMove={(e) => {
              if (dragging.current) pontoArea(e);
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
          >
            <span
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${s}%`, top: `${100 - v}%` }}
            />
          </div>

          {/* Trilho de matiz */}
          <input
            type="range"
            aria-label="Matiz"
            min={0}
            max={360}
            value={Math.round(h)}
            onChange={(e) => emitir(Number(e.target.value), s, v)}
            className="mt-3 h-3 w-full cursor-pointer appearance-none rounded-full"
            style={{
              background:
                "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
            }}
          />

          {/* Hex + conta-gotas */}
          <div className="mt-3 flex items-center gap-2">
            <input
              value={hex}
              onChange={(e) => aplicarHex(e.target.value)}
              spellCheck={false}
              className="h-[var(--h-control-sm)] min-w-0 flex-1 rounded-control border border-border-2 bg-surface px-2 font-mono text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            {temED && (
              <button
                type="button"
                aria-label="Conta-gotas"
                onClick={contaGotas}
                className="grid h-[var(--h-control-sm)] w-[var(--h-control-sm)] shrink-0 place-items-center rounded-control border border-border-2 bg-surface text-text-2 hover:bg-surface-2"
              >
                {/* ícone conta-gotas simples */}
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m2 22 1-1h3l9-9" />
                  <path d="M3 21v-3l9-9" />
                  <path d="m15 6 3.5-3.5a2.12 2.12 0 0 1 3 3L18 9l.5.5a1.5 1.5 0 0 1-3 3l-6-6a1.5 1.5 0 0 1 3-3Z" />
                </svg>
              </button>
            )}
          </div>

          {/* Swatches salvos + presets */}
          <div className="mt-3 border-t border-border pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Cores</span>
              <button type="button" onClick={salvarCor} className="text-[11px] font-semibold text-accent hover:underline">
                Salvar
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {[...salvos, ...PRESETS].slice(0, 18).map((c, i) => (
                <button
                  key={`${c}-${i}`}
                  type="button"
                  aria-label={c}
                  title={c}
                  onClick={() => aplicarHex(c)}
                  className="h-6 w-6 rounded-md border border-border-2"
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Dropdown>
  );
}
