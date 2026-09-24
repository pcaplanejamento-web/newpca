import { normUnidadeMedida } from "./normalize.ts";
import { normComparacao } from "./parse-dfd-comum.ts";

/**
 * PADRONIZAÇÃO dos itens — núcleo PURO (sem `getDb`/JSX → testável). Dois cadastros (Catálogo → Unidades de medida |
 * Classificações):
 *  1. UNIDADES DE MEDIDA (sigla + nome + sinônimos): toda grafia de unidade dos itens (DFDs e catálogo) é COMPARADA com
 *     o cadastro. "Und.", "UND" e "und" são a MESMA grafia (`chaveUnidade`); ela é CADASTRADA quando é a sigla, o nome ou
 *     um sinônimo de uma unidade; senão fica NÃO CADASTRADA — com SUGESTÃO quando a regra do sistema (`normUnidadeMedida`)
 *     a põe no mesmo canônico de UMA cadastrada (UND ≡ UNIDADE) ou quando é o plural de uma grafia cadastrada.
 *  2. CLASSIFICAÇÕES (nome + cor + palavras-chave): cada item é classificado AUTOMATICAMENTE pela descrição — vence a
 *     palavra-chave que aparece PRIMEIRO (o produto vem no início: "SERVIÇO DE MANUTENÇÃO EM CADEIRAS" é serviço, não
 *     cadeira); na mesma posição, a mais LONGA (mais específica); depois, a ordem do cadastro. Sem palavra-chave na
 *     descrição, vale a classificação que a UNIDADE cadastrada do item indica; sem nenhuma, "Não classificado".
 */

/** Unidade de medida CADASTRADA. */
export type UnidadeMedida = {
  id: number;
  sigla: string;
  nome: string;
  /** As outras grafias aceitas ("UND", "UNID."). */
  sinonimos: string[];
  /** A classificação que a unidade indica (quando a descrição não tem palavra-chave). */
  classificacaoId: number | null;
  ordem: number;
};

/** Classificação de item CADASTRADA. */
export type ClassificacaoItem = { id: number; nome: string; cor: string; palavras: string[]; ordem: number };

/** Os dois cadastros — o que as telas de itens usam (Mesa → Itens). */
export type Padronizacao = { unidades: UnidadeMedida[]; classificacoes: ClassificacaoItem[] };

export const NAO_CADASTRADA = "Não cadastrada";
export const NAO_CLASSIFICADO = "Não classificado";

/** Limites do cadastro (os MESMOS no Zod e na proposta de cadastro). */
export const LIMITES_PADRONIZACAO = { sigla: 20, nome: 60, grafia: 60, sinonimos: 100, palavra: 60, palavras: 300 } as const;

const porOrdem = <T extends { id: number; ordem: number }>(l: readonly T[]): T[] => [...l].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
const espacos = (s: string) => s.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Unidades de medida
// ---------------------------------------------------------------------------

/** Chave de COMPARAÇÃO de uma grafia de unidade: sem acento, caixa, pontuação e espaço; ²/³ = 2/3 ("Unid." = "UNID",
 * "m²" = "M2"). Vazia = sem unidade. */
export function chaveUnidade(texto: string | null | undefined): string {
  return normComparacao(String(texto ?? "").replace(/²/g, "2").replace(/³/g, "3")).replace(/ /g, "");
}

/** Todas as grafias de uma unidade (sigla, nome e sinônimos). */
export function grafiasDaUnidade(u: Pick<UnidadeMedida, "sigla" | "nome" | "sinonimos">): string[] {
  return [u.sigla, u.nome, ...u.sinonimos];
}

/** Grafia → a unidade CADASTRADA dela (sigla, nome ou sinônimo), ou `null`. */
export type ResolverUnidade = (texto: string | null | undefined) => UnidadeMedida | null;

function mapaDeChaves(unidades: readonly UnidadeMedida[]): Map<string, UnidadeMedida> {
  const m = new Map<string, UnidadeMedida>();
  for (const u of porOrdem(unidades))
    for (const g of grafiasDaUnidade(u)) {
      const k = chaveUnidade(g);
      if (k && !m.has(k)) m.set(k, u);
    }
  return m;
}

export function resolverUnidades(unidades: readonly UnidadeMedida[]): ResolverUnidade {
  const m = mapaDeChaves(unidades);
  return (texto) => m.get(chaveUnidade(texto)) ?? null;
}

