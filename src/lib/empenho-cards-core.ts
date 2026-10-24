/**
 * Os CARDS de EMPENHOS — o núcleo PURO (sem banco/DOM, testado em `tests/empenho-cards.test.ts`). Cada card é uma
 * importação da Centi com a PRÓPRIA configuração: a integração (endereço e parâmetros), os ANOS, a programação da
 * atualização automática, as REGRAS da conferência e os VÍNCULOS — quais órgãos gestores, unidades orçamentárias e ações
 * entram e a que órgão/unidade do cadastro cada um pertence. Só o que um vínculo do card cobre é gravado.
 */
import { type EnderecoCenti, lerParametros, MARCADORES, marcadoresUsados, montarCorpo, urlBaseValida, urlDaApi } from "./centi-resposta-core.ts";

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

export type CardEmpenho = {
  id: number;
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
  ativa: boolean;
  frequenciaMin: number;
  diasUteis: boolean;
  horaInicio: string;
  horaFim: string;
  quedaSoma: number;
  quedaRegistros: number;
  removidos: RegraRemovidos;
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
export type ResumoCard = CardEmpenho & { empenhos: number; soma: number; vinculos: number; lendo: boolean };

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
  | "ativa"
  | "frequenciaMin"
  | "diasUteis"
  | "horaInicio"
  | "horaFim"
  | "quedaSoma"
  | "quedaRegistros"
  | "removidos"
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
  ativa: false,
  frequenciaMin: 120,
  diasUteis: true,
  horaInicio: "07:00",
  horaFim: "19:00",
  quedaSoma: 80,
  quedaRegistros: 90,
  removidos: "marcar",
};

export function edicaoDoCard(c: CardEmpenho): EdicaoCard {
  const { nome, descricao, cor, urlBase, endpoint, uf, tenant, parametros, anos, ativa, frequenciaMin, diasUteis, horaInicio, horaFim, quedaSoma, quedaRegistros, removidos } = c;
  return { nome, descricao, cor, urlBase, endpoint, uf, tenant, parametros, anos, ativa, frequenciaMin, diasUteis, horaInicio, horaFim, quedaSoma, quedaRegistros, removidos };
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
  if (!FREQUENCIAS.some((f) => f.valor === e.frequenciaMin)) return "Frequência inválida.";
  if (!HORA.test(e.horaInicio) || !HORA.test(e.horaFim)) return "Horário inválido (use HH:MM).";
  if (e.horaInicio >= e.horaFim) return "O horário de início tem de ser antes do fim.";
  if (!OPCOES_QUEDA.some((o) => o.valor === e.quedaSoma) || !OPCOES_QUEDA.some((o) => o.valor === e.quedaRegistros)) return "Regra de queda inválida.";
  return null;
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
export function pendenciasDoCard(c: Pick<CardEmpenho, "configuradoEm">, vinculos: number): PendenciaCard[] {
  const p: PendenciaCard[] = [];
  if (!c.configuradoEm) p.push({ aba: "configuracao", texto: "Confirme a configuração: integração, anos, atualização e regras." });
  if (vinculos < 1) p.push({ aba: "vinculos", texto: "Crie ao menos um vínculo: o que o card importa e para onde vai." });
  return p;
}

/** O estado do card (o selo do card e do cabeçalho). */
export function estadoCard(c: Pick<CardEmpenho, "ativa" | "ultimoStatus" | "configuradoEm"> & { vinculos?: number }, lendo = false): { rotulo: string; tom: "slate" | "emerald" | "amber" | "red" | "blue" } {
  if (lendo) return { rotulo: "Importando", tom: "blue" };
  if (pendenciasDoCard(c, c.vinculos ?? 1).length) return { rotulo: "A configurar", tom: "amber" };
  if (c.ultimoStatus === "falhou") return { rotulo: "Com erro", tom: "red" };
  if (c.ultimoStatus === "parcial") return { rotulo: "Parcial", tom: "amber" };
  if (c.ativa) return { rotulo: "Automática", tom: "emerald" };
  return { rotulo: "Manual", tom: "slate" };
}

export function rotuloFrequencia(min: number, diasUteis: boolean, inicio: string, fim: string): string {
  const f = FREQUENCIAS.find((x) => x.valor === min)?.rotulo ?? `A cada ${min} min`;
  return `${f}${diasUteis ? ", dias úteis" : ""}, ${inicio}–${fim}`;
}

/** A PRÉVIA do pedido do TESTE (a 1ª SEMANA do ano — o ano inteiro passa do tamanho de uma resposta). Nada é enviado. */
export function previaPedido(e: EdicaoCard, ano: number): { url: string; corpo: unknown; erro: string | null } {
  const p = lerParametros(e.parametros);
  return {
    url: urlDoCard(e),
    corpo: p.ok ? montarCorpo(p.valor, { ano, inicio: `01/01/${ano}`, fim: `07/01/${ano}` }) : null,
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
