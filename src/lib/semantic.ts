// Mapeia rótulos de domínio → tokens semânticos (CSS vars da spec §3). Os
// componentes recebem a cor como `var(--token)`; nada de hex hardcoded — o ADM
// pode trocar a cor no token e reflete em toda a UI. As tintas/glows derivam
// desses tokens via color-mix nos componentes.

/** Natureza (rótulo) → var da cor. Prefixos como no print. */
export function naturezaVar(natureza?: string | null): string {
  const n = (natureza ?? "").toUpperCase();
  if (n.startsWith("INCLUSÃO 2027") || n.startsWith("INCLUSAO 2027")) return "var(--nat-inclusao-2027)";
  if (n.startsWith("INCLUSÃO") || n.startsWith("INCLUSAO")) return "var(--nat-inclusao-2026)";
  if (n.startsWith("EXCLUSÃO") || n.startsWith("EXCLUSAO")) return "var(--nat-exclusao)";
  if (n.startsWith("CORREÇÃO") || n.startsWith("CORRECAO")) return "var(--nat-correcao)";
  if (n.startsWith("COMUNICAÇÃO") || n.startsWith("COMUNICACAO")) return "var(--nat-comunicacao)";
  return "var(--faint)";
}

const SIT_VAR: Record<string, string> = {
  em_analise: "var(--sit-em-analise)",
  em_andamento: "var(--sit-em-andamento)",
  finalizado: "var(--sit-finalizado)",
  devolvido: "var(--sit-devolvido)",
  cancelado: "var(--sit-cancelado)",
};

/** Situação (valor do enum) → var da cor. */
export function situacaoVar(situacao?: string | null): string {
  return SIT_VAR[situacao ?? ""] ?? "var(--faint)";
}

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
