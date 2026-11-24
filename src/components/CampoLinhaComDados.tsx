"use client";

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { type CampoDado, htmlComCampos, textoDaLinha } from "@/lib/campos-dados-core";
import { BotaoCampos, ListaCampos } from "./SeletorCampos";
import { useCamposNoTexto } from "./useCamposNoTexto";

/**
 * CAMPO DE UMA LINHA com CAMPOS DE DADOS — o irmão do `TextField compacto` para os textos curtos que levam dados
 * consolidados (título, subtítulo, ente, local): o texto e os CHIPS dos dados (`campos-dados-core.ts`), o botão "Dado" no
 * fim e "{{" abrindo as sugestões — a MESMA lógica do `EditorRico` (`useCamposNoTexto`). Grava o texto com `{{chave}}`;
 * Enter não quebra a linha; o colado vira uma linha só.
 */
export function CampoLinhaComDados({
  label,
  valor,
  onChange,
  campos,
  maxLength,
  placeholder,
  rotuloExtra,
  disabled = false,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  campos: readonly CampoDado[];
  maxLength?: number;
  placeholder?: string;
  rotuloExtra?: ReactNode;
  disabled?: boolean;
}) {
  const idLabel = useId();
  const ref = useRef<HTMLDivElement>(null);
  const ultimo = useRef<string | null>(null);
  const selecao = useRef<Range | null>(null);
  const [vazio, setVazio] = useState(!valor);

  const emitir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    let t = textoDaLinha(el);
    if (maxLength != null && t.length > maxLength) t = t.slice(0, maxLength);
    setVazio(!t);
    if (t === ultimo.current) return;
    ultimo.current = t;
    onChange(t);
  }, [onChange, maxLength]);

  const restaurar = () => {
    const el = ref.current;
    if (!el) return;
    const atual = document.getSelection();
    if (document.activeElement === el && atual && atual.rangeCount > 0 && el.contains(atual.anchorNode)) return;
    el.focus();
    const r = selecao.current;
    const sel = document.getSelection();
    if (sel && r && el.contains(r.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(r);
    } else if (sel) {
      // Sem posição guardada: o cursor no fim.
      const fim = document.createRange();
      fim.selectNodeContents(el);
      fim.collapse(false);
      sel.removeAllRanges();
      sel.addRange(fim);
    }
  };

  const cd = useCamposNoTexto({ ref, campos, disabled, restaurar, aoMudar: emitir });
  const { mapa } = cd;
  // A seleção pelo MESMO ouvinte (o hook troca a função a cada tecla — o ouvinte do documento não é refeito).
  const aoSelecionarRef = useRef(cd.aoSelecionar);
  aoSelecionarRef.current = cd.aoSelecionar;

  // O valor de FORA redesenha (o que o próprio campo emitiu, não — o cursor fica).
  useEffect(() => {
    const el = ref.current;
    if (!el || valor === ultimo.current) return;
    el.innerHTML = htmlComCampos(valor, mapa);
    ultimo.current = valor;
    setVazio(!valor);
  }, [valor, mapa]);

  useEffect(() => {
    const aoMudarSelecao = () => {
      const el = ref.current;
      const sel = document.getSelection();
      if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
      selecao.current = sel.getRangeAt(0).cloneRange();
      aoSelecionarRef.current(sel);
    };
    document.addEventListener("selectionchange", aoMudarSelecao);
    return () => document.removeEventListener("selectionchange", aoMudarSelecao);
  }, []);

  return (
    <div className="relative min-w-0">
      <div className="mb-2 flex items-center gap-1.5">
        <span id={idLabel} className="block text-[13.5px] font-bold text-text">
          {label}
        </span>
        {rotuloExtra}
      </div>
      <div className="flex h-11 items-center gap-1 rounded-control border border-border-2 bg-surface-2 pr-1 pl-3 transition-[border-color,box-shadow,background-color] duration-[var(--motion-duration)] focus-within:border-accent focus-within:bg-surface focus-within:ring-4 focus-within:ring-accent/20 desktop:h-[var(--h-control-sm)]">
        <div className="relative min-w-0 flex-1">
          {vazio && placeholder && <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center truncate text-[13px] text-faint pointer-coarse:text-[16px]">{placeholder}</span>}
          {/* biome-ignore lint/a11y/useSemanticElements: o campo mostra os CHIPS dos dados — um <input> só mostra texto */}
          <div
            ref={ref}
            role="textbox"
            aria-multiline="false"
            aria-labelledby={idLabel}
            tabIndex={disabled ? -1 : 0}
            contentEditable={!disabled}
            suppressContentEditableWarning
            spellCheck
            lang="pt-BR"
            onKeyDown={(e) => {
              if (cd.tecla(e)) return;
              // Uma linha só.
              if (e.key === "Enter") e.preventDefault();
            }}
            onInput={() => {
              cd.aoDigitar();
              emitir();
            }}
            onPaste={(e) => {
              e.preventDefault();
              // Do próprio sistema (chips), o HTML guarda os dados (`{{chave}}`); de fora, o texto puro.
              const html = e.clipboardData.getData("text/html");
              const bruto = html ? textoDaLinha(new DOMParser().parseFromString(html, "text/html").body) : e.clipboardData.getData("text/plain");
              const t = bruto.replace(/\s+/g, " ").trim();
              if (t) document.execCommand("insertHTML", false, htmlComCampos(t, mapa));
              emitir();
            }}
            className="barra-rolavel overflow-x-auto whitespace-nowrap py-1 text-[13px] text-text outline-none pointer-coarse:text-[16px]"
          />
        </div>
        <BotaoCampos campos={campos} onEscolher={cd.inserir} disabled={disabled} />
      </div>
      {cd.sugestoes.length > 0 && (
        <div className="absolute right-0 left-0 top-full z-20 mt-1 overflow-hidden rounded-card border border-border bg-surface shadow-soft">
          <ListaCampos campos={campos} termo={cd.termo} ativa={cd.ativa} onAtiva={cd.setAtiva} onEscolher={cd.inserir} />
        </div>
      )}
    </div>
  );
}
