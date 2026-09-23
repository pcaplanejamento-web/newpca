import { type RegrasAvaliacao, regrasPadrao } from "./avaliacao-core.ts";
import type { ConferenciaItem } from "./catalogo-conferencia.ts";
import {
  type EstadoDfd,
  estadoDfd,
  type MensagemDfd,
  mensagensDfd,
  type ResumoEstado,
  resumoEstado,
} from "./dfd-tratamento.ts";
import type { Assinatura, DfdItemParseado } from "./parse-dfd-comum.ts";
import { casarOrgao, type OrgaoMatch, orgaoDivergeDaUnidade } from "./reparticao-match.ts";
import {
  pdfExigeAssinatura,
  type Responsaveis,
  RESPONSAVEIS_VAZIO,
  type ResultadoAssinatura,
  validarAssinatura,
} from "./reparticao-responsaveis.ts";

/**
 * CONFERÊNCIA de um DFD — fonte ÚNICA do que é apontado (erro/atenção/acerto) em TODO lugar: na
 * análise do protocolo/DFD avulso, no protocolo GRAVADO, na lista de DFDs da Mesa e no servidor
 * (`/api/dfd/conferencia`). Puro (sem getDb/JSX) → testável no Node. A célula "Estado" das tabelas e o
 * painel "Ver mensagens" saem da MESMA lista de mensagens, então nunca se contradizem.
 */

/** Unidade para a conferência: id + órgão dono + responsáveis EFETIVOS por DFDs. */
export type RepConferencia = { id: number; orgaoId?: number | null; responsaveis: Responsaveis };

/** O que a conferência lê de um DFD — `DfdParseado` (análise) e `DfdDetalhe` (gravado) servem. */
export type DfdConferivel = {
  itens: DfdItemParseado[];
  secoes: { titulo: string; texto: string }[];
  tipo: string | null;
  numeroContrato: string | null;
  numeroAta: string | null;
  numeroLicitacao: string | null;
  anoPca: number | null;
  assinaturas: Assinatura[];
  nomeArquivo: string | null;
  orgaoEntidade: string | null;
};

/** Confere a assinatura do DFD contra os responsáveis da unidade (PDF exige assinatura; .xlsx não). */
export function conferirAssinaturaDfd(d: Pick<DfdConferivel, "assinaturas" | "nomeArquivo">, rep: RepConferencia | null): ResultadoAssinatura {
  return validarAssinatura(d.assinaturas, rep?.responsaveis ?? RESPONSAVEIS_VAZIO, {
    exigeAssinatura: pdfExigeAssinatura(d.nomeArquivo),
  });
}

/** Mensagens com a assinatura JÁ conferida (evita conferir duas vezes na mesma linha). */
function mensagensComAssinatura(
  d: DfdConferivel,
  rep: RepConferencia | null,
  res: ResultadoAssinatura,
  anoPca: number | null | undefined,
  regras: RegrasAvaliacao,
  categoria: string | null,
  orgaos: OrgaoMatch[],
  conformidade?: Map<string, ConferenciaItem>,
): MensagemDfd[] {
  // Divergência órgão × unidade (item 6.3): "Órgão/Entidade" do DFD × órgão da unidade SELECIONADA.
  const orgaoUnidadeDivergente =
    orgaos.length > 0 && rep?.orgaoId != null && orgaoDivergeDaUnidade(d.orgaoEntidade, rep.orgaoId, orgaos);
  // Órgão não identificado (Órgão/Entidade não casa nenhum órgão cadastrado).
  const orgaoNaoIdentificado = orgaos.length > 0 && casarOrgao(d.orgaoEntidade, orgaos) == null;
  return mensagensDfd(
    {
      itens: d.itens,
      secoes: d.secoes,
      reparticaoId: rep?.id ?? null,
      tipo: d.tipo,
      numeroContrato: d.numeroContrato,
      numeroAta: d.numeroAta,
      numeroLicitacao: d.numeroLicitacao,
      anoPca: anoPca !== undefined ? anoPca : d.anoPca,
      assinatura: {
        status: res.status,
        motivo: res.status === "erro" ? res.motivo : null,
        origem: res.status === "ok" ? res.origem : undefined,
        responsavel: res.status === "ok" ? res.responsavel.nome : null,
      },
    },
    regras,
    { categoria, orgaoNaoIdentificado, orgaoUnidadeDivergente, conformidade },
  );
}

