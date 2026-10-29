import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { centiLotes, empenhoCards, frotaCursores, frotaLeituras } from "@/db/schema";
import { getDb } from "./db";
import type { TipoCard, TipoImportacao } from "./empenho-cards-core";
import { frotaAoVivo, type LeituraFrotaAoVivo } from "./frota-andamento-core";
import { listarPassos, paraLote } from "./empenhos";
import { type AndamentoLote, fracaoDoAndamento, type LoteCenti, MARCA_GUARDANDO, type PassoLote, QUEM_AUTO } from "./empenhos-core";
import { andamentoDoLote } from "./empenhos-fragmentos";
import { consultaLotesAoVivo } from "./empenhos-sql";

/**
 * TODAS AS IMPORTAÇÕES EM ANDAMENTO (e as que terminaram há pouco), para o ADM acompanhar ao vivo no canto inferior direito —
 * as da atualização automática (o cron, no servidor), as de outras abas e de outras pessoas. Cada uma com o card, o ano, a
 * fração lida (a MESMA régua da tela do card: o ano lido + a resposta grande em fragmentos), a leitura grande em curso e os
 * últimos passos à Centi.
 */
export type PassoAoVivo = Omit<PassoLote, "corpo"> & { erro?: string | null };
export type LoteAoVivo = LoteCenti & {
  /** O card (Centi); null = a FROTA (Vólus — a automática pelos cursores e as leituras recentes). */
  cardId: number | null;
  cardNome: string;
  tipo: TipoImportacao;
  /** A atualização automática começou esta importação. */
  doCron: boolean;
  fracao: number;
  leitura: AndamentoLote["leitura"];
  /** Os últimos passos (o mais novo primeiro) e as contagens de todos. */
  passos: PassoAoVivo[];
  pedidos: number;
  erros: number;
  bytes: number;
};

/** Até quanto tempo depois de terminar a importação ainda aparece (o desfecho no painel). */
export const MINUTOS_DESFECHO = 20;
const ULTIMOS_PASSOS = 8;

const sqlAgoraMenos = (min: number) => new Date(Date.now() - min * 60_000).toISOString().replace("T", " ").slice(0, 19);

/**
 * As importações ao vivo; com `ultimaDe`, também a ÚLTIMA importação de um tipo de card (qualquer estado e quando for — o
 * relógio da Execução abre ela no painel do canto), com os passos mesmo já encerrada (`ultima`).
 */
export async function andamentoDasImportacoes(ultimaDe?: TipoImportacao): Promise<{ lotes: LoteAoVivo[]; ultima: LoteAoVivo | null }> {
  const [centi, frota] = await Promise.all([andamentoCenti(ultimaDe === "frotas" ? undefined : ultimaDe), andamentoFrota(ultimaDe === "frotas")]);
  return { lotes: frota.aoVivo ? [...centi.lotes, frota.aoVivo] : centi.lotes, ultima: ultimaDe === "frotas" ? frota.ultima : centi.ultima };
}

/** A FROTA: os cursores travados (a automática lendo) + as leituras dos últimos minutos; com `ultima`, as da última leitura. */
async function andamentoFrota(ultima: boolean): Promise<{ aoVivo: LoteAoVivo | null; ultima: LoteAoVivo | null }> {
  const db = getDb();
  const agoraIso = new Date().toISOString();
  try {
    const [cursores, recentes, ultimas] = await Promise.all([
      db
        .select({
          contrato: frotaCursores.contrato,
          tipo: frotaCursores.tipo,
          travaAte: frotaCursores.travaAte,
          cicloInicio: frotaCursores.cicloInicio,
          proximo: frotaCursores.proximo,
          falhas: frotaCursores.falhas,
          esperaAte: frotaCursores.esperaAte,
          ultimoErro: frotaCursores.ultimoErro,
        })
        .from(frotaCursores),
      db.select().from(frotaLeituras).where(gte(frotaLeituras.em, sqlAgoraMenos(MINUTOS_DESFECHO))).orderBy(desc(frotaLeituras.id)).limit(200),
      ultima ? db.select().from(frotaLeituras).orderBy(desc(frotaLeituras.id)).limit(8) : Promise.resolve([]),
    ]);
    const aoVivo = frotaAoVivo(cursores, recentes as LeituraFrotaAoVivo[], agoraIso);
    return { aoVivo, ultima: ultima ? (aoVivo ?? frotaAoVivo([], ultimas as LeituraFrotaAoVivo[], agoraIso)) : null };
  } catch {
    // A frota ainda sem tabelas/sem dados: o painel segue com a Centi.
    return { aoVivo: null, ultima: null };
  }
}

