"use client";

import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { num } from "@/lib/format";
import { ESTILOS_BLOCO, type EstiloBloco, estiloDoBloco, escaparHtml, htmlDoTexto, textoDoHtml } from "@/lib/texto-rico-core";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { TextField } from "./Field";
import {
  IconBold,
  IconCheck,
  IconCode,
  IconItalic,
  IconLimparFormato,
  IconLink,
  IconList,
  IconListOrdered,
  IconMenos,
  IconQuote,
  IconRedo,
  IconUndo,
} from "./icons";
import { SetaDropdown } from "./SetaDropdown";

/** As classes do CONTEÚDO (a mesma aparência no editor e na folha) — títulos, listas, citação, código, links. */
const CONTEUDO =
  "text-[15px] leading-[1.7] text-text [&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-[22px] [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[18px] [&_h2]:font-bold [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[16px] [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5 [&_blockquote]:my-3 [&_blockquote]:border-l-[3px] [&_blockquote]:border-border-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_hr]:my-5 [&_hr]:border-border [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_a]:text-accent [&_a]:underline [&_strong]:font-bold [&_>*:first-child]:mt-0";

type Estado = { negrito: boolean; italico: boolean; lista: boolean; numerada: boolean; bloco: EstiloBloco };
const ESTADO_INICIAL: Estado = { negrito: false, italico: false, lista: false, numerada: false, bloco: "p" };

function exec(cmd: string, arg?: string) {
  // O `execCommand` segue o único jeito de editar com o desfazer nativo do navegador (Ctrl+Z) em todos os navegadores.
  document.execCommand(cmd, false, arg);
}

