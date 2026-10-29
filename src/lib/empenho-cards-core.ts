/**
 * Os CARDS de EMPENHOS — o núcleo PURO (sem banco/DOM, testado em `tests/empenho-cards.test.ts`). Cada card é uma
 * importação da Centi com a PRÓPRIA configuração: a integração (endereço e parâmetros), os ANOS, a programação da
 * atualização automática, as REGRAS da conferência e os VÍNCULOS — quais órgãos gestores, unidades orçamentárias e ações
 * entram e a que órgão/unidade do cadastro cada um pertence. Só o que um vínculo do card cobre é gravado.
 */
import { type EnderecoCenti, lerParametros, MARCADORES, marcadoresUsados, montarCorpo, urlBaseValida, urlDaApi } from "./centi-resposta-core.ts";
import { periodoDoAno } from "./empenhos-core.ts";
import { ENDPOINT_LIQUIDACOES } from "./liquidacoes-core.ts";
import { corpoPagamentos, ENDPOINT_PAGAMENTOS, periodoDoMes } from "./pagamentos-core.ts";

/** As frequências da atualização automática (minutos). */
export const FREQUENCIAS: { valor: number; rotulo: string }[] = [
  { valor: 60, rotulo: "A cada 1 hora" },
  { valor: 120, rotulo: "A cada 2 horas" },
  { valor: 240, rotulo: "A cada 4 horas" },
  { valor: 720, rotulo: "A cada 12 horas" },
  { valor: 1440, rotulo: "Uma vez por dia" },
];

/** Os anos RELATIVOS (acompanham a virada do ano): 0 = o atual, -1 = o anterior, -2 = dois atrás. */
export const ANOS_RELATIVOS: { valor: number; rotulo: string }[] = [
  { valor: 0, rotulo: "Ano atual" },
  { valor: -1, rotulo: "Ano anterior" },
  { valor: -2, rotulo: "Dois anos atrás" },
];
/** O ano fixo mais antigo que um card importa. */
export const ANO_MINIMO = 2015;

/** As regras da QUEDA (a soma empenhada e os registros não podem cair abaixo deste % da última importação concluída). */
export const OPCOES_QUEDA: { valor: number; rotulo: string }[] = [
  { valor: 0, rotulo: "Não conferir" },
  { valor: 50, rotulo: "50%" },
  { valor: 70, rotulo: "70%" },
  { valor: 80, rotulo: "80%" },
  { valor: 90, rotulo: "90%" },
  { valor: 95, rotulo: "95%" },
];

/** O que fazer com o empenho que a Centi não traz mais: MARCAR como removido (fica guardado, fora das somas) ou APAGAR. */
export type RegraRemovidos = "marcar" | "apagar";
export const REGRAS_REMOVIDOS: { valor: RegraRemovidos; rotulo: string }[] = [
  { valor: "marcar", rotulo: "Marcar como removidos (ficam guardados)" },
  { valor: "apagar", rotulo: "Apagar do banco" },
];

export const LIMITES_CARD = { nome: 60, descricao: 400, endpoint: 80, uf: 4, tenant: 40, parametros: 2000, anos: 10, vinculos: 2000 } as const;

/** O TIPO do card: EMPENHOS (a tela Empenhos), LIQUIDAÇÕES (a tela Liquidações) ou PAGAMENTOS (a tela Pagamentos). */
export type TipoCard = "empenhos" | "liquidacoes" | "pagamentos";
export const TIPOS_CARD = ["empenhos", "liquidacoes", "pagamentos"] as const satisfies readonly TipoCard[];
export const lerTipoCard = (v: unknown): TipoCard => (v === "liquidacoes" || v === "pagamentos" ? v : "empenhos");
/** O card lê TODOS os órgãos com o "ID na Centi" (a API exige o órgão; o número do empenho dá o destino): liquidações e
 * pagamentos — sem vínculos próprios. */
export const cardPorOrgao = (tipo: TipoCard): boolean => tipo !== "empenhos";
/** O nome do tipo (singular/plural) nas telas. */
export const NOME_TIPO: Record<TipoCard, { titulo: string; um: string; varios: string; masc: boolean }> = {
  empenhos: { titulo: "Empenhos", um: "empenho", varios: "empenhos", masc: true },
  liquidacoes: { titulo: "Liquidações", um: "liquidação", varios: "liquidações", masc: false },
  pagamentos: { titulo: "Pagamentos", um: "pagamento", varios: "pagamentos", masc: true },
};
/** O que aparece nas IMPORTAÇÕES (painel do canto, relógio das KPIs): os cards da Centi e a FROTA (Vólus). */
export type TipoImportacao = TipoCard | "frotas";
export const NOME_IMPORTACAO: Record<TipoImportacao, { titulo: string; um: string; varios: string; masc: boolean }> = {
  ...NOME_TIPO,
  frotas: { titulo: "Frotas (Vólus)", um: "leitura da frota", varios: "leituras da frota", masc: false },
};
export const lerTipoImportacao = (v: unknown): TipoImportacao | undefined => (v === "empenhos" || v === "liquidacoes" || v === "pagamentos" || v === "frotas" ? v : undefined);
/** A TELA (permissão) de um card. */
export const telaDoCard = (c: { tipo: TipoCard }): TipoCard => c.tipo;
/** O endereço das IMPORTAÇÕES (Configurações → Importações — só o ADM): o tipo e, com `card`, o card aberto na sub-aba. */
export const linkImportacoes = (tipo: TipoImportacao, card?: number | null, sub?: "importacao" | "vinculos" | "configuracao"): string =>
  `/painel/configuracoes?aba=importacoes&tipo=${tipo}${card ? `&card=${card}${sub ? `&sub=${sub}` : ""}` : ""}`;

