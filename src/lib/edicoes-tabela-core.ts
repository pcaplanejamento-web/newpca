import type { Tela } from "./papeis-core.ts";

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

/**
 * A TELA da tabela de uma chave — a régua do acesso às edições salvas: a Mesa do sistema (`mesa:`), a Mesa do PCA
 * (`mesa-pca:`), o Comparativo do orçamento (`orcamento-comparativo:` — está no Orçamento e no PCA: basta uma) e a Lista de
 * um quadro de tarefas (`tarefas:<quadro>:` — a permissão segue o grupo DO QUADRO). Salvar a sua = Visualizar; PUBLICAR (ou
 * moderar a pública de outra pessoa) = Configurar. Chave de outra tabela ⇒ `null` (recusada).
 */
export function telasDaChave(chave: string): { telas: readonly Tela[]; quadroId: number | null } | null {
  if (chave.startsWith("mesa-pca:")) return { telas: ["pca"], quadroId: null };
  if (chave.startsWith("mesa:")) return { telas: ["dfd"], quadroId: null };
  if (chave.startsWith("orcamento-comparativo:")) return { telas: ["orcamento", "pca"], quadroId: null };
  const t = /^tarefas:([1-9]\d{0,8}):/.exec(chave);
  return t ? { telas: ["tarefas"], quadroId: Number(t[1]) } : null;
}

/**
 * A AÇÃO que a pessoa precisa ter na tela da chave para GRAVAR uma edição: a sua, só para ela = Visualizar; o que fica
 * PÚBLICO depois = Configurar (publicar); a PÚBLICA de outra pessoa (moderar) = Configurar. `null` = nada a conferir: o
 * dono sempre DESPUBLICA ou EXCLUI a sua (ela sai do ar). A PRIVADA de outra pessoa ninguém grava além do ADM — a rota
 * recusa antes.
 */
export function acaoParaGravar(e: { dono: boolean; publicoAntes: boolean; publicoDepois: boolean; excluir: boolean }): "visualizar" | "configurar" | null {
  if (!e.dono) return "configurar";
  if (e.excluir || (e.publicoAntes && !e.publicoDepois)) return null;
  return e.publicoDepois ? "configurar" : "visualizar";
}
