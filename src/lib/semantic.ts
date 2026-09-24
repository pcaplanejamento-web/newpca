// Mapeia rótulos de domínio → tokens semânticos (CSS vars da spec §3). Os
// componentes recebem a cor como `var(--token)`; nada de hex hardcoded — o ADM
// pode trocar a cor no token e reflete em toda a UI. As tintas/glows derivam
// desses tokens via color-mix nos componentes.

/** Feedback de UI (banners/estados/ações) — o `kind` vira a var `--{kind}` nos componentes (Callout, avisos). */
export type Feedback = "ok" | "warn" | "danger" | "info";

const AV_KNOWN: Record<string, string> = {
  jhone: "var(--av-jhone)",
  maria: "var(--av-maria)",
  naty: "var(--av-naty)",
  cris: "var(--av-cris)",
  thamires: "var(--av-thamires)",
};
const AV_VARS = [
  "var(--av-jhone)",
  "var(--av-maria)",
  "var(--av-naty)",
  "var(--av-cris)",
  "var(--av-thamires)",
];

/** Avatar por pessoa (§3): nomes conhecidos usam sua cor; demais, cor
 * determinística; vazio ("sem responsável") = --faint. */
export function avatarVar(nome?: string | null): string {
  const t = (nome ?? "").trim();
  if (!t) return "var(--faint)";
  const first = t.toLowerCase().split(/\s+/u)[0];
  if (AV_KNOWN[first]) return AV_KNOWN[first];
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return AV_VARS[Math.abs(h) % AV_VARS.length];
}
