/**
 * Regras PURAS de PROMOVER (unidade→órgão), REBAIXAR (órgão→unidade) e ÓRGÃO QUE TAMBÉM É
 * UNIDADE (unidade "própria"). Sem `getDb`/JSX → testável no Node. As travas de vínculo/
 * contagem vêm do servidor (queries em `orgaos.ts`/`reparticoes.ts`); aqui ficam (a) o MAPA
 * dos campos que "seguem" na transformação e (b) os predicados de permissão sobre os fatos
 * já apurados. Promover/rebaixar movem a identidade entre `reparticoes`⇄`orgaos` (create+delete
 * de UMA linha) — nada de FK é reapontado, então valem as mesmas travas do ponto 8.
 */

type FonteUnidade = {
  codigo: string;
  nome: string;
  numeroInteressado: string | null;
  responsavelDfd: string | null; // JSON cru (segue verbatim)
  oculto: boolean;
};
type FonteOrgao = {
  sigla: string;
  nome: string;
  numeroInteressado: string | null;
  responsavelDfd: string | null;
  oculto: boolean;
};

export type Permissao = { ok: true } | { ok: false; motivo: string };

/**
 * PROMOVER — campos do novo ÓRGÃO a partir da unidade. `orgaoEntidade` fica `null` (o match
 * por nome/sigla já cobre; o ADM configura depois) e a assinatura nasce "por unidade". O nº do
 * interessado e os responsáveis SEGUEM (a unidade será excluída — sem duplicidade).
 */
export function orgaoDeUnidade(u: FonteUnidade) {
  return {
    sigla: u.codigo,
    nome: u.nome,
    orgaoEntidade: null as string | null,
    numeroInteressado: u.numeroInteressado,
    assinaturaUnica: false,
    responsavelDfd: u.responsavelDfd,
    oculto: u.oculto,
  };
}

/**
 * REBAIXAR — campos da nova UNIDADE a partir do órgão, já sob o órgão `destinoId`.
 * `setorRequisitante` fica `null` (match por nome/sigla; ADM configura). Nº do interessado e
 * responsáveis SEGUEM (o órgão será excluído).
 */
export function unidadeDeOrgao(o: FonteOrgao, destinoId: number) {
  return {
    codigo: o.sigla,
    nome: o.nome,
    setorRequisitante: null as string | null,
    numeroInteressado: o.numeroInteressado,
    orgaoId: destinoId,
    orgaoProprio: false,
    responsavelDfd: o.responsavelDfd,
    oculto: o.oculto,
  };
}

/**
 * TAMBÉM UNIDADE (dual) — a unidade PRÓPRIA que representa o órgão. Herda nome/sigla/oculto;
 * NÃO herda o nº do interessado (o órgão já o detém — único global) nem os responsáveis (o ADM
 * define; em "assinatura única" valem os do órgão via `responsaveisEfetivos`).
 */
export function unidadePropriaDeOrgao(o: { sigla: string; nome: string; oculto: boolean }, orgaoId: number) {
  return {
    codigo: o.sigla,
    nome: o.nome,
    setorRequisitante: null as string | null,
    numeroInteressado: null as string | null,
    orgaoId,
    orgaoProprio: true,
    responsavelDfd: null as string | null,
    oculto: o.oculto,
  };
}

/** Promover: só uma unidade COMUM e SEM vínculo (seria excluída — ponto 8). */
export function podePromoverUnidade(f: { orgaoProprio: boolean; temVinculo: boolean }): Permissao {
  if (f.orgaoProprio)
    return { ok: false, motivo: "Esta é a unidade própria de um órgão que já funciona como unidade — não pode ser promovida." };
  if (f.temVinculo)
    return { ok: false, motivo: "Esta unidade tem DFD/protocolo vinculado — não pode ser promovida (ela seria excluída). Oculte-a ou promova uma unidade sem vínculo." };
  return { ok: true };
}

/** Rebaixar: só um órgão SEM unidades (filhas ou própria) e SEM vínculo direto. */
export function podeRebaixarOrgao(f: { temUnidades: boolean; temVinculo: boolean }): Permissao {
  if (f.temUnidades)
    return { ok: false, motivo: "Este órgão tem unidades — mova/promova as unidades antes de rebaixá-lo." };
  if (f.temVinculo)
    return { ok: false, motivo: "Este órgão tem DFD/protocolo vinculado — não pode ser rebaixado (ele seria excluído). Oculte-o." };
  return { ok: true };
}

/** Tornar TAMBÉM UNIDADE: só para órgão SEM unidades-filhas e que ainda não é dual. */
export function podeTornarUnidade(f: { temUnidadesFilhas: boolean; jaEhDual: boolean }): Permissao {
  if (f.jaEhDual) return { ok: false, motivo: "Este órgão já funciona como unidade." };
  if (f.temUnidadesFilhas)
    return { ok: false, motivo: "Só é possível para órgãos SEM unidades. Remova/promova as unidades antes." };
  return { ok: true };
}

/** Deixar de ser unidade: remove a unidade própria — barrado se ela tiver vínculo. */
export function podeRemoverUnidadePropria(f: { temVinculo: boolean }): Permissao {
  if (f.temVinculo)
    return { ok: false, motivo: "A unidade própria tem DFD/protocolo vinculado — não pode ser removida. Oculte o órgão." };
  return { ok: true };
}
