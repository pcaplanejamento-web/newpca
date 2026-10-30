import { anosDoCard, linkImportacoes, pendenciasDoCard, type RegraRemovidos, type ResumoCard } from "./empenho-cards-core.ts";
import { fracaoDoAno, type LoteCenti, type PassoLote, usaPeriodo } from "./empenhos-core.ts";
import { brl } from "./format.ts";
import { importarCard, RecusaImportacao } from "./leitura-centi-cliente.ts";

/**
 * IMPORTAR VÁRIOS CARDS (cliente, sem React): o executor ÚNICO do "Importar tudo" (Configurações → Importações) e do
 * "Importar agora" das KPIs da Execução. Cada card num lote PRÓPRIO, UM POR VEZ (cada card já lê em paralelo por dentro;
 * cards juntos só formam fila no D1), primeiro os EMPENHOS (as liquidações e os pagamentos se ligam a eles pelo número).
 * A importação de cada card é a MESMA da aba do card (`importarCard`): aparece no andamento ao vivo (o painel do canto) e
 * segue mesmo saindo da tela.
 */

export type EstadoLinha = "fila" | "lendo" | "gravado" | "parcial" | "falhou" | "interrompido" | "cancelado" | "pulado";

/** Um card na importação e como ela vai. */
export type LinhaImportacao = {
  card: ResumoCard;
  estado: EstadoLinha;
  texto: string;
  fracao: number;
  ano: number;
  retomar: LoteCenti | null;
};

const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
/** Os registros que a importação concluída trouxe IGUAIS (não regravados). */
export const semMudanca = (l: LoteCenti) => Math.max(0, l.unicos - (l.fora ?? 0) - (l.inseridos ?? 0) - (l.atualizados ?? 0));

/** O aviso da importação GRAVADA — o MESMO na aba do card, no "Importar tudo" e no "Importar agora" da Execução. */
export function textoConclusao(fim: LoteCenti, regra: RegraRemovidos): string {
  const f = fim.modo === "liquidacoes";
  const o = (m: string, fem: string) => (f ? fem : m);
  const quem = fim.modo === "pagamentos" ? `Pagamentos ${fim.ano} de ${num(fim.orgaosCenti?.length ?? 0)} órgãos importados (${brl(fim.soma)} pagos, líquido)` : f ? `Liquidações ${fim.ano} de ${num(fim.orgaosCenti?.length ?? 0)} órgãos importadas (${brl(fim.soma)} liquidados)` : `Empenhos ${fim.ano} importados e conferidos (${brl(fim.soma)} empenhados)`;
  const fora = fim.modo === "dados" || !fim.modo ? "sem vínculo no card" : "sem o empenho nem o órgão no cadastro";
  return `${quem}: ${num(fim.inseridos)} ${o("novos", "novas")}, ${num(fim.atualizados)} ${o("atualizados", "atualizadas")}, ${num(semMudanca(fim))} sem mudança (nada gravado), ${num(fim.ausentes ?? 0)} ${o("ausentes", "ausentes")} pela 1ª vez (seguem valendo), ${num(fim.removidos)} ${regra === "apagar" ? o("apagados", "apagadas") : o("marcados como removidos", "marcadas como removidas")}${fim.fora ? `, ${num(fim.fora)} ${fora} (não ${o("gravados", "gravadas")})` : ""}.`;
}

/** O `confirmar` do `useConfirmacao` (a confirmação do sistema). */
type Confirmar = (p: { titulo: string; texto?: string; confirmar?: string; cancelar?: string; perigo?: boolean }) => Promise<boolean | null>;

/** A pergunta de cada QUEDA (os números caíram — gravar mesmo assim?), uma por vez. */
export function perguntaDeQueda(confirmar: Confirmar): (l: LinhaImportacao, queda: string) => Promise<boolean | null> {
  let fila: Promise<unknown> = Promise.resolve();
  return (l, queda) => {
    const p = fila.then(() =>
      confirmar({ titulo: `${l.card.nome}: os números caíram — gravar mesmo assim?`, texto: `${queda} Confira a Centi antes: se for um erro de leitura, cancele (nada é gravado).`, confirmar: "Gravar", cancelar: "Cancelar este card", perigo: true }),
    );
    fila = p.catch(() => {});
    return p;
  };
}

/** O ano mais recente dos anos do card (o "Importar agora" das KPIs lê os dados atuais). */
export const anoMaisRecente = (c: Pick<ResumoCard, "anos">, anoAtual: number): number | null => {
  const a = anosDoCard(c.anos, anoAtual);
  return a.length ? Math.max(...a) : null;
};

/**
 * O que vai ser importado: cada card com o ano dele (`anoDe`; null = fora). Pulado o card a configurar, o que outra
 * importação conduz agora e o ano fora dos anos do card; o lote ABERTO do card é retomado (no ano dele).
 */
