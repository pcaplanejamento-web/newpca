"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { brl, num } from "@/lib/format";
import { parseNumberBR } from "@/lib/normalize";
import { cellCls } from "./formStyles";
import { IconLock, IconLockOpen } from "./icons";
import { toast } from "./Toast";

/**
 * Primitivos de CAMPO COM CADEADO (POR CAMPO) — a mesma lógica dos itens (`ItemDetalhe`),
 * reusada na capa do protocolo (`CapaCampos`) e no cabeçalho do DFD (`DfdConferir`).
 * Cada campo começa só-leitura; um cadeado próprio o destrava para edição. Um campo
 * pode ser **bloqueado** (identificador/igual ao catálogo) — o cadeado avisa e não abre. Na CONSULTA
 * (Dashboard do PCA, público) os campos ficam **congelados** (`CampoCongelado`): só a caixa do campo, SEM
 * cadeado. Só tokens/componentes do design-system.
 */

/** Número → string editável em pt-BR (vírgula decimal, sem separador de milhar). */
export function fmtNumEdit(v: number | null | undefined): string {
  return v == null ? "" : String(v).replace(".", ",");
}

/**
 * Estado dos cadeados por campo (conjunto de campos abertos). O predicado de bloqueio é do
 * host (identificador, igual ao catálogo…): passe a mensagem de bloqueio para `alternar`.
 */
export function useCadeados<K extends string>() {
  const [abertos, setAbertos] = useState<Set<K>>(new Set());
  const alternar = (campo: K, bloqueio?: string | false) => {
    if (bloqueio) {
      toast.error(bloqueio);
      return;
    }
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(campo)) n.delete(campo);
      else n.add(campo);
      return n;
    });
  };
  return { abertos, alternar, setAbertos };
}

/** O CADEADO de um campo/seção: fechado = só-leitura; aberto = editando. Alvo compacto (dentro de
 * rótulos); o `title` explica o estado (inclusive "bloqueado"). Reusado por campos e seções do DFD. */
export function CadeadoBotao({
  rotulo,
  aberto,
  bloqueado = false,
  onClick,
}: {
  rotulo: string;
  aberto: boolean;
  bloqueado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Visual compacto (28px, cabe no rótulo) com ÁREA DE TOQUE de 44px (pseudo-elemento -inset-2).
      className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-muted transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-surface-2 hover:text-text"
      aria-label={aberto ? `Travar ${rotulo}` : `Destravar ${rotulo}`}
      aria-pressed={aberto}
      title={bloqueado ? "Bloqueado — não pode alterar" : aberto ? "Travar" : "Destravar para editar"}
    >
      {aberto && !bloqueado ? <IconLockOpen className="h-3.5 w-3.5 text-accent" /> : <IconLock className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * Campo CONGELADO (consulta): rótulo + o valor na CAIXA do campo — a mesma aparência de um campo de edição,
 * sem cadeado (discreto). Usado pela consulta do PCA (capa, DFD, item).
 */
export function CampoCongelado({
  label,
  valor,
  span,
  mono,
  forte,
}: {
  label: string;
  valor: string | null | undefined;
  span?: boolean;
  mono?: boolean;
  forte?: boolean;
}) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div
        className={`min-h-[40px] whitespace-pre-line break-words rounded-control border border-border bg-surface-2 px-3 py-2 leading-snug text-text ${
          mono ? "font-mono text-[13px]" : "text-sm"
        } ${forte ? "font-bold" : "font-medium"}`}
      >
        {valor || "—"}
      </div>
    </div>
  );
}

/** Rótulo + cadeado por campo (quando editável) + conteúdo (só-leitura ou input). */
export function LinhaCampo({
  label,
  span,
  editavel,
  aberto,
  bloqueado,
  onLock,
  children,
}: {
  label: string;
  span?: boolean;
  editavel: boolean;
  aberto: boolean;
  bloqueado: boolean;
  onLock: () => void;
  children: ReactNode;
}) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        {editavel && <CadeadoBotao rotulo={label} aberto={aberto} bloqueado={bloqueado} onClick={onLock} />}
      </div>
      {children}
    </div>
  );
}