export type CardEmpenho = {
  id: number;
  tipo: TipoCard;
  nome: string;
  descricao: string;
  cor: string;
  urlBase: string;
  endpoint: string;
  uf: string;
  tenant: string;
  parametros: string;
  /** Os anos (0/-1/-2 = relativos; senão o ano fixo). */
  anos: number[];
  /** Lê os empenhos POR ÓRGÃO (só os órgãos dos vínculos, pelo ID na Centi) — ver `orgaosDaLeitura`. */
  porOrgao: boolean;
  ultimaExecucao: string | null;
  ultimoStatus: string | null;
  ultimaContagem: number | null;
  ultimoTotal: number | null;
  vinculosEm: string | null;
  /** Quando a Configuração foi confirmada — sem ela (e sem vínculos), nada é importado. */
  configuradoEm: string | null;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
};

/** O card na lista e no cabeçalho: os números do que está gravado. */
export type ResumoCard = CardEmpenho & {
  /** Os REGISTROS gravados (empenhos; no card de liquidações, as liquidações). */
  empenhos: number;
  soma: number;
  vinculos: number;
  lendo: boolean;
  /** A execução do que está gravado (no escopo da pessoa) — o card da lista. */
  anulado: number;
  liquidado: number;
  pago: number;
  saldoPagar: number;
  fornecedores: number;
  gestores: number;
  unidadesOrc: number;
  acoes: number;
};

/** Os campos que se configuram. */
export type EdicaoCard = Pick<
  CardEmpenho,
  | "nome"
  | "descricao"
  | "cor"
  | "urlBase"
  | "endpoint"
  | "uf"
  | "tenant"
  | "parametros"
  | "anos"
  | "porOrgao"
>;

/** O card novo: a API de empenhos do portal, o ano atual, desligado. */
export const CARD_PADRAO: Omit<EdicaoCard, "nome"> = {
  descricao: "",
  cor: "#2563eb",
  urlBase: "https://api.centi.com.br/portal",
  endpoint: "getempenhos",
  uf: "go",
  tenant: "rioverde",
  parametros: '{"dataInicio":"{inicio}","dataFim":"{fim}"}',
  anos: [0],
  porOrgao: false,
};

/** O card de LIQUIDAÇÕES novo: a API de liquidações do portal (o resto como o de empenhos). */
export const CARD_PADRAO_LIQUIDACOES: Omit<EdicaoCard, "nome"> = { ...CARD_PADRAO, cor: "#7c3aed", endpoint: ENDPOINT_LIQUIDACOES };

/** O card de PAGAMENTOS novo: a API de ordens de pagamento do portal, pedida por ANO (o mês e o órgão vão sempre — ver
 * `corpoPagamentos`). */
export const CARD_PADRAO_PAGAMENTOS: Omit<EdicaoCard, "nome"> = { ...CARD_PADRAO, cor: "#059669", endpoint: ENDPOINT_PAGAMENTOS, parametros: '{"ano":"{ano}"}' };

/** O padrão do card novo do tipo. */
export const cardPadrao = (tipo: TipoCard): Omit<EdicaoCard, "nome"> => (tipo === "liquidacoes" ? CARD_PADRAO_LIQUIDACOES : tipo === "pagamentos" ? CARD_PADRAO_PAGAMENTOS : CARD_PADRAO);

export function edicaoDoCard(c: CardEmpenho): EdicaoCard {
  const { nome, descricao, cor, urlBase, endpoint, uf, tenant, parametros, anos, porOrgao } = c;
  return { nome, descricao, cor, urlBase, endpoint, uf, tenant, parametros, anos, porOrgao };
}

export const lerRegraRemovidos = (v: unknown): RegraRemovidos => (v === "apagar" ? "apagar" : "marcar");

/** Um ano do card vale? (relativo 0/-1/-2 ou fixo de `ANO_MINIMO` a 2100). */
export const anoValido = (n: number): boolean => Number.isInteger(n) && ((n <= 0 && n >= -2) || (n >= ANO_MINIMO && n <= 2100));

/** Os anos gravados (JSON) — inválido = o ano atual. Sem repetir, na ordem gravada. */
export function lerAnos(v: unknown): number[] {
  let bruto: unknown = v;
  if (typeof v === "string") {
    try {
      bruto = JSON.parse(v);
    } catch {
      return [0];
    }
  }
  if (!Array.isArray(bruto)) return [0];
  const out: number[] = [];
  for (const x of bruto) {
    const n = Number(x);
    if (anoValido(n) && !out.includes(n)) out.push(n);
  }
  return out.length ? out : [0];
}

/** Os anos de fato (os relativos resolvidos pelo ano atual), do mais recente ao mais antigo, sem repetir e sem futuro. */
export function anosDoCard(anos: readonly number[], anoAtual: number): number[] {
  const r = new Set<number>();
  for (const a of anos) {
    const ano = a <= 0 ? anoAtual + a : a;
    if (ano >= ANO_MINIMO && ano <= anoAtual) r.add(ano);
  }
  return [...r].sort((a, b) => b - a);
}