/**
 * TODAS as mensagens de conferência de um DFD (erro/atenção/acerto), com a assinatura conferida
 * contra o responsável da unidade escolhida e as flags de órgão (não identificado / divergente da
 * unidade) resolvidas pelo cadastro. Fonte única do contador "Ver mensagens", do painel lateral e —
 * via `avaliarLinhaDfd` — da célula "Estado" das tabelas.
 */
export function mensagensDoDfd(
  d: DfdConferivel,
  rep: RepConferencia | null,
  anoPca: number | null | undefined,
  regras: RegrasAvaliacao = regrasPadrao(),
  categoria: string | null = null,
  orgaos: OrgaoMatch[] = [],
  conformidade?: Map<string, ConferenciaItem>,
): MensagemDfd[] {
  return mensagensComAssinatura(d, rep, conferirAssinaturaDfd(d, rep), anoPca, regras, categoria, orgaos, conformidade);
}

/** Resultado da conferência de UMA LINHA de DFD (tabelas): estado + resumo da célula + quem validou a
 * assinatura + as mensagens de erro/atenção (relatório). */
export type LinhaAvaliada = {
  estado: EstadoDfd;
  resumo?: ResumoEstado;
  validacao: "auto" | "equipe" | null;
  mensagens: MensagemDfd[];
};

/**
 * ESTADO derivado de uma lista de mensagens — a régua ÚNICA da célula "Estado", do rodapé do banner e
 * do painel: algum erro ⇒ `erro`; senão alguma atenção ⇒ `atencao`; senão o ciclo (editado ›
 * regularizado › regular). Puro.
 */
export function estadoDeMensagens(
  msgs: { status: "erro" | "atencao" | "acerto" }[],
  ciclo: { auto?: boolean; editado?: boolean } = {},
): EstadoDfd {
  if (msgs.some((m) => m.status === "erro")) return "erro";
  if (msgs.some((m) => m.status === "atencao")) return "atencao";
  return estadoDfd(0, !!ciclo.auto, !!ciclo.editado);
}

/** Mensagem do DFD DUPLICADO no protocolo (mesmo nº de DFD ou de planejamento) — ponto do protocolo. */
export const MSG_DFD_DUPLICADO = "DFD duplicado (mesmo nº ou planejamento) — escolha um para manter.";

/**
 * Conferência de UMA LINHA de DFD para as tabelas (`PlanilhaDfds`). O ESTADO é DERIVADO das mesmas
 * mensagens do painel: algum erro ⇒ `erro`; senão alguma atenção ⇒ `atencao`; senão o ciclo
 * (editado › regularizado › regular). Fora da linha fica só o **ano do PCA** (portão do protocolo,
 * resolvido uma vez no PcaPicker) e o catálogo (conferido ao abrir o DFD — a lista fica leve). O
 * `duplicado` (definido pelo host) entra como a 1ª mensagem. Puro.
 */
export function avaliarLinhaDfd(
  d: DfdConferivel,
  rep: RepConferencia | null,
  opts: {
    anoPca?: number | null;
    regras?: RegrasAvaliacao;
    categoria?: string | null;
    orgaos?: OrgaoMatch[];
    /** Algum campo foi regularizado automaticamente (normalização). */
    auto?: boolean;
    /** Editado à mão (ainda não gravado / recém-editado). */
    editado?: boolean;
    /** DFD duplicado ainda não resolvido no protocolo: severidade do ponto `protocolo.dfdDuplicado`. */
    duplicado?: "erro" | "atencao" | null;
  } = {},
): LinhaAvaliada {
  const regras = opts.regras ?? regrasPadrao();
  const res = conferirAssinaturaDfd(d, rep);
  const msgs = mensagensComAssinatura(d, rep, res, opts.anoPca, regras, opts.categoria ?? null, opts.orgaos ?? []).filter(
    (m) => m.chave !== "dfd.anoPca",
  );
  if (opts.duplicado) msgs.unshift({ status: opts.duplicado, chave: "protocolo.dfdDuplicado", texto: MSG_DFD_DUPLICADO, ancora: "" });
  const problemas = msgs.filter((m) => m.status !== "acerto");
  return {
    estado: estadoDeMensagens(problemas, opts),
    resumo: problemas.length > 0 ? resumoEstado(problemas) : undefined,
    validacao: res.status === "ok" ? res.origem : null,
    mensagens: problemas,
  };
}
