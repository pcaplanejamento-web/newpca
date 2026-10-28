import { type LoteCenti, lerPaginaEmpenhos, lotePorMes, lotePorOrgao, type PassoLote, type Periodo, pedidosEmCurso, periodosAPedir, periodosLidos, rotuloPeriodo, type TipoErro } from "./empenhos-core.ts";
import { type ModoParte, partesComIguais } from "./importacao-partes-core.ts";
import { lerPaginaLiquidacoes } from "./liquidacoes-core.ts";
import { lerPaginaPagamentos } from "./pagamentos-core.ts";

/**
 * A LEITURA DE UM ANO NA CENTI conduzida pelo NAVEGADOR (a rota baixa uma página por vez e o JSON é lido AQUI, guardado em
 * partes de tamanho fixo — `lerPaginaNoNavegador`; nenhuma requisição passa do limite de CPU do plano gratuito do Worker): a
 * MESMA na importação manual de um card (Empenhos → card → Importação) e no "Buscar na Centi" dos vínculos (o lote em
 * modo `unidades`, que só atualiza o catálogo). Repete a falha de rede com espera; o período grande demais é dividido ao
 * meio. EM PARALELO: cada pedido é uma requisição própria (o próprio limite do Worker) — empenhos: várias SEMANAS ao mesmo
 * tempo (as páginas de uma semana em sequência); liquidações: todos os ÓRGÃOS de cada semana ao mesmo tempo; pagamentos:
 * todos os ÓRGÃOS de cada MÊS ao mesmo tempo. Um pedido que
 * demora ou falha não segura os outros.
 */

/** Quantos pedidos à Centi ao mesmo tempo (empenhos: semanas · liquidações: órgãos). */
export const PARALELO_EMPENHOS = 4;
export const PARALELO_LIQUIDACOES = 6;
/** Quantas PARTES de uma mesma página ao mesmo tempo (a página grande — o ano inteiro — chega em dezenas de partes). */
export const PARALELO_PARTES = 4;

