"use client";

import { createContext, useContext } from "react";
import { IconTextoCompleto } from "./icons";

/**
 * DADOS COMPLETOS nas tabelas (a Mesa): ligado, as células mostram o texto INTEIRO (descrição, assunto — sem cortar em
 * uma linha) e as listas TODOS os valores (sem o "+N") — dentro da própria tabela, sem depender da dica (que não existe
 * no toque do celular). Desligado = o resumo de uma linha (a linha da tabela compacta, mais informação na tela).
 */
const Ctx = createContext(false);
/** Provedor: o que estiver dentro dele (as tabelas) mostra os dados completos quando `value` é `true`. */
export const DadosCompletos = Ctx.Provider;
/** `true` = mostrar os dados completos na célula. */
export const useDadosCompletos = () => useContext(Ctx);

/** Botão (só o ícone, na altura da barra — 44px no toque) que liga/desliga os dados completos; accent quando ligado. */
export function BotaoDadosCompletos({ ligado, onChange }: { ligado: boolean; onChange: (ligado: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={ligado}
      aria-label="Dados completos nas tabelas"
      title={ligado ? "Dados completos: ligado (toque para voltar ao resumo em uma linha)" : "Dados completos: mostrar o texto inteiro e todos os valores nas células"}
      onClick={() => onChange(!ligado)}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)] ${
        ligado ? "border-accent/50 bg-accent-soft text-accent" : "border-border-2 bg-surface text-muted hover:bg-surface-2 hover:text-text-2"
      }`}
    >
      <IconTextoCompleto className="h-4 w-4" />
    </button>
  );
}
