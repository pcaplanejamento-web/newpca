import { stripAccents } from "./normalize.ts";
import { centroCustoConfere } from "./reparticao-match.ts";

/**
 * SUBUNIDADES — núcleo PURO (testado em `tests/subunidades.test.ts`). A subunidade de cada DFD é definida SÓ pelo CENTRO DE
 * CUSTO (gravado pela automação). Cada UNIDADE escolhe o MODO do cadastro:
 * - **unico**: UM centro de custo (ou as variações dele) para a unidade inteira — a subunidade do DFD é a própria unidade;
 * - **subunidades**: cada subunidade com o(s) seu(s) centro(s) de custo — a do DFD é a que tem o centro dele.
 * O centro é OBRIGATÓRIO: sem cadastro, ou com o centro do DFD fora dele, a subunidade não é definida (ERRO).
 * `subunidadeDoDfd` é a régua ÚNICA (Mesa, banners, conferência, filtros).
 */

export const MODOS_CENTRO = ["unico", "subunidades"] as const;
export type ModoCentro = (typeof MODOS_CENTRO)[number];

export const ROTULO_MODO: Record<ModoCentro, string> = {
  unico: "Um para toda a unidade",
  subunidades: "Um por subunidade",
};

export const DESCRICAO_MODO: Record<ModoCentro, string> = {
  unico: "Um centro de custo para a unidade inteira: a subunidade do DFD é a própria unidade.",
  subunidades: "Cada subunidade tem o seu centro de custo: a do DFD é a que tem o centro de custo dele.",
};

/** Os limites do cadastro (a mesma régua na tela e no Zod). */
export const LIMITES_SUBUNIDADE = { nome: 120, centro: 300, centros: 100, subunidades: 200 } as const;

export type Subunidade = { id: number; nome: string; centros: string[] };
/** O cadastro de UMA unidade (`codigo` = o nome da subunidade no modo único). */
export type ConfigSubunidades = { codigo: string; modo: ModoCentro; subunidades: Subunidade[] };

/** O modo gravado — qualquer outro valor (os vínculos antigos) = único. */
export const lerModo = (v: unknown): ModoCentro => (v === "subunidades" ? "subunidades" : "unico");

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

/** Os centros de custo cadastrados de uma unidade. */
export const centrosDaConfig = (cfg: ConfigSubunidades | null | undefined): string[] => cfg?.subunidades.flatMap((s) => s.centros) ?? [];

/** Por que a subunidade do DFD não foi definida (a pendência `dfd.subunidade` — erro). */
export type FaltaSubunidade = "semCadastro" | "centroNaoCadastrado" | "ambigua";

export type SubunidadeEfetiva = { id: number; nome: string };
export type ResultadoSubunidade = { subunidade: SubunidadeEfetiva | null; falta: FaltaSubunidade | null };

const NENHUMA: ResultadoSubunidade = { subunidade: null, falta: null };

/**
 * A SUBUNIDADE efetiva de um DFD pelo cadastro da unidade dele. Sem unidade = nenhuma e sem falta (a falta da unidade é
 * outra pendência); o DFD sem centro = nenhuma e sem falta (a falta é do centro — `dfd.centroCusto`). A unidade sem centro
 * cadastrado = `semCadastro`; o centro igual vence o que só confere pelo último nome; nenhum = `centroNaoCadastrado`; dois =
 * `ambigua` (nunca chuta). No modo único o nome é o da unidade.
 */
export function subunidadeDoDfd(
  d: { reparticaoId: number | null; centroCusto?: string | null },
  cfg: ConfigSubunidades | null | undefined,
): ResultadoSubunidade {
  if (d.reparticaoId == null || !temCentroCusto(d.centroCusto)) return NENHUMA;
  const lista = cfg?.subunidades.filter((s) => s.centros.length) ?? [];
  if (!cfg || !lista.length) return { subunidade: null, falta: "semCadastro" };
  const k = chaveCentro(d.centroCusto);
  const exatas = lista.filter((s) => s.centros.some((c) => chaveCentro(c) === k));
  const achadas = exatas.length ? exatas : lista.filter((s) => s.centros.some((c) => centroCustoConfere(c, d.centroCusto)));
  if (achadas.length === 1)
    return { subunidade: { id: achadas[0].id, nome: cfg.modo === "unico" ? cfg.codigo : achadas[0].nome }, falta: null };
  return { subunidade: null, falta: achadas.length ? "ambigua" : "centroNaoCadastrado" };
}

/** O texto da pendência da subunidade (mensagem do DFD e despacho). */
export function textoFaltaSubunidade(f: FaltaSubunidade, centro?: string | null): string {
  if (f === "semCadastro") return "A unidade do DFD não tem centro de custo cadastrado — cadastre-o em Órgãos e Unidades.";
  if (f === "ambigua") return `O centro de custo “${limparCentro(centro)}” confere com mais de uma subunidade — ajuste o cadastro em Órgãos e Unidades.`;
  return `O centro de custo “${limparCentro(centro)}” não está cadastrado na unidade do DFD — cadastre-o em Órgãos e Unidades.`;
}

/** Um item do cadastro enviado pela tela (`id` ausente = nova). */
export type SubunidadeEnviada = { id?: number; nome: string; centros: string[] };

/**
 * O cadastro de UMA unidade é válido? Todo item com ao menos um centro de custo (obrigatório); no modo único, no máximo um
 * item; nomes sem repetir (sem caixa), centros sem repetir, limites. `null` = válido.
 */
export function motivoSubunidadesInvalidas(modo: ModoCentro, lista: SubunidadeEnviada[]): string | null {
  if (modo === "unico" && lista.length > 1) return "No modo “Um para toda a unidade” há um só cadastro de centro de custo.";
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
    if (!s.centros.length)
      return modo === "unico" ? "Cadastre o centro de custo da unidade." : `Cadastre o centro de custo da subunidade “${nome}”.`;
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
