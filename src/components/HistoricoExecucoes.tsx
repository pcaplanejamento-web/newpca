"use client";

import { useCallback, useEffect, useState } from "react";
import { type EstadoExecucao, receitaPorId } from "@/lib/automacao-core";
import { dataHoraBR } from "@/lib/format";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { ErroCarga } from "./ErroCarga";
import { type Column, DataTable } from "./DataTable";
import { Modal } from "./Modal";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

// O HISTÓRICO das execuções da Automação (contêiner com dados — fora do catálogo, como os demais contêineres): cada
// execução de receita com quem, quando, o estado e os passos; a que ficou rodando/pausada pode ser cancelada.

type Execucao = {
  id: number;
  receita: string;
  usuarioNome: string | null;
  estado: string;
  ensaio: number | boolean;
  total: number;
  feitos: number;
  falhas: number;
  erro: string | null;
  criadoEm: string | null;
  atualizadoEm: string | null;
};
type Passo = { ordem: number; chave: string; capacidade: string; alvo: string | null; estado: string; resultado: string | null; erro: string | null };

const TOM: Record<string, Tone> = {
  preparada: "slate",
  rodando: "blue",
  pausada: "amber",
  concluida: "emerald",
  falhou: "red",
  cancelada: "slate",
  fila: "slate",
  executando: "blue",
  ok: "emerald",
  pulado: "amber",
};
const ROTULO: Record<string, string> = {
  preparada: "Preparada",
  rodando: "Rodando",
  pausada: "Pausada",
  concluida: "Concluída",
  falhou: "Falhou",
  cancelada: "Cancelada",
  fila: "Na fila",
  executando: "Executando",
  ok: "Feito",
  pulado: "Pulado",
};
const selo = (e: string) => (
  <Badge tone={TOM[e] ?? "slate"} dot>
    {ROTULO[e] ?? e}
  </Badge>
);
/** O alvo canônico "anexar|Id|nº|ano|DESCRIÇÃO" em texto legível. */
function textoAlvo(a: string | null): string {
  if (!a) return "—";
  const [, id, numero, ano, descricao] = a.split("|");
  return descricao ? `${descricao} → protocolo ${numero}${ano ? `/${ano}` : ""} (Id ${id})` : a;
}

const COLUNAS: Column<Execucao>[] = [
  { key: "id", header: "Nº", nowrap: true, value: (e) => String(e.id), render: (e) => <span className="tabular-nums">{e.id}</span> },
  { key: "estado", header: "Estado", nowrap: true, value: (e) => ROTULO[e.estado] ?? e.estado, render: (e) => selo(e.estado) },
  {
    key: "receita",
    header: "Receita",
    value: (e) => receitaPorId(e.receita)?.nome ?? e.receita,
    render: (e) => (
      <span>
        {receitaPorId(e.receita)?.nome ?? e.receita}
        {e.ensaio ? <span className="ml-1 text-muted">(ensaio)</span> : null}
      </span>
    ),
  },
  {
    key: "passos",
    header: "Passos",
    nowrap: true,
    value: (e) => String(e.total),
    render: (e) => (
      <span className="tabular-nums">
        {e.feitos}/{e.total}
        {e.falhas ? <span className="ml-1 text-[var(--danger)]">· {e.falhas} falha(s)</span> : null}
      </span>
    ),
  },
  { key: "quem", header: "Quem", value: (e) => e.usuarioNome ?? "—", render: (e) => <span>{e.usuarioNome ?? "—"}</span> },
  { key: "quando", header: "Quando", nowrap: true, value: (e) => e.criadoEm ?? "", render: (e) => <span className="tabular-nums">{dataHoraBR(e.criadoEm)}</span> },
];

const COLUNAS_PASSO: Column<Passo>[] = [
  { key: "ordem", header: "#", nowrap: true, value: (p) => String(p.ordem), render: (p) => <span className="tabular-nums">{p.ordem}</span> },
  { key: "estado", header: "Estado", nowrap: true, value: (p) => ROTULO[p.estado] ?? p.estado, render: (p) => selo(p.estado) },
  { key: "alvo", header: "Alvo", align: "left", value: (p) => textoAlvo(p.alvo), render: (p) => <span className="text-sm">{textoAlvo(p.alvo)}</span> },
  {
    key: "resultado",
    header: "Resultado",
    align: "left",
    value: (p) => p.erro ?? p.resultado ?? "",
    render: (p) => <span className={`text-sm ${p.erro ? "text-[var(--danger)]" : "text-muted"}`}>{p.erro ?? p.resultado ?? "—"}</span>,
  },
];

export function HistoricoExecucoes({ onFechar }: { onFechar: () => void }) {
  const [lista, setLista] = useState<Execucao[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [passos, setPassos] = useState<Passo[] | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const carregar = useCallback(async () => {
    setFalha(null);
    try {
      const r = await fetch("/api/admin/automacao/execucoes");
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; execucoes?: Execucao[] } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Falha ao carregar o histórico.");
      setLista(j.execucoes ?? []);
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Falha ao carregar o histórico.");
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrir = useCallback(async (id: number) => {
    setAberta(id);
    setPassos(null);
    try {
      const r = await fetch(`/api/admin/automacao/execucoes/${id}`);
      const j = (await r.json().catch(() => null)) as { ok?: boolean; passos?: Passo[] } | null;
      setPassos(r.ok && j?.ok ? (j.passos ?? []) : []);
    } catch {
      setPassos([]);
    }
  }, []);

  const execucao = lista?.find((e) => e.id === aberta) ?? null;
  const podeCancelar = execucao && (["rodando", "pausada", "preparada"] as EstadoExecucao[]).includes(execucao.estado as EstadoExecucao);
  async function cancelar() {
    if (!execucao) return;
    setCancelando(true);
    try {
      const r = await fetch(`/api/admin/automacao/execucoes/${execucao.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ estado: "cancelada" }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Falha ao cancelar.");
      toast.success(`Execução ${execucao.id} cancelada — os passos que faltavam não rodam mais.`);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao cancelar.");
    } finally {
      setCancelando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onFechar}
      titulo="Histórico das execuções"
      size="full"
      lateral={{
        aberto: aberta != null,
        titulo: execucao ? `Execução ${execucao.id}` : "Execução",
        onClose: () => setAberta(null),
        rodape: podeCancelar ? (
          <Button size="sm" variant="danger" onClick={cancelar} loading={cancelando}>
            Cancelar execução
          </Button>
        ) : undefined,
        children: execucao ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {selo(execucao.estado)}
              <span>{receitaPorId(execucao.receita)?.nome ?? execucao.receita}</span>
              <span>· {execucao.usuarioNome ?? "—"}</span>
              <span>· {dataHoraBR(execucao.criadoEm)}</span>
            </div>
            {execucao.erro && <p className="text-sm text-[var(--danger)]">{execucao.erro}</p>}
            {passos ? (
              <DataTable columns={COLUNAS_PASSO} rows={passos} getKey={(p) => p.chave} density="compact" vazio="Sem passos." />
            ) : (
              <SkeletonLinhas linhas={4} />
            )}
          </div>
        ) : null,
      }}
    >
      {falha ? (
        <ErroCarga msg={falha} onTentar={carregar} />
      ) : lista ? (
        <DataTable
          columns={COLUNAS}
          rows={lista}
          getKey={(e) => e.id}
          onRowClick={(e) => void abrir(e.id)}
          activeKey={aberta}
          density="compact"
          vazio="Nenhuma execução ainda."
        />
      ) : (
        <SkeletonLinhas linhas={6} />
      )}
    </Modal>
  );
}