async function andamentoCenti(ultimaDe?: TipoCard): Promise<{ lotes: LoteAoVivo[]; ultima: LoteAoVivo | null }> {
  const db = getDb();
  const [aoVivo, [ultimo]] = await Promise.all([
    consultaLotesAoVivo(db, sqlAgoraMenos(MINUTOS_DESFECHO)),
    ultimaDe
      ? db
          .select({ l: centiLotes })
          .from(centiLotes)
          .innerJoin(empenhoCards, eq(empenhoCards.id, centiLotes.cardId))
          .where(and(eq(empenhoCards.tipo, ultimaDe), ne(centiLotes.modo, "unidades")))
          .orderBy(desc(centiLotes.id))
          .limit(1)
      : Promise.resolve([] as { l: typeof centiLotes.$inferSelect }[]),
  ]);
  const lotes = ultimo && !aoVivo.some((l) => l.id === ultimo.l.id) ? [...aoVivo, ultimo.l] : aoVivo;
  if (!lotes.length) return { lotes: [], ultima: null };
  const cards = await db
    .select({ id: empenhoCards.id, nome: empenhoCards.nome, tipo: empenhoCards.tipo })
    .from(empenhoCards)
    .where(inArray(empenhoCards.id, [...new Set(lotes.map((l) => l.cardId ?? 0))]));
  const porId = new Map(cards.map((c) => [c.id, c]));
  const todos: LoteAoVivo[] = await Promise.all(
    lotes.flatMap((l) => {
      const c = porId.get(l.cardId ?? 0);
      return c ? [{ lote: l, cardNome: c.nome, tipo: c.tipo }] : [];
    }).map(async ({ lote: l, cardNome, tipo }) => {
      const lote = paraLote(l);
      const lendo = lote.estado === "lendo";
      const consultado = lote.id === ultimo?.l.id;
      const passos = lendo || consultado ? await listarPassos(lote.id) : ([] as PassoLote[]);
      const andamento = lendo ? await andamentoDoLote({ ...lote, cardId: l.cardId }, passos) : null;
      const leitura = andamento?.leitura ?? null;
      const fracao = andamento ? fracaoDoAndamento(lote.ano, andamento) : 1;
      const guardando = (p: PassoLote) => p.estado === "erro" && (p.mensagem ?? "").startsWith(MARCA_GUARDANDO);
      const erros = passos.filter((p) => p.estado === "erro" && !guardando(p)).length;
      // Os registros da página que AINDA chega em partes (o passo "Guardando…") já contam — o lote só reconta no fim dela.
      const emCurso = passos.filter(guardando).reduce((s, p) => s + (p.recebidos ?? 0), 0);
      return {
        ...lote,
        cardId: l.cardId ?? 0,
        cardNome,
        tipo: tipo as TipoCard,
        doCron: lote.iniciadoPor === QUEM_AUTO,
        fracao,
        leitura,
        passos: passos
          .slice(-ULTIMOS_PASSOS)
          .reverse()
          .map(({ corpo: _, ...p }) => p),
        pedidos: passos.length,
        erros,
        unicos: (lote.unicos ?? 0) + emCurso,
        // O baixado inclui a resposta grande capturada em fragmentos (o passo dela só tem os bytes no fim).
        bytes: passos.reduce((s, p) => s + (p.bytes ?? 0), 0) + (leitura?.bytes ?? 0),
      };
    }),
  );
  const ultima = ultimo ? (todos.find((l) => l.id === ultimo.l.id) ?? null) : null;
  return { lotes: todos.filter((l) => l.id !== ultimo?.l.id || aoVivo.some((x) => x.id === l.id)), ultima };
}
