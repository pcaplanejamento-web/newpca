"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IconSpinner } from "./icons";

// Botão do design system (spec §6.8), 100% por token. Substitui a recipe
// `bg-emerald-600 …` repetida. Primário = ação neutra (--text); ícone/secundário
// em superfície. Altura pela densidade (--h-control); foco visível.
type Variant = "primary" | "secondary" | "icon" | "ghost" | "accent";

const VARIANT: Record<Variant, string> = {
  primary: "bg-text text-surface hover:opacity-90",
  secondary: "border border-border-2 bg-surface text-text hover:bg-surface-2",
  icon: "border border-border-2 bg-surface text-text-2 hover:bg-surface-2",
  ghost: "text-text-2 hover:bg-surface-2",
  accent: "bg-accent text-white shadow-accent hover:brightness-[1.06]",
};

type Props = {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  href?: string;
  children?: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">;

export function Button({
  variant = "primary",
  loading = false,
  icon,
  href,
  children,
  className = "",
  type,
  ...rest
}: Props) {
  const isIcon = variant === "icon";
  const cls = `inline-flex h-[var(--h-control)] shrink-0 items-center justify-center gap-2 rounded-control text-[13.5px] font-semibold transition-[background-color,opacity,box-shadow] duration-[var(--motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-60 ${
    isIcon ? "w-[var(--h-control)]" : "px-4"
  } ${VARIANT[variant]} ${className}`;
  const inner = loading ? (
    <IconSpinner className="h-[18px] w-[18px]" />
  ) : (
    <>
      {icon}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button className={cls} type={type ?? "button"} {...rest}>
      {inner}
    </button>
  );
}