/** Canônico da regra EMBUTIDA do sistema (`normUnidadeMedida`: UN/UND/UNID = UNIDADE, QUILO = KG…), como chave. */
function canonicoUnidade(texto: string | null | undefined): string {
  if (!chaveUnidade(texto)) return "";
  const c = normUnidadeMedida(texto);
  return c === "—" ? "" : chaveUnidade(c);
}

/** Resolve a grafia no cadastro e, quando não cadastrada, SUGERE a unidade (nunca adivinha entre duas). */
export type ComparadorUnidades = { resolver: ResolverUnidade; sugerir: ResolverUnidade };

export function comparadorUnidades(unidades: readonly UnidadeMedida[]): ComparadorUnidades {
  const chaves = mapaDeChaves(unidades);
  // Canônico do sistema → as unidades cadastradas que caem nele (uma só = sugestão segura; duas ou mais = ambíguo).
  const porCanonico = new Map<string, Set<number>>();
  const porId = new Map(unidades.map((u) => [u.id, u]));
  for (const u of unidades)
    for (const g of grafiasDaUnidade(u)) {
      const c = canonicoUnidade(g);
      if (!c) continue;
      const s = porCanonico.get(c) ?? new Set<number>();
      s.add(u.id);
      porCanonico.set(c, s);
    }
  const resolver: ResolverUnidade = (texto) => chaves.get(chaveUnidade(texto)) ?? null;
  const sugerir: ResolverUnidade = (texto) => {
    const k = chaveUnidade(texto);
    if (!k || chaves.has(k)) return null;
    const mesmas = porCanonico.get(canonicoUnidade(texto));
    if (mesmas?.size === 1) return porId.get([...mesmas][0]) ?? null;
    // O plural de uma grafia cadastrada ("CAIXAS" → "CAIXA").
    if (k.length > 2 && k.endsWith("S")) return chaves.get(k.slice(0, -1)) ?? null;
    return null;
  };
  return { resolver, sugerir };
}

/** Uso de UMA grafia de unidade nos itens (como vem do banco: grafia crua + quantos itens a usam). */
export type UsoUnidade = { texto: string | null; dfd: number; catalogo: number };

export type EstadoUnidade = "cadastrada" | "sugestao" | "nao_cadastrada";
export const ROTULO_ESTADO_UNIDADE: Record<EstadoUnidade, string> = {
  cadastrada: "Cadastrada",
  sugestao: "Sugestão",
  nao_cadastrada: NAO_CADASTRADA,
};

/** Uma linha da COMPARAÇÃO: uma grafia (as escritas equivalentes juntas) com o uso e o casamento com o cadastro. */
export type LinhaUnidade = {
  chave: string;
  /** A escrita mais usada. */
  texto: string;
  /** Todas as escritas equivalentes ("UND", "Und.", "und"), a mais usada primeiro. */
  grafias: { texto: string; n: number }[];
  dfd: number;
  catalogo: number;
  total: number;
  unidadeId: number | null;
  sugestaoId: number | null;
  estado: EstadoUnidade;
};

const PESO_ESTADO: Record<EstadoUnidade, number> = { nao_cadastrada: 0, sugestao: 1, cadastrada: 2 };

/**
 * COMPARA as unidades dos itens com o cadastro: uma linha por grafia (as escritas equivalentes juntas), com quantos
 * itens de DFD e do catálogo a usam e a unidade cadastrada (ou a sugestão). Ordem: o que precisa de ação primeiro (não
 * cadastradas › sugestões › cadastradas), depois o mais usado. Itens sem unidade vão à parte (`semUnidade`).
 */