/** Um botão da barra (o clique NÃO tira a seleção do texto — `onMouseDown` evita o foco). */
function BotaoBarra({ rotulo, atalho, ativo = false, onClick, children, disabled }: { rotulo: string; atalho?: string; ativo?: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      aria-pressed={ativo}
      title={atalho ? `${rotulo} (${atalho})` : rotulo}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-control transition-colors lg:h-8 lg:w-8 disabled:opacity-40 ${ativo ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-surface-2 hover:text-text"}`}
    >
      {children}
    </button>
  );
}

const Divisor = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;

/**
 * EDITOR VISUAL de texto (como num editor de documentos): escreve-se e vê-se o resultado na hora — títulos, negrito,
 * itálico, listas, citação, código, links, separador, desfazer/refazer e limpar formatação, com os atalhos de sempre
 * (Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+Z, Ctrl+Y, Ctrl+Alt+1/2/3, Ctrl+Shift+7/8). Controlado (`valor`/`onChange`): grava o
 * TEXTO FORMATADO de sempre (`texto-rico-core.ts`) — o colado de outros programas fica só com o que o formato conhece.
 */
export function EditorRico({
  valor,
  onChange,
  rotulo,
  maxLength,
  placeholder = "Comece a escrever…",
  altura = "min-h-[50vh] max-h-[70vh]",
  disabled = false,
}: {
  valor: string;
  onChange: (v: string) => void;
  rotulo: string;
  maxLength?: number;
  placeholder?: string;
  /** As classes de altura da folha (rola por dentro). */
  altura?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ultimo = useRef<string | null>(null);
  const selecao = useRef<Range | null>(null);
  const [estado, setEstado] = useState<Estado>(ESTADO_INICIAL);
  const [vazio, setVazio] = useState(!valor.trim());
  const [link, setLink] = useState<string | null>(null);
  const [focado, setFocado] = useState(false);

  // O valor de FORA (carga, "voltar ao modelo") redesenha a folha; o que o próprio editor emitiu, não (o cursor fica).
  useEffect(() => {
    const el = ref.current;
    if (!el || valor === ultimo.current) return;
    el.innerHTML = htmlDoTexto(valor);
    ultimo.current = valor;
    setVazio(!valor.trim());
  }, [valor]);

  const emitir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const t = textoDoHtml(el);
    setVazio(!t.trim());
    if (t === ultimo.current) return;
    ultimo.current = t;
    onChange(t);
  }, [onChange]);

  const atualizarEstado = useCallback(() => {
    const el = ref.current;
    const sel = document.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    selecao.current = sel.getRangeAt(0).cloneRange();
    setEstado({
      negrito: document.queryCommandState("bold"),
      italico: document.queryCommandState("italic"),
      lista: document.queryCommandState("insertUnorderedList"),
      numerada: document.queryCommandState("insertOrderedList"),
      bloco: estiloDoBloco(String(document.queryCommandValue("formatBlock") ?? "")),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", atualizarEstado);
    return () => document.removeEventListener("selectionchange", atualizarEstado);
  }, [atualizarEstado]);

  /** Volta o foco e a seleção ao texto (um seletor ou o campo do link levaram o foco). */
  const restaurar = () => {
    const el = ref.current;
    if (!el) return;
    // Com o cursor JÁ no texto (os botões não tiram o foco), nada a repor — repor apagaria o estilo de digitação (ex.:
    // desligar o itálico antes de continuar escrevendo).
    const atual = document.getSelection();
    if (document.activeElement === el && atual && atual.rangeCount > 0 && el.contains(atual.anchorNode)) return;
    el.focus();
    const r = selecao.current;
    const sel = document.getSelection();
    if (r && sel && el.contains(r.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  const aplicar = (cmd: string, arg?: string) => {
    if (disabled) return;
    restaurar();
    exec(cmd, arg);
    emitir();
    atualizarEstado();
  };

  const bloco = (v: EstiloBloco) => {
    // Sair de uma lista antes de virar título/citação (o navegador não converte <li> em bloco).
    restaurar();
    if (document.queryCommandState("insertUnorderedList")) exec("insertUnorderedList");
    if (document.queryCommandState("insertOrderedList")) exec("insertOrderedList");
    aplicar("formatBlock", `<${v}>`);
  };

  const codigo = () => {
    restaurar();
    const t = document.getSelection()?.toString() ?? "";
    if (!t) return;
    aplicar("insertHTML", `<code>${escaparHtml(t.replace(/\n/g, " "))}</code>&#8203;`);
  };

  const confirmarLink = () => {
    const url = (link ?? "").trim();
    setLink(null);
    if (!/^https?:\/\/[^\s<>"]+$/i.test(url)) return;
    restaurar();
    const t = document.getSelection()?.toString();
    if (t) aplicar("createLink", url);
    else aplicar("insertHTML", `<a href="${escaparHtml(url)}">${escaparHtml(url)}</a>&#8203;`);
  };

  const limpar = () => {
    restaurar();
    exec("unlink");
    exec("removeFormat");
    aplicar("formatBlock", "<p>");
  };

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "k") {
      e.preventDefault();
      atualizarEstado();
      setLink("https://");
    } else if (e.altKey && ["1", "2", "3"].includes(e.key)) {
      e.preventDefault();
      bloco(`h${e.key}` as EstiloBloco);
    } else if (e.altKey && e.key === "0") {
      e.preventDefault();
      bloco("p");
    } else if (e.shiftKey && (e.code === "Digit7" || e.code === "Digit8")) {
      e.preventDefault();
      aplicar(e.code === "Digit7" ? "insertOrderedList" : "insertUnorderedList");
    }
  }

  const rotuloBloco = ESTILOS_BLOCO.find((b) => b.valor === estado.bloco)?.rotulo ?? "Texto normal";
  const tamanho = valor.length;
  const passou = maxLength != null && tamanho > maxLength;

  return (
    <div className={`overflow-hidden rounded-card border bg-surface transition-shadow ${focado ? "border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]" : "border-border-2"}`}>
      <div role="toolbar" aria-label={`Formatação — ${rotulo}`} className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-2 py-1">
        <BotaoBarra rotulo="Desfazer" atalho="Ctrl+Z" onClick={() => aplicar("undo")} disabled={disabled}>
          <IconUndo className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra rotulo="Refazer" atalho="Ctrl+Y" onClick={() => aplicar("redo")} disabled={disabled}>
          <IconRedo className="h-4 w-4" />
        </BotaoBarra>
        <Divisor />
        <Dropdown
          ariaLabel="Estilo do parágrafo"
          title="Estilo do parágrafo (Ctrl+Alt+0/1/2/3)"
          papel="listbox"
          width={200}
          bloqueado={disabled}
          triggerClassName="inline-flex h-11 min-w-[9.5rem] items-center justify-between gap-2 rounded-control px-2.5 text-[13px] font-medium text-text hover:bg-surface-2 lg:h-8"
          trigger={
            <>
              <span className="truncate">{rotuloBloco}</span>
              <SetaDropdown className="h-4 w-4" />
            </>
          }
        >
          {(fechar) => (
            <div className="py-1">
              {ESTILOS_BLOCO.map((b) => (
                <button
                  key={b.valor}
                  type="button"
                  role="option"
                  aria-selected={b.valor === estado.bloco}
                  onClick={() => {
                    fechar();
                    bloco(b.valor);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-2 ${b.valor === estado.bloco ? "text-accent" : "text-text"} ${b.valor === "h1" ? "text-[19px] font-bold" : b.valor === "h2" ? "text-[16px] font-bold" : b.valor === "h3" ? "text-[14.5px] font-semibold" : b.valor === "blockquote" ? "text-[13.5px] italic text-muted" : "text-[13.5px]"}`}
                >
                  {b.rotulo}
                  {b.valor === estado.bloco && <IconCheck className="h-4 w-4 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </Dropdown>
        <Divisor />
        <BotaoBarra rotulo="Negrito" atalho="Ctrl+B" ativo={estado.negrito} onClick={() => aplicar("bold")} disabled={disabled}>
          <IconBold className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra rotulo="Itálico" atalho="Ctrl+I" ativo={estado.italico} onClick={() => aplicar("italic")} disabled={disabled}>
          <IconItalic className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra rotulo="Código" onClick={codigo} disabled={disabled}>
          <IconCode className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra
          rotulo="Link"
          atalho="Ctrl+K"
          onClick={() => {
            atualizarEstado();
            setLink("https://");
          }}
          disabled={disabled}
        >
          <IconLink className="h-4 w-4" />
        </BotaoBarra>
        <Divisor />
        <BotaoBarra rotulo="Lista com marcadores" atalho="Ctrl+Shift+8" ativo={estado.lista} onClick={() => aplicar("insertUnorderedList")} disabled={disabled}>
          <IconList className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra rotulo="Lista numerada" atalho="Ctrl+Shift+7" ativo={estado.numerada} onClick={() => aplicar("insertOrderedList")} disabled={disabled}>
          <IconListOrdered className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra rotulo="Citação" ativo={estado.bloco === "blockquote"} onClick={() => bloco(estado.bloco === "blockquote" ? "p" : "blockquote")} disabled={disabled}>
          <IconQuote className="h-4 w-4" />
        </BotaoBarra>
        <BotaoBarra rotulo="Linha separadora" onClick={() => aplicar("insertHorizontalRule")} disabled={disabled}>
          <IconMenos className="h-4 w-4" />
        </BotaoBarra>
        <Divisor />
        <BotaoBarra rotulo="Limpar formatação" onClick={limpar} disabled={disabled}>
          <IconLimparFormato className="h-4 w-4" />
        </BotaoBarra>
      </div>
      {link != null && (
        <div className="flex flex-wrap items-end gap-2 border-b border-border bg-surface-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <TextField
              label="Endereço do link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmarLink();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setLink(null);
                  restaurar();
                }
              }}
            />
          </div>
          <Button size="sm" onClick={confirmarLink} disabled={!/^https?:\/\/\S+\.\S+/i.test(link.trim())}>
            Aplicar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLink(null)}>
            Cancelar
          </Button>
        </div>
      )}
      {/* A FOLHA: o fundo cinza com a página branca no centro, como num editor de documentos. */}
      <div className={`overflow-y-auto bg-surface-2 px-2 py-4 sm:px-6 ${altura}`}>
        <div className="relative mx-auto max-w-[52rem] rounded-card bg-surface px-5 py-6 shadow-ring sm:px-10 sm:py-10">
          {vazio && !focado && <p className="pointer-events-none absolute left-5 top-6 text-[15px] text-faint sm:left-10 sm:top-10">{placeholder}</p>}
          {/* biome-ignore lint/a11y/useSemanticElements: o editor visual é um contentEditable (um <textarea> não mostra a formatação) */}
          <div
            ref={ref}
            role="textbox"
            aria-multiline="true"
            aria-label={rotulo}
            tabIndex={0}
            contentEditable={!disabled}
            suppressContentEditableWarning
            spellCheck
            lang="pt-BR"
            onFocus={() => {
              setFocado(true);
              document.execCommand("defaultParagraphSeparator", false, "p");
            }}
            onBlur={() => setFocado(false)}
            onInput={emitir}
            onKeyDown={teclas}
            onKeyUp={atualizarEstado}
            onMouseUp={atualizarEstado}
            onPaste={(e) => {
              // O colado passa pelos dois conversores: fica só o que o formato conhece (sem estilos e scripts de fora).
              e.preventDefault();
              const html = e.clipboardData.getData("text/html");
              const texto = html ? textoDoHtml(new DOMParser().parseFromString(html, "text/html").body) : e.clipboardData.getData("text/plain");
              if (texto) aplicar("insertHTML", htmlDoTexto(texto));
            }}
            className={`min-h-[30vh] outline-none ${CONTEUDO}`}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[12px] text-muted">
        <span>{estado.bloco === "p" ? "Texto normal" : rotuloBloco}</span>
        <span className={passou ? "font-semibold text-[var(--danger)]" : ""}>
          {num(tamanho)}
          {maxLength != null ? ` / ${num(maxLength)}` : ""} caracteres
        </span>
      </div>
    </div>
  );
}
