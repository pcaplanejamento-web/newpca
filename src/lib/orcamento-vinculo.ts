import { similaridade } from "./catalogo-conferencia.ts";
import { norm } from "./parse-dfd-comum.ts";

/**
 * VÍNCULOS do ORÇAMENTO (CUBO) com o cadastro do sistema — núcleo PURO (sem `getDb`/JSX →
 * testável). O CUBO traz Órgão/Unidade como TEXTO próprio ("FUNDO MUNICIPAL DE EDUCACAO…",
 * "2 - SECRETARIA MUNICIPAL DE EDUCAÇÃO", "26 - FMACL"); cada texto distinto é vinculado a UM
 * órgão (tipo `orgao`) ou UMA unidade (tipo `unidade`) cadastrados. A chave é o texto
 * normalizado → o vínculo vale para todos os orçamentos (inclusive os próximos anos).
 */

export type TipoVinculo = "orgao" | "unidade";

/** Vínculo gravado (`orcamento_vinculos`), como chega ao cliente. */
export type VinculoOrcamento = { tipo: TipoVinculo; chave: string; texto: string; alvoId: number | null };

/** Alvo possível do vínculo (órgão: `sigla`; unidade: `codigo` → aqui `sigla`). */
export type AlvoVinculo = { id: number; sigla: string; nome: string; oculto?: boolean; orgaoId?: number | null };

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

/** Uma linha da tela de vínculos: um texto distinto do CUBO + agregados + vínculo atual. */
export type LinhaVinculo = {
  tipo: TipoVinculo;
  chave: string;
  texto: string;
  /** Unidade: o(s) órgão(s) do CUBO em que ela aparece (contexto p/ quem vincula). */
  contexto: string;
  lancamentos: number;
  valorInicial: number;
  alvoId: number | null;
  sugestaoId: number | null;
};

type LancamentoVinculo = { orgao: string | null; unidade: string | null; valorInicial: number };

/**
 * Agrupa os lançamentos em textos DISTINTOS de Órgão e de Unidade (com nº de lançamentos e Σ
 * dotação), já com o vínculo gravado e a sugestão (quando sem vínculo). Órgãos primeiro, depois
 * unidades, cada grupo em ordem alfabética. Texto vazio é ignorado.
 */
export function linhasVinculo(
  lancamentos: LancamentoVinculo[],
  vinculos: VinculoOrcamento[],
  alvos: { orgaos: AlvoVinculo[]; unidades: AlvoVinculo[] },
): LinhaVinculo[] {
  const gravado = mapaVinculos(vinculos);
  const acc = new Map<string, LinhaVinculo & { ctx: Set<string> }>();
  const somar = (tipo: TipoVinculo, texto: string | null, orgaoTexto: string | null, v: number) => {
    const chave = chaveVinculo(texto);
    if (!chave) return;
    const k = `${tipo}|${chave}`;
    let l = acc.get(k);
    if (!l) {
      l = { tipo, chave, texto: String(texto).trim(), contexto: "", lancamentos: 0, valorInicial: 0, alvoId: gravado.get(k) ?? null, sugestaoId: null, ctx: new Set() };
      acc.set(k, l);
    }
    l.lancamentos++;
    l.valorInicial += v || 0;
    if (tipo === "unidade" && orgaoTexto?.trim()) l.ctx.add(orgaoTexto.trim());
  };
  for (const r of lancamentos) {
    somar("orgao", r.orgao, null, r.valorInicial);
    somar("unidade", r.unidade, r.orgao, r.valorInicial);
  }
  return [...acc.values()]
    .map(({ ctx, ...l }) => ({
      ...l,
      contexto: [...ctx].join(" · "),
      sugestaoId: l.alvoId == null ? sugerirAlvo(l.texto, l.tipo === "orgao" ? alvos.orgaos : alvos.unidades) : null,
    }))
    .sort((a, b) => (a.tipo === b.tipo ? a.texto.localeCompare(b.texto, "pt-BR") : a.tipo === "orgao" ? -1 : 1));
}

/** `tipo|chave` → alvo gravado (só os vinculados). */
export function mapaVinculos(vinculos: VinculoOrcamento[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of vinculos) if (v.alvoId != null) m.set(`${v.tipo}|${v.chave}`, v.alvoId);
  return m;
}

/** Alvo vinculado a um texto do CUBO (ou `null`). */
export function alvoDoTexto(mapa: Map<string, number>, tipo: TipoVinculo, texto: string | null | undefined): number | null {
  const chave = chaveVinculo(texto);
  return chave ? (mapa.get(`${tipo}|${chave}`) ?? null) : null;
}
