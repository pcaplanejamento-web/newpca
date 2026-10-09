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
  oculto: boolean;
};
type FonteOrgao = {
  sigla: string;
  nome: string;
  numeroInteressado: string | null;
  oculto: boolean;
};

export type Permissao = { ok: true } | { ok: false; motivo: string };

/**
 * PROMOVER — campos do novo ÓRGÃO a partir da unidade. `orgaoEntidade` fica `null` (o match
 * por nome/sigla já cobre; o ADM configura depois) e a assinatura nasce "por unidade". O nº do
 * interessado SEGUE; os responsáveis (vínculos da planilha) seguem por `vinculosNoPromover`.
 */
export function orgaoDeUnidade(u: FonteUnidade) {
  return {
    sigla: u.codigo,
    nome: u.nome,
    orgaoEntidade: null as string | null,
    numeroInteressado: u.numeroInteressado,
    assinaturaUnica: false,
    oculto: u.oculto,
  };
}

/**
 * REBAIXAR — campos da nova UNIDADE a partir do órgão, já sob o órgão `destinoId`.
 * `setorRequisitante` fica `null` (match por nome/sigla; ADM configura). O nº do interessado SEGUE (o órgão
 * será excluído); os responsáveis, por `vinculosNoRebaixar`. Órgão DUAL não usa isto — a própria desce
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
    oculto: o.oculto,
  };
}

/**
 * TAMBÉM UNIDADE (dual) — a unidade PRÓPRIA que representa o órgão. Herda nome/sigla/oculto;
 * NÃO herda o nº do interessado (o órgão já o detém — único global) nem os responsáveis (o ADM
 * vincula; em "assinatura única" valem os do órgão — `alvoEfetivo`).
 */
export function unidadePropriaDeOrgao(o: { sigla: string; nome: string; oculto: boolean }, orgaoId: number) {
  return {
    codigo: o.sigla,
    nome: o.nome,
    setorRequisitante: null as string | null,
    numeroInteressado: null as string | null,
    orgaoId,
    orgaoProprio: true,
    oculto: o.oculto,
  };
}

/**
 * PROMOVER COM VÍNCULO — a unidade NÃO é excluída: vira a UNIDADE PRÓPRIA do novo órgão (dual),
 * mantendo o mesmo id (DFDs/protocolos/itens seguem nela). O nº do interessado SOBE p/ o órgão
 * (único global — mesma convenção do "também unidade"). Os responsáveis seguem por `vinculosNoPromover`. O
 * `orgao_id` (o órgão recém-criado) é aplicado pela rota no MESMO batch.
 */
export function unidadePreservadaNoPromover() {
  return { orgaoProprio: true, numeroInteressado: null as string | null };
}

/**
 * Os RESPONSÁVEIS (vínculos da planilha) ao PROMOVER:
 * - sem vínculo de DFD (a unidade é excluída): os da unidade PASSAM ao órgão novo (nada se perde);
 * - preservada: ficam na unidade (é ela que confere a assinatura dos DFDs); sem os seus e com o órgão de origem de
 *   assinatura ÚNICA, ela recebe uma CÓPIA dos do órgão de origem — a conferência dos DFDs já gravados não muda.
 */
export function vinculosNoPromover(f: {
  preservar: boolean;
  unidadeTemVinculos: boolean;
  origemUnica: boolean;
  origemTemVinculos: boolean;
}): "moverParaOrgao" | "manter" | "copiarDaOrigem" {
  if (!f.preservar) return "moverParaOrgao";
  if (!f.unidadeTemVinculos && f.origemUnica && f.origemTemVinculos) return "copiarDaOrigem";
  return "manter";
}

/**
 * REBAIXAR ÓRGÃO DUAL — a unidade PRÓPRIA (que já carrega os vínculos) desce para o destino como
 * unidade COMUM, preservando o id. Recebe do órgão o nº do interessado (se não tinha); os responsáveis seguem
 * por `vinculosNoRebaixar`. Fica oculta se qualquer um dos dois estava oculto.
 */
export function propriaRebaixada(
  o: { numeroInteressado: string | null; oculto: boolean },
  u: { numeroInteressado: string | null; oculto: boolean },
  destinoId: number,
) {
  return {
    orgaoId: destinoId,
    orgaoProprio: false,
    numeroInteressado: u.numeroInteressado ?? o.numeroInteressado,
    oculto: o.oculto || u.oculto,
  };
}

/**
 * Os RESPONSÁVEIS (vínculos da planilha) ao REBAIXAR — o órgão é excluído, então os dele nunca ficam para trás:
 * - unidade NOVA: os do órgão PASSAM a ela;
 * - a PRÓPRIA desce: com o órgão de assinatura ÚNICA e com responsáveis, os do órgão a SUBSTITUEM (eram os efetivos);
 *   senão ela mantém os seus e, sem nenhum, recebe os do órgão.
 */
export function vinculosNoRebaixar(f: {
  propria: boolean;
  orgaoUnica: boolean;
  orgaoTemVinculos: boolean;
  propriaTemVinculos: boolean;
}): "moverDoOrgao" | "substituirPelosDoOrgao" | "manter" {
  if (!f.propria) return "moverDoOrgao";
  if (f.orgaoUnica && f.orgaoTemVinculos) return "substituirPelosDoOrgao";
  if (f.propriaTemVinculos) return "manter";
  return "moverDoOrgao";
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
