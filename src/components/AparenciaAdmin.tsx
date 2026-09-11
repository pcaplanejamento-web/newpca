"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/Button";
import { ColorField } from "@/components/ColorField";
import { Segmented } from "@/components/Segmented";
import { Tabs } from "@/components/Tabs";
import { toast } from "@/components/Toast";
import { IconBell, IconClipboard, IconFile, IconLayers, IconTrash, IconUser } from "@/components/icons";
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
  const [elevation, setElevation] = useState<"ring" | "soft">(inicial.elevation ?? "ring");
  const [kpi, setKpi] = useState<"outline" | "filled">(inicial.kpi ?? "outline");
  const [iconStroke, setIconStroke] = useState(inicial.icones?.stroke ?? 2);
  const [iconFill, setIconFill] = useState<"none" | "duotone">(inicial.icones?.fill ?? "none");
  const [iconAnim, setIconAnim] = useState<"none" | "hover">(inicial.icones?.anim ?? "none");
  const [iconTintOn, setIconTintOn] = useState(!!inicial.icones?.tint);
  const [iconTint, setIconTint] = useState(inicial.icones?.tint ?? "#4f46e5");
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
    const root = document.documentElement;
    root.setAttribute("data-density", density);
    root.setAttribute("data-motion", motion);
    if (elevation === "soft") root.setAttribute("data-elevation", "soft");
    else root.removeAttribute("data-elevation");
    if (kpi === "filled") root.setAttribute("data-kpi", "filled");
    else root.removeAttribute("data-kpi");
    root.style.setProperty("--icon-stroke", String(iconStroke));
    if (iconTintOn) {
      root.style.setProperty("--icon-tint", iconTint);
      root.setAttribute("data-icon-tint", "");
    } else {
      root.style.removeProperty("--icon-tint");
      root.removeAttribute("data-icon-tint");
    }
    if (iconFill === "duotone") root.setAttribute("data-icons", "filled");
    else root.removeAttribute("data-icons");
    if (iconAnim === "hover") root.setAttribute("data-icon-anim", "hover");
    else root.removeAttribute("data-icon-anim");
  }, [cores, radius, density, motion, elevation, kpi, iconStroke, iconFill, iconAnim, iconTintOn, iconTint]);
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
        body: JSON.stringify({
          cores,
          radius,
          density,
          motion,
          elevation,
          kpi,
          icones: { stroke: iconStroke, tint: iconTintOn ? iconTint : undefined, fill: iconFill, anim: iconAnim },
        }),
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
      setElevation("ring");
      setKpi("outline");
      setIconStroke(2);
      setIconFill("none");
      setIconAnim("none");
      setIconTintOn(false);
      setIconTint("#4f46e5");
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
        <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted">Elevação dos cards</span>
        <Segmented
          value={elevation}
          onChange={(v) => setElevation(v as "ring" | "soft")}
          options={[
            { value: "ring", label: "Anel" },
            { value: "soft", label: "Sombra suave" },
          ]}
        />
      </div>
      <div>
        <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted">Estilo dos KPIs</span>
        <Segmented
          value={kpi}
          onChange={(v) => setKpi(v as "outline" | "filled")}
          options={[
            { value: "outline", label: "Contorno" },
            { value: "filled", label: "Preenchido" },
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

  const abaIcones = (
    <div className="max-w-md space-y-5">
      <div>
        <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted">
          Espessura do traço · {iconStroke.toFixed(2)}
        </span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.25}
          value={iconStroke}
          onChange={(e) => setIconStroke(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </div>
      <div>
        <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted">Preenchimento</span>
        <Segmented
          value={iconFill}
          onChange={(v) => setIconFill(v as "none" | "duotone")}
          options={[
            { value: "none", label: "Contorno" },
            { value: "duotone", label: "Preenchido" },
          ]}
        />
      </div>
      <div>
        <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted">Animação</span>
        <Segmented
          value={iconAnim}
          onChange={(v) => setIconAnim(v as "none" | "hover")}
          options={[
            { value: "none", label: "Nenhuma" },
            { value: "hover", label: "Suave (hover)" },
          ]}
        />
      </div>
      <div>
        <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted">Tom dos ícones</span>
        <Segmented
          value={iconTintOn ? "cor" : "ctx"}
          onChange={(v) => setIconTintOn(v === "cor")}
          options={[
            { value: "ctx", label: "Contextual" },
            { value: "cor", label: "Cor fixa" },
          ]}
        />
        {iconTintOn && (
          <div className="mt-2">
            <ColorField value={iconTint} onChange={setIconTint} label="Tom dos ícones" />
          </div>
        )}
      </div>
      <div className="rounded-control border border-border bg-surface-2 p-3">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted">Prévia</span>
        <div className="flex flex-wrap items-center gap-4 text-text-2">
          <IconClipboard className="h-6 w-6" />
          <IconUser className="h-6 w-6" />
          <IconBell className="h-6 w-6" />
          <IconFile className="h-6 w-6" />
          <IconTrash className="h-6 w-6" />
        </div>
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
            { key: "icones", label: "Ícones", content: abaIcones },
          ]}
        />
      </div>
    </div>
  );
}
