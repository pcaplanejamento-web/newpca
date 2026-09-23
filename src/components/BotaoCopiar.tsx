"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { IconCheck, IconClipboard } from "./icons";
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
