import { type RegrasAvaliacao, regrasPadrao } from "./avaliacao-core.ts";
import type { ConferenciaItem } from "./catalogo-conferencia.ts";
import {
  conciliacaoCapa,
  type EstadoDfd,
  type EstadoProtocolo,
  estadoDfd,
  type MensagemDfd,
  mensagensDfd,
  ROTULO_CURTO,
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

// ---------------------------------------------------------------------------------------------------
// ESTADO do PROTOCOLO = a capa + TODOS os problemas dos seus DFDs (e dos itens deles)
// ---------------------------------------------------------------------------------------------------

export type ConferenciaProtocolo = {
  estado: EstadoProtocolo;
  /** Principal + "+N" + tooltip + TODOS os rótulos (filtro multi-valor) — a MESMA célula dos DFDs. */
  resumo?: ResumoEstado;
  totalDfds: number;
  dfdsComErro: number;
  dfdsEmAtencao: number;
};

/** Um problema de uma linha de DFD já conferida (o mínimo p/ agregar no protocolo). */
type ProblemaDfd = { status: "erro" | "atencao" | "acerto"; chave: string; texto: string; cor?: string; rotulo?: string };

/**
 * ESTADO do PROTOCOLO — ele ACUMULA os problemas de dentro: (1) a conciliação da CAPA (valor ausente/
 * diferente da somatória — a MESMA régua do banner), (2) protocolo SEM DFDs (atenção) e (3) TODOS os
 * problemas de TODOS os DFDs (inclusive os dos itens — sem valor/quantidade, duplicados — que vêm nas
 * mensagens do DFD), cada problema agrupado UMA vez com os DFDs que o têm ("Sem prioridade — 3 DFDs:
 * 531, 532, 540"). Ordem: erros antes das atenções; em cada grupo, a capa e depois o problema que atinge
 * MAIS DFDs. A célula aponta o principal com a contagem de DFDs; o filtro recebe TODOS os rótulos.
 * `dfds: null` = a conferência dos DFDs ainda não chegou (só a capa conta). Puro.
 */
export function avaliarProtocolo(
  capa: {
    valorCapa: number | null;
    valorTotal: number;
    totalDfds: number;
    categoria?: string | null;
    /** DFDs SOBRESCRITOS depois por outro protocolo (o rastro) e o valor deles NA ÉPOCA — a capa foi emitida
     * com eles: entram na conciliação e contam como DFDs do processo (não é "Sem DFDs"). */
    sobrescritos?: number;
    valorSobrescritos?: number;
  },
  dfds: { numero: string; planejamento: string | null; mensagens: ProblemaDfd[] }[] | null,
  regras: RegrasAvaliacao = regrasPadrao(),
): ConferenciaProtocolo {
  type Msg = { status: "erro" | "atencao"; chave: string; texto: string; rotulo: string; cor?: string; n: number; capa?: boolean };
  const msgs: Msg[] = [];
  const sobrescritos = capa.sobrescritos ?? 0;
  const conc = conciliacaoCapa(
    { valorCapa: capa.valorCapa, somatorio: capa.valorTotal + (capa.valorSobrescritos ?? 0), totalDfds: capa.totalDfds + sobrescritos },
    regras,
    { categoria: capa.categoria ?? null },
  );
  if (conc.divergente && conc.motivo)
    msgs.push({ status: conc.bloqueia ? "erro" : "atencao", chave: "protocolo.valorCapa", texto: conc.motivo, rotulo: conc.zerada ? "Capa sem valor" : "Capa ≠ somatória", n: 0, capa: true });
  if (capa.totalDfds + sobrescritos === 0)
    msgs.push({ status: "atencao", chave: "protocolo.semDfds", texto: "Protocolo sem DFDs vinculados.", rotulo: "Sem DFDs", n: 0, capa: true });

  let dfdsComErro = 0;
  let dfdsEmAtencao = 0;
  const grupos = new Map<string, Msg & { dfds: string[] }>();
  for (const d of dfds ?? []) {
    const probs = d.mensagens.filter((m): m is ProblemaDfd & { status: "erro" | "atencao" } => m.status !== "acerto");
    if (probs.some((m) => m.status === "erro")) dfdsComErro++;
    else if (probs.length > 0) dfdsEmAtencao++;
    const ref = d.planejamento ? `${d.numero} (Planej. ${d.planejamento})` : d.numero;
    const vistos = new Set<string>();
    for (const m of probs) {
      const rotulo = m.rotulo ?? ROTULO_CURTO[m.chave] ?? m.texto;
      const k = `${m.status}|${rotulo}`;
      if (vistos.has(k)) continue; // o mesmo problema 2× no DFD conta 1 DFD
      vistos.add(k);
      const g = grupos.get(k) ?? { status: m.status, chave: m.chave, texto: "", rotulo, cor: m.cor, n: 0, dfds: [] };
      g.n++;
      g.dfds.push(ref);
      grupos.set(k, g);
    }
  }
  for (const g of grupos.values()) {
    const lista = g.dfds.length > 8 ? `${g.dfds.slice(0, 8).join(", ")} e mais ${g.dfds.length - 8}` : g.dfds.join(", ");
    msgs.push({ ...g, texto: `${g.rotulo} — ${g.n} DFD${g.n === 1 ? "" : "s"}: ${lista}.` });
  }
  // Erros primeiro; em cada severidade, a capa e depois o problema que atinge MAIS DFDs.
  const peso = (m: Msg) => (m.status === "erro" ? 0 : 2) + (m.capa ? 0 : 1);
  msgs.sort((a, b) => peso(a) - peso(b) || b.n - a.n);
  const estado: EstadoProtocolo = msgs.some((m) => m.status === "erro") ? "erro" : msgs.length > 0 ? "atencao" : "regular";
  const base = { estado, totalDfds: capa.totalDfds, dfdsComErro, dfdsEmAtencao };
  if (msgs.length === 0) return base;
  const r = resumoEstado(msgs);
  const principal = msgs[0];
  const contagem =
    dfds && capa.totalDfds > 0 && (dfdsComErro > 0 || dfdsEmAtencao > 0)
      ? `${dfdsComErro} de ${capa.totalDfds} DFD(s) com erro · ${dfdsEmAtencao} em atenção\n`
      : "";
  return {
    ...base,
    // A célula mostra quantos DFDs têm o problema principal; o filtro segue com os rótulos puros.
    resumo: { ...r, rotulo: principal.n > 1 ? `${principal.rotulo} (${principal.n})` : principal.rotulo, titulo: `${contagem}${r.titulo}` },
  };
}
