"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Button } from "./Button";
import { IconCheck, IconClipboard, IconCopy } from "./icons";
import { toast } from "./Toast";

/** Copia um texto para a área de transferência: API do navegador e, sem permissão, o fallback clássico
 * (textarea + `execCommand`). `true` = copiado. */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = texto;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    el.remove();
    return ok;
  }
}

/**
 * Botão que COPIA um texto pronto (ex.: os nºs de planejamento dos DFDs selecionados — "1525:1549:1554")
 * e confirma na hora ("Copiado!"); sem permissão de clipboard, avisa com o texto para copiar à mão.
 * Desabilitado quando não há o que copiar. Só componentes do design-system.
 */
export function BotaoCopiar({
  texto,
  rotulo,
  titulo,
  disabled = false,
}: {
  texto: string;
  rotulo: string;
  /** Dica (tooltip) — ex.: o texto que será copiado. */
  titulo?: string;
  disabled?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = window.setTimeout(() => setCopiado(false), 1800);
    return () => window.clearTimeout(t);
  }, [copiado]);
  // A dica fica no invólucro: o botão desabilitado não recebe o ponteiro (e ela explica POR QUE está desabilitado).
  return (
    <span className="inline-flex shrink-0" title={titulo ?? texto}>
      <Button
        variant="ghost"
        disabled={disabled || !texto}
        onClick={async () => {
          if (await copiarTexto(texto)) setCopiado(true);
          else toast.warning(`Não foi possível copiar automaticamente. Copie: ${texto}`, 8000);
        }}
        icon={copiado ? <IconCheck className="h-4 w-4" style={{ color: "var(--ok)" }} /> : <IconClipboard className="h-4 w-4" />}
      >
        {copiado ? "Copiado!" : rotulo}
      </Button>
    </span>
  );
}

/** Até quantos caracteres o valor entra no nome acessível/dica e no aviso (uma descrição longa não vira uma dica enorme). */
const CURTO = 60;
const curto = (t: string) => (t.length > CURTO ? `${t.slice(0, CURTO - 1)}…` : t);

/**
 * CÉLULA COPIÁVEL — o conteúdo da célula + um ícone DISCRETO de copiar ao lado (nº do protocolo, Id, DFD, planejamento,
 * código e descrição do item, em TODA tabela). O texto copiado pode diferir do exibido: o nº do protocolo sai SEM o ano
 * (`numeroSemAno`) e vários valores saem unidos por ":" (`juntarParaCopiar` — o formato que a busca dos filtros aceita).
 * No computador o ícone aparece ao passar o mouse na LINHA (`group/linha` do `DataTable`) ou na célula, e no foco do
 * teclado; no toque (ponteiro grosso) fica sempre visível, afastado do valor e com a área de toque ampliada (44px de
 * altura) só para cima/baixo e para a DIREITA, sem mudar o leiaute — nunca sobre o texto: tocar no valor abre a linha,
 * tocar no ícone copia. O clique é do botão (não abre a linha); confirma com o ✓ e o aviso flutuante. Sem o que copiar
 * (vazio ou "—") = só o conteúdo, sem ícone.
 */
export function CelulaCopiavel({
  copiar,
  rotulo,
  plural,
  children,
}: {
  /** O texto COPIADO (pode diferir do exibido). Vazio/"—" = sem ícone. */
  copiar: string | null | undefined;
  /** O que é copiado — o nome acessível e a dica ("Copiar nº do protocolo: 144756"). */
  rotulo: string;
  /** O nome quando saem VÁRIOS valores (unidos por ":") — ex.: "nºs dos DFDs". */
  plural?: string;
  children: ReactNode;
}) {
  const [ok, setOk] = useState(false);
  const texto = (copiar ?? "").trim();
  if (!texto || texto === "—") return <>{children}</>;
  const dica = `Copiar ${plural && texto.includes(":") ? plural : rotulo}: ${curto(texto)}`;
  return (
    // Toque (ponteiro grosso): um vão maior entre o valor e o ícone — o navegador "puxa" o toque para o controle
    // clicável mais próximo, e colado ao valor um toque no fim do número copiaria em vez de abrir a linha.
    <span className="group/copiar inline-flex max-w-full items-center gap-1 align-middle pointer-coarse:gap-3">
      <span className="min-w-0">{children}</span>
      <button
        type="button"
        aria-label={dica}
        title={dica}
        onClick={async (e) => {
          e.stopPropagation();
          if (await copiarTexto(texto)) {
            setOk(true);
            window.setTimeout(() => setOk(false), 1500);
            toast.success(`Copiado: ${curto(texto)}`, 2000);
          } else toast.warning(`Não foi possível copiar automaticamente. Copie: ${texto}`, 8000);
        }}
        // Copiado: segue visível (o ✓) mesmo com o ponteiro fora da linha.
        style={ok ? { opacity: 1 } : undefined}
        className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-faint transition-[opacity,color,background-color] duration-[var(--motion-duration)] hover:bg-surface-2 hover:text-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 group-hover/copiar:opacity-100 group-hover/linha:opacity-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-y-3 pointer-coarse:after:left-0 pointer-coarse:after:-right-3 [@media(hover:hover)]:opacity-0"
      >
        {ok ? <IconCheck className="h-3.5 w-3.5" style={{ color: "var(--ok)" }} /> : <IconCopy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}
