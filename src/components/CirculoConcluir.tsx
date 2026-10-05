"use client";

import { IconCheck } from "./icons";

/**
 * O CÍRCULO de concluir (como o Trello): vazio = aberta; verde com ✓ = concluída. Conclui/reabre NO LUGAR — a tarefa não
 * sai da lista. `discreto` = só aparece com o mouse sobre o `group/cartao` (ou no foco/toque) enquanto aberta. A área de
 * toque passa de 44px no celular sem aumentar o desenho. `rotulos` = o que o toque faz em cada estado (padrão
 * Concluir/Reabrir — ex.: o marcador de LIDA do sino).
 */
export function CirculoConcluir({
  concluida,
  onAlternar,
  rotulo,
  tamanho = "sm",
  discreto = false,
  disabled = false,
  rotulos = { marcar: "Concluir", desmarcar: "Reabrir" },
}: {
  concluida: boolean;
  onAlternar: () => void;
  /** O nome acessível (ex.: "#12 Conferir DFDs"). */
  rotulo: string;
  tamanho?: "sm" | "md";
  discreto?: boolean;
  disabled?: boolean;
  rotulos?: { marcar: string; desmarcar: string };
}) {
  const dim = tamanho === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <button
      type="button"
      aria-pressed={concluida}
      aria-label={`${concluida ? rotulos.desmarcar : rotulos.marcar}: ${rotulo}`}
      title={concluida ? rotulos.desmarcar : rotulos.marcar}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onAlternar();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`relative z-10 grid shrink-0 place-items-center rounded-full transition-[opacity,background-color,border-color] duration-[var(--motion-duration)] after:absolute after:-inset-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default pointer-coarse:after:-inset-3.5 ${dim} ${
        concluida ? "border border-[var(--ok)] bg-[var(--ok)] text-white" : "border-[1.5px] border-muted text-transparent hover:border-[var(--ok)]"
      } ${discreto && !concluida ? "opacity-0 group-hover/cartao:opacity-100 focus-visible:opacity-100 any-pointer-coarse:opacity-100" : ""}`}
    >
      <IconCheck className={tamanho === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={3} />
    </button>
  );
}
