import { similaridade } from "./catalogo-conferencia.ts";
import { norm } from "./parse-dfd-comum.ts";

/**
 * VÍNCULOS do ORÇAMENTO (CUBO) com o cadastro do sistema — núcleo PURO (sem `getDb`/JSX → testável). A UNIDADE é o
 * micro: cada texto distinto de Unidade do CUBO ("2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO", "26 - FMACL") é vinculado a UMA
 * unidade cadastrada e o usuário escolhe quais AÇÕES dessa unidade entram no vínculo (as de fora ficam "Sem vínculo").
 * O ÓRGÃO não se vincula: ver por órgão = a SOMA das unidades vinculadas a ele (`comVinculos`). A chave é o texto
 * normalizado → o vínculo vale para todos os orçamentos (inclusive os próximos anos).
 */

/** Vínculo gravado (`orcamento_vinculos`), como chega ao cliente. `acoesFora` = as chaves das AÇÕES que NÃO entram. */
export type VinculoOrcamento = { chave: string; texto: string; alvoId: number | null; acoesFora: string[] };

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

/** Uma linha da tela de vínculos: uma UNIDADE distinta do CUBO + agregados + vínculo atual + as ações dela. */
export type LinhaVinculo = {
  chave: string;
  texto: string;
  /** O(s) órgão(s) do CUBO em que a unidade aparece (contexto p/ quem vincula). */
  contexto: string;
  lancamentos: number;
  valorInicial: number;
  alvoId: number | null;
  sugestaoId: number | null;
  /** As AÇÕES da unidade (ordem alfabética natural). */
  acoes: AcaoVinculo[];
  /** As chaves das ações que NÃO entram no vínculo (só as que existem neste orçamento). */
  acoesFora: string[];
};

type LancamentoVinculo = { orgao: string | null; unidade: string | null; acao: string | null; valorInicial: number };

const colator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
/** A ação vazia do CUBO vira esta chave (escolhível como as demais). */
export const SEM_ACAO = "—";

/**
 * Agrupa os lançamentos nas UNIDADES distintas do CUBO (com nº de lançamentos, Σ dotação e as AÇÕES de cada uma), já com
 * o vínculo gravado e a sugestão (quando sem vínculo). Ordem alfabética; unidade vazia é ignorada.
 */
export function linhasVinculo(lancamentos: LancamentoVinculo[], vinculos: VinculoOrcamento[], unidades: AlvoVinculo[]): LinhaVinculo[] {
  const gravado = new Map(vinculos.map((v) => [v.chave, v]));
  const acc = new Map<string, Omit<LinhaVinculo, "acoes" | "acoesFora"> & { ctx: Set<string>; acoes: Map<string, AcaoVinculo> }>();
  for (const r of lancamentos) {
    const chave = chaveVinculo(r.unidade);
    if (!chave) continue;
    let l = acc.get(chave);
    if (!l) {
      l = { chave, texto: String(r.unidade).trim(), contexto: "", lancamentos: 0, valorInicial: 0, alvoId: gravado.get(chave)?.alvoId ?? null, sugestaoId: null, ctx: new Set(), acoes: new Map() };
      acc.set(chave, l);
    }
    l.lancamentos++;
    l.valorInicial += r.valorInicial || 0;
    if (r.orgao?.trim()) l.ctx.add(r.orgao.trim());
    const ka = chaveVinculo(r.acao) || SEM_ACAO;
    const a = l.acoes.get(ka) ?? { chave: ka, texto: r.acao?.trim() || SEM_ACAO, lancamentos: 0, valorInicial: 0 };
    a.lancamentos++;
    a.valorInicial += r.valorInicial || 0;
    l.acoes.set(ka, a);
  }
  return [...acc.values()]
    .map(({ ctx, acoes, ...l }) => {
      const lista = [...acoes.values()].sort((a, b) => colator.compare(a.texto, b.texto));
      const fora = new Set(gravado.get(l.chave)?.acoesFora ?? []);
      return {
        ...l,
        contexto: [...ctx].join(" · "),
        sugestaoId: l.alvoId == null ? sugerirAlvo(l.texto, unidades) : null,
        acoes: lista,
        acoesFora: lista.filter((a) => fora.has(a.chave)).map((a) => a.chave),
      };
    })
    .sort((a, b) => colator.compare(a.texto, b.texto));
}

/** O vínculo pronto para resolver os lançamentos: a unidade-alvo + as ações de fora. */
export type MapaVinculos = Map<string, { alvoId: number; fora: Set<string> }>;

/** `chave da unidade do CUBO` → alvo gravado + as ações de fora (só os vinculados). */
export function mapaVinculos(vinculos: VinculoOrcamento[]): MapaVinculos {
  const m: MapaVinculos = new Map();
  for (const v of vinculos) if (v.alvoId != null) m.set(v.chave, { alvoId: v.alvoId, fora: new Set(v.acoesFora) });
  return m;
}

/** A unidade CADASTRADA de um lançamento: a do vínculo da unidade do CUBO, se a AÇÃO dele entra (senão `null`). */
export function unidadeDoLancamento(mapa: MapaVinculos, unidade: string | null | undefined, acao: string | null | undefined): number | null {
  const v = mapa.get(chaveVinculo(unidade));
  if (!v) return null;
  return v.fora.has(chaveVinculo(acao) || SEM_ACAO) ? null : v.alvoId;
}

/** O vínculo da unidade do CUBO (ignorando as ações) — a Sigla da linha na tabela cruzada. */
export const alvoDaUnidade = (mapa: MapaVinculos, unidade: string | null | undefined): number | null => mapa.get(chaveVinculo(unidade))?.alvoId ?? null;

/** "SIGLA — Nome" de um cadastro (sem repetir quando a sigla é o próprio nome). */
export const rotuloCadastro = (a: Pick<AlvoVinculo, "sigla" | "nome">) => (a.nome && a.nome !== a.sigla ? `${a.sigla} — ${a.nome}` : a.sigla);

/** As duas DIMENSÕES do cadastro que cada lançamento ganha (`comVinculos`). */
export type DimensoesCadastro = { unidadeSistema: string; orgaoSistema: string };

/**
 * Os lançamentos com a UNIDADE e o ÓRGÃO DO CADASTRO (as dimensões "Unidade (cadastro)" e "Órgão (cadastro)" das visões,
 * do comparativo e dos lançamentos): a unidade pelo vínculo (respeitando as ações) e o órgão = o dono dessa unidade —
 * ver por órgão é a SOMA das unidades vinculadas. Sem vínculo (ou ação de fora) = "Sem vínculo".
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

/** Lê o JSON das ações de fora gravado (tolerante: qualquer coisa inválida = nenhuma). */
export function lerAcoesFora(v: unknown): string[] {
  let o: unknown = v;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(o) ? [...new Set(o.filter((x): x is string => typeof x === "string" && x.trim() !== ""))] : [];
}
