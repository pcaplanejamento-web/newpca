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