export function rotuloAno(a: number): string {
  return ANOS_RELATIVOS.find((x) => x.valor === a)?.rotulo ?? String(a);
}

/** "Ano atual, 2024" — o que o card importa (o rótulo da escolha). */
export function rotuloAnos(anos: readonly number[]): string {
  return anos.map(rotuloAno).join(", ");
}

/** As opções da escolha dos anos: os relativos e os fixos (do atual ao `ANO_MINIMO`). */
export function opcoesAnos(anoAtual: number): { valor: number; rotulo: string }[] {
  const fixos: { valor: number; rotulo: string }[] = [];
  for (let a = anoAtual; a >= ANO_MINIMO; a--) fixos.push({ valor: a, rotulo: String(a) });
  return [...ANOS_RELATIVOS, ...fixos];
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const SEGMENTO = /^[A-Za-z0-9_-]+$/;
const COR = /^#[0-9a-fA-F]{6}$/;

/** O motivo de a configuração não valer (null = vale) — a MESMA régua na tela e no servidor. */
export function motivoCardInvalido(e: EdicaoCard): string | null {
  if (!e.nome.trim()) return "Informe o nome do card.";
  if (!COR.test(e.cor)) return "Cor inválida.";
  if (!urlBaseValida(e.urlBase)) return "A URL base tem de ser HTTPS do domínio da Centi (centi.com.br).";
  if (!SEGMENTO.test(e.endpoint)) return "O endpoint só aceita letras, números, - e _.";
  if (!SEGMENTO.test(e.uf) || !SEGMENTO.test(e.tenant)) return "UF e município só aceitam letras, números, - e _.";
  const p = lerParametros(e.parametros);
  if (!p.ok) return p.motivo;
  const desconhecido = marcadoresUsados(p.valor).find((m) => !(MARCADORES as readonly string[]).includes(m));
  if (desconhecido) return `Marcador desconhecido: {${desconhecido}} (use {ano}, {inicio}, {fim} ou {pagina}).`;
  if (!e.anos.length) return "Escolha ao menos um ano.";
  if (e.anos.length > LIMITES_CARD.anos || e.anos.some((a) => !anoValido(a))) return "Ano inválido.";
  return null;
}

/**
 * A CONFIGURAÇÃO CENTRAL das importações da Centi (Configurações → Importações — vale para TODOS os cards): a atualização
 * automática em segundo plano (ligada, frequência, horário de Brasília, só dias úteis) e as REGRAS da conferência (queda da
 * soma e dos registros em relação à importação anterior; o que fazer com o que a Centi não traz mais). Os cards ficam só
 * com o que é deles (nome, anos, integração e vínculos). Blob `configuracoes`, chave `importacoes`.
 */
export type ConfigImportacoes = {
  ativa: boolean;
  frequenciaMin: number;
  diasUteis: boolean;
  horaInicio: string;
  horaFim: string;
  quedaSoma: number;
  quedaRegistros: number;
  removidos: RegraRemovidos;
  /**
   * QUAIS importações atualizam sozinhas: id do card → os anos ESCOLHIDOS, nos valores gravados no card (o relativo `0` =
   * "Ano atual", que acompanha a virada do ano, ou o ano fixo). Card ausente ou lista vazia = manual. `null` = o formato
   * antigo (todos os cards, todos os anos) — vale até o ADM salvar a escolha.
   */
  automaticas: Record<string, number[]> | null;
  /** O INTERVALO MÍNIMO entre duas atualizações do mesmo card (min; 0 = sem intervalo): antes disso nenhuma importação NOVA
   * começa — a manual, o "Importar tudo", o "Importar agora" da Execução e a automática (continuar a aberta pode). */
  intervaloMin: number;
};

/** As opções do intervalo mínimo entre atualizações. */
export const OPCOES_INTERVALO: { valor: number; rotulo: string }[] = [
  { valor: 0, rotulo: "Sem intervalo mínimo" },
  { valor: 5, rotulo: "5 minutos" },
  { valor: 10, rotulo: "10 minutos" },
  { valor: 15, rotulo: "15 minutos" },
  { valor: 30, rotulo: "30 minutos" },
  { valor: 60, rotulo: "1 hora" },
  { valor: 120, rotulo: "2 horas" },
  { valor: 240, rotulo: "4 horas" },
  { valor: 480, rotulo: "8 horas" },
  { valor: 1440, rotulo: "24 horas" },
];

/**
 * Quando a próxima atualização pode COMEÇAR (ms desde 1970), dada a última (o texto do D1 "AAAA-MM-DD HH:MM:SS" em UTC, ou
 * ISO) e o intervalo mínimo; `null` = já pode. A MESMA régua na rota da importação, na automática e nos botões.
 */
export function proximaAtualizacaoMs(ultima: string | null | undefined, intervaloMin: number, agoraMs = Date.now()): number | null {
  if (!ultima || !(intervaloMin > 0)) return null;
  const t = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(ultima) ? ultima : `${ultima.replace(" ", "T")}Z`);
  if (!Number.isFinite(t)) return null;
  const pode = t + intervaloMin * 60_000;
  return pode > agoraMs ? pode : null;
}

/** A próxima atualização do CARD: o intervalo conta da última importação CONCLUÍDA (`completo`) — depois de uma falha ou
 * parcial, importar de novo já pode (é a correção). */
