"use client";

import { type InputHTMLAttributes, type ReactNode, useId, useState } from "react";
import { IconCheck, IconClose, IconEye, IconEyeOff, IconLock, IconSearch } from "./icons";

// Campos de formulário do design system (spec do usuário — prints do login):
// rótulo forte, superfície preenchida, ícone à esquerda, **anel de foco accent**
// (glow suave), toque ≥44px. Tudo por token; sem cor hardcoded. Reutilizado em
// Auth, Perfil, filtros e onde houver entrada de texto.
type CampoProps = {
  label?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  hint?: ReactNode;
  error?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size">;

const WRAP =
  "flex items-center gap-2.5 rounded-control border bg-surface-2 px-3.5 transition-[border-color,box-shadow,background-color] duration-[var(--motion-duration)] focus-within:border-accent focus-within:bg-surface focus-within:ring-4 focus-within:ring-accent/20";
const INPUT =
  "min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-faint";

export function TextField({ label, icon, trailing, hint, error, id, ...rest }: CampoProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div>
      {label && (
        <label htmlFor={fid} className="mb-2 block text-[13.5px] font-bold text-text">
          {label}
        </label>
      )}
      <div className={`${WRAP} h-[54px] ${error ? "border-[var(--sit-devolvido)]" : "border-border-2"}`}>
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        <input id={fid} className={INPUT} {...rest} />
        {trailing}
      </div>
      {error ? (
        <p className="mt-1.5 text-[12px] font-medium text-[var(--sit-devolvido)]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

// Campo de senha: cadeado + botão de mostrar/ocultar (olho).
export function PasswordField({ label = "Senha", ...rest }: Omit<CampoProps, "icon" | "trailing" | "type">) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      label={label}
      icon={<IconLock className="h-5 w-5" />}
      type={show ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="-mr-1 shrink-0 rounded-chip p-1.5 text-muted transition-colors hover:text-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {show ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
        </button>
      }
      {...rest}
    />
  );
}

// Barra de pesquisa: ícone de busca + limpar (aparece com texto). Mesma
// linguagem visual, um pouco mais baixa (uso em toolbars).
export function SearchField({
  value,
  onClear,
  placeholder = "Pesquisar…",
  ...rest
}: CampoProps & { onClear?: () => void }) {
  const preenchido = typeof value === "string" && value.length > 0;
  return (
    <div className={`${WRAP} h-[46px] border-border-2`}>
      <IconSearch className="h-[18px] w-[18px] shrink-0 text-muted" />
      <input value={value} placeholder={placeholder} type="search" className={INPUT} {...rest} />
      {preenchido && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpar busca"
          className="shrink-0 rounded-chip p-1 text-muted transition-colors hover:text-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <IconClose className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Checkbox do design system (accent arredondado + check). Controlado.
export function Checkbox({
  label,
  checked,
  id,
  ...rest
}: {
  label?: ReactNode;
  checked?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type" | "checked">) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className="inline-flex cursor-pointer select-none items-center gap-2.5">
      <input id={cid} type="checkbox" checked={checked} className="peer sr-only" {...rest} />
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border transition-colors duration-[var(--motion-duration)] peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 ${
          checked ? "border-accent bg-accent text-white" : "border-border-2 bg-surface"
        }`}
      >
        {checked && <IconCheck className="h-3.5 w-3.5" />}
      </span>
      {label && <span className="text-[14px] text-text-2">{label}</span>}
    </label>
  );
}
