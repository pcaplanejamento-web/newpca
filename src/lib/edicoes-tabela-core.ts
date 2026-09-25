/**
 * EDIÇÕES SALVAS de tabela — núcleo PURO (testável). Cada edição tem nome, dono e visibilidade (só do dono ou PÚBLICA);
 * a padrão de cada usuário fica nas preferências dele (chave `padrao:<chave da tabela>` → `{ id }`).
 */
export type EdicaoTabela = {
  id: number;
  chave: string;
  nome: string;
  publico: boolean;
  /** É do usuário atual (pode atualizar/excluir). */
  minha: boolean;
  /** Nome de exibição do dono. */
  autor: string;
  /** O layout salvo (JSON cru — quem usa normaliza). */
  valor: unknown;
};

/** A chave da preferência que guarda a edição PADRÃO do usuário para a tabela `chave`. */
export const chavePadrao = (chave: string) => `padrao:${chave}`;

/** O id da edição padrão guardado nas preferências (`null` = o padrão do sistema). */
export function idPadrao(padroes: Record<string, unknown>, chave: string): number | null {
  const v = padroes[chavePadrao(chave)] as { id?: unknown } | undefined;
  return typeof v?.id === "number" && Number.isInteger(v.id) ? v.id : null;
}

/** As edições da tabela `chave` que o usuário vê: as DELE e as PÚBLICAS dos outros, cada grupo por nome. */
export function edicoesDaChave(edicoes: EdicaoTabela[], chave: string): { minhas: EdicaoTabela[]; publicas: EdicaoTabela[] } {
  const daChave = edicoes.filter((e) => e.chave === chave).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  return { minhas: daChave.filter((e) => e.minha), publicas: daChave.filter((e) => !e.minha && e.publico) };
}

/** A edição com que a tabela ABRE: a padrão do usuário, se ele ainda a vê (excluída ou despublicada ⇒ o padrão do sistema). */
export function edicaoInicial(edicoes: EdicaoTabela[], padroes: Record<string, unknown>, chave: string): EdicaoTabela | null {
  const id = idPadrao(padroes, chave);
  if (id == null) return null;
  const { minhas, publicas } = edicoesDaChave(edicoes, chave);
  return [...minhas, ...publicas].find((e) => e.id === id) ?? null;
}
