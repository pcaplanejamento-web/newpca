"use client";

import { Fragment, type ReactNode, useMemo, useState } from "react";
import { type Alinhamento, type Bloco, CSS_ALINHAMENTO, type Inline, lerTextoFormatado } from "@/lib/texto-formatado";
import { EditorRico } from "./EditorRico";
import { IconPencil } from "./icons";
import { LinkExterno } from "./LinkExterno";

function Trechos({ f }: { f: Inline[] }) {
  return (
    <>
      {f.map((n, i) => {
        switch (n.t) {
          case "texto":
            return <Fragment key={i}>{n.v}</Fragment>;
          case "quebra":
            return <br key={i} />;
          case "negrito":
            return (
              <strong key={i} className="font-semibold text-text">
                <Trechos f={n.f} />
              </strong>
            );
          case "italico":
            return (
              <em key={i}>
                <Trechos f={n.f} />
              </em>
            );
          case "codigo":
            return (
              <code key={i} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.92em] text-text">
                {n.v}
              </code>
            );
          case "link":
            return (
              <LinkExterno key={i} variante="texto" href={n.href} className="break-all">
                <Trechos f={n.f} />
              </LinkExterno>
            );
          default:
            return (
              <span key={i} className="font-semibold text-accent">
                {n.v}
              </span>
            );
        }
      })}
    </>
  );
}

/** O alinhamento do bloco (só quando não é o padrão, à esquerda). */
const alinhar = (al: Alinhamento | undefined) => (al && al !== "esquerda" ? { textAlign: CSS_ALINHAMENTO[al] as "center" | "right" | "justify" } : undefined);

function BlocoTexto({ b }: { b: Bloco }) {
  switch (b.t) {
    case "par":
      return (
        <p style={alinhar(b.al)}>
          <Trechos f={b.f} />
        </p>
      );
    case "titulo":
      return (
        <p style={alinhar(b.al)} className={`font-bold text-text ${b.n === 1 ? "text-[16px]" : b.n === 2 ? "text-[14.5px]" : "text-[13.5px]"}`}>
          <Trechos f={b.f} />
        </p>
      );
    case "lista": {
      const Tag = b.ordenada ? "ol" : "ul";
      return (
        <Tag start={b.ordenada ? b.inicio : undefined} style={alinhar(b.al)} className={`space-y-0.5 pl-5 ${b.ordenada ? "list-decimal" : "list-disc"}`}>
          {b.itens.map((f, i) => (
            <li key={i}>
              <Trechos f={f} />
            </li>
          ))}
        </Tag>
      );
    }
    case "citacao":
      return (
        <blockquote style={alinhar(b.al)} className="border-l-2 border-border-2 pl-3 text-muted">
          <Trechos f={b.f} />
        </blockquote>
      );
    case "separador":
      return <hr className="border-border" />;
  }
}

/**
 * O TEXTO FORMATADO desenhado (descrição, notas e comentários das tarefas): títulos, listas, citação, negrito, itálico,
 * código, links http(s) e @menções — por elementos React (o texto nunca vira HTML cru). `vazio` = o que mostrar sem texto.
 */
export function TextoFormatado({ texto, vazio = null, className = "" }: { texto: string | null | undefined; vazio?: ReactNode; className?: string }) {
  const blocos = useMemo(() => lerTextoFormatado(texto), [texto]);
  if (!blocos.length) return <>{vazio}</>;
  return (
    <div className={`space-y-2 break-words text-[13px] leading-relaxed text-text-2 ${className}`}>
      {blocos.map((b, i) => (
        <BlocoTexto key={i} b={b} />
      ))}
    </div>
  );
}

/**
 * Um CAMPO de texto formatado que se LÊ formatado e se EDITA no lugar (a descrição e as notas da tarefa, como no Trello):
 * tocar no texto (ou em "Editar") abre o `EditorRico compacto` (o mesmo editor do sistema); "Pronto" volta à leitura. Vazio = o convite `vazio` (abre o
 * editor). Controlado — o valor é do host (o rascunho da tarefa).
 */
export function CampoTextoFormatado({
  valor,
  onChange,
  rotulo,
  vazio,
  placeholder,
  maxLength,
  disabled = false,
  iniciarEditando = false,
}: {
  valor: string;
  onChange: (v: string) => void;
  rotulo: string;
  /** O convite com o campo vazio (ex.: "Adicione uma descrição mais detalhada…"). */
  vazio: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  iniciarEditando?: boolean;
}) {
  const [editando, setEditando] = useState(iniciarEditando);
  if (editando && !disabled)
    return (
      <div className="space-y-2">
        <EditorRico compacto autoFocus valor={valor} onChange={onChange} rotulo={rotulo} placeholder={placeholder} maxLength={maxLength} />
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="inline-flex h-11 items-center rounded-control bg-accent px-3 text-[13px] font-semibold text-white hover:brightness-95 lg:h-[var(--h-control-sm)]"
        >
          Pronto
        </button>
      </div>
    );
  if (!valor.trim())
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditando(true)}
        className="block min-h-11 w-full rounded-control bg-surface-2 px-3 py-3 text-left text-[13px] text-muted transition-colors hover:bg-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default"
      >
        {vazio}
      </button>
    );
  // Leitura: tocar no texto edita (os LINKS do texto abrem normalmente); o lápis é o caminho do teclado.
  return (
    <div className="group/campo relative rounded-control px-2 py-1.5 transition-colors hover:bg-surface-2">
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: tocar no texto é o atalho do ponteiro — o teclado edita pelo lápis ao lado, e os links do texto seguem focáveis (um botão em volta deles não pode) */}
      <div
        onClick={(e) => {
          if (!disabled && !(e.target as HTMLElement).closest("a")) setEditando(true);
        }}
        className={disabled ? "" : "cursor-text"}
      >
        <TextoFormatado texto={valor} />
      </div>
      {!disabled && (
        <button
          type="button"
          aria-label={`Editar ${rotulo.toLowerCase()}`}
          onClick={() => setEditando(true)}
          className="absolute top-1 right-1 grid h-11 w-11 place-items-center rounded-control text-muted opacity-0 transition-opacity hover:bg-surface focus-visible:opacity-100 group-hover/campo:opacity-100 any-pointer-coarse:opacity-100 lg:h-8 lg:w-8"
        >
          <IconPencil className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
