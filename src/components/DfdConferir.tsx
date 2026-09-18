"use client";

import { useEffect, useRef } from "react";
import { editavelDe, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import {
  type CampoTratavel,
  type MensagemDfd,
  mensagensDfd,
  setTextoSecao,
  textoSecao,
  TRATAVEIS,
} from "@/lib/dfd-tratamento";
import { MESES, normPrevisao, normPrioridade, type Prioridade } from "@/lib/normalize";
import { type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { casarOrgao, orgaoDivergeDaUnidade } from "@/lib/reparticao-match";
import {
  pdfExigeAssinatura,
  type Responsaveis,
  RESPONSAVEIS_VAZIO,
  solicitanteDeResultado,
  validarAssinatura,
} from "@/lib/reparticao-responsaveis";
import { CampoTexto, useCadeados } from "./CampoCadeado";
import { Callout } from "./Callout";
import { DfdView, type DfdVisual } from "./DfdView";
import { Checkbox, TextField } from "./Field";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconBuilding } from "./icons";
import { Segmented } from "./Segmented";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  orgaoId?: number | null;
  orgaoProprio?: boolean | null;
  setorRequisitante?: string | null;
  numeroInteressado?: string | null;
  oculto?: boolean | null;
  responsaveis: Responsaveis;
};
type Orgao = { id: number; sigla: string; nome: string; orgaoEntidade: string | null; assinaturaUnica?: boolean | null };

/** Campos de CONTEÚDO do cabeçalho do DFD editáveis com cadeado (os IDENTIFICADORES —
 * número/planejamento/tipo/ano do PCA — nunca entram aqui). */
export type CamposCabecalhoDfd = Pick<
  DfdParseado,
  "objeto" | "orgaoEntidade" | "setorRequisitante" | "responsavel" | "matricula" | "email" | "telefone"
>;
/** Chave de cadeado por campo do cabeçalho editável. */
type CampoCabK = keyof CamposCabecalhoDfd;
/** No-op para campos só-leitura (identificadores) do bloco editável. */
const naoOp = () => {};

/** O que o painel da DIREITA (lateral) do DFD mostra: as mensagens OU o detalhe de um item. */
export type PainelDfd = { tipo: "mensagens" } | { tipo: "item"; idx: number } | { tipo: "historico" };

/** Único mapeador `DfdParseado` (+ repartição escolhida) → `DfdVisual` do `DfdView`.
 * A conferência da assinatura (solicitante) é resolvida ao vivo pela repartição
 * escolhida — reflete a troca de repartição no banner. O `anoPca` efetivo (herdado
 * do protocolo / definido no avulso) pode sobrescrever o do parse. */
export function toVisual(d: DfdParseado, rep: Rep | null, anoPca?: number | null): DfdVisual {
  const res = validarAssinatura(d.assinaturas, rep?.responsaveis ?? RESPONSAVEIS_VAZIO, {
    exigeAssinatura: pdfExigeAssinatura(d.nomeArquivo),
  });
  return {
    numero: d.numero,
    planejamento: d.planejamento,
    tipo: d.tipo,
    objeto: d.objeto,
    orgaoEntidade: d.orgaoEntidade,
    setorRequisitante: d.setorRequisitante,
    responsavel: d.responsavel,
    matricula: d.matricula,
    email: d.email,
    telefone: d.telefone,
    anoPca: anoPca !== undefined ? anoPca : d.anoPca,
    numeroContrato: d.numeroContrato,
    numeroAta: d.numeroAta,
    numeroLicitacao: d.numeroLicitacao,
    valorEstimado: d.valorEstimado,
    valorTotal: d.valorTotal,
    reparticaoCodigo: rep?.codigo ?? null,
    reparticaoNome: rep?.nome ?? null,
    totalItens: d.itens.length,
    itens: d.itens,
    secoes: d.secoes,
    assinaturas: { lista: d.assinaturas, solicitante: solicitanteDeResultado(res) },
  };
}

/**
 * TODAS as mensagens de conferência de um DFD (erro/atenção/acerto), já com a assinatura
 * conferida contra o responsável da repartição escolhida. Fonte ÚNICA usada tanto pelo
 * `DfdConferir` (contador do botão "Ver mensagens") quanto pelo painel lateral
 * `MensagensDfd` (renderizado pelo pai) — os dois recebem exatamente a mesma lista.
 */
