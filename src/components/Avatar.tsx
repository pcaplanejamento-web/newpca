"use client";

import { useState } from "react";
import { avatarVar } from "@/lib/semantic";

// Avatar: mostra a foto cadastrada (a URL da rota da foto, com cache); sem foto (ou se falhar), cai
// para as iniciais sobre a cor da pessoa (token semântico §3, via avatarVar) — mesma pessoa → mesma
// cor, e o ADM pode trocar a paleta nos tokens.

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/u).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const DIM = {
  xs: "h-[22px] w-[22px] text-[9px]",
  sm: "h-[26px] w-[26px] text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-[34px] w-[34px] text-[13px]",
  xl: "h-20 w-20 text-xl",
} as const;

/** O ponto de PRESENÇA no canto da foto (online = verde, ausente = âmbar), com o anel da superfície. */
const PONTO = { online: "bg-[var(--ok)]", ausente: "bg-[var(--warn)]" } as const;
const PONTO_DIM: Record<keyof typeof DIM, string> = { xs: "h-2 w-2", sm: "h-2.5 w-2.5", md: "h-2.5 w-2.5", lg: "h-3 w-3", xl: "h-5 w-5" };

export function Avatar({
  nome,
  foto,
  size = "md",
  className = "",
  presenca,
  pulsar = false,
}: {
  nome: string;
  foto?: string | null;
  size?: keyof typeof DIM;
  className?: string;
  /** Mostra o ponto de presença (quem está online). */
  presenca?: keyof typeof PONTO;
  /** O ponto PULSA (o "ao vivo" — no cabeçalho e no painel; nas tabelas fica parado). */
  pulsar?: boolean;
}) {
  if (presenca) {
    return (
      <span className={`relative inline-flex shrink-0 ${className}`}>
        <Avatar nome={nome} foto={foto} size={size} />
        <span aria-hidden="true" className={`absolute right-0 bottom-0 rounded-full ring-2 ring-surface ${PONTO_DIM[size]} ${PONTO[presenca]} ${pulsar ? "ponto-vivo" : ""}`} />
      </span>
    );
  }
  return <AvatarBase nome={nome} foto={foto} size={size} className={className} />;
}

function AvatarBase({ nome, foto, size, className }: { nome: string; foto?: string | null; size: keyof typeof DIM; className: string }) {
  // A foto que FALHOU ao carregar (cai nas iniciais); outra foto (nova URL) volta a ser tentada.
  const [falhou, setFalhou] = useState<string | null>(null);

  if (foto && foto !== falhou) {
    return (
      // biome-ignore lint/performance/noImgElement: a foto é a URL da rota da foto (cache por versão) ou o data-URL recém-escolhido no Perfil; next/image não agrega nada aqui.
      <img
        src={foto}
        alt={nome}
        title={nome}
        loading="lazy"
        decoding="async"
        onError={() => setFalhou(foto)}
        className={`${DIM[size]} shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      title={nome}
      style={{ background: avatarVar(nome) }}
      className={`flex ${DIM[size]} shrink-0 items-center justify-center rounded-full font-bold text-white ${className}`}
    >
      {iniciais(nome)}
    </div>
  );
}
