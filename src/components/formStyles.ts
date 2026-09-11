// Estilos de formulário compartilhados (fonte única). Reusados em Auth, Perfil,
// Protocolos, Tabelas, Usuários e filtros — evita duplicar as mesmas classes.

/** Input padrão (formulários). */
export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-emerald-500/20";

/** Célula compacta para edição inline em tabelas. */
export const cellCls =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-emerald-500/20";

/** Dropdown de filtro (barra de filtros). */
export const filterCls =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:focus:ring-emerald-500/20";

/** Select compacto (ex.: papel do usuário). */
export const selectCls =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none transition focus:border-emerald-400 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";

/** Rótulo padrão. */
export const labelCls =
  "mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300";

/** Rótulo pequeno (edição compacta). */
export const labelSmCls =
  "mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400";