export const proximaDoCard = (c: Pick<CardEmpenho, "ultimaExecucao" | "ultimoStatus">, intervaloMin: number, agoraMs = Date.now()): number | null =>
  c.ultimoStatus === "completo" ? proximaAtualizacaoMs(c.ultimaExecucao, intervaloMin, agoraMs) : null;

/** "Atualizada há pouco — a próxima atualização a partir de 14:35 (intervalo mínimo de 30 minutos)." */
export function textoIntervalo(proximaMs: number, intervaloMin: number, agoraMs = Date.now()): string {
  const falta = Math.max(1, Math.ceil((proximaMs - agoraMs) / 60_000));
  const hora = new Date(proximaMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const rot = OPCOES_INTERVALO.find((o) => o.valor === intervaloMin)?.rotulo ?? `${intervaloMin} minutos`;
  return `Atualizada há pouco — a próxima atualização pode começar às ${hora} (em ${falta} min; intervalo mínimo de ${rot.toLowerCase()}).`;
}

/** Teto de cards na escolha das automáticas (o blob fica pequeno). */
export const MAX_CARDS_AUTOMATICOS = 200;

/** O padrão: desligada (nada roda sozinho até o ADM ligar), a cada 2 h, dias úteis, 07:00–19:00, queda de 80%/90%. */
export const IMPORTACOES_PADRAO: ConfigImportacoes = {
  ativa: false,
  frequenciaMin: 120,
  diasUteis: true,
  horaInicio: "07:00",
  horaFim: "19:00",
  quedaSoma: 80,
  quedaRegistros: 90,
  removidos: "marcar",
  automaticas: null,
  intervaloMin: 0,
};

/** A escolha gravada → id → anos válidos, sem repetir (inválido = sai; nada válido e não-objeto = `null`, o legado). */
export function lerAutomaticas(v: unknown): Record<string, number[]> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, number[]> = {};
  for (const [k, lista] of Object.entries(v as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_CARDS_AUTOMATICOS) break;
    if (!/^[1-9]\d{0,9}$/.test(k) || !Array.isArray(lista)) continue;
    const anos: number[] = [];
    for (const x of lista) {
      const n = Number(x);
      if (anoValido(n) && !anos.includes(n) && anos.length < LIMITES_CARD.anos) anos.push(n);
    }
    out[k] = anos;
  }
  return out;
}

/** Os ANOS de fato que a automática lê neste card: os escolhidos que ainda estão no card, resolvidos (`anosDoCard` — os
 * relativos pelo ano atual, sem futuro). Legado (`null`) = todos os anos do card. Não olha se a central está ligada. */
export function anosAutomaticos(cfg: Pick<ConfigImportacoes, "automaticas">, card: Pick<CardEmpenho, "id" | "anos">, anoAtual: number): number[] {
  if (cfg.automaticas == null) return anosDoCard(card.anos, anoAtual);
  const escolhidos = cfg.automaticas[String(card.id)] ?? [];
  return anosDoCard(
    card.anos.filter((a) => escolhidos.includes(a)),
    anoAtual,
  );
}

/** A importação deste card atualiza sozinha? (a central ligada E algum ano escolhido que vale hoje) — o selo "Automática". */
export function cardAutomatico(cfg: Pick<ConfigImportacoes, "ativa" | "automaticas">, card: Pick<CardEmpenho, "id" | "anos">, anoAtual: number): boolean {
  return cfg.ativa && anosAutomaticos(cfg, card, anoAtual).length > 0;
}

/** Os cards que a atualização automática percorre (só os com algum ano escolhido), na ordem da fila única. */
export function cardsDaAutomatica<T extends Pick<CardEmpenho, "id" | "tipo" | "anos">>(cards: readonly T[], cfg: Pick<ConfigImportacoes, "ativa" | "automaticas">, anoAtual: number): T[] {
  if (!cfg.ativa) return [];
  return filaDosCards(cards.filter((c) => anosAutomaticos(cfg, c, anoAtual).length > 0));
}

/** Os lotes LENDO da automática que saíram da escolha (o card/ano desmarcado, o card que não está mais pronto, a central
 * desligada) — o cron os cancela: nada fica "Importando" para sempre. */
export function lotesForaDaEscolha<L extends { cardId: number | null; ano: number }>(
  lotes: readonly L[],
  cards: readonly Pick<CardEmpenho, "id" | "tipo" | "anos">[],
  cfg: Pick<ConfigImportacoes, "ativa" | "automaticas">,
  anoAtual: number,
): L[] {
  const vale = cardsDaAutomatica(cards, cfg, anoAtual);
  return lotes.filter((l) => {
    const c = vale.find((x) => x.id === l.cardId);
    return !c || !anosAutomaticos(cfg, c, anoAtual).includes(l.ano);
  });
}

/** A escolha contra os cards de VERDADE (null = vale): todo id é um card e todo ano está nos anos dele. */
export function motivoEscolhaAutomaticas(automaticas: Record<string, number[]> | null, cards: readonly Pick<CardEmpenho, "id" | "nome" | "anos">[]): string | null {
  if (!automaticas) return null;
  for (const [id, anos] of Object.entries(automaticas)) {
    const c = cards.find((x) => String(x.id) === id);
    if (!c) return "Uma importação escolhida não existe mais — recarregue a tela.";
    const fora = anos.find((a) => !c.anos.includes(a));
    if (fora != null) return `O ano ${rotuloAno(fora)} não está no card "${c.nome}".`;
  }
  return null;
}

