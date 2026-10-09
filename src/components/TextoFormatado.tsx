"use client";

import { Fragment, type ReactNode, useMemo, useRef, useState } from "react";
import { type AcaoTexto, aplicarAcaoTexto, type Bloco, type Inline, lerTextoFormatado } from "@/lib/texto-formatado";
import { IconBold, IconCode, IconHeading, IconItalic, IconLink, IconList, IconListOrdered, IconPencil, IconQuote } from "./icons";
import { LinkExterno } from "./LinkExterno";
import { Segmented } from "./Segmented";

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

function BlocoTexto({ b }: { b: Bloco }) {
  switch (b.t) {
    case "par":
      return (
        <p>
          <Trechos f={b.f} />
        </p>
      );
    case "titulo":
      return (
        <p className={`font-bold text-text ${b.n === 1 ? "text-[16px]" : b.n === 2 ? "text-[14.5px]" : "text-[13.5px]"}`}>
          <Trechos f={b.f} />
        </p>
      );
    case "lista": {
      const Tag = b.ordenada ? "ol" : "ul";
      return (
        <Tag className={`space-y-0.5 pl-5 ${b.ordenada ? "list-decimal" : "list-disc"}`}>
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
        <blockquote className="border-l-2 border-border-2 pl-3 text-muted">
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

const ACOES: { acao: AcaoTexto; rotulo: string; icone: ReactNode }[] = [
  { acao: "titulo", rotulo: "Título", icone: <IconHeading className="h-4 w-4" /> },
  { acao: "negrito", rotulo: "Negrito (Ctrl+B)", icone: <IconBold className="h-4 w-4" /> },
  { acao: "italico", rotulo: "Itálico (Ctrl+I)", icone: <IconItalic className="h-4 w-4" /> },
  { acao: "lista", rotulo: "Lista", icone: <IconList className="h-4 w-4" /> },
  { acao: "numerada", rotulo: "Lista numerada", icone: <IconListOrdered className="h-4 w-4" /> },
  { acao: "citacao", rotulo: "Citação", icone: <IconQuote className="h-4 w-4" /> },
  { acao: "codigo", rotulo: "Código", icone: <IconCode className="h-4 w-4" /> },
  { acao: "link", rotulo: "Link", icone: <IconLink className="h-4 w-4" /> },
];

/**
 * EDITOR de texto formatado: a barra (título · negrito · itálico · listas · citação · código · link — envolve a seleção
 * ou insere a marcação; Ctrl+B/Ctrl+I) sobre a caixa de texto e a alternância **Escrever | Visualizar** (a prévia é o
 * mesmo `TextoFormatado`). Controlado (`valor`/`onChange`).
 */
export function EditorTexto({
  valor,
  onChange,
  rotulo,
  placeholder,
  maxLength,
  rows = 5,
  disabled = false,
  autoFocus = false,
}: {
  valor: string;
  onChange: (v: string) => void;
  /** O nome acessível da caixa de texto. */
  rotulo: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [modo, setModo] = useState<"escrever" | "ver">("escrever");
  const campo = useRef<HTMLTextAreaElement>(null);
  const agir = (acao: AcaoTexto) => {
    const el = campo.current;
    const r = aplicarAcaoTexto(valor, el?.selectionStart ?? valor.length, el?.selectionEnd ?? valor.length, acao);
    if (maxLength && r.texto.length > maxLength) return;
    onChange(r.texto);
    requestAnimationFrame(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(r.ini, r.fim);
    });
  };
  return (
    <div className="rounded-control border border-border-2 bg-surface transition-[border-color,box-shadow] duration-[var(--motion-duration)] focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/20">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-1">
        {modo === "escrever" &&
          ACOES.map((a) => (
            <button
              key={a.acao}
              type="button"
              disabled={disabled}
              aria-label={a.rotulo}
              title={a.rotulo}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => agir(a.acao)}
              className="grid h-11 w-11 place-items-center rounded-control text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40 lg:h-8 lg:w-8"
            >
              {a.icone}
            </button>
          ))}
        <div className="ml-auto">
          <Segmented<"escrever" | "ver">
            ariaLabel="Escrever ou visualizar"
            value={modo}
            onChange={setModo}
            options={[
              { value: "escrever", label: "Escrever" },
              { value: "ver", label: "Visualizar" },
            ]}
          />
        </div>
      </div>
      {modo === "escrever" ? (
        <textarea
          ref={campo}
          value={valor}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          // biome-ignore lint/a11y/noAutofocus: abre para escrever depois de a pessoa tocar em "editar".
          autoFocus={autoFocus}
          aria-label={rotulo}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const k = e.key.toLowerCase();
            if (k === "b" || k === "i") {
              e.preventDefault();
              agir(k === "b" ? "negrito" : "italico");
            }
          }}
          className="block w-full resize-y bg-transparent px-3 py-2 text-[13px] leading-relaxed text-text outline-none placeholder:text-faint"
        />
      ) : (
        <div className="min-h-[6rem] px-3 py-2">
          <TextoFormatado texto={valor} vazio={<p className="text-[12.5px] text-faint">Nada para visualizar.</p>} />
        </div>
      )}
    </div>
  );
}

/**
 * Um CAMPO de texto formatado que se LÊ formatado e se EDITA no lugar (a descrição e as notas da tarefa, como no Trello):
 * tocar no texto (ou em "Editar") abre o `EditorTexto`; "Pronto" volta à leitura. Vazio = o convite `vazio` (abre o
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
        <EditorTexto valor={valor} onChange={onChange} rotulo={rotulo} placeholder={placeholder} maxLength={maxLength} autoFocus />
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
