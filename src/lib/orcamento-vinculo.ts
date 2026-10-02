import { similaridade } from "./catalogo-conferencia.ts";
import { norm } from "./parse-dfd-comum.ts";

/**
 * VÍNCULOS do ORÇAMENTO (CUBO) com o cadastro do sistema — núcleo PURO (sem `getDb`/JSX → testável). A UNIDADE é o
 * micro: o usuário CRIA os vínculos — cada um liga um texto de Unidade do CUBO ("2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO",
 * "26 - FMACL") a UMA unidade cadastrada, com as AÇÕES dele; a mesma unidade do CUBO pode ter VÁRIOS vínculos (as ações
 * divididas entre unidades cadastradas). As ações de um vínculo são uma lista EXPLÍCITA ou "as DEMAIS" (as que nenhum
 * outro vínculo da unidade pegou, menos as de fora — um por unidade do CUBO). Uma ação vai a UMA unidade (nunca conta
 * duas vezes). O ÓRGÃO não se vincula: ver por órgão = a SOMA das unidades vinculadas (`comVinculos`). A chave é o texto
 * normalizado → o vínculo vale para todos os orçamentos (inclusive os próximos anos).
 */

/**
 * Vínculo gravado (`orcamento_vinculos`), como chega ao cliente: `acoes` = as chaves das ações EXPLÍCITAS (null = as
 * DEMAIS); `acoesFora` = as que ficam de fora de um vínculo "com as demais".
 */
export type VinculoOrcamento = { id: number; chave: string; texto: string; alvoId: number; acoes: string[] | null; acoesFora: string[] };

/** Alvo possível do vínculo (unidade: `codigo` → aqui `sigla`; órgão: o dono da unidade). */
export type AlvoVinculo = { id: number; sigla: string; nome: string; oculto?: boolean; orgaoId?: number | null };

/** Os cadastros que o vínculo usa: as unidades (alvos) e os órgãos (para ver por órgão). */
export type AlvosVinculo = { orgaos: AlvoVinculo[]; unidades: AlvoVinculo[] };

export const SEM_VINCULO_ORC = "Sem vínculo";

/** Chave estável do texto do CUBO (maiúsculas, sem acento, espaços colapsados). */
export function chaveVinculo(texto: string | null | undefined): string {
  return norm(texto ?? "");
}

/** Tira o código numérico que o CUBO põe na frente da unidade ("2 - SECRETARIA…" → "SECRETARIA…"). */
export function nomeSemCodigo(texto: string | null | undefined): string {
  return String(texto ?? "")
    .replace(/^\s*\d+\s*[-–—.]\s*/, "")
    .trim();
}

/** Limiar da semelhança por nome (Jaccard de tokens) para SUGERIR um alvo. */
export const LIMIAR_SUGESTAO = 0.6;

/**
 * SUGERE o alvo de um texto do CUBO entre os cadastrados (ignora ocultos): nome ou sigla IGUAIS
 * (sem o código numérico, sem acento) ⇒ certeza; senão o nome mais semelhante ≥ `LIMIAR_SUGESTAO`
 * (empate ⇒ nenhum, para não sugerir errado). Só SUGERE — quem confirma é o usuário.
 */
export function sugerirAlvo(texto: string | null | undefined, candidatos: AlvoVinculo[]): number | null {
  const alvo = chaveVinculo(nomeSemCodigo(texto));
  if (!alvo) return null;
  const visiveis = candidatos.filter((c) => !c.oculto);
  const exato = visiveis.filter((c) => chaveVinculo(c.nome) === alvo || chaveVinculo(c.sigla) === alvo);
  if (exato.length === 1) return exato[0].id;
  if (exato.length > 1) return null;
  let melhor: { id: number; s: number } | null = null;
  let empate = false;
  for (const c of visiveis) {
    const s = similaridade(alvo, c.nome);
    if (s < LIMIAR_SUGESTAO) continue;
    if (!melhor || s > melhor.s) {
      melhor = { id: c.id, s };
      empate = false;
    } else if (s === melhor.s) empate = true;
  }
  return melhor && !empate ? melhor.id : null;
}

/** Uma AÇÃO de uma unidade do CUBO: o texto, quantos lançamentos e a dotação. */
export type AcaoVinculo = { chave: string; texto: string; lancamentos: number; valorInicial: number };

/** Uma UNIDADE distinta do CUBO neste orçamento: os agregados e as AÇÕES dela. */
export type UnidadeOrcamento = {
  chave: string;
  texto: string;
  /** O(s) órgão(s) do CUBO em que a unidade aparece (contexto p/ quem vincula). */
  contexto: string;
  lancamentos: number;
  valorInicial: number;
  acoes: AcaoVinculo[];
};

type LancamentoVinculo = { orgao: string | null; unidade: string | null; acao: string | null; valorInicial: number };

