"use client";

import { useEffect, useMemo, useState } from "react";
import { brl, dataHoraBR, num } from "@/lib/format";
import type { ConciliacaoCapa } from "@/lib/dfd-tratamento";
import { type ExcluidoAntigo, type MotivoExclusao, ROTULO_MOTIVO_EXCLUSAO, type RetratoItem, type RetratoProtocolo } from "@/lib/mesa-excluidos-core";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { CampoCongelado } from "./CampoCadeado";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { DfdCabecalho, type DfdVisual, DfdView, ItemCabecalho } from "./DfdView";
import { ItemDetalhe } from "./ItemDetalhe";
import { IconTrash } from "./icons";
import { Modal } from "./Modal";
import { ProtocoloCabecalho, ProtocoloView } from "./ProtocoloView";
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
  item: RetratoItem | null;
  /** Extras do retrato do DFD (o que o `DfdView` não mostra). */
  dfdExtra: Record<string, string | null> | null;
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
  const [itemIdx, setItemIdx] = useState<number | null>(null);

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
    setItemIdx(null);
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
        render: (l) => (l.antigo ? <Badge tone="amber" title="Sem retrato: excluído antes de a lixeira existir — não há cópia, só o que o histórico de alterações anotou">Sem retrato</Badge> : <Badge tone="emerald" title="Completo: a cópia inteira foi guardada no momento da exclusão">Completo</Badge>),
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
        paineis={[
          {
            id: "excluido",
            aberto: atual != null,
            largura: 52,
            titulo,
            cabecalho: cabecalhoDetalhe(detalhe, linhaAtual),
            acoesCabecalho: <AjudaRegistro />,
            onClose: () => setAtual(null),
            children: linhaAtual?.antigo ? (
              <DetalheAntigo a={linhaAtual.antigo} linha={linhaAtual} />
            ) : (
              <DetalheExcluido detalhe={detalhe} erro={erroDet} itemAtivo={itemIdx} onItem={setItemIdx} onDfd={(id) => setAtual(String(id))} />
            ),
          },
          {
            id: "item",
            aberto: itemIdx != null && detalhe?.dfd != null,
            largura: 34,
            titulo: "Item",
            cabecalho:
              itemIdx != null && detalhe?.dfd ? (
                <ItemCabecalho item={detalhe.dfd.itens[itemIdx]?.item} numero={detalhe.dfd.numero} tipo={detalhe.dfd.tipo} planejamento={detalhe.dfd.planejamento} />
              ) : undefined,
            onClose: () => setItemIdx(null),
            children: itemIdx != null && detalhe?.dfd?.itens[itemIdx] ? <ItemDetalhe item={detalhe.dfd.itens[itemIdx]} consulta={{}} /> : null,
          },
        ]}
      >
        <div className="space-y-[var(--gap-block)]">
          <div className="flex items-center gap-2">
            <Segmented ariaLabel="Tipo de excluído" value={tipo} options={TIPOS} onChange={(v) => { setTipo(v); setAtual(null); }} />
            <AjudaLixeira />
          </div>
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


const SEM_CONCILIACAO: ConciliacaoCapa = { ativa: false, divergente: false, zerada: false, bloqueia: false, somatorio: 0, motivo: null };
const dataOuNull = (v: string | null | undefined) => (v ? dataHoraBR(v) : null);

/** O (?) da lixeira: o que é, o que aparece, os motivos e o registro. */
function AjudaLixeira() {
  return (
    <Ajuda titulo="Excluídos da Mesa" botao="sm">
      <p>Aqui ficam os <b>protocolos</b>, <b>DFDs</b> e <b>itens</b> que saíram desta Mesa, separados pelas abas. Só leitura: nada se edita por aqui.</p>
      <p><b>Registro “Completo”:</b> no momento da exclusão o sistema guardou uma cópia inteira (o retrato) — capa, DFDs, seções, assinaturas e itens, como estavam. Tocar na linha abre os MESMOS banners da Mesa.</p>
      <p><b>Registro “Sem retrato”:</b> a exclusão aconteceu antes de a lixeira existir. Não há cópia; o sistema mostra só o que o histórico de alterações anotou (nº, planejamento, valor, código e descrição do item, quem e quando).</p>
      <p><b>Motivos:</b> Exclusão (alguém excluiu) · Com o protocolo (DFD apagado junto com o protocolo) · Fora do reenvio (o DFD não veio no reenvio e foi excluído) · Remoção em massa · Removido na edição (saiu ao salvar o DFD) · Saiu na sobrescrita (o item não veio no DFD novo).</p>
      <p>Você vê só o que é das unidades a que tem acesso. Cada registro fica guardado por 180 dias.</p>
    </Ajuda>
  );
}