/** O que mudou na escolha (a auditoria): "Empenhos 2025: manual → 2025". */
export function textoDiffAutomaticas(
  antes: Record<string, number[]> | null,
  depois: Record<string, number[]> | null,
  cards: readonly Pick<CardEmpenho, "id" | "nome" | "anos">[],
): string {
  const escolhidos = (m: Record<string, number[]> | null, c: Pick<CardEmpenho, "id" | "anos">) => (m == null ? c.anos : (m[String(c.id)] ?? []).filter((a) => c.anos.includes(a)));
  const txt = (anos: readonly number[]) => (anos.length ? rotuloAnos(anos) : "manual");
  const partes: string[] = [];
  for (const c of cards) {
    const a = escolhidos(antes, c);
    const d = escolhidos(depois, c);
    if (txt(a) !== txt(d)) partes.push(`${c.nome}: ${txt(a)} → ${txt(d)}`);
  }
  return partes.join("; ");
}

/** Quantas importações (card × ano) estão na automática, de quantas existem — o resumo do painel. */
export function contagemAutomaticas(cfg: Pick<ConfigImportacoes, "automaticas">, cards: readonly Pick<CardEmpenho, "id" | "anos">[], anoAtual: number): { auto: number; total: number } {
  let auto = 0;
  let total = 0;
  for (const c of cards) {
    total += anosDoCard(c.anos, anoAtual).length;
    auto += anosAutomaticos(cfg, c, anoAtual).length;
  }
  return { auto, total };
}

/** O motivo de a configuração central não valer (null = vale) — a MESMA régua na tela e no servidor. */
export function motivoConfigImportacoes(c: ConfigImportacoes): string | null {
  if (!FREQUENCIAS.some((f) => f.valor === c.frequenciaMin)) return "Frequência inválida.";
  if (!HORA.test(c.horaInicio) || !HORA.test(c.horaFim)) return "Horário inválido (use HH:MM).";
  if (c.horaInicio >= c.horaFim) return "O horário de início tem de ser antes do fim.";
  if (!OPCOES_QUEDA.some((o) => o.valor === c.quedaSoma) || !OPCOES_QUEDA.some((o) => o.valor === c.quedaRegistros)) return "Regra de queda inválida.";
  if (!OPCOES_INTERVALO.some((o) => o.valor === c.intervaloMin)) return "Intervalo mínimo inválido.";
  if (c.automaticas) {
    const ids = Object.keys(c.automaticas);
    if (ids.length > MAX_CARDS_AUTOMATICOS) return `No máximo ${MAX_CARDS_AUTOMATICOS} importações na escolha.`;
    for (const id of ids) {
      if (!/^[1-9]\d{0,9}$/.test(id)) return "Importação inválida na escolha.";
      const anos = c.automaticas[id];
      if (!Array.isArray(anos) || anos.some((a) => !anoValido(a)) || new Set(anos).size !== anos.length) return "Ano inválido na escolha das importações automáticas.";
    }
  }
  return null;
}

/** O blob gravado → a configuração (qualquer valor fora do esperado volta ao padrão, campo a campo). */
export function lerConfigImportacoes(v: unknown): ConfigImportacoes {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const c: ConfigImportacoes = {
    ativa: o.ativa === true,
    frequenciaMin: FREQUENCIAS.some((f) => f.valor === o.frequenciaMin) ? (o.frequenciaMin as number) : IMPORTACOES_PADRAO.frequenciaMin,
    diasUteis: typeof o.diasUteis === "boolean" ? o.diasUteis : IMPORTACOES_PADRAO.diasUteis,
    horaInicio: typeof o.horaInicio === "string" && HORA.test(o.horaInicio) ? o.horaInicio : IMPORTACOES_PADRAO.horaInicio,
    horaFim: typeof o.horaFim === "string" && HORA.test(o.horaFim) ? o.horaFim : IMPORTACOES_PADRAO.horaFim,
    quedaSoma: OPCOES_QUEDA.some((q) => q.valor === o.quedaSoma) ? (o.quedaSoma as number) : IMPORTACOES_PADRAO.quedaSoma,
    quedaRegistros: OPCOES_QUEDA.some((q) => q.valor === o.quedaRegistros) ? (o.quedaRegistros as number) : IMPORTACOES_PADRAO.quedaRegistros,
    removidos: lerRegraRemovidos(o.removidos),
    automaticas: lerAutomaticas(o.automaticas),
    intervaloMin: OPCOES_INTERVALO.some((q) => q.valor === o.intervaloMin) ? (o.intervaloMin as number) : IMPORTACOES_PADRAO.intervaloMin,
  };
  if (c.horaInicio >= c.horaFim) return { ...c, horaInicio: IMPORTACOES_PADRAO.horaInicio, horaFim: IMPORTACOES_PADRAO.horaFim };
  return c;
}

/** A ORDEM da fila única da atualização automática: empenhos primeiro (é deles que vêm a unidade das liquidações e dos
 * pagamentos), depois liquidações e pagamentos; no mesmo tipo, o card mais antigo primeiro. */
const ORDEM_TIPO: Record<TipoCard, number> = { empenhos: 0, liquidacoes: 1, pagamentos: 2 };
export function filaDosCards<T extends Pick<CardEmpenho, "id" | "tipo">>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] || a.id - b.id);
}

