"use client";

import { useMemo } from "react";
import { type LinhaConferencia, resumoConferencia, type SituacaoAnexo } from "@/lib/automacao-dfds-estado";
import { Badge, type Tone } from "../Badge";
import { Button } from "../Button";
import { type Column, DataTable } from "../DataTable";
import { IconAlert, IconPlay, IconSearch } from "../icons";
import { StatMini } from "../StatMini";

const SITUACAO: Record<SituacaoAnexo, { rotulo: string; tom: Tone; dica: string }> = {
  anexado: { rotulo: "Anexado", tom: "emerald", dica: "O documento está no protocolo da Centi." },
  falta: { rotulo: "Falta", tom: "amber", dica: "Não está no protocolo da Centi — será enviado." },
  ausente: { rotulo: "Registrado, mas ausente", tom: "red", dica: "O sistema registrou o anexo, mas o protocolo da Centi não tem o documento — será enviado de novo." },
  semProtocolo: { rotulo: "Sem protocolo", tom: "slate", dica: "O protocolo da Centi não abriu ou o arquivo não tem protocolo." },
};

const COLUNAS: Column<LinhaConferencia>[] = [
  {
    key: "situacao",
    header: "Situação",
    nowrap: true,
    value: (l) => SITUACAO[l.situacao].rotulo,
    render: (l) => (
      <span title={l.erro ?? SITUACAO[l.situacao].dica}>
        <Badge tone={SITUACAO[l.situacao].tom}>{SITUACAO[l.situacao].rotulo}</Badge>
      </span>
    ),
  },
  { key: "nome", header: "Arquivo", align: "left", value: (l) => l.descricao, render: (l) => <span className="block max-w-[26rem] truncate" title={l.descricao}>{l.descricao}</span> },
  { key: "dfds", header: "DFDs", nowrap: true, filter: "range", numero: (l) => l.dfds, formatarFaixa: (n) => String(n), value: (l) => String(l.dfds), render: (l) => <span className="tabular-nums">{l.dfds}</span> },
  { key: "protocolo", header: "Protocolo", nowrap: true, value: (l) => l.protocolo, render: (l) => l.protocolo || "—" },
  {
    key: "documento",
    header: "Na Centi",
    nowrap: true,
    value: (l) => (l.documento ? `Documento ${l.documento.sequencial || l.documento.id}` : "—"),
    render: (l) => (l.documento ? <span className="tabular-nums" title={`Id ${l.documento.id}`}>Documento {l.documento.sequencial || l.documento.id}</span> : <span className="text-faint">—</span>),
  },
  { key: "registro", header: "No sistema", nowrap: true, value: (l) => (l.registrado ? "Registrado" : "—"), render: (l) => (l.registrado ? "Registrado" : <span className="text-faint">—</span>) },
];

/**
 * A CONFERÊNCIA NO PROTOCOLO da Centi (Baixar/anexar DFDs): cada arquivo do plano com a situação real — anexado (com o nº
 * do documento), falta, registrado no sistema mas ausente na Centi, sem protocolo — e "Enviar os que faltam". A Centi é a
 * verdade; nada é gravado ao conferir.
 */
export function ConferenciaAnexos({
  linhas,
  carregando = false,
  erro,
  desabilitado = false,
  onConferir,
  onEnviar,
}: {
  linhas: LinhaConferencia[] | null;
  carregando?: boolean;
  erro?: string;
  desabilitado?: boolean;
  onConferir: () => void;
  /** Envia SÓ os que faltam (falta + registrados mas ausentes). */
  onEnviar?: (nomes: string[]) => void;
}) {
  const r = useMemo(() => (linhas ? resumoConferencia(linhas) : null), [linhas]);
  const faltando = useMemo(() => (linhas ?? []).filter((l) => l.situacao === "falta" || l.situacao === "ausente").map((l) => l.nome), [linhas]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onConferir} loading={carregando} disabled={desabilitado} title="Abre o protocolo na Centi só para ler e confere o que já está anexado e o que falta">
          <IconSearch className="h-4 w-4" />
          Conferir no protocolo
        </Button>
        {onEnviar && r && faltando.length > 0 && (
          <Button size="sm" onClick={() => onEnviar(faltando)} disabled={desabilitado || carregando} title="Emite e anexa só os arquivos que não estão no protocolo">
            <IconPlay className="h-4 w-4" />
            Enviar os que faltam ({faltando.length})
          </Button>
        )}
      </div>
      {erro && (
        <div role="alert" className="flex items-start gap-2 rounded-control border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-2 text-xs text-text">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <p className="min-w-0 break-words">{erro}</p>
        </div>
      )}
      {r && linhas && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatMini label="Arquivos" value={r.arquivos} />
            <StatMini label="Anexados" value={r.anexados} tone="ok" />
            <StatMini label="Faltando" value={r.faltam + r.ausentes} tone={r.faltam + r.ausentes ? "warn" : "default"} hint={r.dfdsFaltando ? `${r.dfdsFaltando} DFD(s)` : undefined} />
            <StatMini label="Registrados, ausentes" value={r.ausentes} tone={r.ausentes ? "danger" : "default"} hint={r.semProtocolo ? `${r.semProtocolo} sem protocolo` : undefined} />
          </div>
          <DataTable columns={COLUNAS} rows={linhas} getKey={(l) => l.nome} density="compact" exportar={{ nome: "Conferência no protocolo" }} vazio="Nenhum arquivo no plano." />
        </>
      )}
    </div>
  );
}
