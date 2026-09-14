"use client";

import { useState } from "react";
import {
  type CampoTratavel,
  faltasDoItem,
  itemComErro,
  linhasRelatorioDfd,
  setTextoSecao,
  textoSecao,
  TRATAVEIS,
} from "@/lib/dfd-tratamento";
import { faltasObrigatorias } from "@/lib/dfd-validation";
import { MESES, normPrevisao, normPrioridade, type Prioridade } from "@/lib/normalize";
import type { DfdParseado } from "@/lib/parse-dfd-comum";
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
 * escolhida — reflete a troca de repartição no banner. */
export function toVisual(d: DfdParseado, rep: Rep | null): DfdVisual {
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
  autoMatch,
  autoCampos = [],
  readOnly = false,
  onRepChange,
  onSecoesChange,
}: {
  dfd: DfdParseado;
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
  repId: number | null;
  autoMatch: boolean;
  autoCampos?: CampoTratavel[];
  /** Trava a edição (banner de visualização/edição travado). */
  readOnly?: boolean;
  onRepChange: (id: number | null) => void;
  onSecoesChange: (secoes: DfdParseado["secoes"]) => void;
}) {
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const rep = reparticoes.find((r) => r.id === repId) ?? null;
  const faltas = faltasObrigatorias({ reparticaoId: repId, itens: dfd.itens, secoes: dfd.secoes });
  const foraDoHead = repId != null && reparticaoAtivaId != null && repId !== reparticaoAtivaId;
  // Conferência da assinatura contra o responsável da repartição escolhida
  // (recalcula ao trocar de repartição, igual a `faltas`).
  const resAssinatura = validarAssinatura(dfd.assinaturas, rep?.responsaveis ?? RESPONSAVEIS_VAZIO, {
    exigeAssinatura: pdfExigeAssinatura(dfd.nomeArquivo),
  });
  // Itens com pendência + relatório de erros copiável (só aparece quando há erro).
  const itensErro = dfd.itens.filter(itemComErro);
  const assinaturaMotivo = resAssinatura.status === "erro" ? resAssinatura.motivo : null;
  const temErro = faltas.length > 0 || !!assinaturaMotivo || itensErro.length > 0;
  const relatorioLinhas = linhasRelatorioDfd({
    numero: dfd.numero,
    planejamento: dfd.planejamento,
    tipo: dfd.tipo,
    faltas,
    assinaturaMotivo,
    itensComErro: itensErro.map((it) => ({ item: it.item, codigo: it.codigo, faltas: faltasDoItem(it) })),
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

      {/* Faltas (bloqueia importar, mas deixa conferir) */}
      {faltas.length > 0 && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
          <p className="font-semibold">Faltam dados obrigatórios (importação bloqueada):</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 opacity-90">
            {faltas.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Callout>
      )}
      {/* Conferência da assinatura digital (bloqueia a gravação quando não confere) */}
      {resAssinatura.status === "erro" && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
          <p className="font-semibold">Assinatura digital não conferida (gravação bloqueada):</p>
          <p className="mt-1 opacity-90">{resAssinatura.motivo}</p>
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
      {foraDoHead && faltas.length === 0 && (
        <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
          A repartição escolhida é diferente da ativa no cabeçalho — selecione-a (ou "Geral") no topo para vê-lo na
          lista depois.
        </Callout>
      )}

      {/* Documento completo (read-only, reflete as edições) */}
      <div className="border-t border-border pt-4">
        <DfdView dfd={toVisual(dfd, rep)} />
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