export type RespostaPasso = {
  /** null na parte do meio de uma página (a contagem do lote só muda na última). */
  lote: LoteCenti | null;
  passo: PassoLote;
  continuar?: boolean;
  erro?: { tipo: TipoErro; mensagem: string };
  dividir?: Periodo[] | null;
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

/**
 * UMA PÁGINA lida NO NAVEGADOR (o servidor nunca lê o JSON inteiro — o limite de CPU do plano gratuito do Worker): `baixar`
 * traz a resposta da Centi crua (ou o passo de erro, já registrado); o JSON é lido aqui pelas MESMAS funções do servidor e
 * as linhas vão em PARTES de tamanho fixo (`parte`); a leitura que falha vira o passo de erro (`falha`).
 */
export async function lerPaginaNoNavegador(
  cardId: number,
  modo: ModoParte,
  ano: number,
  base: { lote: number; condutor: string; inicio: string; fim: string; pagina: number },
  gravados: ReadonlyMap<string, string> = new Map(),
  leitor = 0,
): Promise<RespostaPasso> {
  const t0 = performance.now();
  const r = await fetch(`/api/empenhos/cards/${cardId}/importar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "baixar", ...base }) });
  const statusCenti = r.headers.get("x-centi-status");
  if (r.status >= 400 || statusCenti == null) {
    // O passo de ERRO (já registrado no servidor) ou a recusa — o JSON de sempre.
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & RespostaPasso;
    if (r.status >= 400 && r.status < 500) throw new RecusaImportacao(j.error ?? `Recusado (${r.status}).`);
    if (!r.ok || !j.ok) throw new Error(j.error ?? `Falha (${r.status}).`);
    return j;
  }
  let texto: string;
  try {
    texto = await r.text();
  } catch {
    // O REPASSE caiu no meio: a resposta passou do teto (ou a conexão caiu) — o período é dividido (pedidos menores).
    return pedirImportacao<RespostaPasso>(cardId, { acao: "falha", ...base, mensagem: "A API da Centi é grande demais para um pedido só (ou a conexão caiu no meio) — o período será dividido.", status: Number(statusCenti) || null, bytes: null, ms: Math.round(performance.now() - t0) });
  }
  const ms = Math.round(performance.now() - t0);
  const status = Number(statusCenti) || null;
  let lida: ReturnType<typeof lerPaginaEmpenhos> | ReturnType<typeof lerPaginaLiquidacoes> | ReturnType<typeof lerPaginaPagamentos>;
  try {
    lida = modo === "pagamentos" ? lerPaginaPagamentos(texto, ano) : modo === "liquidacoes" ? lerPaginaLiquidacoes(texto, ano) : lerPaginaEmpenhos(texto, ano);
  } catch (e) {
    const mensagem = (e instanceof Error ? e.message : "Resposta inválida da Centi.").slice(0, 500);
    return pedirImportacao<RespostaPasso>(cardId, { acao: "falha", ...base, mensagem, status, bytes: texto.length || null, ms });
  }
  // SÓ O QUE MUDOU vai inteiro: o registro com a assinatura gravada vai só como o par (chave + assinatura).
  const partes = partesComIguais(modo, lida.linhas, gravados, leitor);
  const enviar = (i: number, passo: number | null) => {
    const ultima = i === partes.length - 1;
    const resumo = ultima ? { status, bytes: texto.length || null, ms, recebidos: lida.recebidos, recusados: lida.recusados, repetidos: lida.repetidos, total: lida.total, reparado: lida.reparado } : null;
    return pedirImportacao<RespostaPasso>(cardId, { acao: "parte", ...base, parte: i, partes: partes.length, passo, linhas: partes[i].tuplas, iguais: partes[i].iguais, resumo });
  };
  // A 1ª parte cria o passo; as do MEIO vão em PARALELO (cada uma soma no passo, no banco); a ÚLTIMA fecha, depois de todas.
  const primeira = await enviar(0, null);
  if (partes.length === 1) return primeira;
  const passo = primeira.passo.id;
  await emPool(
    Array.from({ length: partes.length - 2 }, (_, k) => k + 1),
    PARALELO_PARTES,
    () => false,
    async (i) => {
      await enviar(i, passo);
    },
  );
  return enviar(partes.length - 1, passo);
}

/** O modo das linhas do lote (os empenhos e o catálogo leem a mesma resposta). */
export const modoDoLote = (l: Pick<LoteCenti, "modo">): ModoParte => (l.modo === "liquidacoes" || l.modo === "pagamentos" ? l.modo : "empenhos");

/** As ASSINATURAS gravadas do card no ano (chave → assinatura) — baixadas UMA vez no começo; falhou = mapa vazio (tudo vai
 * inteiro, como antes — nunca deixa de importar). */
export async function lerAssinaturas(cardId: number, ano: number): Promise<Map<string, string>> {
  try {
    const r = await fetch(`/api/empenhos/cards/${cardId}/importar?assinaturas=${ano}`);
    const j = (await r.json()) as { ok?: boolean; assinaturas?: Record<string, string> };
    return r.ok && j.ok && j.assinaturas ? new Map(Object.entries(j.assinaturas)) : new Map();
  } catch {
    return new Map();
  }
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
  // O catálogo ("unidades") não grava registros: sem assinaturas.
  const gravados = o.lote.modo === "unidades" ? Promise.resolve(new Map<string, string>()) : lerAssinaturas(o.cardId, o.lote.ano);
  const parar = () => falhou || o.parar();
  let emCurso = 0;
  // O lote mais NOVO vence (as respostas paralelas chegam fora de ordem): pelo `vistoEm`, a contagem do banco.
  const aplicarLote = (l: LoteCenti | null) => {
    if (l && l.vistoEm >= lote.vistoEm) {
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
        r = await lerPaginaNoNavegador(o.cardId, modoDoLote(lote), lote.ano, { lote: lote.id, condutor: o.condutor, inicio: periodo.inicio, fim: periodo.fim, pagina }, await gravados, lote.leitor);
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
  // LIQUIDAÇÕES e PAGAMENTOS: cada "página" é um órgão (todos de cada período, em paralelo); empenhos: as páginas em
  // sequência. PAGAMENTOS: o período é o MÊS (a Centi só recorta por mês).
  const orgaos = lotePorOrgao(lote) ? (lote.orgaosCenti?.length ?? 0) : undefined;
  const porMes = lotePorMes(lote);
  const todasAsPaginas = (periodo: Periodo) => (orgaos == null ? [{ periodo, pagina: 1 }] : Array.from({ length: orgaos }, (_, i) => ({ periodo, pagina: i + 1 })));
  // A FILA: o que falta dos períodos começados e o que falta do ano, semana a semana.
  const emAndamento = pedidosEmCurso(o.anteriores, orgaos);
  const fila: { periodo: Periodo; pagina: number }[] = [...emAndamento];
  const comecados = [...new Map(emAndamento.map((p) => [`${p.periodo.inicio}|${p.periodo.fim}`, p.periodo])).values()];
  // O ANO INTEIRO num pedido (por órgão: um pedido por órgão, todos em paralelo); grande demais, divide sozinho.
  for (const p of periodosAPedir(lote.ano, [...periodosLidos(o.anteriores), ...comecados], o.comPeriodo || porMes, undefined, porMes, true)) fila.push(...todasAsPaginas(p));
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

/** O desfecho de `importarCard`: gravado (promovido / catálogo), parcial (nada gravado), interrompido ou cancelado na queda. */
export type FimImportacao = { estado: "gravado" | "parcial" | "interrompido" | "cancelado"; lote: LoteCenti | null };

/**
 * UMA importação de um card, inteira e no navegador — a MESMA na aba Importação do card e no "Importar tudo": começa (ou
 * retoma) o lote, lê o ano (`lerAnoNaCenti`), conclui e, com a QUEDA, só grava com `confirmarQueda`. Interromper cancela o
 * lote (nada gravado). Uma FALHA solta a trava (o lote fica aberto: Continuar lê só o que falta) e é relançada com o lote
 * (`lote` em `onLote`); a recusa do sistema (outra aba conduz) é relançada sem mexer no lote.
 */
export async function importarCard(o: {
  cardId: number;
  ano: number;
  /** O modo do lote novo (`undefined` = empenhos). */
  modo?: string;
  retomar: LoteCenti | null;
  comPeriodo: boolean;
  parar: () => boolean;
  confirmarQueda: (queda: string) => Promise<boolean>;
  onLote?: (l: LoteCenti) => void;
  onPasso?: (p: PassoLote) => void;
  onAnteriores?: (p: PassoLote[]) => void;
  onAgora?: (a: Agora | null) => void;
  onde?: (texto: string) => void;
}): Promise<FimImportacao> {
  const condutor = crypto.randomUUID();
  let local = -1;
  let lote = o.retomar;
  const aplicar = (l: LoteCenti) => {
    lote = l;
    o.onLote?.(l);
  };
  const cancelar = (motivo: string) => (lote ? pedirImportacao(o.cardId, { acao: "cancelar", lote: lote.id, condutor, motivo: motivo.slice(0, 300) }).catch(() => {}) : Promise.resolve());
  try {
    if (!lote) aplicar((await pedirImportacao<{ lote: LoteCenti }>(o.cardId, { acao: "iniciar", ano: o.ano, condutor, ...(o.modo ? { modo: o.modo } : {}) })).lote);
    else aplicar(lote);
    const atual = lote as LoteCenti;
    const anteriores = o.retomar ? await lerPassos(o.cardId, o.retomar.id) : [];
    o.onAnteriores?.(anteriores);
    aplicar(
      await lerAnoNaCenti({
        cardId: o.cardId,
        lote: atual,
        anteriores,
        condutor,
        comPeriodo: o.comPeriodo,
        parar: o.parar,
        onPasso: o.onPasso ?? (() => {}),
        onLote: aplicar,
        onAgora: o.onAgora ?? (() => {}),
        idLocal: () => local--,
        onde: o.onde ?? (() => {}),
      }),
    );
    const id = (lote as LoteCenti).id;
    if (o.parar()) {
      await cancelar("Interrompida por quem importava.");
      return { estado: "interrompido", lote };
    }
    let c = await pedirImportacao<{ lote: LoteCenti; queda?: string }>(o.cardId, { acao: "concluir", lote: id, condutor });
    if (c.queda) {
      if (!(await o.confirmarQueda(c.queda))) {
        await cancelar(`Cancelada: ${c.queda}`);
        return { estado: "cancelado", lote };
      }
      c = await pedirImportacao<{ lote: LoteCenti; queda?: string }>(o.cardId, { acao: "concluir", lote: id, condutor, aceitarQueda: true });
    }
    aplicar(c.lote);
    return { estado: c.lote.estado === "promovido" || c.lote.estado === "unidades" ? "gravado" : "parcial", lote: c.lote };
  } catch (e) {
    o.onAgora?.(null);
    if (e instanceof RecusaImportacao) throw e;
    if (lote && o.parar()) {
      await cancelar("Interrompida por quem importava.");
      return { estado: "interrompido", lote };
    }
    // A falha NÃO perde o que já foi lido: o lote fica aberto e a trava desta aba é solta.
    if (lote) await pedirImportacao(o.cardId, { acao: "pausar", lote: lote.id, condutor }).catch(() => {});
    throw e;
  }
}
