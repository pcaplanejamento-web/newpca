"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { brl, dataBR } from "@/lib/format";
import { enviarOrcamentoEmLotes } from "@/lib/importar-orcamento";
import type { OrcamentoItemRow, OrcamentoResumo } from "@/lib/orcamento";
import { type AlvoVinculo, alvoDoTexto, chaveVinculo, linhasVinculo, mapaVinculos, type VinculoOrcamento } from "@/lib/orcamento-vinculo";
import type { OrcamentoItemParseado } from "@/lib/parse-orcamento-comum";
import { parseOrcamentoXlsx } from "@/lib/parse-orcamento-xlsx";
import { exportarOrcamentoPdf, exportarOrcamentoXlsx } from "@/lib/exportar-orcamento";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { Dropzone } from "./Dropzone";
import { SearchField, TextField } from "./Field";
import { IconAlert, IconDownload, IconInbox, IconPlus, IconTrash, IconUpload, IconWallet } from "./icons";
import { Modal } from "./Modal";
import { OrcamentoItemDetalhe } from "./OrcamentoItemDetalhe";
import { type VinculoAlterado, OrcamentoVinculos } from "./OrcamentoVinculos";
import { OrcamentoVisoes } from "./OrcamentoVisoes";
import { Progress } from "./Progress";
import { Segmented } from "./Segmented";

type Vista = "orcamentos" | "lancamentos" | "vinculos" | "visoes";
type Preview = { itens: OrcamentoItemParseado[]; total: number };

const ANO_ATUAL = new Date().getFullYear();
const SEM_PENDENTES: ReadonlyMap<string, VinculoAlterado> = new Map();
const soma = (linhas: { valorInicial: number; saldo: number }[], campo: "valorInicial" | "saldo") =>
  linhas.reduce((s, r) => s + (r[campo] || 0), 0);

/**
 * Módulo ORÇAMENTO (relatório CUBO). Três visões (Segmented, com transição suave):
 * **Orçamentos** (cards por arquivo importado — nome + ano + dotação), **Lançamentos**
 * (todos os lançamentos numa tabela única filtrável, com totais no rodapé) e **Vínculos**
 * (cada Órgão/Unidade do CUBO ligado ao órgão/unidade CADASTRADO — `OrcamentoVinculos`; o
 * vínculo aparece na coluna "No sistema" e no detalhe do lançamento). Importa `.xlsx`
 * (parse no cliente) informando o ANO; exporta XLSX/PDF; exclui. SOMENTE LEITURA — não edita
 * lançamento. Só editor importa/exclui; demais consultam. 100% design-system.
 */