const colator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
/** A ação vazia do CUBO vira esta chave (escolhível como as demais). */
export const SEM_ACAO = "—";
/** A chave da ação de um lançamento. */
export const chaveAcao = (acao: string | null | undefined) => chaveVinculo(acao) || SEM_ACAO;

/** As UNIDADES distintas do CUBO (com nº de lançamentos, Σ dotação e as AÇÕES), em ordem alfabética; vazia é ignorada. */
export function unidadesDoOrcamento(lancamentos: LancamentoVinculo[]): UnidadeOrcamento[] {
  const acc = new Map<string, Omit<UnidadeOrcamento, "acoes" | "contexto"> & { ctx: Set<string>; acoes: Map<string, AcaoVinculo> }>();
  for (const r of lancamentos) {
    const chave = chaveVinculo(r.unidade);
    if (!chave) continue;
    let u = acc.get(chave);
    if (!u) {
      u = { chave, texto: String(r.unidade).trim(), lancamentos: 0, valorInicial: 0, ctx: new Set(), acoes: new Map() };
      acc.set(chave, u);
    }
    u.lancamentos++;
    u.valorInicial += r.valorInicial || 0;
    if (r.orgao?.trim()) u.ctx.add(r.orgao.trim());
    const ka = chaveAcao(r.acao);
    const a = u.acoes.get(ka) ?? { chave: ka, texto: r.acao?.trim() || SEM_ACAO, lancamentos: 0, valorInicial: 0 };
    a.lancamentos++;
    a.valorInicial += r.valorInicial || 0;
    u.acoes.set(ka, a);
  }
  return [...acc.values()]
    .map(({ ctx, acoes, ...u }) => ({ ...u, contexto: [...ctx].join(" · "), acoes: [...acoes.values()].sort((a, b) => colator.compare(a.texto, b.texto)) }))
    .sort((a, b) => colator.compare(a.texto, b.texto));
}

/** Os vínculos prontos para resolver os lançamentos: por unidade do CUBO, as ações EXPLÍCITAS → alvo e o vínculo das DEMAIS. */
export type MapaVinculos = Map<string, { explicitas: Map<string, number>; demais: { alvoId: number; fora: Set<string> } | null }>;

export function mapaVinculos(vinculos: VinculoOrcamento[]): MapaVinculos {
  const m: MapaVinculos = new Map();
  for (const v of vinculos) {
    const e = m.get(v.chave) ?? { explicitas: new Map(), demais: null };
    if (v.acoes == null) e.demais = { alvoId: v.alvoId, fora: new Set(v.acoesFora) };
    else for (const a of v.acoes) if (!e.explicitas.has(a)) e.explicitas.set(a, v.alvoId);
    m.set(v.chave, e);
  }
  return m;
}

/** A unidade CADASTRADA de um lançamento: a do vínculo que tem a AÇÃO dele (explícita), senão o das DEMAIS (se não está fora). */
export function unidadeDoLancamento(mapa: MapaVinculos, unidade: string | null | undefined, acao: string | null | undefined): number | null {
  const v = mapa.get(chaveVinculo(unidade));
  if (!v) return null;
  const ka = chaveAcao(acao);
  const explicita = v.explicitas.get(ka);
  if (explicita != null) return explicita;
  return v.demais && !v.demais.fora.has(ka) ? v.demais.alvoId : null;
}

/** As unidades cadastradas de uma unidade do CUBO (a Sigla da linha na tabela cruzada). */
export function alvosDaUnidade(mapa: MapaVinculos, unidade: string | null | undefined): number[] {
  const v = mapa.get(chaveVinculo(unidade));
  if (!v) return [];
  return [...new Set([...v.explicitas.values(), ...(v.demais ? [v.demais.alvoId] : [])])];
}

/** Uma linha da lista de VÍNCULOS: o vínculo, a unidade do CUBO e as ações que ele leva NESTE orçamento. */
export type LinhaVinculo = { vinculo: VinculoOrcamento; unidade: UnidadeOrcamento; acoes: AcaoVinculo[]; lancamentos: number; valorInicial: number };

/** Os vínculos das unidades presentes neste orçamento, cada um com as ações (e a dotação) que leva. */
export function linhasVinculos(unidades: UnidadeOrcamento[], vinculos: VinculoOrcamento[]): LinhaVinculo[] {
  const mapa = mapaVinculos(vinculos);
  const porChave = new Map(unidades.map((u) => [u.chave, u]));
  const out: LinhaVinculo[] = [];
  for (const v of vinculos) {
    const u = porChave.get(v.chave);
    if (!u) continue;
    const acoes = u.acoes.filter((a) => unidadeDoLancamento(mapa, u.texto, a.chave === SEM_ACAO ? null : a.texto) === v.alvoId);
    out.push({ vinculo: v, unidade: u, acoes, lancamentos: acoes.reduce((s, a) => s + a.lancamentos, 0), valorInicial: acoes.reduce((s, a) => s + a.valorInicial, 0) });
  }
  return out.sort((a, b) => colator.compare(a.unidade.texto, b.unidade.texto));
}

