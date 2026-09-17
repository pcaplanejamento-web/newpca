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
  /** Padrão do "Setor Requisitante" do DFD (cadastro do ADM) — match preferencial. */
  setorRequisitante?: string | null;
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
 * Devolve o `id` da UNIDADE que casa com o setor do DFD (ou `null`), IGNORANDO ocultas:
 * 0) pelo PADRÃO configurado do Setor Requisitante (`setor_requisitante`);
 * 1) pela SIGLA (código do setor = código da unidade);
 * 2) fallback pelo NOME da secretaria (`chaveNome`, cobre sigla divergente);
 * 3) fallback pelo Órgão/Entidade (setor genérico + órgão = a própria secretaria).
 */
export function casarUnidade(
  dfd: { siglaSetor?: string | null; setorRequisitante?: string | null; orgaoEntidade?: string | null },
  unidades: ReparticaoMatch[],
): number | null {
  const uv = unidades.filter((u) => !u.oculto);
  // 0) padrão configurado do Setor Requisitante — compara o texto do DFD (cru, sem prefixo
  // "SIGLA -", e a própria sigla) com o padrão cadastrado (idem).
  if (dfd.setorRequisitante || dfd.siglaSetor) {
    const cand = [
      dfd.setorRequisitante ? chaveNome(dfd.setorRequisitante) : null,
      dfd.setorRequisitante ? chaveNome(semPrefixo(dfd.setorRequisitante)) : null,
      dfd.siglaSetor ? norm(dfd.siglaSetor) : null,
    ].filter((x): x is string => !!x);
    const r = uv.find((x) => {
      if (!x.setorRequisitante) return false;
      const alvos = [chaveNome(x.setorRequisitante), chaveNome(semPrefixo(x.setorRequisitante)), norm(x.setorRequisitante)];
      return cand.some((c) => alvos.includes(c));
    });
    if (r) return r.id;
  }
  // 1) casa a sigla do Setor Requisitante com o código da unidade.
  if (dfd.siglaSetor) {
    const r = uv.find((x) => norm(x.codigo) === dfd.siglaSetor);
    if (r) return r.id;
  }
  // 2) fallback pelo NOME da secretaria (cobre sigla divergente, ex.: SMIR × SIR).
  if (dfd.setorRequisitante) {
    const alvo = chaveNome(semPrefixo(dfd.setorRequisitante));
    const r = alvo ? uv.find((x) => chaveNome(x.nome) === alvo) : undefined;
    if (r) return r.id;
  }
  // 3) fallback pelo Órgão/Entidade (setor genérico + órgão "SECRETARIA ...").
  if (dfd.orgaoEntidade) {
    const alvo = chaveNome(dfd.orgaoEntidade);
    const r = alvo ? uv.find((x) => chaveNome(x.nome) === alvo) : undefined;
    if (r) return r.id;
  }
  return null;
}

/** Alias histórico de `casarUnidade` — mantido p/ os call sites do import de DFD/protocolo. */
export const casarReparticao = casarUnidade;

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
 * Ponto 5 — PREVÊ a unidade de um DFD (dentro do órgão já identificado): 1) pela ASSINATURA
 * (quando o órgão é "por unidade", o assinante identifica a unidade); 2) pelo SETOR REQUISITANTE
 * (`casarUnidade`). `null` = não deu para prever → o usuário escolhe (erro até definir). As
 * `unidades` já devem vir ESCOPADAS ao órgão identificado.
 */
export function preverUnidade(
  dfd: { siglaSetor?: string | null; setorRequisitante?: string | null; orgaoEntidade?: string | null; assinaturas?: Assinatura[] | null },
  unidades: (ReparticaoMatch & { responsaveis?: Responsaveis | null })[],
  opts: { assinaturaPorUnidade: boolean },
): number | null {
  // 1) pela ASSINATURA — só quando cada unidade tem o seu gestor (órgão "por unidade").
  if (opts.assinaturaPorUnidade && dfd.assinaturas && dfd.assinaturas.length > 0) {
    const comResp = unidades
      .filter((u) => u.responsaveis)
      .map((u) => ({ id: u.id, responsaveis: u.responsaveis as Responsaveis, oculto: u.oculto }));
    const porAssin = preverUnidadePorAssinatura(dfd.assinaturas, comResp);
    if (porAssin != null) return porAssin;
  }
  // 2) pelo SETOR REQUISITANTE (casarUnidade — já ignora ocultas).
  return casarUnidade(dfd, unidades);
}

/**
 * Ponto 4 + 5 — fluxo do DFD: IDENTIFICA o órgão pelo "Órgão/Entidade", ESCOPA as unidades a
 * esse órgão e PREVÊ a unidade (assinatura → setor). `null` = o usuário escolhe. Ponto ÚNICO
 * usado pelos forms (import avulso e protocolo). Se o órgão não é identificado, cai para todas
 * as unidades (o usuário escolhe manualmente).
 */
export function preverUnidadeDoDfd(
  dfd: { orgaoEntidade?: string | null; siglaSetor?: string | null; setorRequisitante?: string | null; assinaturas?: Assinatura[] | null },
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

/**
 * Divergência a partir só do DFD: casa a unidade pelo "Setor Requisitante" e compara o órgão
 * dela com o do "Órgão/Entidade". (Na conferência, prefira `orgaoDivergeDaUnidade`.)
 */
export function divergenciaOrgaoUnidade(
  dfd: { siglaSetor?: string | null; setorRequisitante?: string | null; orgaoEntidade?: string | null },
  unidades: ReparticaoMatch[],
  orgaos: OrgaoMatch[],
): boolean {
  const uId = casarUnidade(dfd, unidades);
  if (uId == null) return false;
  return orgaoDivergeDaUnidade(dfd.orgaoEntidade, unidades.find((u) => u.id === uId)?.orgaoId ?? null, orgaos);
}
