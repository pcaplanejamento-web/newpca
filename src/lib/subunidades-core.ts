import { stripAccents } from "./normalize.ts";
import { centroCustoConfere } from "./reparticao-match.ts";

/**
 * SUBUNIDADES — núcleo PURO (testado em `tests/subunidades.test.ts`). Cada UNIDADE escolhe UM tipo de VÍNCULO, que decide
 * a subunidade de cada DFD dela:
 * - **proprio** (padrão): a subunidade É a própria unidade — nada a cadastrar;
 * - **centro_custo**: a subunidade cujo CENTRO DE CUSTO (lista do ADM) confere com o do DFD (gravado pela automação);
 * - **marcado**: a subunidade é ESCOLHIDA no DFD, entre as cadastradas da unidade.
 * `subunidadeDoDfd` é a régua ÚNICA (Mesa, banners, conferência, filtros).
 */

export const VINCULOS_SUBUNIDADE = ["proprio", "centro_custo", "marcado"] as const;
export type VinculoSubunidade = (typeof VINCULOS_SUBUNIDADE)[number];

export const ROTULO_VINCULO: Record<VinculoSubunidade, string> = {
  proprio: "Próprio",
  centro_custo: "Centro de custo",
  marcado: "Marcado",
};

export const DESCRICAO_VINCULO: Record<VinculoSubunidade, string> = {
  proprio: "A subunidade é a própria unidade — não há cadastro.",
  centro_custo: "Cada subunidade tem os seus centros de custo: a do DFD é a que tem o centro de custo dele.",
  marcado: "A subunidade é escolhida em cada DFD, entre as cadastradas aqui.",
};

/** Os limites do cadastro (a mesma régua na tela e no Zod). */
export const LIMITES_SUBUNIDADE = { nome: 120, centro: 300, centros: 100, subunidades: 200 } as const;

export type Subunidade = { id: number; nome: string; centros: string[] };
/** A configuração de UMA unidade (o código = o nome da subunidade "própria"). */
export type ConfigSubunidades = { codigo: string; vinculo: VinculoSubunidade; subunidades: Subunidade[] };

export const lerVinculo = (v: unknown): VinculoSubunidade => (VINCULOS_SUBUNIDADE.includes(v as VinculoSubunidade) ? (v as VinculoSubunidade) : "proprio");

/** Texto de um centro de custo como gravado (espaços colapsados). */
export const limparCentro = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim();