export function compararUnidades(
  uso: readonly UsoUnidade[],
  unidades: readonly UnidadeMedida[],
): { linhas: LinhaUnidade[]; semUnidade: { dfd: number; catalogo: number } } {
  const cmp = comparadorUnidades(unidades);
  const semUnidade = { dfd: 0, catalogo: 0 };
  const acc = new Map<string, { dfd: number; catalogo: number; grafias: Map<string, number> }>();
  for (const u of uso) {
    const dfd = Math.max(0, Number(u.dfd) || 0);
    const catalogo = Math.max(0, Number(u.catalogo) || 0);
    const texto = espacos(String(u.texto ?? ""));
    const chave = chaveUnidade(texto);
    if (!chave) {
      semUnidade.dfd += dfd;
      semUnidade.catalogo += catalogo;
      continue;
    }
    const a = acc.get(chave) ?? { dfd: 0, catalogo: 0, grafias: new Map<string, number>() };
    a.dfd += dfd;
    a.catalogo += catalogo;
    a.grafias.set(texto, (a.grafias.get(texto) ?? 0) + dfd + catalogo);
    acc.set(chave, a);
  }
  const linhas: LinhaUnidade[] = [];
  for (const [chave, a] of acc) {
    const grafias = [...a.grafias].map(([texto, n]) => ({ texto, n })).sort((x, y) => y.n - x.n || x.texto.localeCompare(y.texto, "pt-BR"));
    const texto = grafias[0].texto;
    const unidade = cmp.resolver(texto);
    const sugestao = unidade ? null : cmp.sugerir(texto);
    linhas.push({
      chave,
      texto,
      grafias,
      dfd: a.dfd,
      catalogo: a.catalogo,
      total: a.dfd + a.catalogo,
      unidadeId: unidade?.id ?? null,
      sugestaoId: sugestao?.id ?? null,
      estado: unidade ? "cadastrada" : sugestao ? "sugestao" : "nao_cadastrada",
    });
  }
  linhas.sort((x, y) => PESO_ESTADO[x.estado] - PESO_ESTADO[y.estado] || y.total - x.total || x.texto.localeCompare(y.texto, "pt-BR"));
  return { linhas, semUnidade };
}

/** Quantos itens (de DFD e do catálogo) caem em cada unidade cadastrada — somado das linhas da comparação. */
export function itensPorUnidade(linhas: readonly LinhaUnidade[]): Map<number, { dfd: number; catalogo: number }> {
  const m = new Map<number, { dfd: number; catalogo: number }>();
  for (const l of linhas) {
    if (l.unidadeId == null) continue;
    const a = m.get(l.unidadeId) ?? { dfd: 0, catalogo: 0 };
    a.dfd += l.dfd;
    a.catalogo += l.catalogo;
    m.set(l.unidadeId, a);
  }
  return m;
}

/**
 * PROPOSTA de cadastro para uma grafia NÃO cadastrada (o ADM confere antes de gravar): o nome é o canônico da regra do
 * sistema (UND → UNIDADE); a sigla, a escrita mais curta do grupo; os sinônimos, as demais grafias ainda não cadastradas
 * dos itens que caem no MESMO canônico ("UN", "UND", "Unid." → UN · UNIDADE · [UND, UNID.]).
 */
export function propostaUnidade(linha: LinhaUnidade, linhas: readonly LinhaUnidade[]): { sigla: string; nome: string; sinonimos: string[] } {
  const c = canonicoUnidade(linha.texto);
  const grupo = c ? linhas.filter((l) => l.estado !== "cadastrada" && canonicoUnidade(l.texto) === c) : [linha];
  if (!grupo.includes(linha)) grupo.push(linha);
  const textos = grupo.map((l) => l.texto.toUpperCase());
  const sigla = [...textos].sort((a, b) => a.length - b.length || a.localeCompare(b, "pt-BR"))[0].slice(0, LIMITES_PADRONIZACAO.sigla);
  const canonico = normUnidadeMedida(linha.texto);
  const nome = (canonico === "—" ? linha.texto.toUpperCase() : canonico).slice(0, LIMITES_PADRONIZACAO.nome);
  return { sigla, nome, sinonimos: limparSinonimos(sigla, nome, textos) };
}

/** Sinônimos limpos: sem vazios, sem repetir a MESMA grafia e sem os iguais à sigla/nome da própria unidade. */
export function limparSinonimos(sigla: string, nome: string, sinonimos: readonly string[]): string[] {
  const vistas = new Set([chaveUnidade(sigla), chaveUnidade(nome)]);
  const out: string[] = [];
  for (const s of sinonimos) {
    const t = espacos(s).slice(0, LIMITES_PADRONIZACAO.grafia);
    const k = chaveUnidade(t);
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    out.push(t);
  }
  return out;
}

