import { Skeleton, SkeletonLinhas } from "@/components/Skeleton";

// Skeleton mostrado durante a navegação entre telas do painel (Suspense do
// App Router). Aparece na área de conteúdo, com a sidebar/topbar já renderizadas.
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-2xl" />
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <SkeletonLinhas linhas={7} />
      </div>
    </div>
  );
}
