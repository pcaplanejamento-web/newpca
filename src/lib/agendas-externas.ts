import { and, asc, eq } from "drizzle-orm";
import { calendarioExternos } from "@/db/schema";
import { getDb } from "./db";
import { type AgendaExterna, lerIcs, MAX_BYTES_ICS, urlAgendaValida } from "./ics-core";

/**
 * AGENDAS EXTERNAS (migração `0049`) — acesso ao D1 + a LEITURA do `.ics` (só escopo de request). A agenda é da PESSOA
 * (somente leitura). O arquivo é baixado sob demanda, só por HTTPS e fora da rede interna (`urlAgendaValida`), com tempo
 * e tamanho limitados, e fica 10 minutos em memória (a mesma agenda aberta por várias pessoas/meses não é baixada de novo).
 */

export type CadastroExterno = { id: number; nome: string; url: string; cor: string | null };

export async function listarExternos(usuarioId: number): Promise<CadastroExterno[]> {
  return getDb()
    .select({ id: calendarioExternos.id, nome: calendarioExternos.nome, url: calendarioExternos.url, cor: calendarioExternos.cor })
    .from(calendarioExternos)
    .where(eq(calendarioExternos.usuarioId, usuarioId))
    .orderBy(asc(calendarioExternos.id));
}

export async function criarExterno(usuarioId: number, d: { nome: string; url: string; cor: string | null }): Promise<number> {
  const [r] = await getDb().insert(calendarioExternos).values({ usuarioId, ...d }).returning({ id: calendarioExternos.id });
  return r.id;
}

export async function atualizarExterno(usuarioId: number, id: number, d: { nome?: string; cor?: string | null }) {
  await getDb()
    .update(calendarioExternos)
    .set(d)
    .where(and(eq(calendarioExternos.id, id), eq(calendarioExternos.usuarioId, usuarioId)));
}

export async function excluirExterno(usuarioId: number, id: number) {
  await getDb()
    .delete(calendarioExternos)
    .where(and(eq(calendarioExternos.id, id), eq(calendarioExternos.usuarioId, usuarioId)));
}

const TEMPO_MS = 8000;
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { em: number; eventos: AgendaExterna["eventos"] }>();

/** Baixa e lê a agenda (cache de 10 min). Lança `Error` com a mensagem para a pessoa. */
export async function lerAgendaExterna(bruta: string): Promise<AgendaExterna["eventos"]> {
  const url = urlAgendaValida(bruta);
  if (!url) throw new Error("Link inválido: use um endereço https:// (ou webcal://) público.");
  const c = cache.get(url);
  if (c && Date.now() - c.em < CACHE_MS) return c.eventos;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TEMPO_MS);
  let texto = "";
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" }, redirect: "follow" });
    if (!r.ok) throw new Error(`A agenda respondeu ${r.status}.`);
    if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES_ICS) throw new Error("A agenda é grande demais (máx. 2 MB).");
    const leitor = r.body?.getReader();
    if (!leitor) throw new Error("A agenda veio vazia.");
    const dec = new TextDecoder();
    let lidos = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      lidos += value.byteLength;
      if (lidos > MAX_BYTES_ICS) {
        await leitor.cancel();
        throw new Error("A agenda é grande demais (máx. 2 MB).");
      }
      texto += dec.decode(value, { stream: true });
    }
    texto += dec.decode();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("A agenda demorou demais para responder.");
    if (e instanceof Error && /^(A agenda|Link)/.test(e.message)) throw e;
    throw new Error("Não foi possível baixar a agenda.");
  } finally {
    clearTimeout(t);
  }
  if (!/BEGIN:VCALENDAR/i.test(texto)) throw new Error("O link não é uma agenda .ics.");
  const eventos = lerIcs(texto);
  if (cache.size > 30) cache.delete(cache.keys().next().value as string);
  cache.set(url, { em: Date.now(), eventos });
  return eventos;
}
