import { type LoteCenti, type PassoLote, type Periodo, pedidosEmCurso, periodosAPedir, periodosLidos, rotuloPeriodo, type TipoErro } from "./empenhos-core.ts";

/**
 * A LEITURA DE UM ANO NA CENTI conduzida pelo NAVEGADOR (a rota lê uma página por vez — o limite de CPU do Worker): a
 * MESMA na importação manual de um card (Empenhos → card → Importação) e no "Buscar na Centi" dos vínculos (o lote em
 * modo `unidades`, que só atualiza o catálogo). Repete a falha de rede com espera; o período grande demais é dividido ao
 * meio. EM PARALELO: cada pedido é uma requisição própria (o próprio limite do Worker) — empenhos: várias SEMANAS ao mesmo
 * tempo (as páginas de uma semana em sequência); liquidações: todos os ÓRGÃOS de cada semana ao mesmo tempo. Um pedido que
 * demora ou falha não segura os outros.
 */

/** Quantos pedidos à Centi ao mesmo tempo (empenhos: semanas · liquidações: órgãos). */
export const PARALELO_EMPENHOS = 4;
export const PARALELO_LIQUIDACOES = 6;

export type RespostaPasso = {
  lote: LoteCenti;
  passo: PassoLote;
  continuar?: boolean;
  erro?: { tipo: TipoErro; mensagem: string };
  dividir?: [Periodo, Periodo] | null;
};

/** O SISTEMA respondeu e recusou (4xx) — não adianta repetir (ex.: outra aba conduz o lote). */
export class RecusaImportacao extends Error {}

