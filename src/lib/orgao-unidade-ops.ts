/**
 * Regras PURAS de PROMOVER (unidade→órgão), REBAIXAR (órgão→unidade) e ÓRGÃO QUE TAMBÉM É
 * UNIDADE (unidade "própria"). Sem `getDb`/JSX → testável no Node. As travas de vínculo/
 * contagem vêm do servidor (queries em `orgaos.ts`/`reparticoes.ts`); aqui ficam (a) o MAPA
 * dos campos que "seguem" na transformação e (b) os predicados de permissão sobre os fatos
 * já apurados. Promover/rebaixar movem a identidade entre `reparticoes`⇄`orgaos`. SEM vínculo, é
 * create+delete de UMA linha. COM vínculo (DFD/protocolo/itens), a UNIDADE que carrega os vínculos
 * é PRESERVADA (mesmo `reparticoes.id` ⇒ DFDs/itens/protocolos/acesso por grupo intactos) e só o
 * `orgao_id` dos DFDs/protocolos é realinhado — nada se perde e nada é excluído com vínculo.
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
 * interessado e os responsáveis SEGUEM (sem vínculo, a unidade é excluída — sem duplicidade; com
 * vínculo, os responsáveis ficam na unidade preservada — ver `unidadePreservadaNoPromover`).
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
 * responsáveis SEGUEM (o órgão será excluído). Órgão DUAL não usa isto — a própria desce
 * (`propriaRebaixada`).
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

/**
 * PROMOVER COM VÍNCULO — a unidade NÃO é excluída: vira a UNIDADE PRÓPRIA do novo órgão (dual),
 * mantendo o mesmo id (DFDs/protocolos/itens seguem nela). O nº do interessado SOBE p/ o órgão
 * (único global — mesma convenção do "também unidade"). Os responsáveis FICAM na unidade (é ela que
 * confere a assinatura dos DFDs); se ela não tinha os seus e o órgão de origem era de assinatura
 * ÚNICA, herda os do órgão de origem — a conferência dos DFDs já gravados não muda. O `orgao_id`
 * (o órgão recém-criado) é aplicado pela rota no MESMO batch.
 */
export function unidadePreservadaNoPromover(
  u: { responsavelDfd: string | null },
  origem: { assinaturaUnica: boolean; responsavelDfd: string | null } | null,
) {
  const herdaOrigem = !u.responsavelDfd && origem?.assinaturaUnica ? origem.responsavelDfd : null;
  return {
    orgaoProprio: true,
    numeroInteressado: null as string | null,
    responsavelDfd: u.responsavelDfd ?? herdaOrigem,
  };
}

/**
 * REBAIXAR ÓRGÃO DUAL — a unidade PRÓPRIA (que já carrega os vínculos) desce para o destino como
 * unidade COMUM, preservando o id. Recebe do órgão o nº do interessado (se não tinha) e, se o órgão
 * era de assinatura ÚNICA, os responsáveis do órgão (eram os efetivos) — senão mantém os seus. Fica
 * oculta se qualquer um dos dois estava oculto.
 */
export function propriaRebaixada(
  o: { numeroInteressado: string | null; assinaturaUnica: boolean; responsavelDfd: string | null; oculto: boolean },
  u: { numeroInteressado: string | null; responsavelDfd: string | null; oculto: boolean },
  destinoId: number,
) {
  return {
    orgaoId: destinoId,
    orgaoProprio: false,
    numeroInteressado: u.numeroInteressado ?? o.numeroInteressado,
    responsavelDfd: o.assinaturaUnica && o.responsavelDfd ? o.responsavelDfd : (u.responsavelDfd ?? o.responsavelDfd),
    oculto: o.oculto || u.oculto,
  };
}

/** Promover: qualquer unidade COMUM (com ou sem vínculo — com vínculo ela é PRESERVADA). */
export function podePromoverUnidade(f: { orgaoProprio: boolean }): Permissao {
  if (f.orgaoProprio)
    return { ok: false, motivo: "Esta é a unidade própria de um órgão que já funciona como unidade — não pode ser promovida." };
  return { ok: true };
}

/**
 * Rebaixar: qualquer órgão SEM unidades-FILHAS comuns (com ou sem vínculo; a unidade própria do
 * órgão dual desce junto). As filhas precisariam de outro órgão — o ADM as move/promove antes.
 */
export function podeRebaixarOrgao(f: { temUnidadesFilhas: boolean }): Permissao {
  if (f.temUnidadesFilhas)
    return { ok: false, motivo: "Este órgão tem unidades — mova/promova as unidades antes de rebaixá-lo." };
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