/** A 1ª grafia (sigla, nome ou sinônimo) que JÁ é de OUTRA unidade cadastrada — o conflito; `null` = ok. */
export function conflitoUnidade(
  dados: Pick<UnidadeMedida, "sigla" | "nome" | "sinonimos">,
  unidades: readonly UnidadeMedida[],
  id?: number | null,
): { grafia: string; unidade: UnidadeMedida } | null {
  const outras = resolverUnidades(unidades.filter((u) => u.id !== id));
  for (const g of grafiasDaUnidade(dados)) {
    const u = outras(g);
    if (u) return { grafia: g, unidade: u };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classificação automática dos itens
// ---------------------------------------------------------------------------

/** Palavras de um texto para a classificação (sem acento, caixa e pontuação). */
export function palavrasDe(texto: string | null | undefined): string[] {
  const s = normComparacao(texto ?? "");
  return s ? s.split(" ") : [];
}

/** Forma de COMPARAÇÃO de uma palavra-chave ("Manutenção!" = "MANUTENCAO"). */
export function chavePalavra(termo: string | null | undefined): string {
  return palavrasDe(termo).join(" ");
}

/** Palavras-chave limpas: sem as vazias/curtas (menos de 2 letras), sem repetir a mesma forma, no limite do cadastro. */
export function limparPalavras(palavras: readonly string[]): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const p of palavras) {
    const t = espacos(p).slice(0, LIMITES_PADRONIZACAO.palavra);
    const k = chavePalavra(t);
    if (k.replace(/ /g, "").length < 2 || vistas.has(k)) continue;
    vistas.add(k);
    out.push(t);
    if (out.length >= LIMITES_PADRONIZACAO.palavras) break;
  }
  return out;
}

/** A 1ª palavra-chave que JÁ é de OUTRA classificação — o conflito (a mesma palavra em duas nunca decide); `null` = ok. */
export function conflitoPalavra(
  palavras: readonly string[],
  classificacoes: readonly ClassificacaoItem[],
  id?: number | null,
): { termo: string; classificacao: ClassificacaoItem } | null {
  const dono = new Map<string, ClassificacaoItem>();
  for (const c of porOrdem(classificacoes)) {
    if (c.id === id) continue;
    for (const p of c.palavras) {
      const k = chavePalavra(p);
      if (k && !dono.has(k)) dono.set(k, c);
    }
  }
  for (const p of palavras) {
    const c = dono.get(chavePalavra(p));
    if (c) return { termo: p, classificacao: c };
  }
  return null;
}

/** Outra classificação com o MESMO nome (sem acento/caixa/pontuação), ou `null`. */
export function nomeEmUso(nome: string, classificacoes: readonly ClassificacaoItem[], id?: number | null): ClassificacaoItem | null {
  const k = chavePalavra(nome);
  if (!k) return null;
  return classificacoes.find((c) => c.id !== id && chavePalavra(c.nome) === k) ?? null;
}

/** Palavra da descrição × palavra da palavra-chave: curta (até 3 letras) = a palavra INTEIRA; longa = o INÍCIO dela
 * (CADEIRA acha CADEIRAS; AR não acha ARMÁRIO; DE não acha DESCARTÁVEL). */
function casaPalavra(daDescricao: string, daChave: string): boolean {
  return daChave.length <= 3 ? daDescricao === daChave : daDescricao.startsWith(daChave);
}

/** Por que o item ficou na classificação: a palavra-chave (como cadastrada) ou a sigla da unidade. */
export type ResultadoClassificacao = { classificacao: ClassificacaoItem; por: "palavra" | "unidade"; termo: string };
export type Classificador = (descricao: string | null | undefined, unidade?: string | null) => ResultadoClassificacao | null;

type Regra = { cls: ClassificacaoItem; termo: string; palavras: string[]; tamanho: number; prioridade: number };

/**
 * O CLASSIFICADOR dos itens a partir do cadastro (monta os índices uma vez; cada chamada percorre a descrição só até a
 * 1ª posição que casa). Linear no tamanho da descrição — milhares de itens sem custo perceptível.
 */
