// Estilos de formulário compartilhados (fonte única, por token). Reusados em
// Auth, Perfil, Usuários, Configurações e na edição inline das tabelas — nada de cor hardcoded.

/** Input padrão (formulários). */
export const inputCls =
  "w-full rounded-control border border-border-2 bg-surface px-3.5 py-3 text-base text-text outline-none transition-colors placeholder:text-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";

/** Célula compacta para edição inline em tabelas. */
export const cellCls =
  "w-full rounded-[8px] border border-border-2 bg-surface px-2 py-1.5 text-sm text-text outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30";

/** Select compacto (ex.: papel do usuário). */
export const selectCls =
  "h-11 rounded-control border border-border-2 bg-surface px-2 text-[13px] text-text-2 outline-none lg:h-[var(--h-control-sm)] transition-colors focus-visible:border-accent disabled:opacity-50";

/** Rótulo padrão. */
export const labelCls = "mb-1 block text-sm font-medium text-text-2";
