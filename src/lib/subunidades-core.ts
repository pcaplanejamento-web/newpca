import { stripAccents } from "./normalize.ts";
import { centroCustoConfere } from "./reparticao-match.ts";

/**
 * SUBUNIDADES — núcleo PURO (testado em `tests/subunidades.test.ts`). O CENTRO DE CUSTO do DFD (gravado pela automação)
 * tem de estar no cadastro da unidade dele. Cada UNIDADE escolhe o MODO do cadastro:
 * - **unico**: UM centro de custo (ou as variações dele) para a unidade inteira — a subunidade é ESCOLHIDA no DFD entre as
 *   cadastradas (sem subunidades cadastradas, a subunidade é a própria unidade);
 * - **subunidades**: cada subunidade com o(s) seu(s) centro(s) de custo — a do DFD é a que tem o centro dele.
 * O centro é OBRIGATÓRIO: sem cadastro, com o centro do DFD fora dele ou (no único) sem a escolha, é ERRO.
 * `subunidadeDoDfd` é a régua ÚNICA (Mesa, banners, conferência, filtros).
 */

export const MODOS_CENTRO = ["unico", "subunidades"] as const;
export type ModoCentro = (typeof MODOS_CENTRO)[number];

export const ROTULO_MODO: Record<ModoCentro, string> = {
  unico: "Um para toda a unidade",
  subunidades: "Um por subunidade",
};

export const DESCRICAO_MODO: Record<ModoCentro, string> = {
  unico: "Um centro de custo para a unidade inteira: a subunidade é escolhida em cada DFD (sem subunidades cadastradas, é a própria unidade).",
  subunidades: "Cada subunidade tem o seu centro de custo: a do DFD é a que tem o centro de custo dele.",
};

/** Os limites do cadastro (a mesma régua na tela e no Zod). */
export const LIMITES_SUBUNIDADE = { nome: 120, centro: 300, centros: 100, subunidades: 200 } as const;

export type Subunidade = { id: number; nome: string; centros: string[] };
/** O cadastro de UMA unidade: no modo único, `centros` = os da unidade (e as subunidades só com o nome); no por subunidade,
 * os centros moram em cada uma (`centros` vazio). `codigo` = o nome da subunidade quando é a própria unidade. */
export type ConfigSubunidades = { codigo: string; modo: ModoCentro; centros: string[]; subunidades: Subunidade[] };

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
export const centrosDaConfig = (cfg: ConfigSubunidades | null | undefined): string[] =>
  !cfg ? [] : cfg.modo === "unico" ? cfg.centros : cfg.subunidades.flatMap((s) => s.centros);

/** Por que a subunidade do DFD não foi definida (a pendência `dfd.subunidade` — erro). */
export type FaltaSubunidade = "semCadastro" | "centroNaoCadastrado" | "ambigua" | "naoEscolhida";

/** `id` null = a própria unidade (modo único sem subunidades). */
export type SubunidadeEfetiva = { id: number | null; nome: string };
export type ResultadoSubunidade = { subunidade: SubunidadeEfetiva | null; falta: FaltaSubunidade | null };

const NENHUMA: ResultadoSubunidade = { subunidade: null, falta: null };

/** O centro do DFD confere com um da lista? (a mesma chave, senão o último nome — `centroCustoConfere`). */
const exato = (lista: string[], centro: string | null | undefined) => lista.some((c) => chaveCentro(c) === chaveCentro(centro));
const confere = (lista: string[], centro: string | null | undefined) => lista.some((c) => centroCustoConfere(c, centro));

/**
 * A SUBUNIDADE efetiva de um DFD pelo cadastro da unidade dele. Sem unidade = nenhuma e sem falta (a falta da unidade é
 * outra pendência); o DFD sem centro = nenhuma e sem falta (a falta é do centro — `dfd.centroCusto`). Sem centro
 * cadastrado = `semCadastro`; o centro fora do cadastro = `centroNaoCadastrado`. No modo único, com o centro conferindo, a
 * subunidade é a ESCOLHIDA no DFD (`naoEscolhida` sem ela; sem subunidades cadastradas, a própria unidade). No por
 * subunidade, a mesma chave vence o que só confere pelo último nome; duas = `ambigua` (nunca chuta).
 */
