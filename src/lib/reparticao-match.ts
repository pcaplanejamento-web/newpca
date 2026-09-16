import { stripAccents } from "./normalize.ts";

/**
 * Casamento de UNIDADE (repartição) e ÓRGÃO a partir dos campos de um documento.
 * Lógica PURA (sem getDb/JSX) → testável no Node e reaproveitada pelo import de
 * DFD (um a um), pelo de PROTOCOLO (por DFD do bundle) e pela identificação do
 * Interessado do protocolo. Ponto ÚNICO de match — não duplicar em outro lugar.
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
};

export type OrgaoMatch = {
  id: number;
  sigla: string;
  nome: string;
  /** Padrão do "Órgão/Entidade" do DFD (cadastro do ADM) — match preferencial. */
  orgaoEntidade?: string | null;
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
 * Devolve o `id` da UNIDADE que casa com o setor do DFD (ou `null`):
 * 0) pelo PADRÃO configurado do Setor Requisitante (`setor_requisitante`) — só quando o ADM
 *    preencheu; casa pela sigla OU pelo nome normalizado (escape hatch p/ rótulos divergentes);
 * 1) pela SIGLA (código do setor = código da unidade);
 * 2) fallback pelo NOME da secretaria (`chaveNome`, cobre sigla divergente);
 * 3) fallback pelo Órgão/Entidade (quando o Setor não casa, mas o órgão é a própria secretaria).
 *
 * Com `setor_requisitante` vazio em todas as unidades (estado atual), o passo 0 não casa nada e o
 * resultado é IDÊNTICO ao de hoje (invariante coberto por teste).
 */
export function casarUnidade(
  dfd: { siglaSetor?: string | null; setorRequisitante?: string | null; orgaoEntidade?: string | null },
  unidades: ReparticaoMatch[],
): number | null {
  // 0) padrão configurado do Setor Requisitante — compara o texto do DFD (cru, sem prefixo
  // "SIGLA -", e a própria sigla) com o padrão cadastrado (idem) → tolera o ADM colar o
  // rótulo inteiro OU só o nome.
  if (dfd.setorRequisitante || dfd.siglaSetor) {
    const cand = [
      dfd.setorRequisitante ? chaveNome(dfd.setorRequisitante) : null,
      dfd.setorRequisitante ? chaveNome(semPrefixo(dfd.setorRequisitante)) : null,
      dfd.siglaSetor ? norm(dfd.siglaSetor) : null,
    ].filter((x): x is string => !!x);
    const r = unidades.find((x) => {
      if (!x.setorRequisitante) return false;
      const alvos = [chaveNome(x.setorRequisitante), chaveNome(semPrefixo(x.setorRequisitante)), norm(x.setorRequisitante)];
      return cand.some((c) => alvos.includes(c));
    });
    if (r) return r.id;
  }
  // 1) casa a sigla do Setor Requisitante com o código da unidade.
  if (dfd.siglaSetor) {
    const r = unidades.find((x) => norm(x.codigo) === dfd.siglaSetor);
    if (r) return r.id;
  }
  // 2) fallback pelo NOME da secretaria (cobre sigla divergente, ex.: SMIR × SIR).
  if (dfd.setorRequisitante) {
    const alvo = chaveNome(semPrefixo(dfd.setorRequisitante));
    const r = alvo ? unidades.find((x) => chaveNome(x.nome) === alvo) : undefined;
    if (r) return r.id;
  }
  // 3) fallback pelo Órgão/Entidade (setor genérico + órgão "SECRETARIA ...").
  if (dfd.orgaoEntidade) {
    const alvo = chaveNome(dfd.orgaoEntidade);
    const r = alvo ? unidades.find((x) => chaveNome(x.nome) === alvo) : undefined;
    if (r) return r.id;
  }
  return null;
}

/** Alias histórico de `casarUnidade` — mantido p/ os call sites do import de DFD/protocolo. */
export const casarReparticao = casarUnidade;

/**
 * Devolve o `id` da UNIDADE identificada pelo INTERESSADO do protocolo (ou `null`):
 * 1) pelo NÚMERO líder do interessado (`numero_interessado` cadastrado) — identificação primária;
 * 2) fallback pelo NOME (após o "N - "), casando com o nome da unidade (`chaveNome`).
 * Com `numero_interessado` vazio, cai no passo 2 = comportamento atual (nome).
 */
export function casarUnidadePorInteressado(
  interessado: string | null | undefined,
  unidades: ReparticaoMatch[],
): number | null {
  if (!interessado) return null;
  // 1) pelo NÚMERO do interessado configurado.
  const num = numeroLider(interessado);
  if (num) {
    const r = unidades.find((x) => (x.numeroInteressado ?? "").trim() === num);
    if (r) return r.id;
  }
  // 2) fallback pelo NOME do interessado.
  const alvo = chaveNome(semPrefixo(interessado));
  if (alvo) {
    const r = unidades.find((x) => chaveNome(x.nome) === alvo);
    if (r) return r.id;
  }
  return null;
}

/**
 * Devolve o `id` do ÓRGÃO que casa com o campo "Órgão/Entidade" do DFD (ou `null`):
 * 1) pelo PADRÃO configurado (`orgao_entidade`); 2) fallback pelo nome do órgão; 3) pela sigla.
 */
export function casarOrgao(
  orgaoEntidade: string | null | undefined,
  orgaos: OrgaoMatch[],
): number | null {
  if (!orgaoEntidade) return null;
  const alvo = chaveNome(orgaoEntidade);
  if (!alvo) return null;
  const cfg = orgaos.find((o) => o.orgaoEntidade && chaveNome(o.orgaoEntidade) === alvo);
  if (cfg) return cfg.id;
  const byNome = orgaos.find((o) => chaveNome(o.nome) === alvo);
  if (byNome) return byNome.id;
  const sig = norm(orgaoEntidade);
  const bySigla = orgaos.find((o) => norm(o.sigla) === sig);
  return bySigla ? bySigla.id : null;
}

/**
 * Primitiva da divergência (item 6.3): o órgão apontado pelo campo "Órgão/Entidade" do DFD
 * difere do órgão DONO da unidade (`orgaoIdDaUnidade`). Só acusa quando AMBOS resolvem e
 * diferem. Usada com a unidade SELECIONADA na conferência (reflete a escolha do usuário).
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
 * Divergência LÓGICA entre o cadastro e o que o DFD mostra (item 6.3), a partir só do DFD:
 * casa a unidade pelo "Setor Requisitante" e compara o órgão dela com o do "Órgão/Entidade".
 * (Na conferência, prefira `orgaoDivergeDaUnidade` com a unidade já selecionada.)
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