/** O endereço do pedido do card. */
export const urlDoCard = (c: EnderecoCenti): string => urlDaApi(c);

/** Uma etapa da configuração que falta — a aba em que se resolve. */
export type PendenciaCard = { aba: "configuracao" | "vinculos"; texto: string };

/**
 * O que falta CONFIGURAR antes de importar (vazio = pode importar): 1º a Configuração confirmada (integração, anos,
 * programação e regras), 2º ao menos um vínculo. A MESMA régua na tela, na rota da importação e na atualização automática.
 * O "Buscar na Centi" (só o catálogo, nada gravado nos empenhos) exige só a Configuração — é dele que vêm as escolhas dos
 * vínculos.
 */
export function pendenciasDoCard(c: Pick<CardEmpenho, "configuradoEm"> & { tipo?: TipoCard }, vinculos: number): PendenciaCard[] {
  const p: PendenciaCard[] = [];
  if (!c.configuradoEm) p.push({ aba: "configuracao", texto: "Confirme a configuração: anos e integração." });
  if (vinculos < 1)
    p.push(
      c.tipo && cardPorOrgao(c.tipo)
        ? { aba: "configuracao", texto: `Cadastre o “ID na Centi” de ao menos um órgão (Órgãos e Unidades): a importação lê ${c.tipo === "pagamentos" ? "os pagamentos" : "as liquidações"} de todos os órgãos com o ID.` }
        : { aba: "vinculos", texto: "Crie ao menos um vínculo: o que o card importa e para onde vai." },
    );
  return p;
}

/** O estado do card (o selo do card e do cabeçalho). */
export function estadoCard(
  c: Pick<CardEmpenho, "ultimoStatus" | "configuradoEm"> & { vinculos?: number; tipo?: TipoCard },
  lendo = false,
  /** A atualização automática central está ligada (Configurações → Importações). */
  automatica = false,
): { rotulo: string; tom: "slate" | "emerald" | "amber" | "red" | "blue" } {
  if (lendo) return { rotulo: "Importando", tom: "blue" };
  if (pendenciasDoCard(c, c.vinculos ?? 1).length) return { rotulo: "A configurar", tom: "amber" };
  if (c.ultimoStatus === "falhou") return { rotulo: "Com erro", tom: "red" };
  if (c.ultimoStatus === "parcial") return { rotulo: "Parcial", tom: "amber" };
  if (automatica) return { rotulo: "Automática", tom: "emerald" };
  return { rotulo: "Manual", tom: "slate" };
}

export function rotuloFrequencia(min: number, diasUteis: boolean, inicio: string, fim: string): string {
  const f = FREQUENCIAS.find((x) => x.valor === min)?.rotulo ?? `A cada ${min} min`;
  return `${f}${diasUteis ? ", dias úteis" : ""}, ${inicio}–${fim}`;
}

/** A PRÉVIA do pedido do TESTE: o ano inteiro (01/01 a 31/12, também no ano atual); nos PAGAMENTOS, janeiro (a Centi só
 * recorta por mês — o ano inteiro de um órgão passa de 10 MB). Nada é enviado. */
