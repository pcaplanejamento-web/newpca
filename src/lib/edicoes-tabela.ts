import { and, eq, like, or, sql } from "drizzle-orm";
import { configuracoes, edicoesTabela, usuarios } from "@/db/schema";
import { type Acesso, motivoNoQuadro, motivoRecusa } from "./acesso";
import { getDb } from "./db";
import { chaveDeAdmin, chavePadraoAdm, type EdicaoTabela, lerPadroesAdm, telasDaChave } from "./edicoes-tabela-core";
import { lerBlobConfiguracoes } from "./integracoes";
import type { AcaoPapel } from "./papeis-core";
import { nomeExibicao } from "./pessoa";
import { listarPreferenciasTabela } from "./preferencias-tabela";
import { quadroAcessivel } from "./tarefas";

/**
 * EDIÇÕES SALVAS de tabela (migração `0041`) — acesso ao D1 (só escopo de request). O usuário vê as DELE e as PÚBLICAS;
 * o dono grava a sua (publicar = Configurar na tela da tabela) e quem CONFIGURA a tela modera as públicas (`telasDaChave`
 * + `acaoParaGravar`, núcleo puro).
 */
export async function listarEdicoesTabela(usuarioId: number, prefixo: string): Promise<EdicaoTabela[]> {
  const linhas = await getDb()
    .select({
      id: edicoesTabela.id,
      chave: edicoesTabela.chave,
      nome: edicoesTabela.nome,
      valor: edicoesTabela.valor,
      publico: edicoesTabela.publico,
      usuarioId: edicoesTabela.usuarioId,
      autorNome: usuarios.nome,
      autorApelido: usuarios.apelido,
    })
    .from(edicoesTabela)
    .innerJoin(usuarios, eq(usuarios.id, edicoesTabela.usuarioId))
    .where(and(like(edicoesTabela.chave, `${prefixo}%`), or(eq(edicoesTabela.usuarioId, usuarioId), eq(edicoesTabela.publico, true))));
  return linhas.flatMap((l) => {
    try {
      return [
        {
          id: l.id,
          chave: l.chave,
          nome: l.nome,
          publico: l.publico,
          minha: l.usuarioId === usuarioId,
          autor: nomeExibicao({ nome: l.autorNome, apelido: l.autorApelido }),
          valor: JSON.parse(l.valor) as unknown,
        },
      ];
    } catch {
      return []; // valor corrompido: a edição não aparece
    }
  });
}

export async function getEdicaoTabela(id: number) {
  const [e] = await getDb()
    .select({ id: edicoesTabela.id, usuarioId: edicoesTabela.usuarioId, chave: edicoesTabela.chave, nome: edicoesTabela.nome, publico: edicoesTabela.publico })
    .from(edicoesTabela)
    .where(eq(edicoesTabela.id, id));
  return e ?? null;
}

/**
 * O MOTIVO de recusar a AÇÃO na tabela da chave (`null` = pode): a tela dela no grupo ativo (a Mesa do sistema, a do PCA,
 * o Orçamento ou o PCA — basta uma) ou, na Lista de um quadro de tarefas, o papel no GRUPO DO QUADRO. Chave de outra
 * tabela (422) ou quadro que a pessoa não vê (404) também recusam. As tabelas da Administração (`chaveDeAdmin`): só o ADM.
 */
export async function recusaNaChave(acesso: Acesso, chave: string, acao: AcaoPapel): Promise<{ msg: string; status: number } | null> {
  if (chaveDeAdmin(chave)) return acesso.u.admin ? null : { msg: "Somente administradores.", status: 403 };
  const t = telasDaChave(chave);
  if (!t) return { msg: "Tabela desconhecida.", status: 422 };
  if (t.quadroId != null) {
    const q = await quadroAcessivel(acesso.u, t.quadroId);
    if (!q) return { msg: "Quadro não encontrado.", status: 404 };
    const m = motivoNoQuadro(acesso, q.grupoId, acao);
    return m ? { msg: m, status: 403 } : null;
  }
  let primeiro: string | null = null;
  for (const tela of t.telas) {
    const m = motivoRecusa(acesso, tela, acao);
    if (!m) return null;
    primeiro ??= m;
  }
  return { msg: primeiro ?? "Sem permissão.", status: 403 };
}