export function subunidadeDoDfd(
  d: { reparticaoId: number | null; subunidadeId?: number | null; centroCusto?: string | null },
  cfg: ConfigSubunidades | null | undefined,
): ResultadoSubunidade {
  if (d.reparticaoId == null || !temCentroCusto(d.centroCusto)) return NENHUMA;
  if (cfg?.modo === "unico") {
    if (!cfg.centros.length) return { subunidade: null, falta: "semCadastro" };
    if (!exato(cfg.centros, d.centroCusto) && !confere(cfg.centros, d.centroCusto)) return { subunidade: null, falta: "centroNaoCadastrado" };
    if (!cfg.subunidades.length) return { subunidade: { id: null, nome: cfg.codigo }, falta: null };
    const s = d.subunidadeId != null ? cfg.subunidades.find((x) => x.id === d.subunidadeId) : undefined;
    return s ? { subunidade: { id: s.id, nome: s.nome }, falta: null } : { subunidade: null, falta: "naoEscolhida" };
  }
  const lista = cfg?.subunidades.filter((s) => s.centros.length) ?? [];
  if (!cfg || !lista.length) return { subunidade: null, falta: "semCadastro" };
  const exatas = lista.filter((s) => exato(s.centros, d.centroCusto));
  const achadas = exatas.length ? exatas : lista.filter((s) => confere(s.centros, d.centroCusto));
  if (achadas.length === 1) return { subunidade: { id: achadas[0].id, nome: achadas[0].nome }, falta: null };
  return { subunidade: null, falta: achadas.length ? "ambigua" : "centroNaoCadastrado" };
}

/** A subunidade é escolhível no DFD? (só no modo único, entre as cadastradas da unidade). */
export const subunidadeEscolhivel = (cfg: ConfigSubunidades | null | undefined, id: number) =>
  !!cfg && cfg.modo === "unico" && cfg.subunidades.some((s) => s.id === id);

/** O texto da pendência da subunidade (mensagem do DFD e despacho). */
export function textoFaltaSubunidade(f: FaltaSubunidade, centro?: string | null): string {
  if (f === "naoEscolhida") return "Subunidade não escolhida — escolha a subunidade do DFD (a unidade tem um centro de custo para todas).";
  if (f === "semCadastro") return "A unidade do DFD não tem centro de custo cadastrado — cadastre-o em Órgãos e Unidades.";
  if (f === "ambigua") return `O centro de custo “${limparCentro(centro)}” confere com mais de uma subunidade — ajuste o cadastro em Órgãos e Unidades.`;
  return `O centro de custo “${limparCentro(centro)}” não está cadastrado na unidade do DFD — cadastre-o em Órgãos e Unidades.`;
}

/** Um item do cadastro enviado pela tela (`id` ausente = nova). */
export type SubunidadeEnviada = { id?: number; nome: string; centros: string[] };

/** Uma lista de centros válida? (vazio, tamanho, repetido no cadastro — `donos` acumula a chave → onde está). */
function motivoCentros(centros: string[], onde: string, donos: Map<string, string>): string | null {
  if (centros.length > LIMITES_SUBUNIDADE.centros) return `No máximo ${LIMITES_SUBUNIDADE.centros} centros de custo em “${onde}”.`;
  for (const c of centros) {
    const k = chaveCentro(c);
    if (!k) return `Centro de custo vazio em “${onde}”.`;
    if (limparCentro(c).length > LIMITES_SUBUNIDADE.centro) return `Centro de custo com mais de ${LIMITES_SUBUNIDADE.centro} caracteres em “${onde}”.`;
    const dono = donos.get(k);
    if (dono) return `O centro de custo “${limparCentro(c)}” está em “${dono}” e em “${onde}” — um centro de custo pertence a um só cadastro.`;
    donos.set(k, onde);
  }
  return null;
}