export function previaPedido(e: EdicaoCard, ano: number, hoje?: string, tipo: TipoCard = "empenhos"): { url: string; corpo: unknown; erro: string | null } {
  if (tipo === "pagamentos") {
    try {
      return { url: urlDoCard(e), corpo: corpoPagamentos(e.parametros, ano, periodoDoMes(ano, 1), 0), erro: null };
    } catch (x) {
      return { url: urlDoCard(e), corpo: null, erro: x instanceof Error ? x.message : "Parâmetros inválidos." };
    }
  }
  const p = lerParametros(e.parametros);
  const per = periodoDoAno(ano, hoje);
  const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return {
    url: urlDoCard(e),
    corpo: p.ok ? montarCorpo(p.valor, { ano, inicio: br(per.inicio), fim: br(per.fim) }) : null,
    erro: p.ok ? null : p.motivo,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// OS VÍNCULOS do card: órgão gestor › unidade orçamentária (null = todas) › ação (null = todas) → órgão/unidade do cadastro
// ---------------------------------------------------------------------------------------------------------------

export type VinculoCard = { orgaoGestor: string; unidade: string | null; acao: string | null; orgaoId: number; reparticaoId: number | null };

/** O mínimo de um registro da Centi para achar o vínculo (o vazio da unidade/ação = ""). */
export type LinhaCentiMin = { orgaoGestor: string; unidadeOrcamentaria: string | null; acao: string | null };

/** A especificidade de um vínculo: a ação (2) › a unidade orçamentária (1) › o órgão gestor inteiro (0). */
const especificidade = (v: Pick<VinculoCard, "unidade" | "acao">) => (v.acao != null ? 2 : v.unidade != null ? 1 : 0);

/** Os vínculos por órgão gestor, o mais específico primeiro — a busca de cada registro olha só os do órgão gestor dele. */
export type MapaVinculos = ReadonlyMap<string, readonly VinculoCard[]>;

export function mapaDosVinculos(vs: readonly VinculoCard[]): MapaVinculos {
  const m = new Map<string, VinculoCard[]>();
  for (const v of vs) {
    const l = m.get(v.orgaoGestor);
    if (l) l.push(v);
    else m.set(v.orgaoGestor, [v]);
  }
  for (const l of m.values()) l.sort((a, b) => especificidade(b) - especificidade(a));
  return m;
}

/** O VÍNCULO do registro (o mais específico que o cobre) — null = sem vínculo: NADA dele é gravado. */
export function vinculoDaLinha(m: MapaVinculos, l: LinhaCentiMin): VinculoCard | null {
  const lista = m.get(l.orgaoGestor ?? "");
  if (!lista) return null;
  const un = l.unidadeOrcamentaria ?? "";
  const ac = l.acao ?? "";
  for (const v of lista) if ((v.unidade == null || v.unidade === un) && (v.acao == null || v.acao === ac)) return v;
  return null;
}

/** A chave única de um vínculo no card (o mesmo órgão gestor + unidade + ação duas vezes não vale). */
export const chaveVinculo = (v: Pick<VinculoCard, "orgaoGestor" | "unidade" | "acao">) => `${v.orgaoGestor}\u0000${v.unidade ?? "*"}\u0000${v.acao ?? "*"}`;

/**
 * A REGRA dos vínculos do card (a mesma na tela e no servidor — 422): órgão gestor informado; ação só com a unidade
 * orçamentária; o mesmo órgão gestor + unidade + ação uma vez só; a unidade do cadastro do MESMO órgão escolhido.
 * `unidades` = a unidade do cadastro → o órgão dela; `orgaos` = os órgãos que existem.
 */
export function motivoVinculosInvalidos(vs: readonly VinculoCard[], cadastro: { orgaos: ReadonlySet<number>; unidades: ReadonlyMap<number, number | null> }): string | null {
  if (vs.length > LIMITES_CARD.vinculos) return `No máximo ${LIMITES_CARD.vinculos} vínculos por card.`;
  const vistos = new Set<string>();
  for (const v of vs) {
    if (!v.orgaoGestor.trim()) return "Escolha o órgão gestor da Centi de cada vínculo.";
    if (v.acao != null && v.unidade == null) return "A ação só pode ser escolhida com a unidade orçamentária dela.";
    const k = chaveVinculo(v);
    if (vistos.has(k)) return `${rotuloVinculoCenti(v)} está em dois vínculos — cada órgão gestor, unidade orçamentária e ação vai a UM lugar.`;
    vistos.add(k);
    if (!cadastro.orgaos.has(v.orgaoId)) return "Órgão do cadastro não encontrado.";
    if (v.reparticaoId != null) {
      if (!cadastro.unidades.has(v.reparticaoId)) return "Unidade do cadastro não encontrada.";
      if (cadastro.unidades.get(v.reparticaoId) !== v.orgaoId) return "A unidade escolhida não é do órgão escolhido.";
    }
  }
  return null;
}

/** O texto de uma unidade da Centi ("FMS · 02.01 - FUNDO…"; sem unidade, só o órgão gestor). */
export function rotuloUnidadeCenti(orgaoGestor: string, unidade: string | null): string {
  if (unidade == null) return orgaoGestor || "—";
  return unidade ? `${orgaoGestor || "—"} · ${unidade}` : `${orgaoGestor || "—"} · (sem unidade orçamentária)`;
}

/** O texto de uma ação como a Centi o traz (sem ação, "(sem ação)"). */
export const rotuloAcaoCenti = (acao: string): string => acao || "(sem ação)";

/** O texto do que o vínculo cobre (para os avisos). */
export function rotuloVinculoCenti(v: Pick<VinculoCard, "orgaoGestor" | "unidade" | "acao">): string {
  const base = v.unidade == null ? `${v.orgaoGestor} (todas as unidades)` : rotuloUnidadeCenti(v.orgaoGestor, v.unidade);
  return v.acao == null ? base : `${base} · ${rotuloAcaoCenti(v.acao)}`;
}

/**
 * Um GRUPO de vínculos (como a tela os mostra e edita): o órgão gestor, a unidade orçamentária (null = todas), as ações
 * (null = todas; senão a lista) e o destino no cadastro. Grava-se como uma linha por ação.
 */
export type GrupoVinculo = { chave: string; orgaoGestor: string; unidade: string | null; acoes: string[] | null; orgaoId: number; reparticaoId: number | null };

const chaveGrupo = (v: Pick<VinculoCard, "orgaoGestor" | "unidade" | "orgaoId" | "reparticaoId">, todas: boolean) =>
  `${v.orgaoGestor}\u0000${v.unidade ?? "*"}\u0000${v.orgaoId}\u0000${v.reparticaoId ?? "-"}\u0000${todas ? "*" : "a"}`;

/** Os vínculos → os grupos (as ações do mesmo destino juntas; "todas as ações" é um grupo à parte), em ordem de texto. */
export function gruposDosVinculos(vs: readonly VinculoCard[]): GrupoVinculo[] {
  const m = new Map<string, GrupoVinculo>();
  for (const v of vs) {
    const k = chaveGrupo(v, v.acao == null);
    const g = m.get(k);
    if (g) {
      if (g.acoes && v.acao != null) g.acoes.push(v.acao);
    } else m.set(k, { chave: k, orgaoGestor: v.orgaoGestor, unidade: v.unidade, acoes: v.acao == null ? null : [v.acao], orgaoId: v.orgaoId, reparticaoId: v.reparticaoId });
  }
  const texto = (g: GrupoVinculo) => `${g.orgaoGestor}\u0000${g.unidade ?? ""}`;
  return [...m.values()]
    .map((g) => (g.acoes ? { ...g, acoes: [...g.acoes].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })) } : g))
    .sort((a, b) => texto(a).localeCompare(texto(b), "pt-BR", { numeric: true }));
}