/** Uma unidade do CUBO com AÇÕES SEM VÍNCULO neste orçamento (a sugestão só quando ela não tem vínculo nenhum). */
export type PendenciaVinculo = { unidade: UnidadeOrcamento; acoes: AcaoVinculo[]; lancamentos: number; valorInicial: number; vinculada: boolean; sugestaoId: number | null };

export function semVinculo(unidades: UnidadeOrcamento[], vinculos: VinculoOrcamento[], alvos: AlvoVinculo[]): PendenciaVinculo[] {
  const mapa = mapaVinculos(vinculos);
  const out: PendenciaVinculo[] = [];
  for (const u of unidades) {
    const acoes = u.acoes.filter((a) => unidadeDoLancamento(mapa, u.texto, a.chave === SEM_ACAO ? null : a.texto) == null);
    if (acoes.length === 0) continue;
    const vinculada = mapa.has(u.chave);
    out.push({
      unidade: u,
      acoes,
      lancamentos: acoes.reduce((s, a) => s + a.lancamentos, 0),
      valorInicial: acoes.reduce((s, a) => s + a.valorInicial, 0),
      vinculada,
      sugestaoId: vinculada ? null : sugerirAlvo(u.texto, alvos),
    });
  }
  return out;
}

/**
 * A REGRA de um vínculo novo/alterado entre os OUTROS da mesma unidade do CUBO (mesma régua na tela e no servidor):
 * uma unidade cadastrada por vez; um só "com as demais"; a lista explícita não vazia e sem ação de outro vínculo.
 * Devolve o motivo ou `null`.
 */
export function conflitoVinculo(
  outros: Pick<VinculoOrcamento, "alvoId" | "acoes">[],
  novo: Pick<VinculoOrcamento, "alvoId" | "acoes">,
  rotuloAcao: (chave: string) => string = (c) => c,
): string | null {
  if (outros.some((o) => o.alvoId === novo.alvoId)) return "Esta unidade do orçamento já tem um vínculo com esta unidade cadastrada — edite-o.";
  if (novo.acoes == null) return outros.some((o) => o.acoes == null) ? "Já existe um vínculo com as DEMAIS ações desta unidade — escolha as ações." : null;
  if (novo.acoes.length === 0) return "Escolha ao menos uma ação.";
  const usadas = new Set(outros.flatMap((o) => o.acoes ?? []));
  const repetida = novo.acoes.find((a) => usadas.has(a));
  return repetida ? `A ação "${rotuloAcao(repetida)}" já está em outro vínculo desta unidade.` : null;
}

/** "SIGLA — Nome" de um cadastro (sem repetir quando a sigla é o próprio nome). */
export const rotuloCadastro = (a: Pick<AlvoVinculo, "sigla" | "nome">) => (a.nome && a.nome !== a.sigla ? `${a.sigla} — ${a.nome}` : a.sigla);

/** As duas DIMENSÕES do cadastro que cada lançamento ganha (`comVinculos`). */
export type DimensoesCadastro = { unidadeSistema: string; orgaoSistema: string };

/**
 * Os lançamentos com a UNIDADE e o ÓRGÃO DO CADASTRO (as dimensões "Unidade (cadastro)" e "Órgão (cadastro)" das visões,
 * do comparativo e dos lançamentos): a unidade pelo vínculo da AÇÃO (`unidadeDoLancamento`) e o órgão = o dono dessa
 * unidade — ver por órgão é a SOMA das unidades vinculadas. Sem vínculo = "Sem vínculo".
 */
export function comVinculos<T extends { unidade: string | null; acao: string | null }>(itens: T[], vinculos: VinculoOrcamento[], alvos: AlvosVinculo): (T & DimensoesCadastro)[] {
  const mapa = mapaVinculos(vinculos);
  const unidades = new Map(alvos.unidades.map((u) => [u.id, u]));
  const orgaos = new Map(alvos.orgaos.map((o) => [o.id, o]));
  return itens.map((i) => {
    const u = unidades.get(unidadeDoLancamento(mapa, i.unidade, i.acao) ?? -1);
    const o = u?.orgaoId != null ? orgaos.get(u.orgaoId) : undefined;
    return { ...i, unidadeSistema: u ? rotuloCadastro(u) : SEM_VINCULO_ORC, orgaoSistema: o ? rotuloCadastro(o) : SEM_VINCULO_ORC };
  });
}

/** Lê uma lista de ações gravada em JSON (tolerante: qualquer coisa inválida = `null` quando `nulo`, senão vazia). */
export function lerListaAcoes(v: unknown): string[] | null {
  if (v == null) return null;
  let o: unknown = v;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return Array.isArray(o) ? [...new Set(o.filter((x): x is string => typeof x === "string" && x.trim() !== ""))] : null;
}
