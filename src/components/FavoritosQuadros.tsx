"use client";

import { useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { CHAVE_FAVORITOS_TAREFAS } from "@/lib/tarefas-core";
import { IconEstrela } from "./icons";
import { toast } from "./Toast";

/**
 * Os QUADROS FAVORITOS da pessoa (preferência `tarefas:favoritos`): alternar é otimista e grava UMA vez por alteração em
 * FILA (dois toques rápidos nunca se atropelam); falhou ⇒ volta ao último estado gravado e avisa.
 */
export function useFavoritosQuadros(inicial: number[]) {
  const [favoritos, setFavoritos] = useState(inicial);
  const gravado = useRef(inicial);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const alternar = (id: number) => {
    setFavoritos((atual) => {
      const novo = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id];
      fila.current = fila.current.then(() =>
        chamar("/api/preferencias/tabela", "PUT", { chave: CHAVE_FAVORITOS_TAREFAS, valor: { ids: novo } }).then(
          () => {
            gravado.current = novo;
          },
          (e) => {
            setFavoritos(gravado.current);
            toast.error((e as Error).message);
          },
        ),
      );
      return novo;
    });
  };
  return { favoritos, alternar };
}

/** A ESTRELA de favorito de um quadro (preenchida quando é favorito; área de toque de 44px no celular). */
export function EstrelaFavorito({ ativo, nome, onAlternar, className = "" }: { ativo: boolean; nome: string; onAlternar: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      aria-label={ativo ? `Tirar ${nome} dos favoritos` : `Marcar ${nome} como favorito`}
      title={ativo ? "Tirar dos favoritos" : "Marcar como favorito"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAlternar();
      }}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-control transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 lg:h-8 lg:w-8 ${
        ativo ? "" : "text-faint hover:text-text-2"
      } ${className}`}
      style={ativo ? { color: "var(--warn)" } : undefined}
    >
      <IconEstrela className="h-4 w-4" fill={ativo ? "currentColor" : "none"} />
    </button>
  );
}
