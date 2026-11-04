import { stripAccents } from "./normalize.ts";
import type { Assinatura } from "./parse-dfd-comum.ts";
import { preverUnidadePorAssinatura, type Responsaveis } from "./reparticao-responsaveis.ts";

/**
 * Casamento de UNIDADE (repartição) e ÓRGÃO a partir dos campos de um documento.
 * Lógica PURA (sem getDb/JSX) → testável no Node e reaproveitada pelo import de
 * DFD (um a um), pelo de PROTOCOLO (por DFD do bundle) e pela identificação do
 * Interessado do protocolo. Ponto ÚNICO de match — não duplicar em outro lugar.
 * Entidades OCULTAS (`oculto`) nunca casam (não podem ser usadas em documentos novos).
 */

export type ReparticaoMatch = {
  id: number;
  codigo: string;
  nome: string;
  /** Padrão do "Setor Requisitante" (cadastro do ADM). **Não** é mais usado na previsão da
   * unidade (ponto 1 — só a assinatura prevê); mantido como dado do cadastro. */
  setorRequisitante?: string | null;
  /** O "Centro de Custo" da CM002 da Centi, como ela escreve (o texto inteiro ou só o último nome). */
  centroCusto?: string | null;
  /** Número do Interessado do protocolo (cadastro do ADM) — identifica a unidade. */
  numeroInteressado?: string | null;
  /** Órgão dono da unidade (derivado para o órgão do documento). */
  orgaoId?: number | null;
  /** 1 = é a UNIDADE PRÓPRIA do órgão (órgão-que-é-unidade, `orgao_proprio`). */
  orgaoProprio?: boolean | null;
  /** Ocultada (tem DFD/protocolo): não pode ser usada em documentos novos. */
  oculto?: boolean | null;
};

export type OrgaoMatch = {
  id: number;
  sigla: string;
  nome: string;
  /** Padrão do "Órgão/Entidade" do DFD (cadastro do ADM) — match preferencial. */
  orgaoEntidade?: string | null;
  /** Número do Interessado do protocolo — o protocolo pode vir em nome do órgão. */
  numeroInteressado?: string | null;
  /** Ocultado: não pode ser usado em documentos novos. */
  oculto?: boolean | null;
  /** 1 = assinatura única (todas as unidades compartilham o gestor) — desabilita a previsão por assinante. */
  assinaturaUnica?: boolean | null;
};

/** UPPER + sem acento (p/ casar sigla/código). */
const norm = (s: string) => stripAccents(s.trim().toUpperCase());

/** Chave de NOME p/ casar secretarias com siglas divergentes (ignora acentos,
 * conectores e "MUNICIPAL"). Ex.: "SECRETARIA MUNICIPAL DE INFRAESTRUTURA RURAL"
 * e "Secretaria de Infraestrutura Rural" → "SECRETARIA INFRAESTRUTURA RURAL". */
