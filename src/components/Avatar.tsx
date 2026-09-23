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