/** A CHAVE de um centro de custo (sem caixa/acento/pontuação) — a unicidade entre subunidades. */
export const chaveCentro = (t: unknown) =>
  stripAccents(String(t ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** A lista de centros gravada (JSON `string[]`) — tolerante: inválido = vazio; sem repetidos pela chave. */
export function lerCentros(json: unknown): string[] {
  let v: unknown = json;
  if (typeof json === "string") {
    try {
      v = JSON.parse(json);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    const c = limparCentro(x);
    const k = chaveCentro(c);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    out.push(c);
  }
  return out;
}

/** O DFD tem centro de custo? (algum caractere de letra ou número). */
export const temCentroCusto = (c: string | null | undefined) => chaveCentro(c) !== "";

/** Os centros de custo de uma unidade (os das subunidades no vínculo "centro_custo"; nos demais, nenhum). */
export const centrosDaConfig = (cfg: ConfigSubunidades | null | undefined): string[] =>
  cfg?.vinculo === "centro_custo" ? cfg.subunidades.flatMap((s) => s.centros) : [];

/** Por que a subunidade do DFD não foi definida (a pendência `dfd.subunidade`). */
export type FaltaSubunidade = "naoEscolhida" | "centroSemSubunidade" | "ambigua";

export type SubunidadeEfetiva = { id: number | null; nome: string; origem: "propria" | "centro" | "marcada" };
export type ResultadoSubunidade = { subunidade: SubunidadeEfetiva | null; falta: FaltaSubunidade | null };

const NENHUMA: ResultadoSubunidade = { subunidade: null, falta: null };

/**
 * A SUBUNIDADE efetiva de um DFD pela configuração da unidade dele. Sem unidade (ou sem a configuração) = nenhuma e sem
 * falta (a falta da unidade é outra pendência). No centro de custo: o DFD sem centro = nenhuma e sem falta (a falta é do
 * centro — `dfd.centroCusto`); o centro igual vence o que só confere pelo último nome; duas = `ambigua` (nunca chuta).
 */
export function subunidadeDoDfd(
  d: { reparticaoId: number | null; subunidadeId?: number | null; centroCusto?: string | null },
  cfg: ConfigSubunidades | null | undefined,
): ResultadoSubunidade {
  if (d.reparticaoId == null || !cfg) return NENHUMA;
  if (cfg.vinculo === "proprio") return { subunidade: { id: null, nome: cfg.codigo, origem: "propria" }, falta: null };
  if (cfg.vinculo === "marcado") {
    const s = d.subunidadeId != null ? cfg.subunidades.find((x) => x.id === d.subunidadeId) : undefined;
    return s ? { subunidade: { id: s.id, nome: s.nome, origem: "marcada" }, falta: null } : { subunidade: null, falta: "naoEscolhida" };
  }
  if (!temCentroCusto(d.centroCusto)) return NENHUMA;
  const k = chaveCentro(d.centroCusto);
  const exatas = cfg.subunidades.filter((s) => s.centros.some((c) => chaveCentro(c) === k));
  const achadas = exatas.length ? exatas : cfg.subunidades.filter((s) => s.centros.some((c) => centroCustoConfere(c, d.centroCusto)));
  if (achadas.length === 1) return { subunidade: { id: achadas[0].id, nome: achadas[0].nome, origem: "centro" }, falta: null };
  return { subunidade: null, falta: achadas.length ? "ambigua" : "centroSemSubunidade" };
}

/** O texto da pendência da subunidade (mensagem do DFD e despacho). */
export function textoFaltaSubunidade(f: FaltaSubunidade, centro?: string | null): string {
  if (f === "naoEscolhida") return "Subunidade não escolhida — escolha a subunidade do DFD.";
  if (f === "ambigua") return `O centro de custo “${limparCentro(centro)}” está ligado a mais de uma subunidade — ajuste o cadastro em Órgãos e Unidades.`;
  return `O centro de custo “${limparCentro(centro)}” não está ligado a nenhuma subunidade da unidade — ligue-o em Órgãos e Unidades.`;
}

/** A subunidade escolhível no DFD? (só no vínculo "marcado" e entre as da unidade). */
export function subunidadeEscolhivel(cfg: ConfigSubunidades | null | undefined, id: number): boolean {
  return !!cfg && cfg.vinculo === "marcado" && cfg.subunidades.some((s) => s.id === id);
}

/** Um item do cadastro enviado pela tela (`id` ausente = nova). */
export type SubunidadeEnviada = { id?: number; nome: string; centros: string[] };

/** O cadastro de UMA unidade é válido? (nome, nomes repetidos sem caixa, centros repetidos, limites). `null` = válido. */
export function motivoSubunidadesInvalidas(lista: SubunidadeEnviada[]): string | null {
  if (lista.length > LIMITES_SUBUNIDADE.subunidades) return `No máximo ${LIMITES_SUBUNIDADE.subunidades} subunidades por unidade.`;
  const nomes = new Set<string>();
  const centros = new Map<string, string>();
  for (const s of lista) {
    const nome = s.nome.trim();
    if (!nome) return "Toda subunidade precisa de um nome.";
    if (nome.length > LIMITES_SUBUNIDADE.nome) return `Nome de subunidade com mais de ${LIMITES_SUBUNIDADE.nome} caracteres.`;
    const kn = chaveCentro(nome);
    if (nomes.has(kn)) return `Duas subunidades com o nome “${nome}”.`;
    nomes.add(kn);
    if (s.centros.length > LIMITES_SUBUNIDADE.centros) return `No máximo ${LIMITES_SUBUNIDADE.centros} centros de custo por subunidade.`;
    for (const c of s.centros) {
      const k = chaveCentro(c);
      if (!k) return `Centro de custo vazio em “${nome}”.`;
      if (limparCentro(c).length > LIMITES_SUBUNIDADE.centro) return `Centro de custo com mais de ${LIMITES_SUBUNIDADE.centro} caracteres em “${nome}”.`;
      const dono = centros.get(k);
      if (dono) return `O centro de custo “${limparCentro(c)}” está em “${dono}” e em “${nome}” — um centro de custo pertence a uma subunidade.`;
      centros.set(k, nome);
    }
  }
  return null;
}

/** Os centros de custo de uma unidade que JÁ pertencem a subunidades de OUTRAS unidades (a unicidade no sistema). */
export function conflitosCentros(
  lista: SubunidadeEnviada[],
  outras: { unidade: string; subunidade: string; centros: string[] }[],
): string[] {
  const dono = new Map<string, string>();
  for (const o of outras) for (const c of o.centros) dono.set(chaveCentro(c), `${o.subunidade} (${o.unidade})`);
  const out: string[] = [];
  for (const s of lista)
    for (const c of s.centros) {
      const d = dono.get(chaveCentro(c));
      if (d) out.push(`“${limparCentro(c)}” já está em ${d}`);
    }
  return out;
}
