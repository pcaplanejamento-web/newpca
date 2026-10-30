import type { Tela } from "./papeis-core.ts";
import { type OperacaoEdicao, TABELAS_MESA, type TabelaMesa, type TelaEdicoes } from "./papeis-detalhes-core.ts";

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

/** A chave (nas `padroes` entregues à tela) do PADRÃO PARA TODOS que o ADM definiu para a tabela `chave`. */
export const chavePadraoAdm = (chave: string) => `padraoAdm:${chave}`;

/** O id do padrão PARA TODOS do ADM (`null` = nenhum). */
export function idPadraoAdm(padroes: Record<string, unknown>, chave: string): number | null {
  const v = padroes[chavePadraoAdm(chave)] as { id?: unknown } | undefined;
  return typeof v?.id === "number" && Number.isInteger(v.id) ? v.id : null;
}

/** O mapa {chave da tabela → id} do padrão para todos (blob `configuracoes.edicoesPadrao`), normalizado. */
export function lerPadroesAdm(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(([k, id]) => k.length > 0 && k.length <= 200 && typeof id === "number" && Number.isInteger(id) && id > 0),
  ) as Record<string, number>;
}

/**
 * A edição com que a tabela ABRE: a padrão do USUÁRIO, se ele ainda a vê; senão o padrão PARA TODOS do ADM (uma edição
 * PÚBLICA); senão o padrão do sistema (`null`). A escolha da pessoa vence a do ADM.
 */
export function edicaoInicial(edicoes: EdicaoTabela[], padroes: Record<string, unknown>, chave: string): EdicaoTabela | null {
  const { minhas, publicas } = edicoesDaChave(edicoes, chave);
  const todas = [...minhas, ...publicas];
  const minha = idPadrao(padroes, chave);
  const daPessoa = minha == null ? null : todas.find((e) => e.id === minha);
  if (daPessoa) return daPessoa;
  const adm = idPadraoAdm(padroes, chave);
  return adm == null ? null : (todas.find((e) => e.id === adm && e.publico) ?? null);
}

/**
 * A TELA da tabela de uma chave — a régua do acesso às edições salvas: a Mesa do sistema (`mesa:`), a Mesa do PCA
 * (`mesa-pca:`), o Comparativo do orçamento (`orcamento-comparativo:` — está no Orçamento e no PCA: basta uma), os
 * Lançamentos do orçamento (`orcamento-lancamentos:`), os Empenhos (`empenhos:`), as VISÕES dos filtros da Execução
 * (`execucao:`) e a Lista de
 * um quadro de tarefas (`tarefas:<quadro>:` — a permissão segue o grupo DO QUADRO). Salvar a sua = Visualizar; PUBLICAR (ou
 * moderar a pública de outra pessoa) = Configurar. Chave de outra tabela ⇒ `null` (recusada).
 */
/** A chave das edições salvas da tabela de LANÇAMENTOS do orçamento (as colunas são as mesmas em todo orçamento). */
export const CHAVE_LANCAMENTOS = "orcamento-lancamentos:tabela";

/** Chave de uma tabela da ADMINISTRAÇÃO (`admin:orgaos:tabela`…): só o Administrador grava edições nela. */
export const chaveDeAdmin = (chave: string) => /^admin:[a-z-]+:[a-z-]+$/.test(chave);

export function telasDaChave(chave: string): { telas: readonly Tela[]; quadroId: number | null } | null {
  if (chave.startsWith("orcamento-lancamentos:")) return { telas: ["orcamento"], quadroId: null };
  if (chave.startsWith("empenhos:")) return { telas: ["empenhos"], quadroId: null };
  if (chave.startsWith("execucao:")) return { telas: ["execucao"], quadroId: null };
  // FROTAS: cada tabela segue a tela dela (`frotas:combustivel:…`, `frotas:manutencao:…`, `frotas:veiculos:…`, `frotas:frotas:…`).
  const fr = /^frotas:(frotas|combustivel|manutencao|veiculos):/.exec(chave);
  if (fr) return { telas: [fr[1] as Tela], quadroId: null };
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

/**
 * A OPERAÇÃO que gravar uma edição exige (os DETALHES do papel dividem o acesso às edições): a sua, só para ela =
 * PERSONALIZAR; o que fica PÚBLICO depois = PUBLICAR; a de OUTRA pessoa = MODERAR. `null` = nada a conferir: o dono sempre
 * DESPUBLICA ou EXCLUI a sua. A ação do papel na tela segue a de `acaoParaGravar` (personalizar = Visualizar; publicar e
 * moderar = Configurar) — o detalhe só RETIRA.
 */
export function operacaoParaGravar(e: { dono: boolean; publicoAntes: boolean; publicoDepois: boolean; excluir: boolean }): OperacaoEdicao | null {
  if (!e.dono) return "moderar";
  if (e.excluir || (e.publicoAntes && !e.publicoDepois)) return null;
  return e.publicoDepois ? "publicar" : "personalizar";
}

/** A tela das EDIÇÕES (a do detalhe do papel) de uma chave: a Mesa do sistema, a do PCA, o Comparativo (Orçamento — no
 * espaço do PCA, a tela do PCA) e a Lista de um quadro de tarefas. `null` = chave de outra tabela. */
export function telaDetalheDaChave(chave: string, telaAtual?: Tela): TelaEdicoes | null {
  if (chave.startsWith("mesa-pca:")) return "pca";
  if (chave.startsWith("mesa:")) return "dfd";
  if (chave.startsWith("orcamento-comparativo:")) return telaAtual === "pca" ? "pca" : "orcamento";
  if (/^tarefas:[1-9]\d{0,8}:/.test(chave)) return "tarefas";
  return null;
}

/** A TABELA da Mesa de uma chave (`mesa:protocolos`, `mesa-pca:itens`…) — a das colunas do detalhe do papel; `null` =
 * outra tabela (o Comparativo, a Lista de tarefas). */
export function tabelaMesaDaChave(chave: string): TabelaMesa | null {
  const m = /^mesa(?:-pca)?:(\w+)$/.exec(chave);
  return m && (TABELAS_MESA as readonly string[]).includes(m[1]) ? (m[1] as TabelaMesa) : null;
}
