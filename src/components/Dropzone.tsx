"use client";

import { type ReactNode, useRef, useState } from "react";
import { IconFile } from "./icons";

/**
 * Área de importação reutilizável: **solte o arquivo** OU **clique no componente**
 * para escolher no sistema. Só componentes do DS/tokens. Usada nos lançadores de
 * importação (protocolo, DFD, planilha PCA).
 */
export function Dropzone({
  accept,
  onFile,
  onFiles,
  titulo,
  dica,
  icon,
  className = "",
}: {
  accept: string;
  onFile?: (file: File) => void;
  /** VÁRIOS arquivos de uma vez (soltar/escolher) — liga o `multiple` do seletor. */
  onFiles?: (files: File[]) => void;
  titulo: string;
  dica?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const entregar = (lista: FileList | null | undefined) => {
    const fs = lista ? Array.from(lista) : [];
    if (fs.length === 0) return;
    if (onFiles) onFiles(fs);
    else onFile?.(fs[0]);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const escolher = () => inputRef.current?.click();

  return (
    <button
      type="button"
      onClick={escolher}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        entregar(e.dataTransfer.files);
      }}
      className={`flex h-full w-full flex-col items-center justify-center rounded-card border-2 border-dashed p-8 text-center transition ${
        dragging ? "border-accent bg-accent-soft" : "border-border-2 bg-surface hover:border-accent hover:bg-accent-soft/40"
      } ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={!!onFiles}
        className="hidden"
        onChange={(e) => {
          entregar(e.target.files);
          e.target.value = "";
        }}
      />
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        {icon ?? <IconFile className="h-7 w-7" />}
      </span>
      <span className="mt-4 text-sm font-medium text-text-2">{titulo}</span>
      <span className="mt-1 text-xs text-accent">Solte aqui ou clique para escolher no sistema</span>
      {dica && <span className="mt-3 text-xs text-faint">{dica}</span>}
    </button>
  );
}