export async function criarEdicaoTabela(usuarioId: number, d: { chave: string; nome: string; publico: boolean; valor: unknown }): Promise<number> {
  const [e] = await getDb()
    .insert(edicoesTabela)
    .values({ chave: d.chave, nome: d.nome, publico: d.publico, valor: JSON.stringify(d.valor), usuarioId })
    .returning({ id: edicoesTabela.id });
  return e.id;
}

export async function atualizarEdicaoTabela(id: number, d: { nome?: string; publico?: boolean; valor?: unknown }): Promise<void> {
  await getDb()
    .update(edicoesTabela)
    .set({
      ...(d.nome !== undefined ? { nome: d.nome } : {}),
      ...(d.publico !== undefined ? { publico: d.publico } : {}),
      ...(d.valor !== undefined ? { valor: JSON.stringify(d.valor) } : {}),
      atualizadoEm: new Date().toISOString(),
    })
    .where(eq(edicoesTabela.id, id));
}

export async function excluirEdicaoTabela(id: number): Promise<void> {
  await getDb().delete(edicoesTabela).where(eq(edicoesTabela.id, id));
}

/** As EDIÇÕES SALVAS das tabelas de uma tela (chaves começando por `prefixo`) que o usuário vê — as dele e as públicas — e
 * as preferências de edição PADRÃO dele. Sem usuário, nada. */
export async function carregarEdicoes(usuarioId: number | null, prefixo: string): Promise<{ lista: EdicaoTabela[]; padroes: Record<string, unknown> }> {
  if (usuarioId == null) return { lista: [], padroes: {} };
  const [lista, padroes, adm] = await Promise.all([listarEdicoesTabela(usuarioId, prefixo), listarPreferenciasTabela(usuarioId, `padrao:${prefixo}`), getPadroesAdm()]);
  // O padrão PARA TODOS do ADM vai junto (`padraoAdm:<chave>`) — a escolha da pessoa vence (`edicaoInicial`).
  for (const [k, id] of Object.entries(adm)) if (k.startsWith(prefixo)) padroes[chavePadraoAdm(k)] = { id };
  return { lista, padroes };
}

// O PADRÃO PARA TODOS de cada tabela (blob `configuracoes`, chave `edicoesPadrao` → {chave: id}; cache 60 s, fail-safe = nenhum).
let cachePadroes: { at: number; dados: Record<string, number> } | null = null;

export async function getPadroesAdm(): Promise<Record<string, number>> {
  if (cachePadroes && Date.now() - cachePadroes.at < 60_000) return cachePadroes.dados;
  try {
    const dados = lerPadroesAdm((await lerBlobConfiguracoes()).edicoesPadrao);
    cachePadroes = { at: Date.now(), dados };
    return dados;
  } catch {
    return cachePadroes?.dados ?? {};
  }
}

/** Define (`id`) ou tira (`null`) o padrão para todos da tabela `chave`; com `soId`, tira só se for aquela edição. */
export async function gravarPadraoAdm(chave: string, id: number | null, usuarioId: number, soId?: number): Promise<void> {
  const blob = await lerBlobConfiguracoes();
  const atual = lerPadroesAdm(blob.edicoesPadrao);
  if (soId != null && atual[chave] !== soId) return;
  const { [chave]: _, ...resto } = atual;
  const novo = id == null ? resto : { ...resto, [chave]: id };
  await getDb()
    .update(configuracoes)
    .set({ dados: JSON.stringify({ ...blob, edicoesPadrao: novo }), atualizadoPor: usuarioId, atualizadoEm: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(configuracoes.id, 1));
  cachePadroes = null;
}