export function OrcamentoView({
  orcamentos,
  itens,
  vinculos,
  alvos,
  podeEditar,
}: {
  orcamentos: OrcamentoResumo[];
  itens: OrcamentoItemRow[];
  vinculos: VinculoOrcamento[];
  alvos: { orgaos: AlvoVinculo[]; unidades: AlvoVinculo[] };
  podeEditar: boolean;
}) {
  const router = useRouter();
  const itensPorOrcamento = useMemo(() => {
    const m = new Map<number, OrcamentoItemRow[]>();
    for (const it of itens) {
      const a = m.get(it.orcamentoId) ?? [];
      a.push(it);
      m.set(it.orcamentoId, a);
    }
    return m;
  }, [itens]);
  const rotuloPorOrcamento = useMemo(
    () => new Map(orcamentos.map((o) => [o.id, `${o.nome} · ${o.ano}`])),
    [orcamentos],
  );

  const [vista, setVista] = useState<Vista>("orcamentos");
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const orcamentoAberto = orcamentos.find((o) => o.id === abertoId) ?? null;
  const itensAberto = abertoId != null ? (itensPorOrcamento.get(abertoId) ?? []) : [];

  // Importação
  const [launcher, setLauncher] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [nome, setNome] = useState("");
  const [ano, setAno] = useState(String(ANO_ATUAL));
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erroImport, setErroImport] = useState<string | null>(null);

  // Consulta
  const [busca, setBusca] = useState("");
  const [painelItem, setPainelItem] = useState<OrcamentoItemRow | null>(null);

  // Vínculos (Órgão/Unidade do CUBO → cadastro). Alterações aparecem na hora (otimista) e
  // valem só sobre a base em que foram feitas: quando a página recarrega os vínculos gravados
  // (nova base), as pendentes somem sozinhas.
  const [pend, setPend] = useState<{ base: VinculoOrcamento[]; m: Map<string, VinculoAlterado> }>(() => ({ base: vinculos, m: new Map() }));
  const pendentes = pend.base === vinculos ? pend.m : SEM_PENDENTES;
  const alterarPendentes = (fn: (m: Map<string, VinculoAlterado>) => void) =>
    setPend((p) => {
      const m = new Map(p.base === vinculos ? p.m : SEM_PENDENTES);
      fn(m);
      return { base: vinculos, m };
    });
  const [salvandoVinc, setSalvandoVinc] = useState(false);
  const [erroVinc, setErroVinc] = useState<string | null>(null);
  const vinculosEfetivos = useMemo(() => {
    if (pendentes.size === 0) return vinculos;
    const m = new Map(vinculos.map((v) => [`${v.tipo}|${v.chave}`, v]));
    for (const [k, p] of pendentes) m.set(k, { tipo: p.tipo, chave: k.slice(p.tipo.length + 1), texto: p.texto, alvoId: p.alvoId });
    return [...m.values()];
  }, [vinculos, pendentes]);
  const mapaVinc = useMemo(() => mapaVinculos(vinculosEfetivos), [vinculosEfetivos]);
  const alvoPorId = useMemo(
    () => ({ orgao: new Map(alvos.orgaos.map((o) => [o.id, o])), unidade: new Map(alvos.unidades.map((u) => [u.id, u])) }),
    [alvos],
  );
  const vinculoDe = (r: OrcamentoItemRow) => {
    const o = alvoPorId.orgao.get(alvoDoTexto(mapaVinc, "orgao", r.orgao) ?? -1);
    const u = alvoPorId.unidade.get(alvoDoTexto(mapaVinc, "unidade", r.unidade) ?? -1);
    return { orgao: o ? `${o.sigla} — ${o.nome}` : null, unidade: u ? `${u.sigla} — ${u.nome}` : null, siglas: [o?.sigla, u?.sigla].filter(Boolean).join(" / ") };
  };
  const linhasVinc = useMemo(
    () => (vista === "vinculos" ? linhasVinculo(itens, vinculosEfetivos, alvos) : []),
    [vista, itens, vinculosEfetivos, alvos],
  );

  async function salvarVinculos(lista: VinculoAlterado[]) {
    const chaves = lista.map((v) => `${v.tipo}|${chaveVinculo(v.texto)}`);
    setErroVinc(null);
    alterarPendentes((m) => {
      for (let i = 0; i < lista.length; i++) m.set(chaves[i], lista[i]);
    });
    setSalvandoVinc(true);
    try {
      for (let i = 0; i < lista.length; i += 200) {
        const resp = await fetch("/api/orcamento/vinculos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vinculos: lista.slice(i, i + 200) }),
        });
        const j = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!resp.ok || !j.ok) throw new Error(j.error ?? "Não foi possível gravar o vínculo.");
      }
      router.refresh();
    } catch (e) {
      setErroVinc(e instanceof Error ? e.message : "Não foi possível gravar o vínculo.");
      alterarPendentes((m) => {
        for (const k of chaves) m.delete(k);
      });
    } finally {
      setSalvandoVinc(false);
    }
  }

  function trocarVista(v: Vista) {
    setVista(v);
    setAbertoId(null);
    setPainelItem(null);
    setBusca("");
  }

  async function handleFile(file: File) {
    setLauncher(false);
    setErroImport(null);
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") {
      setErroImport("Formato não suportado. Envie a planilha .xlsx do orçamento (CUBO).");
      return;
    }
    try {
      const parsed = await parseOrcamentoXlsx(file);
      if (parsed.itens.length === 0) {
        setErroImport("Não encontrei os lançamentos (Órgão, Unidade, Elemento, valores) neste arquivo.");
        return;
      }
      setNome((parsed.nome ?? file.name.replace(/\.(xlsx|xls)$/i, "")).slice(0, 200));
      setAno(String(ANO_ATUAL));
      setPreview({ itens: parsed.itens, total: parsed.total });
    } catch (e) {
      setErroImport(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    }
  }

  const anoNum = ano.trim() ? Number(ano) : null;
  const anoValido = anoNum != null && Number.isInteger(anoNum) && anoNum >= 2000 && anoNum <= 2100;
  const podeImportar = preview != null && nome.trim().length > 0 && anoValido;

  async function importar() {
    if (!preview || !anoValido || !anoNum) return;
    setEnviando(true);
    setProgresso(0);
    setErroImport(null);
    try {
      await enviarOrcamentoEmLotes({ nome: nome.trim() || "Orçamento", ano: anoNum }, preview.itens, (env, tot) =>
        setProgresso(Math.round((env / tot) * 100)),
      );
      setEnviando(false);
      setPreview(null);
      router.refresh();
    } catch (e) {
      setEnviando(false);
      setErroImport(e instanceof Error ? e.message : "Falha ao importar o orçamento.");
    }
  }

  async function excluir(o: OrcamentoResumo) {
    if (!confirm(`Excluir o orçamento "${o.nome}" (${o.ano}) e seus ${o.totalItens} lançamentos? Esta ação não pode ser desfeita.`)) return;
    await fetch(`/api/orcamento/${o.id}`, { method: "DELETE" });
    if (abertoId === o.id) setAbertoId(null);
    router.refresh();
  }

  // Filtro por busca (texto) — reusado nas duas visões.
  const filtroPredicado = useMemo(() => {
    const casa = predicadoBusca(busca); // vários termos de uma vez com ":"
    return (r: OrcamentoItemRow) => !casa || casa([r.orgao, r.unidade, r.nomeElemento, r.codigoElemento]);
  }, [busca]);
  const itensAbertoFiltrados = useMemo(() => itensAberto.filter(filtroPredicado), [itensAberto, filtroPredicado]);
  const itensListaFiltrados = useMemo(() => itens.filter(filtroPredicado), [itens, filtroPredicado]);

  const money = (v: number) => <span className="tabular-nums text-text-2">{brl(v)}</span>;
  const colValor = (key: string, header: string, get: (r: OrcamentoItemRow) => number, forte?: boolean): Column<OrcamentoItemRow> => ({
    key,
    header,
    align: "right",
    minWidth: forte ? 140 : 128,
    filter: "range",
    numero: get,
    render: (r) => (forte ? <span className="tabular-nums font-semibold text-text">{brl(get(r))}</span> : money(get(r))),
  });
  const colBase: Column<OrcamentoItemRow>[] = [
    {
      key: "orgao",
      header: "Órgão",
      minWidth: 210,
      value: (r) => r.orgao ?? "",
      render: (r) => (
        <span className="block max-w-[280px] truncate text-text" title={r.orgao ?? ""}>
          {r.orgao ?? "—"}
        </span>
      ),
    },
    {
      key: "unidade",
      header: "Unidade",
      minWidth: 190,
      value: (r) => r.unidade ?? "",
      render: (r) => (
        <span className="block max-w-[260px] truncate text-text-2" title={r.unidade ?? ""}>
          {r.unidade ?? "—"}
        </span>
      ),
    },
    {
      key: "sistema",
      header: "No sistema",
      nowrap: true,
      value: (r) => vinculoDe(r).siglas,
      render: (r) => {
        const v = vinculoDe(r);
        return v.siglas ? (
          <span className="whitespace-nowrap text-text-2" title={[v.orgao, v.unidade].filter(Boolean).join(" · ")}>
            {v.siglas}
          </span>
        ) : (
          <span className="text-faint">—</span>
        );
      },
    },
    {
      key: "elemento",
      header: "Elemento",
      minWidth: 260,
      value: (r) => r.nomeElemento ?? "",
      render: (r) => (
        <span className="block max-w-[360px] truncate text-text" title={r.nomeElemento ?? ""}>
          {r.nomeElemento ?? "—"}
        </span>
      ),
    },
    {
      key: "codigo",
      header: "Código",
      minWidth: 130,
      value: (r) => r.codigoElemento ?? "",
      render: (r) => <span className="whitespace-nowrap font-mono text-[13px] text-muted">{r.codigoElemento ?? "—"}</span>,
    },
    colValor("emenda", "Emenda", (r) => r.valorEmendaImpositiva),
    colValor("inicial", "Valor inicial", (r) => r.valorInicial, true),
    colValor("suplement", "Suplementação", (r) => r.valorSuplementacao),
    colValor("empenho", "Empenho", (r) => r.valorEmpenho),
    colValor("saldo", "Saldo", (r) => r.saldo),
    colValor("anulacao", "Anulação", (r) => r.valorAnulacao),
  ];
  const colLista: Column<OrcamentoItemRow>[] = [
    {
      key: "orcamento",
      header: "Orçamento",
      minWidth: 180,
      value: (r) => rotuloPorOrcamento.get(r.orcamentoId) ?? "",
      render: (r) => <span className="truncate text-text-2">{rotuloPorOrcamento.get(r.orcamentoId) ?? "—"}</span>,
    },
    ...colBase,
  ];

  const rodapeResumo = (linhas: OrcamentoItemRow[]) => (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      <span>{linhas.length === 1 ? "1 lançamento" : `${linhas.length} lançamentos`}</span>
      <span className="text-text-2">
        Inicial <span className="font-semibold tabular-nums text-text">{brl(soma(linhas, "valorInicial"))}</span>
      </span>
      <span className="text-text-2">
        Saldo <span className="font-semibold tabular-nums text-text">{brl(soma(linhas, "saldo"))}</span>
      </span>
    </span>
  );

  const colunasPreview: Column<OrcamentoItemParseado>[] = [
    { key: "orgao", header: "Órgão", minWidth: 200, filter: "none", value: (r) => r.orgao, render: (r) => <span className="block max-w-[260px] truncate text-text">{r.orgao || "—"}</span> },
    { key: "unidade", header: "Unidade", minWidth: 180, filter: "none", value: (r) => r.unidade, render: (r) => <span className="block max-w-[240px] truncate text-text-2">{r.unidade || "—"}</span> },
    { key: "elemento", header: "Elemento", minWidth: 240, filter: "none", value: (r) => r.nomeElemento, render: (r) => <span className="block max-w-[320px] truncate text-text">{r.nomeElemento || "—"}</span> },
    { key: "codigo", header: "Código", minWidth: 120, filter: "none", value: (r) => r.codigoElemento, render: (r) => <span className="whitespace-nowrap font-mono text-[13px] text-muted">{r.codigoElemento || "—"}</span> },
    { key: "inicial", header: "Valor inicial", align: "right", minWidth: 140, filter: "none", render: (r) => <span className="tabular-nums font-semibold text-text">{brl(r.valorInicial)}</span> },
  ];

  const detalheItem = (item: OrcamentoItemRow) => {
    const v = vinculoDe(item);
    return <OrcamentoItemDetalhe key={item.id} item={item} vinculo={{ orgao: v.orgao, unidade: v.unidade }} />;
  };

  const barraBusca = (
    <div className="max-w-md">
      <SearchField value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} placeholder="Buscar órgão, unidade, elemento ou código…" />
    </div>
  );

  // Card "+" (mesmo tamanho dos cards de orçamento) — importar. Só editor.
  const addCard = (
    <button
      type="button"
      onClick={() => {
        setErroImport(null);
        setLauncher(true);
      }}
      className="group flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-2 bg-surface p-4 text-muted transition-colors hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
    >
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        <IconPlus className="h-6 w-6" />
      </span>
      <span className="text-sm font-semibold">Importar orçamento</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Orçamento</h1>
          <p className="text-sm text-muted">
            {orcamentos.length} {orcamentos.length === 1 ? "orçamento" : "orçamentos"} · {itens.length} {itens.length === 1 ? "lançamento" : "lançamentos"} · dotação por Órgão/Unidade/Elemento
          </p>
        </div>
        <Segmented
          value={vista}
          onChange={trocarVista}
          options={[
            { value: "orcamentos", label: "Orçamentos" },
            { value: "lancamentos", label: "Lançamentos" },
            { value: "vinculos", label: "Vínculos" },
            { value: "visoes", label: "Visões" },
          ]}
        />
      </div>

      {erroImport && !preview && (
        <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
          {erroImport}
        </Callout>
      )}

      {orcamentos.length === 0 ? (
        podeEditar ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{addCard}</div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
            <IconInbox className="h-10 w-10 text-faint" />
            <p className="text-sm text-muted">Nenhum orçamento ainda.</p>
          </div>
        )
      ) : (
        <div key={vista} className="animate-cat-morph">
          {vista === "orcamentos" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {orcamentos.map((o) => (
                <div key={o.id} className="flex flex-col rounded-card border border-border bg-surface p-4 shadow-ring transition-colors hover:border-accent/40">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                      <IconWallet className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-text" title={o.nome}>
                        {o.nome}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {o.totalItens === 1 ? "1 lançamento" : `${o.totalItens} lançamentos`}
                        {o.atualizadoEm ? ` · ${dataBR(o.atualizadoEm)}` : ""}
                      </p>
                    </div>
                    <Badge tone="blue">{o.ano}</Badge>
                  </div>
                  <div className="mt-3 rounded-control border border-border-2 bg-surface-2 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-faint">Dotação inicial</p>
                    <p className="tabular-nums text-base font-bold text-text">{brl(o.valorInicial)}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                    <Button variant="secondary" onClick={() => setAbertoId(o.id)}>
                      Abrir
                    </Button>
                    {podeEditar && (
                      <Button
                        variant="ghost"
                        aria-label={`Excluir ${o.nome}`}
                        className="ml-auto"
                        icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                        onClick={() => excluir(o)}
                      />
                    )}
                  </div>
                </div>
              ))}
              {podeEditar && addCard}
            </div>
          ) : vista === "visoes" ? (
            <OrcamentoVisoes itens={itens} podeEditar={podeEditar} />
          ) : vista === "vinculos" ? (
            <div className="space-y-4 rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">
              {erroVinc && (
                <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
                  {erroVinc}
                </Callout>
              )}
              <OrcamentoVinculos linhas={linhasVinc} alvos={alvos} podeEditar={podeEditar} salvando={salvandoVinc} onVincular={salvarVinculos} />
            </div>
          ) : (
            <div className="space-y-4 rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">
              {barraBusca}
              <DataTable
                columns={colLista}
                rows={itensListaFiltrados}
                getKey={(r) => r.id}
                fillHeight
                minWidth={1800}
                onRowClick={(r) => setPainelItem(r)}
                activeKey={abertoId == null ? (painelItem?.id ?? null) : null}
                resumo={rodapeResumo}
              />
            </div>
          )}
        </div>
      )}

      {/* Lançador de importação (só .xlsx do CUBO) */}
      <Modal open={launcher} onClose={() => setLauncher(false)} titulo="Importar orçamento" size="lg">
        <Dropzone
          accept=".xlsx,.xls"
          onFile={handleFile}
          titulo="Solte a planilha do orçamento (.xlsx)"
          icon={<IconUpload className="h-7 w-7" />}
          dica="Lemos Órgão, Unidade, Elemento de despesa e os valores de cada lançamento. Você confere e informa o ano antes de gravar."
        />
      </Modal>

      {/* Preview do envio: nome + ANO + prévia */}
      <Modal
        open={preview != null}
        onClose={() => {
          if (!enviando) setPreview(null);
        }}
        bloqueado={enviando}
        titulo="Novo orçamento"
        size="xl"
        rodape={
          preview ? (
            enviando ? (
              <Progress value={progresso} label={`Importando… ${progresso}%`} />
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {erroImport && <span className="mr-auto text-xs font-medium text-[var(--danger)]">{erroImport}</span>}
                <Button variant="ghost" onClick={() => setPreview(null)}>
                  Cancelar
                </Button>
                <Button onClick={importar} disabled={!podeImportar}>
                  Importar {preview.itens.length} {preview.itens.length === 1 ? "lançamento" : "lançamentos"}
                </Button>
              </div>
            )
          ) : undefined
        }
      >
        {preview && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
              <TextField label="Nome do orçamento" value={nome} onChange={(e) => setNome(e.target.value)} disabled={enviando} placeholder="Ex.: Orçamento anual" />
              <TextField
                label="Ano do orçamento"
                value={ano}
                onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
                disabled={enviando}
                placeholder={String(ANO_ATUAL)}
                inputMode="numeric"
                hint={anoValido ? undefined : "Informe um ano entre 2000 e 2100."}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-border-2 bg-surface-2 px-4 py-3 text-sm">
              <span className="text-muted">
                Lançamentos: <span className="font-semibold text-text">{preview.itens.length}</span>
              </span>
              <span className="text-muted">
                Dotação inicial: <span className="font-semibold tabular-nums text-text">{brl(preview.total)}</span>
              </span>
            </div>
            <div className="rounded-card border border-border px-4 pt-3">
              <DataTable columns={colunasPreview} rows={preview.itens} getKey={(r) => r.sequencial} pageSize={20} minWidth={900} resumo={(l) => `${l.length} ${l.length === 1 ? "lançamento" : "lançamentos"}`} />
            </div>
          </div>
        )}
      </Modal>

      {/* Lançamentos de um orçamento aberto (mestre-detalhe: lançamento no lateral) */}
      <Modal
        open={abertoId != null}
        onClose={() => {
          setAbertoId(null);
          setPainelItem(null);
          setBusca("");
        }}
        titulo={orcamentoAberto ? `${orcamentoAberto.nome} · ${orcamentoAberto.ano}` : "Orçamento"}
        size="full"
        lateral={{
          aberto: abertoId != null && painelItem != null,
          titulo: "Detalhe do lançamento",
          onClose: () => setPainelItem(null),
          children: abertoId != null && painelItem ? detalheItem(painelItem) : <div />,
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={() => orcamentoAberto && exportarOrcamentoXlsx(`${orcamentoAberto.nome}-${orcamentoAberto.ano}`, itensAberto)}>
              XLSX
            </Button>
            <Button
              variant="secondary"
              icon={<IconDownload className="h-4 w-4" />}
              onClick={() => {
                try {
                  if (orcamentoAberto) exportarOrcamentoPdf(`${orcamentoAberto.nome} · ${orcamentoAberto.ano}`, itensAberto);
                } catch (e) {
                  setErroImport(e instanceof Error ? e.message : "Falha ao exportar PDF.");
                }
              }}
            >
              PDF
            </Button>
          </div>
          {barraBusca}
          <DataTable
            columns={colBase}
            rows={itensAbertoFiltrados}
            getKey={(r) => r.id}
            pageSize={20}
            minWidth={1620}
            onRowClick={(r) => setPainelItem(r)}
            activeKey={abertoId != null ? (painelItem?.id ?? null) : null}
            resumo={rodapeResumo}
          />
        </div>
      </Modal>

      {/* Detalhe do lançamento na visão Lançamentos (banner próprio) */}
      <Modal open={abertoId == null && painelItem != null} onClose={() => setPainelItem(null)} titulo="Detalhe do lançamento" size="lg">
        {abertoId == null && painelItem ? detalheItem(painelItem) : <div />}
      </Modal>
    </div>
  );
}