/** Chama a rota da importação; devolve o JSON ou lança com a mensagem do servidor. */
export async function pedirImportacao<T>(cardId: number, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`/api/empenhos/cards/${cardId}/importar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (r.status >= 400 && r.status < 500) throw new RecusaImportacao(j.error ?? `Recusado (${r.status}).`);
  if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
  return j;
}

/** Os passos já gravados de um lote (retomar, o detalhe do histórico). */
export async function lerPassos(cardId: number, loteId: number): Promise<PassoLote[]> {
  const r = await fetch(`/api/empenhos/cards/${cardId}/importar?lote=${loteId}`);
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; passos?: PassoLote[] };
  if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
  return j.passos ?? [];
}

/** Um passo que NÃO chegou ao servidor (sem resposta do sistema) — fica só na tela. */
export function passoVazio(id: number, periodo: Periodo, pagina: number): PassoLote {
  return {
    id,
    inicio: periodo.inicio,
    fim: periodo.fim,
    pagina,
    estado: "erro",
    fimPeriodo: false,
    status: null,
    bytes: null,
    ms: null,
    recebidos: 0,
    novos: 0,
    recusados: 0,
    repetidos: 0,
    total: null,
    soma: null,
    resNovos: null,
    resAlterados: null,
    resIguais: null,
    resSemVinculo: null,
    mensagem: null,
    corpo: null,
    em: new Date().toISOString(),
  };
}

/** O que acontece agora (a linha acima da barra): o pedido mais recente e quantos estão em curso ao mesmo tempo. */
export type Agora = { periodo: Periodo; pagina: number; tentativa: number; espera?: number; emCurso?: number };

/** As esperas entre as tentativas de uma página que falhou (a Centi oscila — 500, sem resposta): ~1 min no total. */
const ESPERA_TENTATIVAS = [2000, 4000, 8000, 15000, 30000];
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Uma fila de tarefas com no máximo `n` em curso; `parar()` deixa de começar novas e espera as que já começaram. A 1ª
 * falha para tudo (as em curso terminam) e é lançada no fim. */
async function emPool<T>(fila: T[], n: number, parar: () => boolean, fazer: (t: T) => Promise<void>): Promise<void> {
  const ativos = new Set<Promise<void>>();
  let falha: unknown = null;
  while ((fila.length || ativos.size) && falha == null) {
    while (fila.length && ativos.size < n && !parar() && falha == null) {
      const t = fila.shift() as T;
      const pr: Promise<void> = fazer(t)
        .catch((e) => {
          falha ??= e;
        })
        .finally(() => ativos.delete(pr));
      ativos.add(pr);
    }
    if (!ativos.size) break;
    await Promise.race(ativos);
  }
  await Promise.all(ativos);
  if (falha != null) throw falha;
}

/**
 * LÊ o ano inteiro do lote (retomando os passos já lidos), em PARALELO, até o fim ou até `parar()`. Devolve o lote depois
 * da última página e onde parou ("período, página" — para a mensagem de erro); lança a falha final (os pedidos em curso
 * terminam antes — nada fica pela metade).
 */
export async function lerAnoNaCenti(o: {
  cardId: number;
  lote: LoteCenti;
  anteriores: PassoLote[];
  condutor: string;
  comPeriodo: boolean;
  parar: () => boolean;
  onPasso: (p: PassoLote) => void;
  onLote: (l: LoteCenti) => void;
  onAgora: (a: Agora | null) => void;
  /** Ids negativos para os passos que não chegaram ao servidor. */
  idLocal: () => number;
  /** Onde parou (o pedido que falhou primeiro — a mensagem de erro de quem chama). */
  onde: (texto: string) => void;
}): Promise<LoteCenti> {
  let lote = o.lote;
  let falhou = false;
  const parar = () => falhou || o.parar();
  let emCurso = 0;
  // O lote mais NOVO vence (as respostas paralelas chegam fora de ordem): pelo `vistoEm`, a contagem do banco.
  const aplicarLote = (l: LoteCenti) => {
    if (l.vistoEm >= lote.vistoEm) {
      lote = l;
      o.onLote(l);
    }
  };
  async function passo(periodo: Periodo, pagina: number): Promise<RespostaPasso> {
    for (let t = 0; ; t++) {
      if (parar()) throw new Error("Interrompida.");
      o.onAgora({ periodo, pagina, tentativa: t + 1, emCurso });
      let r: RespostaPasso;
      try {
        r = await pedirImportacao<RespostaPasso>(o.cardId, { acao: "pagina", lote: lote.id, condutor: o.condutor, inicio: periodo.inicio, fim: periodo.fim, pagina });
      } catch (e) {
        if (e instanceof RecusaImportacao) throw e;
        // Sem resposta do SISTEMA (rede, sessão) — o passo não chegou ao servidor: fica registrado só na tela.
        const mensagem = `Sem resposta do sistema: ${e instanceof Error ? e.message : "falha de rede"}`;
        o.onPasso({ ...passoVazio(o.idLocal(), periodo, pagina), estado: "erro", mensagem });
        if (t >= ESPERA_TENTATIVAS.length) throw new Error(mensagem);
        o.onAgora({ periodo, pagina, tentativa: t + 1, espera: ESPERA_TENTATIVAS[t], emCurso });
        await esperar(ESPERA_TENTATIVAS[t]);
        continue;
      }
      o.onPasso(r.passo);
      aplicarLote(r.lote);
      if (!r.erro || r.dividir) return r;
      if (r.erro.tipo !== "rede" || t >= ESPERA_TENTATIVAS.length) throw new Error(r.erro.mensagem);
      o.onAgora({ periodo, pagina, tentativa: t + 1, espera: ESPERA_TENTATIVAS[t], emCurso });
      await esperar(ESPERA_TENTATIVAS[t]);
    }
  }
  // LIQUIDAÇÕES: cada "página" é um órgão (todos de cada período, em paralelo); empenhos: as páginas em sequência.
  const orgaos = lote.modo === "liquidacoes" ? (lote.orgaosCenti?.length ?? 0) : undefined;
  const todasAsPaginas = (periodo: Periodo) => (orgaos == null ? [{ periodo, pagina: 1 }] : Array.from({ length: orgaos }, (_, i) => ({ periodo, pagina: i + 1 })));
  // A FILA: o que falta dos períodos começados e o que falta do ano, semana a semana.
  const emAndamento = pedidosEmCurso(o.anteriores, orgaos);
  const fila: { periodo: Periodo; pagina: number }[] = [...emAndamento];
  const comecados = [...new Map(emAndamento.map((p) => [`${p.periodo.inicio}|${p.periodo.fim}`, p.periodo])).values()];
  for (const p of periodosAPedir(lote.ano, [...periodosLidos(o.anteriores), ...comecados], o.comPeriodo)) fila.push(...todasAsPaginas(p));
  const divididos = new Set<string>();
  try {
    await emPool(fila, orgaos == null ? PARALELO_EMPENHOS : PARALELO_LIQUIDACOES, parar, async (item) => {
      emCurso++;
      try {
        const r = await passo(item.periodo, item.pagina);
        if (r.dividir) {
          // O período grande demais recomeça nas metades — nas liquidações, com TODOS os órgãos (uma vez por período).
          const k = `${item.periodo.inicio}|${item.periodo.fim}`;
          if (!divididos.has(k)) {
            divididos.add(k);
            fila.unshift(...r.dividir.flatMap(todasAsPaginas));
          }
        } else if (r.continuar && orgaos == null) fila.unshift({ periodo: item.periodo, pagina: item.pagina + 1 });
      } catch (e) {
        // Onde parou = o pedido que FALHOU primeiro (com vários em curso, nunca o último que começou).
        if (!falhou) o.onde(`${rotuloPeriodo(item.periodo)}, ${orgaos == null ? "página" : "órgão"} ${item.pagina}`);
        falhou = true;
        throw e;
      } finally {
        emCurso--;
      }
    });
  } finally {
    o.onAgora(null);
  }
  return lote;
}