const chaveNome = (s: string) =>
  stripAccents(s)
    .toUpperCase()
    .replace(/\b(DE|DA|DO|DAS|DOS|E|MUNICIPAL)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

/** Só os dígitos LÍDERES de um interessado "N - NOME" (ex.: "42 - FUNDO" → "42"). */
function numeroLider(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

/** Remove o prefixo "N - " OU "SIGLA - " de um rótulo, devolvendo só o NOME. */
function semPrefixo(s: string): string {
  const semNumero = s.replace(/^\s*\d+\s*[-–—]\s*/, "");
  const partes = semNumero.split(/\s+[-–—]\s+/);
  return (partes.length > 1 ? partes.slice(1).join(" - ") : semNumero).trim();
}

/**
 * Ponto 2 — Interessado do PROTOCOLO → ÓRGÃO ou UNIDADE (o protocolo pode vir em nome de qualquer
 * um). Casa pelo NÚMERO do interessado cadastrado (único GLOBAL) e, no fallback, pelo NOME. Prefere
 * a UNIDADE (mais específica) e ignora ocultos. `null` se nada casar.
 */
export function casarPorInteressado(
  interessado: string | null | undefined,
  orgaos: OrgaoMatch[],
  unidades: ReparticaoMatch[],
): { tipo: "orgao" | "unidade"; id: number } | null {
  if (!interessado) return null;
  const uv = unidades.filter((u) => !u.oculto);
  const ov = orgaos.filter((o) => !o.oculto);
  const num = numeroLider(interessado);
  if (num) {
    const u = uv.find((x) => (x.numeroInteressado ?? "").trim() === num);
    if (u) return { tipo: "unidade", id: u.id };
    const o = ov.find((x) => (x.numeroInteressado ?? "").trim() === num);
    if (o) return { tipo: "orgao", id: o.id };
  }
  const alvo = chaveNome(semPrefixo(interessado));
  if (alvo) {
    const u = uv.find((x) => chaveNome(x.nome) === alvo);
    if (u) return { tipo: "unidade", id: u.id };
    const o = ov.find((x) => chaveNome(x.nome) === alvo);
    if (o) return { tipo: "orgao", id: o.id };
  }
  return null;
}

/**
 * Ponto 1 + 5 — PREVÊ a unidade de um DFD (dentro do órgão já identificado) **SÓ pela ASSINATURA**:
 * quando o órgão é "por unidade", o ASSINANTE (que bate com um responsável da unidade) identifica a
 * unidade. O "Setor Requisitante" do DFD **não** é mais usado para prever (removido — era ruído). Sem
 * assinante que case (ou órgão de assinatura ÚNICA), devolve `null` → o usuário escolhe a unidade. As
 * `unidades` já devem vir ESCOPADAS ao órgão identificado.
 */
export function preverUnidade(
  dfd: { assinaturas?: Assinatura[] | null },
  unidades: (ReparticaoMatch & { responsaveis?: Responsaveis | null })[],
  opts: { assinaturaPorUnidade: boolean },
): number | null {
  if (!opts.assinaturaPorUnidade || !dfd.assinaturas || dfd.assinaturas.length === 0) return null;
  const comResp = unidades
    .filter((u) => u.responsaveis)
    .map((u) => ({ id: u.id, responsaveis: u.responsaveis as Responsaveis, oculto: u.oculto }));
  return preverUnidadePorAssinatura(dfd.assinaturas, comResp);
}

/**
 * Ponto 4 + 5 — fluxo do DFD: IDENTIFICA o órgão pelo "Órgão/Entidade", ESCOPA as unidades a
 * esse órgão e PREVÊ a unidade **pela ASSINATURA**. `null` = o usuário escolhe. Ponto ÚNICO
 * usado pelos forms (import avulso e protocolo). Se o órgão não é identificado, cai para todas
 * as unidades (o usuário escolhe manualmente).
 */
export function preverUnidadeDoDfd(
  dfd: { orgaoEntidade?: string | null; assinaturas?: Assinatura[] | null },
  orgaos: OrgaoMatch[],
  unidades: (ReparticaoMatch & { responsaveis?: Responsaveis | null })[],
): number | null {
  const orgaoId = casarOrgao(dfd.orgaoEntidade, orgaos);
  const escopo = orgaoId != null ? unidades.filter((u) => u.orgaoId === orgaoId) : unidades;
  const orgao = orgaoId != null ? orgaos.find((o) => o.id === orgaoId) : undefined;
  const previsto = preverUnidade(dfd, escopo, { assinaturaPorUnidade: !orgao?.assinaturaUnica });
  if (previsto != null) return previsto;
  // ÓRGÃO-QUE-É-UNIDADE (dual, `orgao_proprio`): a unidade própria do órgão identificado É a
  // requisitante (por regra o órgão dual não tem unidades-filhas). Resolve para ela — senão o
  // DFD ficaria sem unidade e travava (`dfd.reparticao` fundamental).
  if (orgaoId != null) {
    const propria = escopo.find((u) => u.orgaoProprio && !u.oculto);
    if (propria) return propria.id;
  }
  return null;
}

/**
 * Ponto 4 — ÓRGÃO do DFD pelo campo "Órgão/Entidade" (ou `null`), ignorando ocultos:
 * 1) pelo PADRÃO configurado (`orgao_entidade`); 2) fallback pelo nome; 3) pela sigla.
 */
export function casarOrgao(
  orgaoEntidade: string | null | undefined,
  orgaos: OrgaoMatch[],
): number | null {
  if (!orgaoEntidade) return null;
  const alvo = chaveNome(orgaoEntidade);
  if (!alvo) return null;
  const ov = orgaos.filter((o) => !o.oculto);
  const cfg = ov.find((o) => o.orgaoEntidade && chaveNome(o.orgaoEntidade) === alvo);
  if (cfg) return cfg.id;
  const byNome = ov.find((o) => chaveNome(o.nome) === alvo);
  if (byNome) return byNome.id;
  const sig = norm(orgaoEntidade);
  const bySigla = ov.find((o) => norm(o.sigla) === sig);
  return bySigla ? bySigla.id : null;
}

/**
 * Divergência (item 6.3): o órgão apontado pelo campo "Órgão/Entidade" difere do órgão DONO
 * da unidade (`orgaoIdDaUnidade`). Só acusa quando AMBOS resolvem e diferem.
 */
export function orgaoDivergeDaUnidade(
  orgaoEntidade: string | null | undefined,
  orgaoIdDaUnidade: number | null | undefined,
  orgaos: OrgaoMatch[],
): boolean {
  if (orgaoIdDaUnidade == null) return false;
  const orgaoDoCampo = casarOrgao(orgaoEntidade, orgaos);
  if (orgaoDoCampo == null) return false;
  return orgaoDoCampo !== orgaoIdDaUnidade;
}

/** A UNIDADE do "Centro custo" da CM002 = SEMPRE o último nome ("PM RV, CAMARA MUNICIPAL, GGIM" → "GGIM"). Sem vírgula,
 * um nome curto (até `MAX_ENTIDADE` letras — "PM RV") é só a ENTIDADE: sem unidade (`nome` vazio). A Centi corta os nomes
 * (reticência ou 45 caracteres por trecho): `truncado` marca que só o COMEÇO é conhecido. */
export function unidadeDoCentroCusto(texto: string | null | undefined): { nome: string; truncado: boolean } {
  const t = String(texto ?? "");
  const brutos = t.split(",").filter((x) => x.trim());
  const bruto = brutos[brutos.length - 1] ?? "";
  if (brutos.length === 1 && bruto.trim().length <= MAX_ENTIDADE) return { nome: "", truncado: false };
  const sem = bruto.replace(/\s*(\.{2,}|…)\s*$/, "");
  const nome = sem.trim().replace(/\s+/g, " ");
  if (!nome) return { nome: "", truncado: false };
  return { nome, truncado: sem.length !== bruto.length || nome.length >= CORTE_TRECHO_CENTI || t.trim().length >= MAX_CENTRO_CUSTO };
}

/** O tamanho da ENTIDADE no começo do "Centro custo" ("PM RV"): sem vírgula, um texto assim curto não é unidade. */
export const MAX_ENTIDADE = 12;

/** A Centi corta cada trecho do "Centro custo" em 45 caracteres ("SEC MUN. DE DESENV. ECONOMICO SUST. DO TRABAL"). */
export const CORTE_TRECHO_CENTI = 45;

/** O tamanho em que a extensão corta os textos da CM002 (`centi-anexo.js`). */
export const MAX_CENTRO_CUSTO = 200;

/** A sigla no fim da Finalidade da CM002 ("PCA - 2026 - INICIAL - SMAUSP" → "SMAUSP"), só quando é uma
 * palavra curta de letras (nunca um ano nem um texto). */
export function siglaDaFinalidade(texto: string | null | undefined): string | null {
  const ultimo = String(texto ?? "").split(/\s+[-–—]\s+/).pop()?.trim() ?? "";
  return /^[A-Za-zÀ-ú][A-Za-zÀ-ú0-9]{1,14}$/.test(ultimo) && !/^\d+$/.test(ultimo) ? ultimo : null;
}

/** As palavras de um nome sem as de ligação e sem MUNICIPAL (e as abreviações MUN/MUNIC). */
function tokensNome(s: string): string[] {
  return chaveNome(s)
    .split(" ")
    .filter((w) => w && !/^(MUN|MUNIC|MUNICIP|MUNICIPAIS|MUNICIPIO)$/.test(w));
}

/** As palavras da Centi (`a`) × as cadastradas (`b`): cada par na mesma posição, uma o começo da outra (3+ letras; a
 * palavra mais curta que 3 letras só igual). Cortado, a cadastrada pode ter palavras a mais no fim. */
function casaPorPrefixo(a: string[], b: string[], truncado: boolean): boolean {
  if (a.length > b.length || (!truncado && a.length !== b.length)) return false;
  return a.every((w, i) => {
    const x = b[i];
    if (w === x) return true;
    const curta = w.length <= x.length ? w : x;
    return curta.length >= 3 && (x.startsWith(w) || w.startsWith(x));
  });
}

/** As palavras genéricas que não identificam uma unidade (contam na ordem, não no placar). */
const GENERICAS = /^(SEC|SECRET|SECRETARIA|SECRETARIAS|GERAL|DEPARTAMENTO|DEPTO|DIRETORIA|COORDENADORIA|SUPERINTENDENCIA)$/;

/** Uma palavra da Centi × uma cadastrada: iguais, ou uma o começo da outra (3+ letras — abreviação/corte). */
const mesmaPalavra = (w: string, x: string) => w === x || (Math.min(w.length, x.length) >= 3 && (x.startsWith(w) || w.startsWith(x)));

/** Quantas palavras PRÓPRIAS (não genéricas) os dois nomes têm em comum quando TODAS as palavras do menor aparecem, na
 * ordem, no maior; senão 0. Ao menos 2 próprias (uma só palavra em comum não identifica). */
function palavrasEmComum(a: string[], b: string[]): number {
  const [menor, maior] = a.length <= b.length ? [a, b] : [b, a];
  if (!menor.length) return 0;
  let j = 0;
  let proprias = 0;
  for (const w of menor) {
    while (j < maior.length && !mesmaPalavra(w, maior[j])) j++;
    if (j >= maior.length) return 0;
    if (!GENERICAS.test(w)) proprias++;
    j++;
  }
  return proprias >= 2 ? proprias : 0;
}

/** O CENTRO DE CUSTO cadastrado na unidade (como a Centi escreve) × o da CM002: o texto inteiro ou o último nome, sem
 * caixa/acento/pontuação. Vem ANTES da comparação por nome — o ADM sincroniza o nome uma vez e o casamento é exato. */
export function casarPorCentroCusto(centro: string, unidades: ReparticaoMatch[], orgaoId?: number | null): CasamentoUnidade | null {
  const validas = unidades.filter((u) => !u.oculto && norm(u.codigo) !== "GERAL" && u.centroCusto?.trim());
  if (!validas.length) return null;
  const chave = (t: string) => stripAccents(t).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const inteiro = chave(centro);
  const ultimo = chave(String(centro).split(",").filter((x) => x.trim()).pop() ?? "");
  const ultimoDe = (t: string) => chave(t.split(",").filter((x) => x.trim()).pop() ?? "");
  let achadas = validas.filter((u) => {
    const k = chave(String(u.centroCusto));
    return !!k && (k === inteiro || k === ultimo || (!!ultimo && ultimoDe(String(u.centroCusto)) === ultimo));
  });
  if (!achadas.length) return null;
  if (achadas.length > 1 && orgaoId != null) {
    const doOrgao = achadas.filter((u) => u.orgaoId === orgaoId);
    if (doOrgao.length) achadas = doOrgao;
  }
  return achadas.length === 1 ? { tipo: "ok", id: achadas[0].id } : { tipo: "ambigua", ids: achadas.map((u) => u.id) };
}

export type CasamentoUnidade = { tipo: "ok"; id: number } | { tipo: "desconhecida" } | { tipo: "ambigua"; ids: number[] };

/**
 * O nome de uma unidade da Centi (o Centro de Custo) → a unidade CADASTRADA. Pelo NOME (a `chaveNome`), pela
 * SIGLA (o código) ou pelo "Setor Requisitante"; com o nome cortado (`truncado`), pelo começo do nome. Ocultas e
 * a "Geral" nunca casam; no empate, as do ÓRGÃO do documento; ainda mais de uma = `ambigua` (nunca chuta).
 */
export function casarUnidadePorNome(
  nome: string,
  truncado: boolean,
  unidades: ReparticaoMatch[],
  orgaoId?: number | null,
): CasamentoUnidade {
  const validas = unidades.filter((u) => !u.oculto && norm(u.codigo) !== "GERAL");
  const k = chaveNome(semPrefixo(nome));
  if (!k) return { tipo: "desconhecida" };
  // O nome inteiro e cada trecho " - " ("SECRETARIA DE PLANEJAMENTO - SEPLAN").
  const trechos = nome.split(/\s+[-–—]\s+/).map((x) => x.trim()).filter(Boolean);
  const chaves = new Set([k, ...trechos.map(chaveNome)].filter(Boolean));
  const siglas = new Set([nome, ...trechos].map(norm).filter(Boolean));
  const pelo = (f: (u: ReparticaoMatch) => boolean) => validas.filter(f);
  let achadas = pelo((u) => chaves.has(chaveNome(u.nome)));
  if (!achadas.length) achadas = pelo((u) => siglas.has(norm(u.codigo)));
  if (!achadas.length) achadas = pelo((u) => !!u.setorRequisitante && chaves.has(chaveNome(u.setorRequisitante)));
  if (!achadas.length && truncado && k.length >= 4) achadas = pelo((u) => chaveNome(u.nome).startsWith(k));
  // As ABREVIAÇÕES e os cortes da Centi ("SEC. MUNIC. DE INFRAESTRUTURA E DESENV. URBAN"): palavra a palavra, cada uma
  // é o começo da cadastrada na mesma posição.
  if (!achadas.length) {
    const t = tokensNome(nome);
    if (t.length >= 2) achadas = pelo((u) => casaPorPrefixo(t, tokensNome(u.nome), truncado));
  }
  // A Centi tem os PRÓPRIOS nomes (palavra a mais ou a menos: "SEC. MUNIC. DE INFRAESTRUTURA E DESENV. URBAN" ×
  // "Secretaria de Infraestrutura Urbana"): todas as palavras do nome MENOR aparecem, na ordem, no maior. Vale a unidade
  // com mais palavras próprias em comum — empate = ambígua (nunca chuta).
  if (!achadas.length) {
    const t = tokensNome(nome);
    let melhor = 0;
    for (const u of validas) {
      const n = palavrasEmComum(t, tokensNome(u.nome));
      if (n > melhor) [melhor, achadas] = [n, [u]];
      else if (n && n === melhor) achadas.push(u);
    }
  }
  if (achadas.length > 1 && orgaoId != null) {
    const doOrgao = achadas.filter((u) => u.orgaoId === orgaoId);
    if (doOrgao.length) achadas = doOrgao;
  }
  if (achadas.length === 1) return { tipo: "ok", id: achadas[0].id };
  return achadas.length ? { tipo: "ambigua", ids: achadas.map((u) => u.id) } : { tipo: "desconhecida" };
}
