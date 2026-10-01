import { asc, eq, sql } from "drizzle-orm";
import { catalogoCompras, catalogoContratos, catalogoPastas } from "@/db/schema";
import { comandosCatalogosDaPasta, comandosCompras, comandosContratos, comandosExcluirPasta } from "./catalogo-historico-sql";
import type { CompraHistoricoImport, ContratoHistoricoImport } from "./catalogo-validation";
import { getDb } from "./db";
import type { CompraHistorico, ContratoHistorico } from "./historico-compra-core";

/**
 * Acesso ao D1 do HISTÓRICO DE COMPRA e das PASTAS do catálogo (migração `0074`). Só escopo de request (`getDb`). Os
 * comandos de lote são os builders testados de `catalogo-historico-sql.ts`.
 */

// biome-ignore lint/suspicious/noExplicitAny: a tupla exigida por db.batch() do Drizzle é inviável de anotar.
type Lote = [any, ...any[]];

export async function gravarContratosHistorico(catalogoId: number, contratos: readonly ContratoHistoricoImport[]): Promise<void> {
  const db = getDb();
  const cmds = comandosContratos(db, catalogoId, contratos);
  if (cmds.length > 0) await db.batch(cmds as unknown as Lote);
}

export async function gravarComprasHistorico(catalogoId: number, rows: readonly CompraHistoricoImport[]): Promise<void> {
  const db = getDb();
  const cmds = comandosCompras(db, catalogoId, rows);
  if (cmds.length > 0) await db.batch(cmds as unknown as Lote);
}

/** O histórico inteiro de UM catálogo (contratos + itens na ordem do arquivo) — carregado ao abrir. */
export async function getHistorico(catalogoId: number): Promise<{ contratos: ContratoHistorico[]; itens: CompraHistorico[] }> {
  const db = getDb();
  const [contratos, itens] = await Promise.all([
    db
      .select({
        idContrato: catalogoContratos.idContrato,
        numeroContrato: catalogoContratos.numeroContrato,
        idLicitacao: catalogoContratos.idLicitacao,
        numeroLicitacao: catalogoContratos.numeroLicitacao,
        orgao: catalogoContratos.orgao,
        unidadeGestora: catalogoContratos.unidadeGestora,
        credor: catalogoContratos.credor,
        valorContrato: catalogoContratos.valorContrato,
        dataAssinatura: catalogoContratos.dataAssinatura,
        dataPublicacao: catalogoContratos.dataPublicacao,
        modalidade: catalogoContratos.modalidade,
        protocolo: catalogoContratos.protocolo,
        objeto: catalogoContratos.objeto,
        natureza: catalogoContratos.natureza,
        detalhamento: catalogoContratos.detalhamento,
      })
      .from(catalogoContratos)
      .where(eq(catalogoContratos.catalogoId, catalogoId))
      .orderBy(asc(catalogoContratos.dataAssinatura), asc(catalogoContratos.id)),
    db
      .select({
        ordem: catalogoCompras.ordem,
        idContrato: catalogoCompras.idContrato,
        processo: catalogoCompras.processo,
        codigo: catalogoCompras.codigo,
        sequencial: catalogoCompras.sequencial,
        descricao: catalogoCompras.descricao,
        qtdContratada: catalogoCompras.qtdContratada,
        qtdAditada: catalogoCompras.qtdAditada,
        qtdEmpenhada: catalogoCompras.qtdEmpenhada,
        qtdOfEmpenhar: catalogoCompras.qtdOfEmpenhar,
        saldoEmpenhar: catalogoCompras.saldoEmpenhar,
        valorUnitario: catalogoCompras.valorUnitario,
        valorContratado: catalogoCompras.valorContratado,
        valorEmpenhado: catalogoCompras.valorEmpenhado,
        saldoValorEmpenhar: catalogoCompras.saldoValorEmpenhar,
        qtdLiquidada: catalogoCompras.qtdLiquidada,
        qtdLiquidadaAnulada: catalogoCompras.qtdLiquidadaAnulada,
        qtdEmpenhadaAnulada: catalogoCompras.qtdEmpenhadaAnulada,
        saldoLiquidar: catalogoCompras.saldoLiquidar,
      })
      .from(catalogoCompras)
      .where(eq(catalogoCompras.catalogoId, catalogoId))
      .orderBy(asc(catalogoCompras.ordem)),
  ]);
  return { contratos, itens };
}

// ---------------------------------------------------------------- Pastas

export type PastaCatalogo = { id: number; nome: string; cor: string; ordem: number };

export async function listarPastasCatalogo(): Promise<PastaCatalogo[]> {
  return getDb()
    .select({ id: catalogoPastas.id, nome: catalogoPastas.nome, cor: catalogoPastas.cor, ordem: catalogoPastas.ordem })
    .from(catalogoPastas)
    .orderBy(asc(catalogoPastas.ordem), asc(catalogoPastas.nome));
}

export async function getPastaCatalogo(id: number): Promise<PastaCatalogo | null> {
  const [p] = await getDb()
    .select({ id: catalogoPastas.id, nome: catalogoPastas.nome, cor: catalogoPastas.cor, ordem: catalogoPastas.ordem })
    .from(catalogoPastas)
    .where(eq(catalogoPastas.id, id))
    .limit(1);
  return p ?? null;
}

/** Cria a pasta no FIM da ordem e (opcional) põe nela os catálogos escolhidos — um lote. */
export async function criarPastaCatalogo(dados: { nome: string; cor: string; catalogos?: number[] }, usuarioId: number): Promise<number> {
  const db = getDb();
  const [p] = await db
    .insert(catalogoPastas)
    .values({ nome: dados.nome, cor: dados.cor, criadoPor: usuarioId, ordem: sql`(SELECT COALESCE(MAX(ordem), 0) + 1 FROM catalogo_pastas)` })
    .returning({ id: catalogoPastas.id });
  if (dados.catalogos?.length) await db.batch(comandosCatalogosDaPasta(db, p.id, dados.catalogos) as unknown as Lote);
  return p.id;
}

export async function atualizarPastaCatalogo(id: number, dados: { nome?: string; cor?: string; catalogos?: number[] }): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = { atualizadoEm: sql`(CURRENT_TIMESTAMP)` };
  if (dados.nome !== undefined) set.nome = dados.nome;
  if (dados.cor !== undefined) set.cor = dados.cor;
  await db.batch([db.update(catalogoPastas).set(set).where(eq(catalogoPastas.id, id)), ...(dados.catalogos ? comandosCatalogosDaPasta(db, id, dados.catalogos) : [])] as unknown as Lote);
}

export async function excluirPastaCatalogo(id: number): Promise<void> {
  const db = getDb();
  await db.batch(comandosExcluirPasta(db, id) as unknown as Lote);
}