export function mensagensDoDfd(
  d: DfdParseado,
  rep: Rep | null,
  anoPca: number | null | undefined,
  regras: RegrasAvaliacao = regrasPadrao(),
  categoria: string | null = null,
  orgaos: Orgao[] = [],
  conformidade?: Map<string, ConferenciaItem>,
): MensagemDfd[] {
  const res = validarAssinatura(d.assinaturas, rep?.responsaveis ?? RESPONSAVEIS_VAZIO, {
    exigeAssinatura: pdfExigeAssinatura(d.nomeArquivo),
  });
  // Divergência órgão × unidade (item 6.3): compara o "Órgão/Entidade" do DFD com o órgão da
  // unidade SELECIONADA. Só quando há órgãos cadastrados e a unidade tem órgão.
  const orgaoUnidadeDivergente =
    orgaos.length > 0 && rep?.orgaoId != null && orgaoDivergeDaUnidade(d.orgaoEntidade, rep.orgaoId, orgaos);
  // Ponto 6: órgão não identificado (Órgão/Entidade não casa nenhum órgão cadastrado).
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
      valorEstimado: d.valorEstimado,
      valorTotal: d.valorTotal,
      assinatura: { status: res.status, motivo: res.status === "erro" ? res.motivo : null },
    },
    regras,
    { categoria, orgaoNaoIdentificado, orgaoUnidadeDivergente, conformidade },
  );
}

/**
 * Constrói o texto canônico da PREVISÃO a partir do editor. É **um OU outro**:
 * ANUAL (com ano opcional → `ANUAL/AAAA`, senão só `ANUAL`) OU uma DATA `MÊS/AAAA`
 * (exige mês E ano). Vazio = ainda a preencher.
 */
export function buildPrevisao(mes: string, ano: string, anual: boolean): string {
  if (anual) return ano ? `ANUAL/${ano}` : "ANUAL";
  return mes && ano ? `${mes}/${ano}` : "";
}

/**
 * CORPO de conferência/edição do DFD — MESMO componente no import avulso e por DFD
 * do protocolo. Controlado: repartição por `repId`/`onRepChange`; seções tratáveis
 * (PRIORIDADE/PREVISÃO/FUNDAMENTAÇÃO) por `dfd.secoes`/`onSecoesChange`. Mostra as
 * faltas ao vivo e o DFD completo (`DfdView`, read-only, reflete as edições).
 */