/** O (?) do banner: o que é o registro mostrado. */
function AjudaRegistro() {
  return (
    <Ajuda titulo="Registro da exclusão" botao="sm">
      <p>O banner mostra o protocolo, DFD ou item <b>exatamente como estava</b> no momento em que foi excluído, com os mesmos componentes da Mesa (somente consulta).</p>
      <p>No protocolo, toque num DFD da tabela para abrir o DFD excluído junto. No DFD, toque num item para ver o item ao lado.</p>
      <p>“Dados do registro” traz o que não aparece no formulário: quem criou, quando, arquivo de origem, PCA, situação, responsável e a conferência com a Centi.</p>
    </Ajuda>
  );
}

function cabecalhoDetalhe(d: Detalhe | null, l: Linha | null) {
  if (l?.antigo || !d) return undefined;
  if (d.protocolo) return <ProtocoloCabecalho numero={d.protocolo.numero} idExterno={d.protocolo.idExterno} assunto={d.protocolo.assunto} />;
  if (d.dfd) return <DfdCabecalho numero={d.dfd.numero} tipo={d.dfd.tipo} planejamento={d.dfd.planejamento} />;
  if (d.item) return <ItemCabecalho item={d.item.item.item} numero={d.item.dfdNumero ?? "—"} tipo={d.item.dfdTipo} planejamento={d.item.dfdPlanejamento} />;
  return undefined;
}

/** "Dados do registro": o que o formulário não mostra (grade de campos congelados). */
function DadosRegistro({ campos }: { campos: [string, string | null | undefined][] }) {
  const vis = campos.filter(([, v]) => v != null && v !== "");
  if (!vis.length) return null;
  return (
    <section className="space-y-2 rounded-card border border-border p-[var(--pad-card)]">
      <h3 className="text-sm font-semibold text-text">Dados do registro</h3>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {vis.map(([r, v]) => (
          <CampoCongelado key={r} label={r} valor={v ?? null} />
        ))}
      </div>
    </section>
  );
}

function TopoExclusao({ e, extra }: { e: Linha; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="red" dot>Excluído</Badge>
      {extra}
      <span className="text-sm text-muted">
        {dataHoraBR(e.excluidoEm)} · {e.excluidoNome ?? "—"} · {motivo(e.motivo)}
      </span>
    </div>
  );
}

