import { type LoteCenti, type PassoLote, type Periodo, periodoEmCurso, periodosAPedir, periodosLidos, rotuloPeriodo, type TipoErro } from "./empenhos-core";

/**
 * A LEITURA DE UM ANO NA CENTI conduzida pelo NAVEGADOR (a rota lê uma página por vez — o limite de CPU do Worker): a
 * MESMA na importação manual de um card (Empenhos → card → Importação) e no "Buscar na Centi" dos vínculos (o lote em
 * modo `unidades`, que só atualiza o catálogo). Repete a falha de rede com espera; o período grande demais é dividido ao
 * meio.
 */

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

/** O que acontece agora (a linha acima da barra). */
export type Agora = { periodo: Periodo; pagina: number; tentativa: number; espera?: number };

/** As esperas entre as tentativas de uma página que falhou (a Centi oscila — 500, sem resposta): ~1 min no total. */
const ESPERA_TENTATIVAS = [2000, 4000, 8000, 15000, 30000];
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * LÊ o ano inteiro do lote (retomando os passos já lidos), página a página, até o fim ou até `parar()`. Devolve o lote
 * depois da última página e onde parou ("período, página" — para a mensagem de erro); lança a falha final.
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
  /** Onde está (atualizado a cada página — a mensagem de erro de quem chama). */
  onde: (texto: string) => void;
}): Promise<LoteCenti> {
  let lote = o.lote;
  async function passo(periodo: Periodo, pagina: number): Promise<RespostaPasso> {
    for (let t = 0; ; t++) {
      if (o.parar()) throw new Error("Interrompida.");
      o.onAgora({ periodo, pagina, tentativa: t + 1 });
      let r: RespostaPasso;
      try {
        r = await pedirImportacao<RespostaPasso>(o.cardId, { acao: "pagina", lote: lote.id, condutor: o.condutor, inicio: periodo.inicio, fim: periodo.fim, pagina });
      } catch (e) {
        if (e instanceof RecusaImportacao) throw e;
        // Sem resposta do SISTEMA (rede, sessão) — o passo não chegou ao servidor: fica registrado só na tela.
        const mensagem = `Sem resposta do sistema: ${e instanceof Error ? e.message : "falha de rede"}`;
        o.onPasso({ ...passoVazio(o.idLocal(), periodo, pagina), estado: "erro", mensagem });
        if (t >= ESPERA_TENTATIVAS.length) throw new Error(mensagem);
        o.onAgora({ periodo, pagina, tentativa: t + 1, espera: ESPERA_TENTATIVAS[t] });
        await esperar(ESPERA_TENTATIVAS[t]);
        continue;
      }
      o.onPasso(r.passo);
      o.onLote(r.lote);
      if (!r.erro || r.dividir) return r;
      if (r.erro.tipo !== "rede" || t >= ESPERA_TENTATIVAS.length) throw new Error(r.erro.mensagem);
      o.onAgora({ periodo, pagina, tentativa: t + 1, espera: ESPERA_TENTATIVAS[t] });
      await esperar(ESPERA_TENTATIVAS[t]);
    }
  }
  // A FILA: o período começado (na próxima página) e o que falta do ano, semana a semana.
  const emCurso = periodoEmCurso(o.anteriores);
  const fila: { periodo: Periodo; pagina: number }[] = emCurso ? [emCurso] : [];
  for (const p of periodosAPedir(lote.ano, [...periodosLidos(o.anteriores), ...(emCurso ? [emCurso.periodo] : [])], o.comPeriodo)) fila.push({ periodo: p, pagina: 1 });
  for (let item = fila.shift(); item; item = fila.shift()) {
    if (o.parar()) break;
    o.onde(`${rotuloPeriodo(item.periodo)}, página ${item.pagina}`);
    const r = await passo(item.periodo, item.pagina);
    lote = r.lote;
    if (r.dividir) fila.unshift(...r.dividir.map((periodo) => ({ periodo, pagina: 1 })));
    else if (r.continuar) fila.unshift({ periodo: item.periodo, pagina: item.pagina + 1 });
  }
  o.onAgora(null);
  return lote;
}
