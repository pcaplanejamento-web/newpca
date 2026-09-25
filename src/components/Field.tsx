"use client";

import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId, useState } from "react";
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

/** Seleção no MESMO visual do `TextField` (rótulo forte + caixa de 54px, foco accent): um `<select>` nativo — no celular
 * abre o seletor do próprio aparelho. As opções vêm como `children`. */
export function SelectField({
  label,
  hint,
  id,
  children,
  ...rest
}: { label?: string; hint?: ReactNode; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div>
      {label && (
        <label htmlFor={fid} className="mb-2 block text-[13.5px] font-bold text-text">
          {label}
        </label>
      )}
      <div className={`${WRAP} h-[54px] border-border-2`}>
        <select id={fid} className={`${INPUT} h-full cursor-pointer disabled:cursor-default disabled:opacity-60`} {...rest}>
          {children}
        </select>
      </div>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
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
  compacto = false,
  ...rest
}: CampoProps & {
  onClear?: () => void;
  /** Compacto (barras de ferramentas, ao lado de `Button size="sm"`): `--h-control-sm` no desktop, 44px no toque. */
  compacto?: boolean;
}) {
  const preenchido = typeof value === "string" && value.length > 0;
  return (
    <div className={`${WRAP} ${compacto ? "h-11 !px-3 lg:h-[var(--h-control-sm)]" : "h-[46px]"} border-border-2`}>
      <IconSearch className={`${compacto ? "h-4 w-4" : "h-[18px] w-[18px]"} shrink-0 text-muted`} />
      <input value={value} placeholder={placeholder} type="search" className={`${INPUT} ${compacto ? "!text-[13px]" : ""}`} {...rest} />
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

// Área de texto multi-linha (mesma linguagem do TextField: superfície + foco accent).
export function TextArea({
  label,
  hint,
  error,
  id,
  rows = 4,
  ...rest
}: {
  label?: string;
  hint?: ReactNode;
  error?: string;
  rows?: number;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "rows">) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div>
      {label && (
        <label htmlFor={fid} className="mb-2 block text-[13.5px] font-bold text-text">
          {label}
        </label>
      )}
      <textarea
        id={fid}
        rows={rows}
        className={`w-full resize-y rounded-control border bg-surface-2 px-3.5 py-2.5 text-[15px] leading-snug text-text outline-none transition-[border-color,box-shadow,background-color] duration-[var(--motion-duration)] placeholder:text-faint focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/20 ${
          error ? "border-[var(--sit-devolvido)]" : "border-border-2"
        }`}
        {...rest}
      />
      {error ? (
        <p className="mt-1.5 text-[12px] font-medium text-[var(--sit-devolvido)]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Campo com VÁRIOS valores (ex.: os nºs de contrato/ARP/licitação de um DFD-R): cada valor vira um chip
 * removível e a entrada acrescenta outro (Enter, "," ou ";" — colar "1/2024; 2/2024" acrescenta todos;
 * sair do campo também confirma o que foi digitado). Sem repetidos. `disabled` = só os chips. Mesma
 * linguagem do `TextField` (superfície + foco accent); alvos de toque ≥44px.
 */
export function CampoLista({
  label,
  valores,
  onChange,
  placeholder,
  disabled = false,
  maxItem = 60,
  id,
}: {
  label?: string;
  valores: string[];
  onChange: (valores: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Tamanho máximo de CADA valor. */
  maxItem?: number;
  id?: string;
}) {
  const auto = useId();
  const fid = id ?? auto;
  const [texto, setTexto] = useState("");
  const acrescentar = (bruto: string) => {
    const novos = bruto
      .split(/[;,]/)
      .map((t) => t.replace(/\s+/g, " ").trim().slice(0, maxItem))
      .filter(Boolean);
    if (novos.length === 0) return;
    const lista = [...valores];
    for (const n of novos) if (!lista.some((x) => x.toUpperCase() === n.toUpperCase())) lista.push(n);
    if (lista.length !== valores.length) onChange(lista);
    setTexto("");
  };
  return (
    <div>
      {label && (
        <label htmlFor={fid} className="mb-2 block text-[13.5px] font-bold text-text">
          {label}
        </label>
      )}
      <div className={`${WRAP} min-h-[54px] flex-wrap border-border-2 py-2 ${disabled ? "opacity-80" : ""}`}>
        {valores.map((v) => (
          <span
            key={v}
            className="inline-flex h-8 max-w-full items-center gap-0.5 rounded-chip border border-border-2 bg-surface pl-2.5 pr-0.5 font-mono text-[12.5px] text-text"
          >
            <span className="truncate">{v}</span>
            {!disabled && (
              <button
                type="button"
                aria-label={`Remover ${v}`}
                onClick={() => onChange(valores.filter((x) => x !== v))}
                className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text after:absolute after:-inset-2 after:content-['']"
              >
                <IconClose className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
        {disabled ? (
          valores.length === 0 && <span className="text-[15px] text-faint">—</span>
        ) : (
          <input
            id={fid}
            className={`${INPUT} min-w-[7rem]`}
            value={texto}
            maxLength={maxItem * 4}
            placeholder={valores.length > 0 ? "Adicionar outro" : placeholder}
            onChange={(e) => {
              const v = e.target.value;
              if (/[;,]/.test(v)) acrescentar(v);
              else setTexto(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                acrescentar(texto);
              } else if (e.key === "Backspace" && !texto && valores.length > 0) {
                onChange(valores.slice(0, -1)); // apaga o último chip (como num campo de tags)
              }
            }}
            onBlur={() => acrescentar(texto)}
            enterKeyHint="done"
          />
        )}
      </div>
    </div>
  );
}