function DetalheExcluido({
  detalhe,
  erro,
  itemAtivo,
  onItem,
  onDfd,
}: {
  detalhe: Detalhe | null;
  erro: string | null;
  itemAtivo: number | null;
  onItem: (i: number) => void;
  onDfd: (id: number) => void;
}) {
  if (erro) return <Callout kind="danger">{erro}</Callout>;
  if (!detalhe) return <SkeletonLinhas linhas={8} />;
  const e = detalhe.excluido;
  const topo = <TopoExclusao e={e} />;
  if (detalhe.dfd) {
    const x = detalhe.dfdExtra ?? {};
    return (
      <div className="space-y-[var(--gap-block)]">
        {topo}
        <DfdView dfd={detalhe.dfd} consulta unica onItemClick={onItem} itemAtivo={itemAtivo} />
        <DadosRegistro
          campos={[
            ["Protocolo", x.protocoloNumero ?? e.protocoloNumero],
            ["Órgão", x.orgaoNome],
            ["Sigla do setor (no documento)", x.siglaSetor],
            ["Arquivo de origem", x.nomeArquivo],
            ["Importado em", dataOuNull(x.criadoEm)],
            ["Importado por", x.criadoPorNome],
            ["Última alteração", dataOuNull(x.atualizadoEm)],
            ["Situação na Centi (CM002)", x.execucaoCenti],
            ["Conferência com a Centi", x.conferenciaCenti ? `${x.conferenciaCenti}${x.conferenciaCentiMotivo ? ` — ${x.conferenciaCentiMotivo}` : ""}` : null],
          ]}
        />
      </div>
    );
  }
  if (detalhe.protocolo) {
    const p = detalhe.protocolo;
    const somatorio = p.valorDfds ?? detalhe.dfds.reduce((s, d) => s + (d.valor ?? 0), 0);
    return (
      <div className="space-y-[var(--gap-block)]">
        {topo}
        <ProtocoloView
          modoCapa="consulta"
          capa={{
            numero: p.numero,
            idExterno: p.idExterno,
            data: p.data ?? "",
            documento: p.documento ?? "",
            interessado: p.interessado ?? "",
            assunto: p.assunto ?? "",
            observacao: p.observacao ?? "",
            valorCapa: p.valorCapa,
            localReparticao: p.localReparticao,
          }}
          unidade={{ id: null, opcoes: [], textoLeitura: detalhe.sigla ?? "Sem unidade" }}
          pca={<CampoCongelado label="PCA (ano)" valor={p.anoPca != null ? String(p.anoPca) : null} />}
          totais={{ dfds: p.dfds, itens: p.itens ?? detalhe.dfds.reduce((s, d) => s + d.totalItens, 0), somatorio }}
          conciliacao={SEM_CONCILIACAO}
          linhas={detalhe.dfds.map((d) => ({
            key: d.id,
            numero: d.numero ?? "—",
            planejamento: d.planejamento,
            sigla: d.sigla ?? "—",
            tipo: d.tipoDfd,
            itens: d.totalItens,
            valor: d.valor ?? 0,
            estado: "regular",
          }))}
          unica
          onVerDfd={(k) => onDfd(Number(k))}
        />
        {detalhe.dfds.length < p.dfds && (
          <Callout kind="warn">
            O protocolo tinha {num(p.dfds)} DFD(s); {num(detalhe.dfds.length)} estão aqui. Os demais são de unidades a que você não tem acesso.
          </Callout>
        )}
        <DadosRegistro
          campos={[
            ["Órgão (interessado)", p.orgaoNome],
            ["Situação", p.situacao],
            ["Responsável", p.responsavelNome],
            ["PCA", p.pcaNome],
            ["Enviado ao PCA em", dataOuNull(p.pcaEnviadoEm)],
            ["Incorporado ao PCA em", dataOuNull(p.pcaIncorporadoEm)],
            ["Arquivo de origem", p.nomeArquivo],
            ["Protocolado em", dataOuNull(p.criadoEm)],
            ["Protocolado por", p.criadoPorNome],
            ["Última alteração", dataOuNull(p.atualizadoEm)],
          ]}
        />
      </div>
    );
  }
  if (detalhe.item) {
    const r = detalhe.item;
    const it = r.item;
    return (
      <div className="space-y-[var(--gap-block)]">
        {topo}
        <ItemDetalhe
          item={{ item: it.item, codigo: it.codigo, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade, valorUnitario: it.valorUnitario, valorTotal: it.valorTotal, dominio: it.dominio }}
          consulta={{}}
        />
        <DadosRegistro
          campos={[
            ["DFD", r.dfdNumero ? `${r.dfdNumero}${r.dfdPlanejamento ? ` (Planej. ${r.dfdPlanejamento})` : ""}` : null],
            ["Objeto do DFD", r.dfdObjeto],
            ["Protocolo", r.protocoloNumero ?? e.protocoloNumero],
            ["Sigla", detalhe.sigla ?? r.dfdSigla],
            ["Ano do PCA", r.dfdAnoPca != null ? String(r.dfdAnoPca) : null],
            ["Classificação", it.classificacao],
            ["Seq. no PCA", it.pcaSequencial != null ? String(it.pcaSequencial) : null],
          ]}
        />
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
  const tipo = a.tipo === "protocolo" ? "Protocolo" : a.tipo === "dfd" ? "Nº DFD" : "Item";
  return (
    <div className="space-y-[var(--gap-block)]">
      <TopoExclusao e={linha} extra={<Badge tone="amber">Sem retrato</Badge>} />
      <Callout kind="warn">
        Excluído antes de a lixeira existir: não há cópia guardada. Aparece só o que o histórico de alterações anotou na hora da exclusão.
      </Callout>
      <section className="rounded-card border border-border p-[var(--pad-card)]">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <CampoCongelado label={tipo} valor={a.numero} />
          {a.tipo !== "protocolo" && <CampoCongelado label="Nº Plan." valor={a.planejamento} />}
          {a.tipo !== "protocolo" && <CampoCongelado label="Protocolo" valor={linha.protocoloNumero} />}
          {a.valor != null && <CampoCongelado label="Valor" valor={brl(a.valor)} />}
          {a.item && <CampoCongelado label="Código" valor={a.item.codigo} mono />}
          {a.item && <CampoCongelado label="Descrição" valor={a.item.descricao} span />}
          {a.item?.campos.map((c) => <CampoCongelado key={c.rotulo} label={c.rotulo} valor={c.antes} />)}
          <CampoCongelado label="Registro no histórico" valor={a.resumo} span />
        </div>
      </section>
    </div>
  );
}