export async function prepararCards(cards: readonly ResumoCard[], anoDe: (c: ResumoCard) => number | null, anoAtual: number): Promise<LinhaImportacao[]> {
  return Promise.all(
    cards.map(async (card): Promise<LinhaImportacao> => {
      const ano = anoDe(card);
      const base: LinhaImportacao = { card, estado: "fila", texto: "Na fila", fracao: 0, ano: ano ?? anoAtual, retomar: null };
      if (pendenciasDoCard(card, card.vinculos).length > 0) return { ...base, estado: "pulado", texto: "Card ainda não configurado." };
      const r = await fetch(`/api/empenhos/cards/${card.id}/importar`).catch(() => null);
      const j = (await r?.json().catch(() => ({}))) as { ok?: boolean; emAndamento?: LoteCenti | null; intervalo?: { texto: string } | null } | undefined;
      const lendo = j?.emAndamento ?? null;
      if (lendo?.conduzido) return { ...base, estado: "pulado", texto: "Outra importação está lendo este card agora — se foi uma aba fechada ou recarregada, tente de novo em 2 minutos (o que já foi lido continua)." };
      if (lendo) return { ...base, ano: lendo.ano, retomar: lendo, texto: `Continua a importação aberta de ${lendo.ano}` };
      // O INTERVALO MÍNIMO entre atualizações (Configurações → Importações): o card atualizado há pouco espera.
      if (j?.intervalo) return { ...base, estado: "pulado", texto: j.intervalo.texto };
      if (ano == null || !anosDoCard(card.anos, anoAtual).includes(ano)) return { ...base, estado: "pulado", texto: `O ano ${ano ?? "—"} não está nos anos do card.` };
      return base;
    }),
  );
}

/** A ordem da importação: os EMPENHOS primeiro, depois liquidações e pagamentos (só os que vão). */
export const ordemDeImportacao = (linhas: readonly LinhaImportacao[]): LinhaImportacao[] => {
  const vao = linhas.filter((l) => l.estado === "fila");
  return [...vao.filter((l) => l.card.tipo === "empenhos"), ...vao.filter((l) => l.card.tipo !== "empenhos")];
};

/**
 * Importa as linhas na ordem, UM CARD POR VEZ; `onLinha` recebe cada mudança. Para entre um card e outro com `parar` — e
 * quando um card é INTERROMPIDO (o "Parar" do painel do canto vale para a série inteira); os que faltam ficam "não iniciado".
 */
export async function importarCards(
  linhas: readonly LinhaImportacao[],
  o: {
    regra: RegraRemovidos;
    parar: () => boolean;
    /** `parar` só ENTRE os cards: o card em curso termina (o botão Interromper do "Importar tudo"; o Parar do painel do canto
     * segue valendo para o card). */
    pararEntreCards?: boolean;
    confirmarQueda?: (l: LinhaImportacao, queda: string) => Promise<boolean | null>; onLinha: (id: number, mudou: Partial<LinhaImportacao>) => void },
): Promise<void> {
  const fila = ordemDeImportacao(linhas);
  let anterior: EstadoLinha | null = null;
  for (let i = 0; i < fila.length; i++) {
    if (o.parar() || anterior === "interrompido") {
      for (const l of fila.slice(i)) o.onLinha(l.card.id, { estado: "interrompido", texto: "Não iniciado — a importação foi interrompida." });
      break;
    }
    anterior = await umCard(fila[i], o);
  }
}

async function umCard(l: LinhaImportacao, o: Parameters<typeof importarCards>[1]): Promise<EstadoLinha> {
  const id = l.card.id;
  const passos: PassoLote[] = [];
  o.onLinha(id, { estado: "lendo", texto: "Lendo na Centi…" });
  try {
    const { estado, lote } = await importarCard({
      cardId: id,
      ano: l.ano,
      modo: l.card.tipo !== "empenhos" ? l.card.tipo : undefined,
      retomar: l.retomar,
      comPeriodo: usaPeriodo(l.card.parametros),
      parar: o.pararEntreCards ? () => false : o.parar,
      confirmarQueda: o.confirmarQueda ? (queda) => o.confirmarQueda?.(l, queda) ?? Promise.resolve(false) : undefined,
      titulo: `${l.card.nome} · ${l.ano}`,
      rota: linkImportacoes(l.card.tipo, l.card.id, "importacao"),
      onAnteriores: (a) => passos.push(...a),
      onPasso: (p) => {
        passos.push(p);
        o.onLinha(id, { fracao: fracaoDoAno(l.ano, passos), texto: `Lendo na Centi… ${passos.length} ${passos.length === 1 ? "pedido" : "pedidos"}` });
      },
    });
    if (estado === "gravado" && lote) o.onLinha(id, { estado: "gravado", fracao: 1, texto: lote.estado === "promovido" ? textoConclusao(lote, o.regra) : (lote.mensagem ?? "Concluído.") });
    else if (estado === "parcial") o.onLinha(id, { estado: "parcial", texto: `Parcial — nada foi gravado. ${lote?.mensagem ?? ""}` });
    else o.onLinha(id, { estado, texto: estado === "interrompido" ? "Interrompida — nada foi gravado." : "Cancelada na queda — nada mudou." });
    return estado;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na importação.";
    o.onLinha(id, { estado: "falhou", texto: e instanceof RecusaImportacao ? msg : `${msg} O que foi lido ficou guardado — Continuar no card lê só o que falta.` });
    return "falhou";
  }
}

/** O resumo de uma importação de vários cards ("2 gravados · 1 com falha"). */
export function resumoImportacao(linhas: readonly LinhaImportacao[]): { texto: string; tom: "ok" | "aviso" | "erro" } {
  const c = (e: EstadoLinha) => linhas.filter((l) => l.estado === e).length;
  const partes = [
    [c("gravado"), "gravado", "gravados"],
    [c("parcial"), "parcial", "parciais"],
    [c("falhou"), "com falha", "com falha"],
    [c("cancelado") + c("interrompido"), "cancelado", "cancelados"],
    [c("pulado"), "fora", "fora"],
  ] as const;
  const texto = partes
    .filter(([n]) => n > 0)
    .map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`)
    .join(" · ");
  const tom = c("falhou") ? "erro" : c("parcial") + c("cancelado") + c("interrompido") ? "aviso" : "ok";
  return { texto: texto || "Nenhum card a importar.", tom };
}
