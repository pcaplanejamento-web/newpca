import { Skeleton } from "./Skeleton";

/** ESQUELETO da `Dropzone` — a MESMA moldura tracejada: o ícone, o título, a chamada e a dica. Arquivo leve, sem "use client". */
export function EsqueletoDropzone() {
  return (
    <div className="flex w-full flex-col items-center justify-center rounded-card border-2 border-dashed border-border-2 bg-surface p-8">
      <Skeleton className="h-14 w-14 rounded-2xl" />
      <Skeleton className="mt-4 h-4 w-48 rounded-sm" />
      <Skeleton className="mt-1.5 h-3 w-64 max-w-full rounded-sm" />
      <Skeleton className="mt-3 h-3 w-56 max-w-full rounded-sm" />
    </div>
  );
}