/**
 * O cadastro de UMA unidade é válido? No modo único: o centro da unidade é obrigatório quando há subunidades, e elas não
 * têm centros próprios. No por subunidade: todo item com ao menos um centro e a unidade sem centros. Nomes sem repetir
 * (sem caixa), centros sem repetir, limites. `null` = válido (o cadastro vazio também — os DFDs ficam com erro).
 */
export function motivoSubunidadesInvalidas(modo: ModoCentro, centros: string[], lista: SubunidadeEnviada[]): string | null {
  if (lista.length > LIMITES_SUBUNIDADE.subunidades) return `No máximo ${LIMITES_SUBUNIDADE.subunidades} subunidades por unidade.`;
  const donos = new Map<string, string>();
  if (modo === "unico") {
    if (lista.length && !centros.length) return "Cadastre o centro de custo da unidade.";
    const m = motivoCentros(centros, "a unidade", donos);
    if (m) return m;
  } else if (centros.length) return "No modo “Um por subunidade” o centro de custo é de cada subunidade.";
  const nomes = new Set<string>();
  for (const s of lista) {
    const nome = s.nome.trim();
    if (!nome) return "Toda subunidade precisa de um nome.";
    if (nome.length > LIMITES_SUBUNIDADE.nome) return `Nome de subunidade com mais de ${LIMITES_SUBUNIDADE.nome} caracteres.`;
    const kn = chaveCentro(nome);
    if (nomes.has(kn)) return `Duas subunidades com o nome “${nome}”.`;
    nomes.add(kn);
    if (modo === "unico") {
      if (s.centros.length) return "No modo “Um para toda a unidade” as subunidades não têm centro de custo próprio.";
      continue;
    }
    if (!s.centros.length) return `Cadastre o centro de custo da subunidade “${nome}”.`;
    const m = motivoCentros(s.centros, nome, donos);
    if (m) return m;
  }
  return null;
}

/** Os centros de custo da unidade (os dela e os das subunidades) que JÁ pertencem a OUTRAS unidades (a unicidade no
 * sistema). */
export function conflitosCentros(
  centros: string[],
  lista: SubunidadeEnviada[],
  outras: { unidade: string; subunidade: string; centros: string[] }[],
): string[] {
  const dono = new Map<string, string>();
  for (const o of outras) for (const c of o.centros) dono.set(chaveCentro(c), o.subunidade ? `${o.subunidade} (${o.unidade})` : o.unidade);
  const out: string[] = [];
  for (const c of [...centros, ...lista.flatMap((s) => s.centros)]) {
    const d = dono.get(chaveCentro(c));
    if (d) out.push(`“${limparCentro(c)}” já está em ${d}`);
  }
  return out;
}

/** Os centros de custo dos DFDs da unidade que ainda NÃO estão no cadastro dela (pela chave, sem repetir) — os
 * "a cadastrar" da lista e do (!) do banner. */
export function centrosPendentes(cfg: ConfigSubunidades | null | undefined, centrosDosDfds: string[]): string[] {
  const tem = new Set(centrosDaConfig(cfg).map(chaveCentro));
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const c of centrosDosDfds) {
    const k = chaveCentro(c);
    if (!k || tem.has(k) || vistos.has(k)) continue;
    vistos.add(k);
    out.push(limparCentro(c));
  }
  return out;
}

/** Um cadastro (de OUTRA unidade) que guarda centros de custo: a própria unidade (modo único — `subunidadeId` null) ou
 * uma subunidade dela. */
export type CentrosDeOutro = { reparticaoId: number; unidade: string; subunidadeId: number | null; subunidade: string; centros: string[] };

/** MOVER centros de custo de outros cadastros para esta unidade: a lista NOVA de cada cadastro de origem (sem os
 * movidos — pela chave) e os rótulos para a auditoria. Só os cadastros que mudam. */
