"use client";

import { useEffect, useMemo, useState } from "react";
import { brl, dataHoraBR, num } from "@/lib/format";
import { type ExcluidoAntigo, type ItemExcluido, type MotivoExclusao, ROTULO_MOTIVO_EXCLUSAO, type RetratoProtocolo } from "@/lib/mesa-excluidos-core";
import { Badge } from "./Badge";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { type DfdVisual, DfdView } from "./DfdView";
import { IconTrash } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { SkeletonLinhas } from "./Skeleton";

type Tipo = "protocolo" | "dfd" | "item";
type Linha = {
  /** A chave da linha: o id da lixeira, ou `a<id da auditoria>` na exclusão antiga. */
  chave: string;
  id: number;
  /** Exclusão ANTERIOR à lixeira (do histórico): sem retrato. */
  antigo?: ExcluidoAntigo;
  tipo: Tipo;
  numero: string | null;
  planejamento: string | null;
  protocoloNumero: string | null;
  reparticaoId: number | null;
  valor: number | null;
  motivo: string;
  excluidoNome: string | null;
  excluidoEm: string | null;
};
type DfdCascata = Linha & { sigla: string | null; tipoDfd: string | null; totalItens: number };
type Detalhe = {
  excluido: Linha;
  sigla: string | null;
  dfd: DfdVisual | null;
  protocolo: RetratoProtocolo | null;
  item: { item: ItemExcluido; dfdNumero: string | null; dfdTipo: string | null } | null;
  dfds: DfdCascata[];
};

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "protocolo", label: "Protocolos" },
  { value: "dfd", label: "DFDs" },
  { value: "item", label: "Itens" },
];
const motivo = (m: string) => ROTULO_MOTIVO_EXCLUSAO[m as MotivoExclusao] ?? m;

/**
 * LIXEIRA DA MESA — o botão (lixeira, na barra da Mesa do sistema e da Mesa do PCA) que abre os protocolos, DFDs e itens
 * EXCLUÍDOS daquela Mesa, com o retrato guardado no momento da exclusão. Só leitura: tocar numa linha mostra o que era.
 */
