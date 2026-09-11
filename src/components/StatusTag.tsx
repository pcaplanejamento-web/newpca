import { naturezaVar, situacaoVar } from "@/lib/semantic";

// Badges sem pílula (spec §6.7): a cor vem do token semântico; as tintas/glows
// derivam por color-mix com os alvos de tema (--tint-target/--glow-target), então
// adaptam a claro/escuro e a mudanças de cor pelo ADM automaticamente.

/** Natureza = tag Geist Mono + keyline colorida, sem fundo. */
export function NaturezaTag({ natureza }: { natureza?: string | null }) {
  if (!natureza) return <span className="text-faint">—</span>;
  return (
    <span
      className="inline-flex min-w-0 items-center gap-[9px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.03em] text-text-2"
      title={natureza}
    >
      <span
        aria-hidden
        className="h-[14px] w-[3px] shrink-0 rounded-[2px]"
        style={{ background: naturezaVar(natureza) }}
      />
      <span className="truncate">{natureza}</span>
    </span>
  );
}

/** Situação = dot com anel (glow) + texto tintado, sem fundo. Nunca só cor: o
 * rótulo sempre acompanha (acessibilidade). */
export function SituacaoDot({
  situacao,
  label,
}: {
  situacao: string;
  label: string;
}) {
  const c = situacaoVar(situacao);
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap text-[11.5px] font-semibold"
      style={{ color: `color-mix(in srgb, ${c} 75%, var(--tint-target))` }}
    >
      <span
        aria-hidden
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{
          background: c,
          boxShadow: `0 0 0 3px color-mix(in srgb, ${c} 16%, var(--glow-target))`,
        }}
      />
      {label}
    </span>
  );
}
