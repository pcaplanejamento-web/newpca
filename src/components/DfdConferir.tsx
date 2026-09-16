"use client";

import { useState } from "react";
import { nivelDe, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import {
  type CampoTratavel,
  faltasCirurgicasDfd,
  linhasRelatorioDfd,
  setTextoSecao,
  textoSecao,
  TRATAVEIS,
} from "@/lib/dfd-tratamento";
import { MESES, normPrevisao, normPrioridade, type Prioridade } from "@/lib/normalize";
import { type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import {
  pdfExigeAssinatura,
  type Responsaveis,
  RESPONSAVEIS_VAZIO,
  solicitanteDeResultado,
  validarAssinatura,
} from "@/lib/reparticao-responsaveis";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { DfdView, type DfdVisual } from "./DfdView";
import { Checkbox, TextField } from "./Field";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconBuilding, IconCheck } from "./icons";
import { RelatorioErros } from "./RelatorioErros";
import { Segmented } from "./Segmented";

type Rep = { id: number; codigo: string; nome: string; responsaveis: Responsaveis };

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
  categoria = null,
  onRepChange,
  onSecoesChange,
  onRefsChange,
}: {
  dfd: DfdParseado;
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
  repId: number | null;
  /** Ano do PCA efetivo do DFD (herdado do protocolo / definido no avulso) — só exibição. */
  anoPca?: number | null;
  autoMatch: boolean;
  autoCampos?: CampoTratavel[];
  /** Trava a edição (banner de visualização/edição travado). */
  readOnly?: boolean;
  /** Regras de avaliação do ADM + a categoria do protocolo (para as exceções). */
  regras?: RegrasAvaliacao;
  categoria?: string | null;
  onRepChange: (id: number | null) => void;
  onSecoesChange: (secoes: DfdParseado["secoes"]) => void;
  /** Edição das referências de renovação (DFD-R): contrato/ata/licitação. */
  onRefsChange?: (refs: { numeroContrato: string | null; numeroAta: string | null; numeroLicitacao: string | null }) => void;
}) {
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const rep = reparticoes.find((r) => r.id === repId) ?? null;
  // DFD de RENOVAÇÃO (DFD-R): precisa referenciar contrato/ata/licitação (não trava).
  const ehRenovacao = tipoCurtoDfd(dfd.tipo) === "DFD-R";
  const semReferencia =
    ehRenovacao &&
    !dfd.numeroContrato &&
    !dfd.numeroAta &&
    !dfd.numeroLicitacao &&
    nivelDe(regras, "dfd.referenciaRenovacao", { dfdTipo: "DFD-R", categoria }) !== "ignorar";
  const setRef = (campo: "numeroContrato" | "numeroAta" | "numeroLicitacao", valor: string) => {
    const v = valor.trim() || null;
    onRefsChange?.({
      numeroContrato: campo === "numeroContrato" ? v : dfd.numeroContrato,
      numeroAta: campo === "numeroAta" ? v : dfd.numeroAta,
      numeroLicitacao: campo === "numeroLicitacao" ? v : dfd.numeroLicitacao,
    });
  };
  const foraDoHead = repId != null && reparticaoAtivaId != null && repId !== reparticaoAtivaId;
  // Conferência da assinatura contra o responsável da repartição escolhida
  // (recalcula ao trocar de repartição, igual a `faltas`).
  const resAssinatura = validarAssinatura(dfd.assinaturas, rep?.responsaveis ?? RESPONSAVEIS_VAZIO, {
    exigeAssinatura: pdfExigeAssinatura(dfd.nomeArquivo),
  });
  // Pendências CIRÚRGICAS (aponta itens/seção e o que fazer). Sem a assinatura (que tem
  // callout próprio); no relatório copiável ela entra.
  // Nível da assinatura (ADM): "ignorar" não mostra a pendência; senão entra como falta.
  const nivelAssinatura = nivelDe(regras, "dfd.assinatura", { dfdTipo: tipoCurtoDfd(dfd.tipo), categoria });
  const assinaturaMotivo =
    nivelAssinatura !== "ignorar" && resAssinatura.status === "erro" ? resAssinatura.motivo : null;
  const faltasCir = faltasCirurgicasDfd(
    { itens: dfd.itens, secoes: dfd.secoes, reparticaoId: repId, tipo: dfd.tipo },
    regras,
    { categoria },
  );
  const temErro = faltasCir.length > 0 || !!assinaturaMotivo;
  const relatorioLinhas = linhasRelatorioDfd({
    numero: dfd.numero,
    planejamento: dfd.planejamento,
    tipo: dfd.tipo,
    faltas: faltasCirurgicasDfd(
      { itens: dfd.itens, secoes: dfd.secoes, reparticaoId: repId, assinaturaMotivo, tipo: dfd.tipo },
      regras,
      { categoria },
    ),
  });

  const setSecao = (cfg: (typeof TRATAVEIS)[number], texto: string) =>
    onSecoesChange(setTextoSecao(dfd.secoes, cfg, texto));

  // Valores atuais das seções tratáveis.
  const [pCfg, vCfg, fCfg] = TRATAVEIS;
  const prio = normPrioridade(textoSecao(dfd.secoes, pCfg.kw)).valor;
  const prev = normPrevisao(textoSecao(dfd.secoes, vCfg.kw)).valor;
  const fund = textoSecao(dfd.secoes, fCfg.kw);
  // "ANUAL" (bare) ou "ANUAL/AAAA" → anual; senão "MÊS/AAAA" → data. Ano é opcional
  // no anual (não deixa o mês grudar como se fosse mês quando é só "ANUAL").
  const anual = !!prev && /^ANUAL(\/|$)/.test(prev);
  const mesSel = prev && !anual ? (prev.split("/")[0] ?? "") : "";
  const anoSel = prev ? (prev.split("/")[1] ?? "") : "";

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
    <div className="space-y-4">
      {/* Setor / Repartição (setor = repartição) */}
      <div>
        <label className={labelCls} htmlFor="dfd-rep">
          Setor / Repartição <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <select
          id="dfd-rep"
          className={inputCls}
          value={repId ?? ""}
          disabled={readOnly}
          onChange={(e) => onRepChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Selecione a repartição —</option>
          {reparticoes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.codigo} · {r.nome}
            </option>
          ))}
        </select>
        {autoMatch && (
          <Callout kind="ok" icon={<IconBuilding className="h-4 w-4" />} className="mt-2">
            Repartição detectada automaticamente pelo setor. Confirme ou ajuste.
          </Callout>
        )}
      </div>

      {/* Tratamento das seções tratáveis */}
      <section className="rounded-card border border-border bg-surface p-4 shadow-ring">
        <h3 className="mb-3 text-sm font-bold text-text">Tratamento</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* PRIORIDADE */}
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-text-2">
              Prioridade <Tag campo="prioridade" ok={prio != null} />
            </span>
            <Segmented<Prioridade | "">
              value={prio ?? ""}
              disabled={readOnly}
              options={[
                { value: "ALTA", label: "Alta" },
                { value: "MÉDIA", label: "Média" },
                { value: "BAIXA", label: "Baixa" },
              ]}
              onChange={(v) => v && setSecao(pCfg, v)}
            />
          </div>

          {/* PREVISÃO */}
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-text-2">
              Previsão de entrega <Tag campo="previsao" ok={prev != null} />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={inputCls}
                style={{ width: "auto", flex: "1 1 120px" }}
                value={mesSel}
                disabled={anual || readOnly}
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
                disabled={readOnly}
                onChange={(e) => {
                  const ano = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setSecao(vCfg, buildPrevisao(mesSel, ano, anual));
                }}
              />
              <Checkbox
                label="Anual"
                checked={anual}
                disabled={readOnly}
                onChange={(e) => setSecao(vCfg, buildPrevisao(mesSel, anoSel, e.target.checked))}
              />
            </div>
          </div>

          {/* FUNDAMENTAÇÃO */}
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-text-2">
              Fundamentação legal <Tag campo="fundamentacao" ok={fund.trim().length > 0} />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[200px] flex-1">
                <TextField
                  aria-label="Fundamentação legal"
                  value={fund}
                  disabled={readOnly}
                  onChange={(e) => setSecao(fCfg, e.target.value)}
                  placeholder="Ex.: Lei 14.133/2021"
                />
              </div>
              {!readOnly && !fund.trim() && (
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
        <section className="rounded-card border border-border bg-surface p-4 shadow-ring">
          <h3 className="mb-1 text-sm font-bold text-text">Referências da renovação</h3>
          <p className="mb-3 text-xs text-muted">
            Todo DFD-R deve mencionar um nº de contrato, ata (registro de preços) ou licitação. Preenchidos
            automaticamente pela descrição; ajuste ou complete se necessário.
          </p>
          {semReferencia && (
            <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />} className="mb-3">
              <p className="font-semibold">Atenção — DFD-R sem referência</p>
              <p className="mt-1 opacity-90">
                Nenhum nº de contrato, ata ou licitação foi encontrado na descrição. O DFD fica marcado como
                <span className="font-semibold"> Atenção</span> (não bloqueia a importação). Informe ao menos uma
                referência abaixo — ou inclua-o no relatório do protocolo.
              </p>
            </Callout>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Nº do contrato"
              value={dfd.numeroContrato ?? ""}
              disabled={readOnly}
              onChange={(e) => setRef("numeroContrato", e.target.value)}
              placeholder="Ex.: 860/2025"
            />
            <TextField
              label="Nº da ata (registro de preços)"
              value={dfd.numeroAta ?? ""}
              disabled={readOnly}
              onChange={(e) => setRef("numeroAta", e.target.value)}
              placeholder="Ex.: 045/2025"
            />
            <TextField
              label="Nº da licitação"
              value={dfd.numeroLicitacao ?? ""}
              disabled={readOnly}
              onChange={(e) => setRef("numeroLicitacao", e.target.value)}
              placeholder="Ex.: 123/2025"
            />
          </div>
        </section>
      )}

      {/* Faltas CIRÚRGICAS (aponta o item/seção e o que fazer; bloqueia importar) */}
      {faltasCir.length > 0 && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
          <p className="font-semibold">Pendências a corrigir (importação bloqueada):</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 opacity-90">
            {faltasCir.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Callout>
      )}
      {/* Conferência da assinatura digital — o nível `dfd.assinatura` decide se bloqueia. */}
      {assinaturaMotivo && (
        <Callout kind={nivelAssinatura === "fundamental" ? "danger" : "warn"} icon={<IconAlert className="h-5 w-5" />}>
          <p className="font-semibold">
            {nivelAssinatura === "fundamental"
              ? "Assinatura digital não conferida (gravação bloqueada):"
              : "Assinatura digital não conferida (atenção — não bloqueia):"}
          </p>
          <p className="mt-1 opacity-90">{assinaturaMotivo}</p>
        </Callout>
      )}
      {resAssinatura.status === "ok" && (
        <Callout kind="ok" icon={<IconCheck className="h-4 w-4" />}>
          Assinatura conferida: <span className="font-semibold">{resAssinatura.responsavel.nome}</span>
          {resAssinatura.tipo === "temporario" ? " (responsável temporário)" : " (responsável padrão)"}.
        </Callout>
      )}
      {resAssinatura.status === "sem-assinatura" && (
        <Callout kind="info" icon={<IconAlert className="h-4 w-4" />}>
          Documento sem assinatura digital (.xlsx) — segue sem conferência de assinante.
        </Callout>
      )}
      {foraDoHead && faltasCir.length === 0 && (
        <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
          A repartição escolhida é diferente da ativa no cabeçalho — selecione-a (ou "Geral") no topo para vê-lo na
          lista depois.
        </Callout>
      )}

      {/* Documento completo (read-only, reflete as edições) */}
      <div className="border-t border-border pt-4">
        <DfdView dfd={toVisual(dfd, rep, anoPca)} regras={regras} />
      </div>

      {/* Parte inferior — relatório de erro (só quando há erro) */}
      {temErro && (
        <div className="flex justify-end border-t border-border pt-4">
          <Button
            variant="secondary"
            onClick={() => setRelatorioAberto(true)}
            icon={<IconAlert className="h-4 w-4" style={{ color: "var(--danger)" }} />}
          >
            Relatório de erro
          </Button>
        </div>
      )}
      <RelatorioErros
        open={relatorioAberto}
        onClose={() => setRelatorioAberto(false)}
        titulo={`Erros do DFD ${dfd.numero}`}
        linhas={relatorioLinhas}
      />
    </div>
  );
}
