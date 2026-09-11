"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/Button";
import { ColorField } from "@/components/ColorField";
import { Segmented } from "@/components/Segmented";
import { Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { IconLayers } from "@/components/icons";
import { type Aparencia, aparenciaToCss, DEFAULT_CORES, TOKENS_COR } from "@/lib/theme";

// Painel de Personalização do ADM (spec §39). Só componentes do design-system.
// Edita tokens com preview AO VIVO (injeta um <style> que espelha a produção) e
// persiste via /api/admin/aparencia. Restaurar = volta ao padrão.
const ROTULO: Record<string, string> = {
  bg: "Fundo",
  surface: "Superfície",
  "surface-2": "Superfície 2",
  text: "Texto",
  "text-2": "Texto secundário",
  muted: "Suave",
  faint: "Fraco",
  border: "Borda",
  "border-2": "Borda externa",
  accent: "Destaque (accent)",
  "accent-soft": "Destaque suave",
  track: "Trilho",
  "sb-active": "Sidebar ativo",
  "kpi-bar": "Barra do KPI",
};

const PRESETS: { nome: string; light: Record<string, string>; dark: Record<string, string> }[] = [
  { nome: "Padrão PCA", light: { accent: "#4f46e5", "accent-soft": "#eef0ff" }, dark: { accent: "#818cf8", "accent-soft": "#1e1e3a" } },
  { nome: "Azul", light: { accent: "#2563eb", "accent-soft": "#eff6ff" }, dark: { accent: "#60a5fa", "accent-soft": "#172554" } },
  { nome: "Verde", light: { accent: "#16a34a", "accent-soft": "#f0fdf4" }, dark: { accent: "#4ade80", "accent-soft": "#052e16" } },
  { nome: "Neutro", light: { accent: "#4b5563", "accent-soft": "#f3f4f6" }, dark: { accent: "#9ca3af", "accent-soft": "#1f2937" } },
];

type Cores = { light: Record<string, string>; dark: Record<string, string> };

export function AparenciaAdmin({ inicial }: { inicial: Aparencia }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [cores, setCores] = useState<Cores>(() => ({
    light: { ...DEFAULT_CORES.light, ...(inicial.cores?.light ?? {}) },
    dark: { ...DEFAULT_CORES.dark, ...(inicial.cores?.dark ?? {}) },
  }));
  const [radius, setRadius] = useState(inicial.radius ?? 14);
  const [density, setDensity] = useState(inicial.density ?? "default");
  const [motion, setMotion] = useState(inicial.motion ?? "default");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setMounted(true), []);
  const tema: "light" | "dark" = mounted && resolvedTheme === "dark" ? "dark" : "light";

  // Preview ao vivo: injeta o mesmo CSS que a produção usaria.
  useEffect(() => {
    let el = document.getElementById("preview-aparencia") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "preview-aparencia";
      document.head.appendChild(el);
    }
    el.textContent = aparenciaToCss({ cores, radius });
    document.documentElement.setAttribute("data-density", density);
    document.documentElement.setAttribute("data-motion", motion);
  }, [cores, radius, density, motion]);
  useEffect(
    () => () => {
      document.getElementById("preview-aparencia")?.remove();
    },
    [],
  );

  const setCor = (token: string, hex: string) =>
    setCores((c) => ({ ...c, [tema]: { ...c[tema], [token]: hex } }));
  const aplicarPreset = (p: (typeof PRESETS)[number]) =>
    setCores((c) => ({ light: { ...c.light, ...p.light }, dark: { ...c.dark, ...p.dark } }));

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/aparencia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cores, radius, density, motion }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      toast.success("Aparência salva — já vale para todos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function restaurar() {
    if (!confirm("Restaurar a aparência padrão? As personalizações atuais serão substituídas.")) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/aparencia", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCores({ light: { ...DEFAULT_CORES.light }, dark: { ...DEFAULT_CORES.dark } });
      setRadius(14);
      setDensity("default");
      setMotion("default");
      toast.success("Aparência restaurada ao padrão.");
    } catch {
      toast.error("Erro ao restaurar.");
    } finally {
      setSalvando(false);
    }
  }

  const abaCores = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tema}
          onChange={(v) => setTheme(v)}
          options={[
            { value: "light", label: "Claro" },
            { value: "dark", label: "Escuro" },
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button key={p.nome} variant="secondary" onClick={() => aplicarPreset(p)}>
              {p.nome}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOKENS_COR.map((token) => (
          <div key={token} className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2">
            <span className="min-w-0 truncate text-[13px] text-text-2">{ROTULO[token] ?? token}</span>
            <ColorField value={cores[tema][token]} onChange={(hex) => setCor(token, hex)} label={ROTULO[token] ?? token} />
          </div>
        ))}
      </div>
    </div>
  );

  const abaLayout = (
    <div className="max-w-md space-y-5">
      <div>
        <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted">
          Raio dos cards · {radius}px
        </span>
        <input
          type="range"
          min={0}
          max={24}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </div>
      <div>
        <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted">Densidade</span>
        <Segmented
          value={density}
          onChange={setDensity}
          options={[
            { value: "compact", label: "Compacta" },
            { value: "default", label: "Padrão" },
            { value: "comfortable", label: "Confortável" },
          ]}
        />
      </div>
      <div>
        <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted">Animações</span>
        <Segmented
          value={motion}
          onChange={setMotion}
          options={[
            { value: "off", label: "Off" },
            { value: "reduced", label: "Reduzido" },
            { value: "default", label: "Padrão" },
            { value: "smooth", label: "Suave" },
          ]}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Personalize a identidade visual — vale para toda a plataforma.</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon={<IconLayers className="h-4 w-4" />} href="/design-system">
            Ver biblioteca
          </Button>
          <Button variant="secondary" onClick={restaurar} disabled={salvando}>
            Restaurar padrão
          </Button>
          <Button onClick={salvar} loading={salvando}>
            Salvar
          </Button>
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">
        <Tabs
          tabs={[
            { key: "cores", label: "Cores", content: abaCores },
            { key: "layout", label: "Bordas · Densidade · Motion", content: abaLayout },
          ]}
        />
      </div>
    </div>
  );
}
