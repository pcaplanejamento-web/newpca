"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "./Toast";

/**
 * TEXTO EDITÁVEL NO LUGAR (como o nome da lista e do quadro no Trello): mostra o texto; um clique vira um campo com o texto
 * SELECIONADO — Enter ou tocar fora grava, Esc desfaz. Vazio ou igual não grava. `onSalvar` devolve `false`/lança = volta ao
 * texto de antes (o erro vai para o aviso). Sem `onSalvar` = só leitura. O campo tem a MESMA fonte do texto (não pula).
 */
export function TextoNoLugar({
  valor,
  onSalvar,
  ariaLabel,
  maxLength = 60,
  className = "",
  ajustar = false,
}: {
  valor: string;
  onSalvar?: (novo: string) => Promise<boolean>;
  /** O nome acessível do campo (ex.: "Nome da lista"). */
  ariaLabel: string;
  maxLength?: number;
  /** A tipografia (a mesma no texto e no campo). */
  className?: string;
  /** Na LARGURA DO TEXTO (o título do quadro) em vez da largura toda — trunca só no limite do pai. */
  ajustar?: boolean;
}) {
  const largura = ajustar ? "inline-block max-w-full align-middle" : "block w-full";
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const [gravando, setGravando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  // Enter e o blur que vem depois gravam UMA vez; Esc cancela de verdade.
  const feito = useRef(false);
  useEffect(() => {
    if (!editando) setTexto(valor);
  }, [valor, editando]);
  useEffect(() => {
    if (editando) campo.current?.select();
  }, [editando]);

  const concluir = async (gravar: boolean) => {
    if (feito.current) return;
    feito.current = true;
    const novo = texto.trim();
    if (!gravar || !onSalvar || !novo || novo === valor) {
      setTexto(valor);
      setEditando(false);
      return;
    }
    setGravando(true);
    try {
      if ((await onSalvar(novo)) === false) setTexto(valor);
    } catch (e) {
      toast.error((e as Error).message);
      setTexto(valor);
    } finally {
      setGravando(false);
      setEditando(false);
    }
  };

  if (!onSalvar)
    return (
      <span className={`block min-w-0 truncate ${className}`} title={valor}>
        {valor}
      </span>
    );
  if (editando)
    return (
      <input
        ref={campo}
        value={texto}
        maxLength={maxLength}
        disabled={gravando}
        aria-label={ariaLabel}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => concluir(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            concluir(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            concluir(false);
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`-mx-1.5 min-h-11 ${ajustar ? "w-[min(100%,32rem)]" : "w-full"} min-w-0 rounded-control border-2 border-accent bg-surface px-1.5 outline-none lg:min-h-8 ${className}`}
      />
    );
  return (
    <button
      type="button"
      title={`${valor} — clique para editar`}
      aria-label={`${ariaLabel}: ${valor} — editar`}
      onClick={() => {
        feito.current = false;
        setEditando(true);
      }}
      className={`-mx-1.5 min-h-11 ${largura} min-w-0 truncate rounded-control px-1.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 lg:min-h-8 ${className}`}
    >
      {valor}
    </button>
  );
}