export function ExcluidosMesa({ pcaId, siglas }: { pcaId: number | null; siglas: Map<number, string> }) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("protocolo");
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [atual, setAtual] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [erroDet, setErroDet] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setLinhas(null);
    setFalha(null);
    const q = new URLSearchParams({ tipo });
    if (pcaId) q.set("pca", String(pcaId));
    fetch(`/api/mesa/excluidos?${q}`)
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string } & Record<string, unknown>>)
      .then((j) => {
        if (!vivo) return;
        if (!j.ok) return setFalha(j.error ?? "Falha ao carregar.");
        const novos = (j.excluidos as Linha[]).map((l) => ({ ...l, chave: String(l.id) }));
        const antigos = ((j.antigos ?? []) as (ExcluidoAntigo & { reparticaoId: number | null; protocoloNumero: string | null })[]).map(
          (a): Linha => ({
            chave: a.chave,
            id: 0,
            antigo: a,
            tipo: a.tipo,
            numero: a.numero,
            planejamento: a.planejamento,
            protocoloNumero: a.protocoloNumero,
            reparticaoId: a.reparticaoId,
            valor: a.valor,
            motivo: a.motivo,
            excluidoNome: a.excluidoNome,
            excluidoEm: a.excluidoEm,
          }),
        );
        setLinhas([...novos, ...antigos]);
      })
      .catch(() => vivo && setFalha("Sem conexão."));
    return () => {
      vivo = false;
    };
  }, [aberto, tipo, pcaId]);

  const linhaAtual = atual == null ? null : (linhas?.find((l) => l.chave === atual) ?? null);

  useEffect(() => {
    setDetalhe(null);
    setErroDet(null);
    if (atual == null || atual.startsWith("a")) return;
    let vivo = true;
    fetch(`/api/mesa/excluidos/${atual}`)
      .then((r) => r.json() as Promise<{ ok: boolean; error?: string } & Record<string, unknown>>)
      .then((j) => {
        if (!vivo) return;
        if (j.ok) setDetalhe(j as unknown as Detalhe);
        else setErroDet(j.error ?? "Falha ao carregar.");
      })
      .catch(() => vivo && setErroDet("Sem conexão."));
    return () => {
      vivo = false;
    };
  }, [atual]);

  const colunas = useMemo<Column<Linha>[]>(() => {
    const sigla = (l: Linha) => (l.reparticaoId != null ? (siglas.get(l.reparticaoId) ?? "—") : "—");
    const base: Column<Linha>[] = [
      { key: "numero", header: tipo === "protocolo" ? "Protocolo" : tipo === "dfd" ? "Nº DFD" : "Item", nowrap: true, value: (l) => l.numero ?? "—", render: (l) => l.numero ?? "—" },
    ];
    if (tipo !== "protocolo") base.push({ key: "planejamento", header: "Nº Plan.", nowrap: true, value: (l) => l.planejamento ?? "—", render: (l) => l.planejamento ?? "—" });
    if (tipo !== "protocolo") base.push({ key: "protocolo", header: "Protocolo", nowrap: true, value: (l) => l.protocoloNumero ?? "—", render: (l) => l.protocoloNumero ?? "—" });
    base.push(
      { key: "sigla", header: "Sigla", nowrap: true, value: sigla, render: sigla },
      { key: "valor", header: "Valor", align: "right", nowrap: true, filter: "range", numero: (l) => l.valor, value: (l) => String(l.valor ?? ""), render: (l) => brl(l.valor) },
      { key: "em", header: "Excluído em", nowrap: true, filter: "date", value: (l) => l.excluidoEm ?? "", render: (l) => dataHoraBR(l.excluidoEm), total: false },
      { key: "por", header: "Por", nowrap: true, value: (l) => l.excluidoNome ?? "—", render: (l) => l.excluidoNome ?? "—" },
      { key: "motivo", header: "Motivo", nowrap: true, value: (l) => motivo(l.motivo), render: (l) => motivo(l.motivo) },
      {
        key: "registro",
        header: "Registro",
        nowrap: true,
        value: (l) => (l.antigo ? "Sem retrato" : "Completo"),
        render: (l) => (l.antigo ? <Badge tone="amber" title="Excluído antes da lixeira: só o que o histórico guardou">Sem retrato</Badge> : <Badge tone="emerald">Completo</Badge>),
      },
    );
    return base;
  }, [tipo, siglas]);

  const titulo = linhaAtual?.antigo
    ? `${TIPOS.find((t) => t.value === linhaAtual.tipo)?.label.slice(0, -1) ?? ""} ${linhaAtual.numero ?? ""} — excluído`
    : detalhe ? `${TIPOS.find((t) => t.value === detalhe.excluido.tipo)?.label.slice(0, -1) ?? ""} ${detalhe.excluido.numero ?? ""} — excluído` : "Excluído";

  return (
    <>
      <button
        type="button"
        aria-label="Excluídos desta Mesa"
        title="Excluídos: ver os protocolos, DFDs e itens excluídos desta Mesa"
        onClick={() => setAberto(true)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border-2 bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
      >
        <IconTrash className="h-4 w-4" />
      </button>
      <Modal
        open={aberto}
        onClose={() => {
          setAberto(false);
          setAtual(null);
        }}
        titulo={pcaId ? "Excluídos da Mesa do PCA" : "Excluídos da Mesa do sistema"}
        size="full"
        lateral={{
          aberto: atual != null,
          titulo,
          onClose: () => setAtual(null),
          children: linhaAtual?.antigo ? <DetalheAntigo a={linhaAtual.antigo} linha={linhaAtual} /> : <DetalheExcluido detalhe={detalhe} erro={erroDet} />,
        }}
      >
        <div className="space-y-[var(--gap-block)]">
          <Segmented ariaLabel="Tipo de excluído" value={tipo} options={TIPOS} onChange={(v) => { setTipo(v); setAtual(null); }} />
          {falha ? (
            <Callout kind="danger">{falha}</Callout>
          ) : !linhas ? (
            <SkeletonLinhas linhas={6} />
          ) : (
            <DataTable
              columns={colunas}
              rows={linhas}
              getKey={(l) => l.chave}
              density="compact"
              onRowClick={(l) => setAtual(l.chave)}
              activeKey={atual}
              exportar={{ nome: "Excluídos" }}
              vazio="Nada excluído nesta Mesa."
              resumo={(ls) => `${num(ls.length)} excluído(s) · ${brl(ls.reduce((s, l) => s + (l.valor ?? 0), 0))}`}
            />
          )}
        </div>
      </Modal>
    </>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted">{rotulo}</div>
      <div className="text-sm text-text break-words">{valor || "—"}</div>
    </div>
  );
}