export function DfdConferir({
  dfd,
  reparticoes,
  reparticaoAtivaId = null,
  repId,
  anoPca,
  autoMatch,
  autoCampos = [],
  readOnly = false,
  regras = regrasPadrao(),
  orgaos = [],
  conformidade,
  ancoraAlvo = null,
  itemAtivo = null,
  onRepChange,
  onSecoesChange,
  onRefsChange,
  onCamposChange,
  onItemClick,
}: {
  dfd: DfdParseado;
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
  repId: number | null;
  /** Órgãos cadastrados — p/ apontar a divergência Órgão/Entidade × órgão da unidade. */
  orgaos?: Orgao[];
  /** Conformidade dos itens com o catálogo (veredito por código) — habilita a coluna
   * "Catálogo" no `DfdView` e as mensagens de catálogo. Ausente = sem conferência. */
  conformidade?: Map<string, ConferenciaItem>;
  /** Ano do PCA efetivo do DFD (herdado do protocolo / definido no avulso) — só exibição. */
  anoPca?: number | null;
  autoMatch: boolean;
  autoCampos?: CampoTratavel[];
  /** Trava a edição (banner de visualização/edição travado). */
  readOnly?: boolean;
  /** Regras de avaliação do ADM (edição de campos por nível). */
  regras?: RegrasAvaliacao;
  /** Pedido de rolagem/destaque de uma âncora (id + cor + nonce para repetir o clique). */
  ancoraAlvo?: { ancora: string; cor: string; nonce: number } | null;
  /** Índice do item ATIVO (detalhe aberto ao lado) — destacado na tabela de itens. */
  itemAtivo?: number | null;
  onRepChange: (id: number | null) => void;
  onSecoesChange: (secoes: DfdParseado["secoes"]) => void;
  /** Edição das referências de renovação (DFD-R): contrato/ata/licitação. */
  onRefsChange?: (refs: { numeroContrato: string | null; numeroAta: string | null; numeroLicitacao: string | null }) => void;
  /** Edição dos campos de CONTEÚDO do cabeçalho (objeto/órgão/setor/responsável/matrícula/e-mail/
   * telefone) com cadeado por campo. Ausente = cabeçalho não editável (identificadores nunca mudam). */
  onCamposChange?: (patch: Partial<CamposCabecalhoDfd>) => void;
  /** Clique numa linha de item (Seção 4) → abre o detalhe do item ao lado (renderizado pelo pai). */
  onItemClick?: (idx: number) => void;
}) {
  const rep = reparticoes.find((r) => r.id === repId) ?? null;
  // Divergência órgão × unidade (item 6.3): o "Órgão/Entidade" do DFD aponta um órgão diferente
  // do órgão da unidade selecionada. Não bloqueia — só avisa (âmbar).
  const orgaoDivergente = orgaos.length > 0 && rep?.orgaoId != null && orgaoDivergeDaUnidade(dfd.orgaoEntidade, rep.orgaoId, orgaos);
  // Ponto 4: identifica o ÓRGÃO pelo "Órgão/Entidade" e ESCOPA as unidades a ele; o usuário
  // escolhe a unidade dentro do órgão. Sem órgãos cadastrados → mantém a lista inteira.
  const orgaoIdent = orgaos.length > 0 ? casarOrgao(dfd.orgaoEntidade, orgaos) : null;
  const orgaoIdentNome = orgaoIdent != null ? (orgaos.find((o) => o.id === orgaoIdent)?.nome ?? null) : null;
  // Escopa as unidades ao órgão identificado (PREFERÊNCIA), mas SEMPRE inclui a unidade já
  // selecionada e cai para a lista inteira quando o escopo fica vazio — senão o seletor ficava
  // vazio (nenhuma unidade acessível no órgão, ou a atual em outro órgão) e travava a escolha
  // manual. Cobre o órgão-que-é-unidade (a unidade própria entra no escopo do próprio órgão).
  const visivel = (r: Rep) => !r.oculto || r.id === repId;
  const escopo = reparticoes.filter((r) => visivel(r) && (orgaoIdent == null || r.orgaoId === orgaoIdent || r.id === repId));
  const unidadesDoDfd = escopo.length > 0 ? escopo : reparticoes.filter(visivel);
  // DFD de RENOVAÇÃO (DFD-R): precisa referenciar contrato/ata/licitação (não trava).
  const ehRenovacao = tipoCurtoDfd(dfd.tipo) === "DFD-R";
  const setRef = (campo: "numeroContrato" | "numeroAta" | "numeroLicitacao", valor: string) => {
    const v = valor.trim() || null;
    onRefsChange?.({
      numeroContrato: campo === "numeroContrato" ? v : dfd.numeroContrato,
      numeroAta: campo === "numeroAta" ? v : dfd.numeroAta,
      numeroLicitacao: campo === "numeroLicitacao" ? v : dfd.numeroLicitacao,
    });
  };
  const foraDoHead = repId != null && reparticaoAtivaId != null && repId !== reparticaoAtivaId;

  // Rolagem + DESTAQUE de uma âncora (ao clicar numa mensagem do painel lateral). O
  // elemento com `data-ancora` correspondente entra em vista e pulsa na cor do status.
  const bodyRef = useRef<HTMLDivElement>(null);
  const destaqueRef = useRef<{ el: HTMLElement; timer: number } | null>(null);
  useEffect(() => {
    if (!ancoraAlvo || !bodyRef.current) return;
    const el = bodyRef.current.querySelector<HTMLElement>(`[data-ancora="${ancoraAlvo.ancora}"]`);
    if (!el) return;
    if (destaqueRef.current) {
      window.clearTimeout(destaqueRef.current.timer);
      destaqueRef.current.el.style.boxShadow = "";
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "box-shadow 0.35s ease";
    el.style.borderRadius = el.style.borderRadius || "14px";
    el.style.boxShadow = `0 0 0 3px ${ancoraAlvo.cor}, 0 0 0 7px color-mix(in srgb, ${ancoraAlvo.cor} 22%, transparent)`;
    const timer = window.setTimeout(() => {
      el.style.boxShadow = "";
    }, 2000);
    destaqueRef.current = { el, timer };
  }, [ancoraAlvo]);
  useEffect(() => () => {
    if (destaqueRef.current) window.clearTimeout(destaqueRef.current.timer);
  }, []);

  const setSecao = (cfg: (typeof TRATAVEIS)[number], texto: string) =>
    onSecoesChange(setTextoSecao(dfd.secoes, cfg, texto));

  // Edição por campo (ADM): trava um campo mesmo fora do modo só-leitura global.
  const roRep = readOnly || !editavelDe(regras, "dfd.reparticao");
  const roPrio = readOnly || !editavelDe(regras, "dfd.prioridade");
  const roPrev = readOnly || !editavelDe(regras, "dfd.previsao");
  const roFund = readOnly || !editavelDe(regras, "dfd.fundamentacao");
  const roRefs = readOnly || !editavelDe(regras, "dfd.referenciaRenovacao");

  // Cadeado POR CAMPO do cabeçalho (conteúdo editável); os identificadores nunca mudam.
  const { abertos: abCab, alternar: altCab } = useCadeados<CampoCabK>();
  const cabEditavel = !!onCamposChange && !readOnly;
  const propsCab = (k: CampoCabK) => ({
    editavel: cabEditavel,
    aberto: abCab.has(k),
    bloqueado: false,
    onLock: () => altCab(k),
  });

  // Valores atuais das seções tratáveis.
  const [pCfg, vCfg, fCfg] = TRATAVEIS;
  const prio = normPrioridade(textoSecao(dfd.secoes, pCfg.kw)).valor;
  // Previsão: o ANO segue o PCA do processo (ponto 7) — passado a `normPrevisao`, que também
  // reconhece só o MÊS por extenso e completa o ano com o do PCA (ponto 8).
  const prev = normPrevisao(textoSecao(dfd.secoes, vCfg.kw), anoPca).valor;
  const fund = textoSecao(dfd.secoes, fCfg.kw);
  // "ANUAL" (bare) ou "ANUAL/AAAA" → anual; senão "MÊS/AAAA" → data. Ano é opcional
  // no anual (não deixa o mês grudar como se fosse mês quando é só "ANUAL").
  const anual = !!prev && /^ANUAL(\/|$)/.test(prev);
  const mesSel = prev && !anual ? (prev.split("/")[0] ?? "") : "";
  // Ano do campo: o da previsão; sem ele, o do PCA (o usuário ainda pode editar — ponto 8).
  const anoSel = (prev ? (prev.split("/")[1] ?? "") : "") || (anoPca != null ? String(anoPca) : "");

  const status = (campo: CampoTratavel, ok: boolean): { txt: string; cor: string } => {
    if (!ok) return { txt: "tratar", cor: "var(--danger)" };
    if (autoCampos.includes(campo)) return { txt: "auto", cor: "var(--warn)" };
    return { txt: "ok", cor: "var(--ok)" };
  };
  const Tag = ({ campo, ok }: { campo: CampoTratavel; ok: boolean }) => {
    const s = status(campo, ok);
    return (
      <span className="ml-2 text-[10px] font-semibold uppercase" style={{ color: s.cor }}>
        {s.txt}
      </span>
    );
  };

  return (
    <div className="space-y-4" ref={bodyRef}>
      {/* Ponto 4: Órgão identificado (Órgão/Entidade) + Unidade escolhida DENTRO do órgão */}
      <div data-ancora="reparticao">
        {orgaos.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="text-muted">Órgão (Órgão/Entidade):</span>
            {orgaoIdentNome ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-text">
                <IconBuilding className="h-4 w-4 text-accent" /> {orgaoIdentNome}
              </span>
            ) : (
              <span style={{ color: "var(--warn)" }}>não identificado — escolha a unidade manualmente</span>
            )}
          </div>
        )}
        <label className={labelCls} htmlFor="dfd-rep">
          {orgaoIdentNome ? "Unidade (dentro do órgão)" : "Setor / Unidade"} <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <select
          id="dfd-rep"
          className={inputCls}
          value={repId ?? ""}
          disabled={roRep}
          onChange={(e) => onRepChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Selecione a unidade —</option>
          {unidadesDoDfd.map((r) => (
            <option key={r.id} value={r.id}>
              {r.codigo} · {r.nome}
            </option>
          ))}
        </select>
        {autoMatch && (
          <Callout kind="ok" icon={<IconBuilding className="h-4 w-4" />} className="mt-2">
            Unidade detectada automaticamente pelo setor. Confirme ou ajuste.
          </Callout>
        )}
        {orgaoDivergente && (
          <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />} className="mt-2">
            O “Órgão/Entidade” do DFD{dfd.orgaoEntidade ? ` (“${dfd.orgaoEntidade}”)` : ""} diverge do órgão desta
            unidade. Confira a unidade selecionada ou o cadastro do órgão.
          </Callout>
        )}
      </div>

      {/* Cabeçalho — conteúdo EDITÁVEL (cadeado por campo, como os itens). Só aparece ao editar
          (import / gravado destravado); os IDENTIFICADORES (número/planejamento/tipo) são imutáveis.
          O DfdView abaixo reflete tudo em só-leitura. */}
      {cabEditavel && (
        <section className="rounded-card border border-border bg-surface p-4 shadow-ring" data-ancora="cabecalho">
          <h3 className="mb-1 text-sm font-bold text-text">1 · Área requisitante da demanda</h3>
          <p className="mb-3 text-[12px] text-muted">
            Destrave um campo para corrigir. Número, planejamento e tipo do DFD são imutáveis.
          </p>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {/* Identificadores (só-leitura): mostrados aqui porque a Seção 1 só-leitura fica oculta ao editar. */}
            <CampoTexto label="Nº DFD" valor={dfd.numero ?? ""} editavel={false} aberto={false} bloqueado onLock={naoOp} onChange={naoOp} />
            <CampoTexto label="Planejamento" valor={dfd.planejamento ?? ""} editavel={false} aberto={false} bloqueado onLock={naoOp} onChange={naoOp} />
            <CampoTexto label="Ano do PCA" valor={anoPca != null ? String(anoPca) : ""} editavel={false} aberto={false} bloqueado onLock={naoOp} onChange={naoOp} />
            <CampoTexto label="Objeto" valor={dfd.objeto ?? ""} span multi {...propsCab("objeto")} onChange={(v) => onCamposChange?.({ objeto: v || null })} />
            <CampoTexto label="Órgão/Entidade" valor={dfd.orgaoEntidade ?? ""} span {...propsCab("orgaoEntidade")} onChange={(v) => onCamposChange?.({ orgaoEntidade: v || null })} />
            <CampoTexto label="Setor Requisitante" valor={dfd.setorRequisitante ?? ""} span {...propsCab("setorRequisitante")} onChange={(v) => onCamposChange?.({ setorRequisitante: v || null })} />
            <CampoTexto label="Responsável" valor={dfd.responsavel ?? ""} {...propsCab("responsavel")} onChange={(v) => onCamposChange?.({ responsavel: v || null })} />
            <CampoTexto label="Matrícula" valor={dfd.matricula ?? ""} {...propsCab("matricula")} onChange={(v) => onCamposChange?.({ matricula: v || null })} />
            <CampoTexto label="E-mail" valor={dfd.email ?? ""} span {...propsCab("email")} onChange={(v) => onCamposChange?.({ email: v || null })} />
            <CampoTexto label="Telefone" valor={dfd.telefone ?? ""} {...propsCab("telefone")} onChange={(v) => onCamposChange?.({ telefone: v || null })} />
          </div>
        </section>
      )}

      {/* Tratamento das seções tratáveis */}
      <section className="rounded-card border border-border bg-surface p-4 shadow-ring">
        <h3 className="mb-3 text-sm font-bold text-text">Tratamento</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* PRIORIDADE */}
          <div data-ancora="prioridade">
            <span className="mb-1.5 block text-[13px] font-medium text-text-2">
              Prioridade <Tag campo="prioridade" ok={prio != null} />
            </span>
            <Segmented<Prioridade | "">
              value={prio ?? ""}
              disabled={roPrio}
              options={[
                { value: "ALTA", label: "Alta" },
                { value: "MÉDIA", label: "Média" },
                { value: "BAIXA", label: "Baixa" },
              ]}
              onChange={(v) => v && setSecao(pCfg, v)}
            />
          </div>

          {/* PREVISÃO */}
          <div data-ancora="previsao">
            <span className="mb-1.5 block text-[13px] font-medium text-text-2">
              Previsão de entrega <Tag campo="previsao" ok={prev != null} />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={inputCls}
                style={{ width: "auto", flex: "1 1 120px" }}
                value={mesSel}
                disabled={anual || roPrev}
                onChange={(e) => setSecao(vCfg, buildPrevisao(e.target.value, anoSel, false))}
              >
                <option value="">— Mês —</option>
                {MESES.map((m) => (
                  <option key={m} value={m}>
                    {m[0] + m.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              <input
                className={inputCls}
                style={{ width: "84px" }}
                inputMode="numeric"
                placeholder="Ano"
                maxLength={4}
                value={anoSel}
                disabled={roPrev}
                onChange={(e) => {
                  const ano = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setSecao(vCfg, buildPrevisao(mesSel, ano, anual));
                }}
              />
              <Checkbox
                label="Anual"
                checked={anual}
                disabled={roPrev}
                onChange={(e) => setSecao(vCfg, buildPrevisao(mesSel, anoSel, e.target.checked))}
              />
            </div>
          </div>

          {/* FUNDAMENTAÇÃO */}
          <div className="sm:col-span-2" data-ancora="fundamentacao">
            <span className="mb-1.5 block text-[13px] font-medium text-text-2">
              Fundamentação legal <Tag campo="fundamentacao" ok={fund.trim().length > 0} />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[200px] flex-1">
                <TextField
                  aria-label="Fundamentação legal"
                  value={fund}
                  disabled={roFund}
                  onChange={(e) => setSecao(fCfg, e.target.value)}
                  placeholder="Ex.: Lei 14.133/2021"
                />
              </div>
              {!roFund && !fund.trim() && (
                <button
                  type="button"
                  className="rounded-control border border-border-2 px-3 py-2 text-[13px] font-medium text-accent hover:bg-accent-soft"
                  onClick={() => setSecao(fCfg, "Lei 14.133/2021")}
                >
                  Preencher padrão
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Referências da RENOVAÇÃO (DFD-R) — contrato/ata/licitação. Aponta a ausência
          (não trava) e permite preencher à mão. Só aparece para DFD-R. */}
      {ehRenovacao && (
        <section className="rounded-card border border-border bg-surface p-4 shadow-ring" data-ancora="referenciaRenovacao">
          <h3 className="mb-1 text-sm font-bold text-text">Referências da renovação</h3>
          <p className="mb-3 text-xs text-muted">
            Todo DFD-R deve mencionar um nº de contrato, ARP ou licitação. Preenchidos
            automaticamente pela descrição; ajuste ou complete se necessário. As pendências ficam em "Ver mensagens".
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Nº do contrato"
              value={dfd.numeroContrato ?? ""}
              disabled={roRefs}
              onChange={(e) => setRef("numeroContrato", e.target.value)}
              placeholder="Ex.: 860/2025"
            />
            <TextField
              label="Nº da ARP"
              value={dfd.numeroAta ?? ""}
              disabled={roRefs}
              onChange={(e) => setRef("numeroAta", e.target.value)}
              placeholder="Ex.: 045/2025"
            />
            <TextField
              label="Nº da licitação"
              value={dfd.numeroLicitacao ?? ""}
              disabled={roRefs}
              onChange={(e) => setRef("numeroLicitacao", e.target.value)}
              placeholder="Ex.: 123/2025"
            />
          </div>
        </section>
      )}

      {/* Dica de fluxo (não é conferência do DFD): repartição diferente da ativa no head. */}
      {foraDoHead && (
        <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
          A unidade escolhida é diferente da ativa no cabeçalho — selecione-a (ou "Geral") no topo para vê-lo na
          lista depois.
        </Callout>
      )}

      {/* Documento completo (read-only, reflete as edições). O botão "Ver mensagens" e a
          numeração ficam no RODAPÉ FIXO do banner (renderizados pelo pai). */}
      <div className="border-t border-border pt-4">
        <DfdView dfd={toVisual(dfd, rep, anoPca)} regras={regras} conformidade={conformidade} onItemClick={onItemClick} itemAtivo={itemAtivo} ocultarSecao1={cabEditavel} />
      </div>
    </div>
  );
}