export function criarClassificador(classificacoes: readonly ClassificacaoItem[], unidades: readonly UnidadeMedida[] = []): Classificador {
  // Índice pela 1ª palavra da palavra-chave: curta = a palavra exata; longa = o início (os tamanhos distintos p/ buscar).
  const exatas = new Map<string, Regra[]>();
  const prefixos = new Map<string, Regra[]>();
  const ordenadas = porOrdem(classificacoes);
  ordenadas.forEach((cls, prioridade) => {
    for (const termo of cls.palavras) {
      const palavras = palavrasDe(termo);
      if (palavras.join("").length < 2) continue;
      const regra: Regra = { cls, termo: espacos(termo), palavras, tamanho: palavras.join(" ").length, prioridade };
      const indice = palavras[0].length <= 3 ? exatas : prefixos;
      const l = indice.get(palavras[0]) ?? [];
      l.push(regra);
      indice.set(palavras[0], l);
    }
  });
  const tamanhos = [...new Set([...prefixos.keys()].map((k) => k.length))].sort((a, b) => a - b);
  const unidadeDe = resolverUnidades(unidades);
  const porId = new Map(ordenadas.map((c) => [c.id, c]));
  return (descricao, unidade) => {
    const ws = palavrasDe(descricao);
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      let melhor: Regra | null = null;
      const considerar = (r: Regra) => {
        if (i + r.palavras.length > ws.length) return;
        for (let j = 1; j < r.palavras.length; j++) if (!casaPalavra(ws[i + j], r.palavras[j])) return;
        if (!melhor || r.tamanho > melhor.tamanho || (r.tamanho === melhor.tamanho && r.prioridade < melhor.prioridade)) melhor = r;
      };
      for (const r of exatas.get(w) ?? []) considerar(r);
      for (const t of tamanhos) {
        if (t > w.length) break;
        for (const r of prefixos.get(w.slice(0, t)) ?? []) considerar(r);
      }
      const achada = melhor as Regra | null;
      if (achada) return { classificacao: achada.cls, por: "palavra", termo: achada.termo };
    }
    const u = unidadeDe(unidade);
    const cls = u?.classificacaoId != null ? porId.get(u.classificacaoId) : undefined;
    return u && cls ? { classificacao: cls, por: "unidade", termo: u.sigla } : null;
  };
}

/** A explicação curta: "pela palavra-chave “MANUTENÇÃO”" / "pela unidade SV" / "sem palavra-chave nem unidade". */
export function motivoClassificacao(r: ResultadoClassificacao | null): string {
  if (!r) return "Nenhuma palavra-chave na descrição e a unidade não indica classificação";
  return r.por === "palavra" ? `Pela palavra-chave “${r.termo}”` : `Pela unidade de medida ${r.termo}`;
}

/** Uma descrição DISTINTA dos itens (como vem do banco: descrição + unidade + quantos itens + valor dos de DFD). */
export type DescricaoItem = { descricao: string; unidade: string | null; dfd: number; catalogo: number; valor: number };
export type LinhaClassificada = DescricaoItem & { id: number; resultado: ResultadoClassificacao | null };
export type TotaisClassificacao = { descricoes: number; dfd: number; catalogo: number; valor: number };

/** Classifica cada descrição distinta (o `id` é a posição — chave estável da lista). */
export function classificarDescricoes(lista: readonly DescricaoItem[], classificar: Classificador): LinhaClassificada[] {
  return lista.map((d, id) => ({ ...d, id, resultado: classificar(d.descricao, d.unidade) }));
}

const zerado = (): TotaisClassificacao => ({ descricoes: 0, dfd: 0, catalogo: 0, valor: 0 });

/** Totais por classificação (descrições, itens de DFD e do catálogo, valor), os NÃO classificados e o geral. */
export function totaisPorClassificacao(linhas: readonly LinhaClassificada[]): {
  porId: Map<number, TotaisClassificacao>;
  semClassificacao: TotaisClassificacao;
  total: TotaisClassificacao;
} {
  const porId = new Map<number, TotaisClassificacao>();
  const semClassificacao = zerado();
  const total = zerado();
  for (const l of linhas) {
    const id = l.resultado?.classificacao.id;
    let alvo = semClassificacao;
    if (id != null) {
      alvo = porId.get(id) ?? zerado();
      porId.set(id, alvo);
    }
    for (const t of [alvo, total]) {
      t.descricoes += 1;
      t.dfd += l.dfd;
      t.catalogo += l.catalogo;
      t.valor += l.valor || 0;
    }
  }
  return { porId, semClassificacao, total };
}