function DetalheExcluido({ detalhe, erro }: { detalhe: Detalhe | null; erro: string | null }) {
  if (erro) return <Callout kind="danger">{erro}</Callout>;
  if (!detalhe) return <SkeletonLinhas linhas={8} />;
  const e = detalhe.excluido;
  const topo = (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="red" dot>Excluído</Badge>
      <span className="text-sm text-muted">
        {dataHoraBR(e.excluidoEm)} · {e.excluidoNome ?? "—"} · {motivo(e.motivo)}
      </span>
    </div>
  );
  if (detalhe.dfd)
    return (
      <div className="space-y-[var(--gap-block)]">
        {topo}
        <DfdView dfd={detalhe.dfd} consulta unica />
      </div>
    );
  if (detalhe.protocolo) {
    const p = detalhe.protocolo;
    return (
      <div className="space-y-[var(--gap-block)]">
        {topo}
        <div className="grid grid-cols-2 gap-3 rounded-card border border-border p-[var(--pad-card)]">
          <Campo rotulo="Número" valor={p.numero} />
          <Campo rotulo="Id" valor={p.idExterno} />
          <Campo rotulo="Data" valor={p.data} />
          <Campo rotulo="Ano do PCA" valor={p.anoPca ? String(p.anoPca) : null} />
          <Campo rotulo="Interessado" valor={p.interessado} />
          <Campo rotulo="Assunto" valor={p.assunto} />
          <Campo rotulo="Valor da capa" valor={p.valorCapa != null ? brl(p.valorCapa) : null} />
          <Campo rotulo="DFDs" valor={num(p.dfds)} />
          <div className="col-span-2">
            <Campo rotulo="Observação" valor={p.observacao} />
          </div>
        </div>
        <div className="text-sm font-semibold text-text">DFDs excluídos junto</div>
        <DataTable
          columns={[
            { key: "numero", header: "Nº DFD", nowrap: true, value: (d) => d.numero ?? "—", render: (d) => d.numero ?? "—" },
            { key: "plan", header: "Nº Plan.", nowrap: true, value: (d) => d.planejamento ?? "—", render: (d) => d.planejamento ?? "—" },
            { key: "sigla", header: "Sigla", nowrap: true, value: (d) => d.sigla ?? "—", render: (d) => d.sigla ?? "—" },
            { key: "tipo", header: "Tipo", nowrap: true, value: (d) => d.tipoDfd ?? "—", render: (d) => d.tipoDfd ?? "—" },
            { key: "itens", header: "Itens", nowrap: true, value: (d) => String(d.totalItens), render: (d) => num(d.totalItens) },
            { key: "valor", header: "Valor", align: "right", nowrap: true, numero: (d) => d.valor, value: (d) => String(d.valor ?? ""), render: (d) => brl(d.valor) },
          ]}
          rows={detalhe.dfds}
          getKey={(d) => d.id}
          density="compact"
          minWidth={480}
          exportar={false}
          vazio="Nenhum DFD guardado com este protocolo."
        />
      </div>
    );
  }
  if (detalhe.item) {
    const { item: it, dfdNumero, dfdTipo } = detalhe.item;
    return (
      <div className="space-y-[var(--gap-block)]">
        {topo}
        <div className="grid grid-cols-2 gap-3 rounded-card border border-border p-[var(--pad-card)]">
          <Campo rotulo="DFD" valor={dfdNumero ? `${dfdNumero}${e.planejamento ? ` (Planej. ${e.planejamento})` : ""}` : null} />
          <Campo rotulo="Tipo do DFD" valor={dfdTipo} />
          <Campo rotulo="Item" valor={it.item != null ? String(it.item) : null} />
          <Campo rotulo="Código" valor={it.codigo} />
          <div className="col-span-2">
            <Campo rotulo="Descrição" valor={it.descricao} />
          </div>
          <Campo rotulo="Unidade" valor={it.unidade} />
          <Campo rotulo="Quantidade" valor={it.quantidade != null ? num(it.quantidade) : null} />
          <Campo rotulo="Valor unitário" valor={it.valorUnitario != null ? brl(it.valorUnitario) : null} />
          <Campo rotulo="Valor total" valor={it.valorTotal != null ? brl(it.valorTotal) : null} />
          <Campo rotulo="Seq. PCA" valor={it.pcaSequencial != null ? String(it.pcaSequencial) : null} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-[var(--gap-block)]">
      {topo}
      <Callout kind="warn">O retrato desta exclusão não pôde ser lido.</Callout>
    </div>
  );
}

/** O banner de uma exclusão ANTERIOR à lixeira: só o que o histórico registrou. */
function DetalheAntigo({ a, linha }: { a: ExcluidoAntigo; linha: Linha }) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="red" dot>Excluído</Badge>
        <Badge tone="amber">Sem retrato</Badge>
        <span className="text-sm text-muted">
          {dataHoraBR(a.excluidoEm)} · {a.excluidoNome ?? "—"} · {motivo(a.motivo)}
        </span>
      </div>
      <Callout kind="warn">Excluído antes de a lixeira existir: o sistema só tem o que o histórico de alterações registrou.</Callout>
      <div className="grid grid-cols-2 gap-3 rounded-card border border-border p-[var(--pad-card)]">
        <Campo rotulo={a.tipo === "protocolo" ? "Protocolo" : a.tipo === "dfd" ? "Nº DFD" : "Item"} valor={a.numero} />
        {a.tipo !== "protocolo" && <Campo rotulo="Nº Plan." valor={a.planejamento} />}
        {a.tipo !== "protocolo" && <Campo rotulo="Protocolo" valor={linha.protocoloNumero} />}
        {a.valor != null && <Campo rotulo="Valor" valor={brl(a.valor)} />}
        {a.item && <Campo rotulo="Código" valor={a.item.codigo} />}
        {a.item && (
          <div className="col-span-2">
            <Campo rotulo="Descrição" valor={a.item.descricao} />
          </div>
        )}
        {a.item?.campos.map((c) => <Campo key={c.rotulo} rotulo={c.rotulo} valor={c.antes} />)}
        <div className="col-span-2">
          <Campo rotulo="Registro no histórico" valor={a.resumo} />
        </div>
      </div>
    </div>
  );
}
