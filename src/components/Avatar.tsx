"use client";

import { useState } from "react";
import { avatarVar } from "@/lib/semantic";

// Avatar: mostra a foto cadastrada; sem foto (ou se falhar), cai para as
// iniciais sobre a cor da pessoa (token semântico §3, via avatarVar) — mesma
// pessoa → mesma cor, e o ADM pode trocar a paleta nos tokens.

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/u).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const DIM = {
  sm: "h-[26px] w-[26px] text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-[34px] w-[34px] text-[13px]",
  xl: "h-20 w-20 text-xl",
} as const;

export function Avatar({
  nome,
  foto,
  size = "md",
  className = "",
}: {
  nome: string;
  foto?: string | null;
  size?: keyof typeof DIM;
  className?: string;
}) {
  const [erro, setErro] = useState(false);

  if (foto && !erro) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      // biome-ignore lint/performance/noImgElement: foto é data-URL base64 redimensionada no cliente; next/image não otimiza data-URL.
      <img
        src={foto}
        alt={nome}
        title={nome}
        onError={() => setErro(true)}
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