export function planoMover(mover: string[], outras: CentrosDeOutro[]) {
  const chaves = new Set(mover.map(chaveCentro).filter(Boolean));
  const alvos: { reparticaoId: number; subunidadeId: number | null; centros: string[]; rotulo: string; tirados: string[] }[] = [];
  for (const o of outras) {
    const tirados = o.centros.filter((c) => chaves.has(chaveCentro(c)));
    if (!tirados.length) continue;
    alvos.push({
      reparticaoId: o.reparticaoId,
      subunidadeId: o.subunidadeId,
      centros: o.centros.filter((c) => !chaves.has(chaveCentro(c))),
      rotulo: o.subunidade ? `${o.subunidade} (${o.unidade})` : o.unidade,
      tirados,
    });
  }
  return alvos;
}

/** Um DFD da seleção para a subunidade EM MASSA: a unidade (do rascunho, no banner) e, quando não pode ser alterado, o motivo. */
export type AlvoSubunidadeMassa = { id: number; reparticaoId: number | null; sigla: string | null; bloqueio?: string | null };
export type MotivoSubunidadeMassa = { tom: "danger" | "warn"; dica: string };

/**
 * A subunidade EM MASSA — a régua ÚNICA da Mesa e do banner do protocolo: só aplica quando TODA a seleção pode (unidade
 * no modo "único" com subunidades, a MESMA unidade). Os que não podem ficam em vermelho (`danger`, com o motivo); os de
 * outra unidade em âmbar (`warn` — vale a de MAIS DFDs). `sub.motivo` = por que o campo fica travado.
 */
export function subunidadeEmMassa(
  alvos: AlvoSubunidadeMassa[],
  cfgDe: (reparticaoId: number) => ConfigSubunidades | null | undefined,
  siglaDe: (reparticaoId: number) => string | null | undefined,
): { motivos: Map<number, MotivoSubunidadeMassa>; sub: { opcoes: Subunidade[]; motivo: string | null } } {
  const motivos = new Map<number, MotivoSubunidadeMassa>();
  const porUnidade = new Map<number, number[]>();
  for (const a of alvos) {
    const cfg = a.reparticaoId != null ? cfgDe(a.reparticaoId) : null;
    const sigla = a.sigla || "a unidade";
    const motivo = a.bloqueio
      ? a.bloqueio
      : a.reparticaoId == null
        ? "DFD sem unidade"
        : !cfg
          ? `${sigla} não tem centro de custo cadastrado`
          : cfg.modo === "subunidades"
            ? `em ${sigla} a subunidade vem do centro de custo (um por subunidade)`
            : !cfg.subunidades.length
              ? `${sigla} não tem subunidades`
              : null;
    if (motivo) motivos.set(a.id, { tom: "danger", dica: `Subunidade não permitida: ${motivo}.` });
    else porUnidade.set(a.reparticaoId as number, [...(porUnidade.get(a.reparticaoId as number) ?? []), a.id]);
  }
  const [unica] = [...porUnidade.entries()].sort((x, y) => y[1].length - x[1].length)[0] ?? [];
  const sig = (id: number) => siglaDe(id) || "outra unidade";
  for (const [u, ids] of porUnidade)
    if (u !== unica) for (const id of ids) motivos.set(id, { tom: "warn", dica: `De ${sig(u)} — a subunidade em massa vale para os DFDs de UMA unidade (${sig(unica as number)}).` });
  const cfg = unica != null ? cfgDe(unica) : null;
  const nao = [...motivos.values()].filter((m) => m.tom === "danger").length;
  const outras = motivos.size - nao;
  const motivo = motivos.size
    ? [nao ? `${nao} DFD(s) não permitem subunidade (em vermelho)` : "", outras ? `${outras} de outra unidade (em âmbar)` : ""].filter(Boolean).join(" · ") +
      " — tire-os da seleção para definir a subunidade."
    : null;
  return { motivos, sub: { opcoes: cfg?.subunidades ?? [], motivo } };
}
