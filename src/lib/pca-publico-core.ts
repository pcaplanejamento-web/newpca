import type { LinhaHistorico } from "./auditoria-core.ts";
import { mascararTexto } from "./dados-pessoais-core.ts";
import type { DfdDetalhe, DfdItemRow } from "./dfd.ts";
import { REGRA_PUBLICA, redigirHistorico } from "./historico-redacao.ts";
import type { Solicitante } from "./reparticao-responsaveis.ts";

/**
 * CONSULTA PÚBLICA do PCA — núcleo PURO (sem getDb; testado). Tudo que sai daqui vai a QUALQUER visitante da tela
 * inicial, então é HIGIENIZADO no servidor: nada de CPF/e-CPF, matrícula, e-mail, telefone, assinaturas nem autor do
 * histórico. Do solicitante (o responsável que pediu a consolidação) ficam só nome, função e o ato de nomeação.
 */

export { mascararTexto } from "./dados-pessoais-core.ts";

/** Responsável pela solicitação, sem matrícula nem dados da assinatura. */
export type SolicitantePublico = Solicitante;

export function solicitantePublico(s: Solicitante | null): SolicitantePublico | null {
  if (!s) return null;
  return { ...s, matricula: "", assinaturaCodigo: "", assinaturaData: "" };
}

/** O DFD como a consulta o mostra (forma do `DfdVisual` do `DfdView`) — sem dados pessoais nem assinaturas. */
export type DfdConsulta = {
  id: number;
  protocoloId: number | null;
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  objeto: string | null;
  orgaoEntidade: string | null;
  setorRequisitante: string | null;
  responsavel: string | null;
  matricula: null;
  email: null;
  telefone: null;
  anoPca: number | null;
  numeroContrato: string | null;
  numeroAta: string | null;
  numeroLicitacao: string | null;
  valorTotal: number;
  reparticaoCodigo: string | null;
  reparticaoNome: string | null;
  totalItens: number;
  itens: DfdItemRow[];
  secoes: { numero: number; titulo: string; texto: string }[];
  assinaturas: { lista: never[]; solicitante: SolicitantePublico | null; validada: null };
};

/**
 * DFD PÚBLICO: só os itens que CONTAM no PCA (`ativo(itemId)` — o retirado do PCA sai) e os totais deles; sem
 * matrícula/e-mail/telefone e sem assinaturas (fica o solicitante higienizado).
 */
export function dfdPublico(d: DfdDetalhe, solicitante: Solicitante | null, ativo: (itemId: number) => boolean): DfdConsulta {
  const itens = d.itens.filter((it) => ativo(it.id));
  return {
    id: d.id,
    protocoloId: d.protocoloId,
    numero: d.numero,
    planejamento: d.planejamento,
    tipo: d.tipo,
    objeto: d.objeto,
    orgaoEntidade: d.orgaoEntidade,
    setorRequisitante: d.setorRequisitante,
    responsavel: d.responsavel,
    matricula: null,
    email: null,
    telefone: null,
    anoPca: d.anoPca,
    numeroContrato: d.numeroContrato,
    numeroAta: d.numeroAta,
    numeroLicitacao: d.numeroLicitacao,
    valorTotal: itens.reduce((s, it) => s + (it.valorTotal ?? 0), 0),
    reparticaoCodigo: d.reparticaoCodigo,
    reparticaoNome: d.reparticaoNome,
    totalItens: itens.length,
    itens,
    secoes: d.secoes.map((x) => ({ ...x, texto: mascararTexto(x.texto) })),
    assinaturas: { lista: [], solicitante: solicitantePublico(solicitante), validada: null },
  };
}

/**
 * HISTÓRICO PÚBLICO: só o que passou por um protocolo INCORPORADO ao PCA (`incorporados`), SEM o autor, sem os dados
 * pessoais/assinaturas do diff e sem a gestão interna (Responsável e Situação — antes os nomes saíam no diff).
 */
export function historicoPublico(linhas: LinhaHistorico[], incorporados: Set<number>): LinhaHistorico[] {
  return redigirHistorico(
    linhas.filter((l) => l.protocoloId != null && incorporados.has(l.protocoloId)),
    REGRA_PUBLICA,
  );
}
