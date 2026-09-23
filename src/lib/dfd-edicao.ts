import type { DfdDetalhe } from "./dfd.ts";
import type { DfdParseado } from "./parse-dfd-comum.ts";

/**
 * Edição do DFD/protocolo JÁ GRAVADO com os MESMOS componentes da análise: o banner trabalha num
 * RASCUNHO (`DfdParseado`) e, ao salvar, envia só o que MUDOU (`PATCH`). Puro/testável.
 */

/** DFD gravado (`DfdDetalhe`) → forma editável (`DfdParseado`) dos componentes de conferência. */
export function detalheParaParseado(d: DfdDetalhe): DfdParseado {
  return {
    numero: d.numero,
    planejamento: d.planejamento,
    tipo: d.tipo,
    objeto: d.objeto,
    orgaoEntidade: d.orgaoEntidade,
    setorRequisitante: d.setorRequisitante,
    siglaSetor: null,
    responsavel: d.responsavel,
    matricula: d.matricula,
    email: d.email,
    telefone: d.telefone,
    anoPca: d.anoPca,
    numeroContrato: d.numeroContrato,
    numeroAta: d.numeroAta,
    numeroLicitacao: d.numeroLicitacao,
    valorTotal: d.valorTotal,
    // Nome do arquivo real (não ""): `pdfExigeAssinatura` do cliente precisa casar o servidor.
    nomeArquivo: d.nomeArquivo ?? "",
    secoes: d.secoes,
    assinaturas: d.assinaturas,
    itens: d.itens.map((it) => ({
      item: it.item,
      codigo: it.codigo,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      valorTotal: it.valorTotal,
    })),
  };
}

/** Campos de texto do DFD editáveis no gravado (os identificadores número/planejamento nunca). */
const CAMPOS_DFD = [
  "tipo",
  "numeroContrato",
  "numeroAta",
  "numeroLicitacao",
  "objeto",
  "orgaoEntidade",
  "setorRequisitante",
  "responsavel",
  "matricula",
  "email",
  "telefone",
] as const;

/**
 * Corpo do `PATCH /api/dfd/[id]` com SÓ o que mudou entre o gravado e o rascunho (unidade, campos de
 * texto, seções, assinaturas e — se editados — os itens). `{}` = nada a salvar. Enviar só o que mudou
 * evita reconferências desnecessárias no servidor (ex.: assinatura ao salvar uma seção).
 */
export function diffDfdGravado(
  o: DfdDetalhe,
  d: DfdParseado,
  reparticaoId: number | null,
  itensEditados: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (reparticaoId !== o.reparticaoId) body.reparticaoId = reparticaoId;
  for (const k of CAMPOS_DFD) if ((d[k] ?? null) !== (o[k] ?? null)) body[k] = d[k] ?? null;
  if (JSON.stringify(d.secoes) !== JSON.stringify(o.secoes)) body.secoes = d.secoes;
  if (JSON.stringify(d.assinaturas) !== JSON.stringify(o.assinaturas)) body.assinaturas = d.assinaturas;
  if (itensEditados) body.itens = d.itens;
  return body;
}

/** Capa do protocolo editável no gravado (conteúdo + unidade; identificadores nunca). */
export type CapaEditavel = {
  reparticaoId: number | null;
  interessado: string | null;
  documento: string | null;
  assunto: string | null;
  observacao: string | null;
  valorCapa: number | null;
  localReparticao: string | null;
};
const CAMPOS_CAPA = ["reparticaoId", "interessado", "documento", "assunto", "observacao", "valorCapa", "localReparticao"] as const;

/** Corpo do `PATCH /api/protocolo/[id]` com SÓ o que mudou na capa (vazio ⇒ `null`). `{}` = nada. */
export function diffCapaGravada(o: CapaEditavel, c: CapaEditavel): Partial<CapaEditavel> {
  const body: Partial<CapaEditavel> = {};
  for (const k of CAMPOS_CAPA) {
    const novo = typeof c[k] === "string" ? (c[k] as string).trim() || null : c[k];
    if (novo !== (o[k] ?? null)) (body as Record<string, unknown>)[k] = novo;
  }
  return body;
}
