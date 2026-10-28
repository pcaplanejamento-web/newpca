import { inArray } from "drizzle-orm";
import { empenhoCards } from "@/db/schema";
import { getDb } from "./db";
import type { TipoCard } from "./empenho-cards-core";
import { listarPassos, paraLote } from "./empenhos";
import { type AndamentoLote, fracaoDoAndamento, fracaoDoAno, type LoteCenti, type PassoLote, QUEM_AUTO } from "./empenhos-core";
import { leituraDoLote } from "./empenhos-fragmentos";
import { consultaLotesAoVivo } from "./empenhos-sql";

/**
 * TODAS AS IMPORTAÇÕES EM ANDAMENTO (e as que terminaram há pouco), para o ADM acompanhar ao vivo no canto inferior direito —
 * as da atualização automática (o cron, no servidor), as de outras abas e de outras pessoas. Cada uma com o card, o ano, a
 * fração lida (a MESMA régua da tela do card: o ano lido + a resposta grande em fragmentos), a leitura grande em curso e os
 * últimos passos à Centi.
 */
export type PassoAoVivo = Omit<PassoLote, "corpo">;
export type LoteAoVivo = LoteCenti & {
  cardId: number;
  cardNome: string;
  tipo: TipoCard;
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

export async function andamentoDasImportacoes(): Promise<LoteAoVivo[]> {
  const db = getDb();
  const lotes = await consultaLotesAoVivo(db, sqlAgoraMenos(MINUTOS_DESFECHO));
  if (!lotes.length) return [];
  const cards = await db
    .select({ id: empenhoCards.id, nome: empenhoCards.nome, tipo: empenhoCards.tipo })
    .from(empenhoCards)
    .where(inArray(empenhoCards.id, [...new Set(lotes.map((l) => l.cardId ?? 0))]));
  const porId = new Map(cards.map((c) => [c.id, c]));
  return Promise.all(
    lotes.flatMap((l) => {
      const c = porId.get(l.cardId ?? 0);
      return c ? [{ lote: l, cardNome: c.nome, tipo: c.tipo }] : [];
    }).map(async ({ lote: l, cardNome, tipo }) => {
      const lote = paraLote(l);
      const lendo = lote.estado === "lendo";
      const [passos, leituraBruta] = lendo ? await Promise.all([listarPassos(lote.id), leituraDoLote(lote.id)]) : [[] as PassoLote[], null];
      const leitura: AndamentoLote["leitura"] = leituraBruta
        ? { inicio: leituraBruta.inicio, fim: leituraBruta.fim, bytes: leituraBruta.bytesCapturados, comprimento: leituraBruta.comprimento, capturado: !!leituraBruta.capturado, pos: leituraBruta.pos, chars: leituraBruta.charsCapturados }
        : null;
      const fracao = lendo ? fracaoDoAndamento(lote.ano, { fracao: fracaoDoAno(lote.ano, passos), leitura }) : 1;
      const erros = passos.filter((p) => p.estado === "erro" && !(p.mensagem ?? "").startsWith("Guardando a página")).length;
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
        bytes: passos.reduce((s, p) => s + (p.bytes ?? 0), 0),
      };
    }),
  );
}