/** Os grupos → os vínculos (uma linha por ação). */
export function vinculosDosGrupos(gs: readonly GrupoVinculo[]): VinculoCard[] {
  return gs.flatMap((g): VinculoCard[] =>
    g.acoes == null
      ? [{ orgaoGestor: g.orgaoGestor, unidade: g.unidade, acao: null, orgaoId: g.orgaoId, reparticaoId: g.reparticaoId }]
      : g.acoes.map((acao) => ({ orgaoGestor: g.orgaoGestor, unidade: g.unidade, acao, orgaoId: g.orgaoId, reparticaoId: g.reparticaoId })),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// O CATÁLOGO da Centi (o que as leituras trouxeram — a base das escolhas)
// ---------------------------------------------------------------------------------------------------------------

export type ItemCatalogo = { orgaoGestor: string; unidade: string; acao: string; registros: number; ultimoAno: number | null };

/** O catálogo de uma página lida (`[órgão gestor, unidade, ação, registros]`; o vazio vira ""). */
export function catalogoDasLinhas(linhas: readonly LinhaCentiMin[]): [string, string, string, number][] {
  const m = new Map<string, [string, string, string, number]>();
  for (const l of linhas) {
    const t: [string, string, string] = [l.orgaoGestor ?? "", l.unidadeOrcamentaria ?? "", l.acao ?? ""];
    const k = t.join("\u0000");
    const atual = m.get(k);
    if (atual) atual[3]++;
    else m.set(k, [...t, 1]);
  }
  return [...m.values()];
}

/** O que a Centi traz e NENHUM vínculo do card cobre (o que o card deixa de fora). */
export function semVinculo(catalogo: readonly ItemCatalogo[], vs: readonly VinculoCard[]): ItemCatalogo[] {
  const m = mapaDosVinculos(vs);
  return catalogo.filter((c) => !vinculoDaLinha(m, { orgaoGestor: c.orgaoGestor, unidadeOrcamentaria: c.unidade, acao: c.acao }));
}

/** Quanto do catálogo o grupo cobre DE FATO (o mais específico de outro grupo vale mais) — itens e registros. */
export function coberturaDoGrupo(g: GrupoVinculo, catalogo: readonly ItemCatalogo[], vs: readonly VinculoCard[]): { itens: number; registros: number } {
  const m = mapaDosVinculos(vs);
  let itens = 0;
  let registros = 0;
  for (const c of catalogo) {
    const v = vinculoDaLinha(m, { orgaoGestor: c.orgaoGestor, unidadeOrcamentaria: c.unidade, acao: c.acao });
    if (v && v.orgaoGestor === g.orgaoGestor && v.unidade === g.unidade && v.orgaoId === g.orgaoId && v.reparticaoId === g.reparticaoId && (g.acoes == null ? v.acao == null : v.acao != null && g.acoes.includes(v.acao))) {
      itens++;
      registros += c.registros;
    }
  }
  return { itens, registros };
}

// ---------------------------------------------------------------------------------------------------------------
// A LEITURA POR ÓRGÃO (o `idOrgao` da Centi): só os órgãos dos vínculos, pelo mapa ID ↔ órgão gestor
// ---------------------------------------------------------------------------------------------------------------

/** Um par do mapa: o ID do órgão na Centi e o texto do órgão gestor que os empenhos dele trazem. */
export type OrgaoGestorCenti = { idCenti: number; orgaoGestor: string };

/** Os IDs conhecidos de cada órgão gestor (o mapa → texto: IDs em ordem). */
export function idsPorGestor(mapa: readonly OrgaoGestorCenti[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const p of mapa) {
    const l = m.get(p.orgaoGestor) ?? [];
    if (!l.includes(p.idCenti)) l.push(p.idCenti);
    m.set(p.orgaoGestor, l);
  }
  for (const l of m.values()) l.sort((a, b) => a - b);
  return m;
}

/**
 * Os órgãos que uma importação POR ÓRGÃO lê: os IDs de TODOS os órgãos gestores dos vínculos do card (`ids`) — e os que
 * ainda não têm o ID conhecido (`semId`). Com algum sem ID (ou nenhum vínculo), a leitura por órgão NÃO vale: a importação
 * lê o ano inteiro de todos os órgãos (como sempre) — nunca deixa um órgão dos vínculos sem atualizar.
 */
export type LeituraPorOrgao = { ids: number[]; semId: string[]; vale: boolean };

export function orgaosDaLeitura(vinculos: readonly Pick<VinculoCard, "orgaoGestor">[], mapa: readonly OrgaoGestorCenti[]): LeituraPorOrgao {
  const por = idsPorGestor(mapa);
  const gestores = [...new Set(vinculos.map((v) => v.orgaoGestor))];
  const ids = new Set<number>();
  const semId: string[] = [];
  for (const g of gestores) {
    const l = por.get(g);
    if (l?.length) for (const id of l) ids.add(id);
    else semId.push(g);
  }
  const lista = [...ids].sort((a, b) => a - b);
  return { ids: lista, semId: semId.sort((a, b) => a.localeCompare(b, "pt-BR")), vale: gestores.length > 0 && !semId.length && lista.length > 0 };
}
