"use client";

import { useState } from "react";

// Avatar: mostra a foto cadastrada; sem foto (ou se falhar o carregamento),
// cai para as iniciais com cor determinística (mesma pessoa → mesma cor).
const CORES = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/u).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const DIM = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
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
      <img
        src={foto}
        alt={nome}
        title={nome}
        onError={() => setErro(true)}
        className={`${DIM[size]} shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  const cor = CORES[hash(nome) % CORES.length];
  return (
    <div
      title={nome}
      className={`flex ${DIM[size]} shrink-0 items-center justify-center rounded-full font-bold ${cor} ${className}`}
    >
      {iniciais(nome)}
    </div>
  );
}