/** Campo de texto: só-leitura, ou input/textarea quando destravado. */
export function CampoTexto({
  label,
  valor,
  onChange,
  editavel,
  aberto,
  bloqueado,
  onLock,
  span,
  mono,
  multi,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  editavel: boolean;
  aberto: boolean;
  bloqueado: boolean;
  onLock: () => void;
  span?: boolean;
  mono?: boolean;
  multi?: boolean;
}) {
  const editando = editavel && aberto && !bloqueado;
  return (
    <LinhaCampo label={label} span={span} editavel={editavel} aberto={aberto} bloqueado={bloqueado} onLock={onLock}>
      {editando ? (
        multi ? (
          <AutoTextarea value={valor} onChange={onChange} mono={mono} />
        ) : (
          <input
            className={`${cellCls} ${mono ? "font-mono" : ""}`}
            value={valor}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      ) : (
        <div
          className={`mt-0.5 break-words leading-snug font-semibold text-text ${mono ? "font-mono text-[13px]" : "text-sm"}`}
        >
          {valor || "—"}
        </div>
      )}
    </LinhaCampo>
  );
}

/** Campo de SELEÇÃO (lista fechada, ex.: assunto do protocolo): só-leitura, ou `<select>` quando destravado. */
export function CampoSelecao({
  label,
  valor,
  opcoes,
  onChange,
  editavel,
  aberto,
  bloqueado,
  onLock,
  span,
}: {
  label: string;
  valor: string;
  opcoes: string[];
  onChange: (v: string) => void;
  editavel: boolean;
  aberto: boolean;
  bloqueado: boolean;
  onLock: () => void;
  span?: boolean;
}) {
  const editando = editavel && aberto && !bloqueado;
  return (
    <LinhaCampo label={label} span={span} editavel={editavel} aberto={aberto} bloqueado={bloqueado} onLock={onLock}>
      {editando ? (
        <select className={cellCls} value={valor} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Selecione —</option>
          {opcoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <div className="mt-0.5 break-words text-sm font-semibold leading-snug text-text">{valor || "—"}</div>
      )}
    </LinhaCampo>
  );
}

/** Campo numérico (quantidade/valores): só-leitura formatado, ou input quando destravado. */
export function CampoNumero({
  label,
  valor,
  onChange,
  editavel,
  aberto,
  bloqueado,
  onLock,
  span,
  moeda,
  forte,
}: {
  label: string;
  valor: number | null | undefined;
  onChange: (v: number | null) => void;
  editavel: boolean;
  aberto: boolean;
  bloqueado: boolean;
  onLock: () => void;
  span?: boolean;
  moeda?: boolean;
  forte?: boolean;
}) {
  const editando = editavel && aberto && !bloqueado;
  const texto = valor == null ? "—" : moeda ? brl(valor) : num(valor);
  return (
    <LinhaCampo label={label} span={span} editavel={editavel} aberto={aberto} bloqueado={bloqueado} onLock={onLock}>
      {editando ? (
        <NumInput valor={valor} onChange={onChange} />
      ) : (
        <div className={`mt-0.5 break-words leading-snug text-text ${forte ? "text-base font-bold" : "text-sm font-semibold"}`}>
          {texto}
        </div>
      )}
    </LinhaCampo>
  );
}

/** Input numérico com RASCUNHO local (aceita "8.000,50" enquanto digita) → número parseado. */
export function NumInput({ valor, onChange }: { valor: number | null | undefined; onChange: (v: number | null) => void }) {
  const [raw, setRaw] = useState(() => fmtNumEdit(valor));
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: foca ao destravar o campo (ação deliberada do usuário).
      autoFocus
      className={cellCls}
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(parseNumberBR(e.target.value));
      }}
    />
  );
}

/** Textarea que CRESCE com o conteúdo (altura = scrollHeight) — mostra o texto INTEIRO, sem cortar. */
export function AutoTextarea({
  value,
  onChange,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: precisa RE-executar a cada mudança de `value` para reajustar a altura ao conteúdo.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      // biome-ignore lint/a11y/noAutofocus: foca ao destravar o campo (ação deliberada do usuário).
      autoFocus
      className={`${cellCls} resize-none overflow-hidden leading-snug ${mono ? "font-mono" : ""}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
