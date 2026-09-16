"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CatalogoItemRow, CatalogoResumo } from "@/lib/catalogo";
import { exportarCatalogoPdf, exportarCatalogoXlsx, exportarModeloCatalogoXlsx } from "@/lib/exportar-catalogo";
import { dataBR } from "@/lib/format";
import { enviarCatalogoEmLotes } from "@/lib/importar-catalogo";
import { parseCatalogoPdf } from "@/lib/parse-catalogo-pdf";
import { parseCatalogoXlsx } from "@/lib/parse-catalogo-xlsx";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CatalogoItemDetalhe } from "./CatalogoItemDetalhe";
import { type Column, DataTable } from "./DataTable";
import { Dropzone } from "./Dropzone";
import { SearchField, TextField } from "./Field";
import { IconAlert, IconDownload, IconInbox, IconLayers, IconPencil, IconTrash, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { Segmented } from "./Segmented";
import { TipoDfdPicker } from "./TipoDfdPicker";

type Vista = "catalogo" | "lista";

type PreviewItem = {
  _k: number;
  sequencial: number | null;
  codigo: string;
  codigoRaw: string | null;
  descricao: string;
  unidade: string | null;
};
type Preview = {
  itens: PreviewItem[];
  duplicadosNoArquivo: string[];
  conflitos: { codigo: string; catalogoNome: string }[];
  verificando: boolean;
  catalogoId: number | null;
  fonte: string; // extensão (pdf/xlsx) — informativo
};

const selectCls =
  "h-[46px] w-full rounded-control border border-border-2 bg-surface-2 px-3 text-[15px] text-text outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/20";

/**
 * Módulo CATÁLOGO. Duas visões (Segmented, com transição suave): **Catálogo** (cards
 * por catálogo; abrir mostra os itens num banner) e **Lista de Itens** (todos os itens
 * numa tabela única). Importa PDF **ou** XLSX (parse no cliente + pré-checagem de
 * conflito), exporta XLSX/PDF, edita o catálogo (nome/tipos padrão) e os itens
 * (descrição/unidade/tipos). Só editor gerencia; demais consultam. 100% design-system.
 */
export function CatalogoView({
  catalogos,
  itens,
  podeEditar,
}: {
  catalogos: CatalogoResumo[];
  itens: CatalogoItemRow[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const itensPorCatalogo = useMemo(() => {
    const m = new Map<number, CatalogoItemRow[]>();
    for (const it of itens) {
      const a = m.get(it.catalogoId) ?? [];
      a.push(it);
      m.set(it.catalogoId, a);
    }
    return m;
  }, [itens]);
  const nomePorCatalogo = useMemo(() => new Map(catalogos.map((c) => [c.id, c.nome])), [catalogos]);

  const [vista, setVista] = useState<Vista>("catalogo");
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const catalogoAberto = catalogos.find((c) => c.id === abertoId) ?? null;
  const itensAberto = abertoId != null ? (itensPorCatalogo.get(abertoId) ?? []) : [];

  // Importação
  const [launcher, setLauncher] = useState(false);
  const [pendingAlvo, setPendingAlvo] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [nomeCat, setNomeCat] = useState("");
  const [tiposPadrao, setTiposPadrao] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erroImport, setErroImport] = useState<string | null>(null);

  // Edição do catálogo (nome/tipos padrão)
  const [editandoCat, setEditandoCat] = useState<CatalogoResumo | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editTipos, setEditTipos] = useState<string[]>([]);
  const [salvandoCat, setSalvandoCat] = useState(false);

  // Consulta / edição dos itens
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [bulkTipos, setBulkTipos] = useState<string[]>([]);
  const [painelItem, setPainelItem] = useState<CatalogoItemRow | null>(null);
  const [salvandoItem, setSalvandoItem] = useState(false);

  function trocarVista(v: Vista) {
    setVista(v);
    setAbertoId(null);
    setPainelItem(null);
    setSel(new Set());
    setBusca("");
    setTipoFiltro([]);
  }

  async function verificarConflitos(codigos: string[], catalogoId: number | null) {
    try {
      const res = await fetch("/api/catalogo/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigos, catalogoId }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; conflitos?: Preview["conflitos"] } | null;
      return j?.ok ? (j.conflitos ?? []) : [];
    } catch {
      return [];
    }
  }

  async function handleFile(file: File) {
    setLauncher(false);
    setErroImport(null);
    const alvo = pendingAlvo;
    setPendingAlvo(null);
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    try {
      let parsed:
        | { nome: string | null; itens: Omit<PreviewItem, "_k">[]; duplicadosNoArquivo: string[] }
        | undefined;
      if (ext === "pdf") parsed = await parseCatalogoPdf(file);
      else if (ext === "xlsx" || ext === "xls") parsed = await parseCatalogoXlsx(file);
      else {
        setErroImport("Formato não suportado. Envie um PDF ou uma planilha .xlsx.");
        return;
      }
      if (parsed.itens.length === 0) {
        setErroImport("Não encontrei uma tabela de itens (código, descrição, unidade) neste arquivo.");
        return;
      }
      const alvoCat = alvo != null ? catalogos.find((c) => c.id === alvo) : null;
      setNomeCat((alvoCat?.nome ?? parsed.nome ?? file.name.replace(/\.(pdf|xlsx|xls)$/i, "")).slice(0, 200));
      setTiposPadrao(alvoCat?.tiposPadrao ?? []);
      const itensPrev: PreviewItem[] = parsed.itens.map((it, i) => ({ _k: i, ...it }));
      setPreview({ itens: itensPrev, duplicadosNoArquivo: parsed.duplicadosNoArquivo, conflitos: [], verificando: true, catalogoId: alvo, fonte: ext });
      const conflitos = await verificarConflitos(
        itensPrev.map((i) => i.codigo),
        alvo,
      );
      setPreview((p) => (p ? { ...p, conflitos, verificando: false } : p));
    } catch (e) {
      setErroImport(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    }
  }

  async function mudarAlvo(catalogoId: number | null) {
    if (!preview) return;
    const alvoCat = catalogoId != null ? catalogos.find((c) => c.id === catalogoId) : null;
    if (alvoCat) {
      setNomeCat(alvoCat.nome);
      setTiposPadrao(alvoCat.tiposPadrao);
    }
    setPreview({ ...preview, catalogoId, verificando: true });
    const conflitos = await verificarConflitos(
      preview.itens.map((i) => i.codigo),
      catalogoId,
    );
    setPreview((p) => (p ? { ...p, catalogoId, conflitos, verificando: false } : p));
  }

  async function importar() {
    if (!preview) return;
    setEnviando(true);
    setProgresso(0);
    setErroImport(null);
    try {
      await enviarCatalogoEmLotes(
        { catalogoId: preview.catalogoId, nome: nomeCat.trim() || "Catálogo", tiposPadrao },
        preview.itens.map((i) => ({
          sequencial: i.sequencial,
          codigo: i.codigo,
          codigoRaw: i.codigoRaw,
          descricao: i.descricao,
          unidade: i.unidade,
        })),
        (env, tot) => setProgresso(Math.round((env / tot) * 100)),
      );
      setEnviando(false);
      setPreview(null);
      router.refresh();
    } catch (e) {
      setEnviando(false);
      setErroImport(e instanceof Error ? e.message : "Falha ao importar o catálogo.");
    }
  }

  async function excluir(c: CatalogoResumo) {
    if (!confirm(`Excluir o catálogo "${c.nome}" e seus ${c.totalItens} itens? Esta ação não pode ser desfeita.`)) return;
    await fetch(`/api/catalogo/${c.id}`, { method: "DELETE" });
    if (abertoId === c.id) setAbertoId(null);
    router.refresh();
  }

  function abrirEdicao(c: CatalogoResumo) {
    setEditandoCat(c);
    setEditNome(c.nome);
    setEditTipos(c.tiposPadrao);
  }
  async function salvarEdicao() {
    if (!editandoCat || !editNome.trim()) return;
    setSalvandoCat(true);
    await fetch(`/api/catalogo/${editandoCat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: editNome.trim(), tiposPadrao: editTipos }),
    });
    setSalvandoCat(false);
    setEditandoCat(null);
    router.refresh();
  }

  async function aplicarBulk() {
    const ids = [...sel].map(Number);
    if (ids.length === 0) return;
    await fetch("/api/catalogo/itens", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, tipos: bulkTipos }),
    });
    setSel(new Set());
    router.refresh();
  }

  async function salvarItem(item: CatalogoItemRow, campos: { descricao: string; unidade: string | null; tipos: string[] }) {
    setSalvandoItem(true);
    await fetch(`/api/catalogo/item/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campos),
    });
    setSalvandoItem(false);
    setPainelItem(null);
    router.refresh();
  }

  // Filtro (busca + tipo) — memoizado e reusado nas duas visões.
  const filtroPredicado = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (r: CatalogoItemRow) => {
      const okTexto = !t || r.codigo.toLowerCase().includes(t) || r.descricao.toLowerCase().includes(t);
      const okTipo = tipoFiltro.length === 0 || tipoFiltro.some((tp) => r.tipos.includes(tp));
      return okTexto && okTipo;
    };
  }, [busca, tipoFiltro]);
  const itensAbertoFiltrados = useMemo(() => itensAberto.filter(filtroPredicado), [itensAberto, filtroPredicado]);
  const itensListaFiltrados = useMemo(() => itens.filter(filtroPredicado), [itens, filtroPredicado]);

  const colTipos: Column<CatalogoItemRow> = {
    key: "tipos",
    header: "Tipos",
    minWidth: 150,
    filter: "none",
    value: (r) => r.tipos.join(", "),
    render: (r) =>
      r.tipos.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {r.tipos.map((tp) => (
            <Badge key={tp} tone="blue">
              {tp}
            </Badge>
          ))}
        </span>
      ) : (
        <span className="text-faint">—</span>
      ),
  };
  const colBase: Column<CatalogoItemRow>[] = [
    {
      key: "codigo",
      header: "Código",
      minWidth: 130,
      filter: "none",
      value: (r) => r.codigo,
      render: (r) => <span className="font-mono text-[13px] text-text-2">{r.codigoRaw ?? r.codigo}</span>,
    },
    {
      key: "descricao",
      header: "Descrição",
      minWidth: 340,
      filter: "none",
      value: (r) => r.descricao,
      render: (r) => (
        <span className="block max-w-[520px] truncate text-text" title={r.descricao}>
          {r.descricao}
        </span>
      ),
    },
    { key: "unidade", header: "Unidade", minWidth: 110, value: (r) => r.unidade ?? "", render: (r) => <span className="text-muted">{r.unidade ?? "—"}</span> },
    colTipos,
    {
      key: "seq",
      header: "Seq.",
      align: "right",
      minWidth: 70,
      filter: "none",
      value: (r) => String(r.sequencial ?? ""),
      render: (r) => <span className="tabular-nums text-faint">{r.sequencial ?? "—"}</span>,
    },
  ];
  const colLista: Column<CatalogoItemRow>[] = [
    {
      key: "catalogo",
      header: "Catálogo",
      minWidth: 170,
      value: (r) => nomePorCatalogo.get(r.catalogoId) ?? "",
      render: (r) => <span className="truncate text-text-2">{nomePorCatalogo.get(r.catalogoId) ?? "—"}</span>,
    },
    ...colBase,
  ];

  const conflitoSet = new Set(preview?.conflitos.map((c) => c.codigo) ?? []);
  const dupSet = new Set(preview?.duplicadosNoArquivo ?? []);
  const colunasPreview: Column<PreviewItem>[] = [
    {
      key: "codigo",
      header: "Código",
      minWidth: 150,
      filter: "none",
      value: (r) => r.codigo,
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[13px] text-text-2">{r.codigoRaw ?? r.codigo}</span>
          {conflitoSet.has(r.codigo) && <Badge tone="red">conflito</Badge>}
          {!conflitoSet.has(r.codigo) && dupSet.has(r.codigo) && <Badge tone="amber">repetido</Badge>}
        </span>
      ),
    },
    {
      key: "descricao",
      header: "Descrição",
      minWidth: 340,
      filter: "none",
      value: (r) => r.descricao,
      render: (r) => (
        <span className="block max-w-[520px] truncate text-text" title={r.descricao}>
          {r.descricao}
        </span>
      ),
    },
    { key: "unidade", header: "Unidade", minWidth: 100, filter: "none", value: (r) => r.unidade ?? "", render: (r) => <span className="text-muted">{r.unidade ?? "—"}</span> },
  ];

  const podeImportar = preview != null && !preview.verificando && preview.conflitos.length === 0 && nomeCat.trim().length > 0;

  const detalheItem = (item: CatalogoItemRow) => (
    <CatalogoItemDetalhe key={item.id} item={item} podeEditar={podeEditar} salvando={salvandoItem} onSalvar={(campos) => salvarItem(item, campos)} />
  );

  const barraTipoBusca = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-sm flex-1">
        <SearchField value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} placeholder="Buscar código ou descrição…" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Filtrar por tipo:</span>
        <TipoDfdPicker value={tipoFiltro} onChange={setTipoFiltro} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Catálogo</h1>
          <p className="text-sm text-muted">
            {catalogos.length} {catalogos.length === 1 ? "catálogo" : "catálogos"} · {itens.length} {itens.length === 1 ? "item" : "itens"} · para padronização e consulta
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={vista}
            onChange={trocarVista}
            options={[
              { value: "catalogo", label: "Catálogo" },
              { value: "lista", label: "Lista de Itens" },
            ]}
          />
          {podeEditar && (
            <>
              <Button
                variant="secondary"
                icon={<IconDownload className="h-[18px] w-[18px]" />}
                onClick={exportarModeloCatalogoXlsx}
                title="Baixar um modelo .xlsx para preencher e importar"
              >
                Exportar modelo
              </Button>
              <Button
                icon={<IconUpload className="h-[18px] w-[18px]" />}
                onClick={() => {
                  setPendingAlvo(null);
                  setLauncher(true);
                }}
              >
                Importar
              </Button>
            </>
          )}
        </div>
      </div>

      {erroImport && !preview && (
        <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
          {erroImport}
        </Callout>
      )}

      {catalogos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
          <IconInbox className="h-10 w-10 text-faint" />
          <p className="text-sm text-muted">Nenhum catálogo ainda.{podeEditar ? " Clique em “Importar” para subir um PDF ou planilha." : ""}</p>
        </div>
      ) : (
        <div key={vista} className="animate-cat-morph">
          {vista === "catalogo" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalogos.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col rounded-card border border-border bg-surface p-4 shadow-ring transition-colors hover:border-accent/40"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                      <IconLayers className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-text" title={c.nome}>
                        {c.nome}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {c.totalItens === 1 ? "1 item" : `${c.totalItens} itens`}
                        {c.atualizadoEm ? ` · ${dataBR(c.atualizadoEm)}` : ""}
                      </p>
                    </div>
                  </div>
                  {c.tiposPadrao.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {c.tiposPadrao.map((t) => (
                        <Badge key={t} tone="blue">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                    <Button variant="secondary" onClick={() => setAbertoId(c.id)}>
                      Abrir
                    </Button>
                    {podeEditar && (
                      <Button variant="ghost" icon={<IconPencil className="h-4 w-4" />} onClick={() => abrirEdicao(c)}>
                        Editar
                      </Button>
                    )}
                    {podeEditar && (
                      <Button
                        variant="ghost"
                        aria-label={`Atualizar ${c.nome}`}
                        title="Atualizar (re-subir mesclando por código)"
                        icon={<IconUpload className="h-4 w-4" />}
                        onClick={() => {
                          setPendingAlvo(c.id);
                          setLauncher(true);
                        }}
                      />
                    )}
                    {podeEditar && (
                      <Button
                        variant="ghost"
                        aria-label={`Excluir ${c.nome}`}
                        className="ml-auto"
                        icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                        onClick={() => excluir(c)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4 rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">
              {barraTipoBusca}
              <DataTable
                columns={colLista}
                rows={itensListaFiltrados}
                getKey={(r) => r.id}
                pageSize={20}
                minWidth={1040}
                onRowClick={(r) => setPainelItem(r)}
                activeKey={abertoId == null ? (painelItem?.id ?? null) : null}
                resumo={(l) => `${l.length} ${l.length === 1 ? "item" : "itens"}`}
              />
            </div>
          )}
        </div>
      )}

      {/* Lançador de importação (PDF ou XLSX) */}
      <Modal open={launcher} onClose={() => setLauncher(false)} titulo={pendingAlvo != null ? "Atualizar catálogo" : "Importar catálogo"} size="lg">
        <Dropzone
          accept=".pdf,.xlsx,.xls"
          onFile={handleFile}
          titulo={pendingAlvo != null ? "Solte o PDF ou a planilha para atualizar" : "Solte o catálogo (PDF ou planilha .xlsx)"}
          icon={<IconUpload className="h-7 w-7" />}
          dica="Extraímos código, descrição e unidade de medida de cada item."
        />
      </Modal>

      {/* Preview do envio */}
      <Modal
        open={preview != null}
        onClose={() => {
          if (!enviando) setPreview(null);
        }}
        bloqueado={enviando}
        titulo={preview?.catalogoId != null ? "Atualizar catálogo" : "Novo catálogo"}
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
                  Importar {preview.itens.length === 1 ? "1 item" : `${preview.itens.length} itens`}
                </Button>
              </div>
            )
          ) : undefined
        }
      >
        {preview && (
          <div className="space-y-4">
            <TextField label="Nome do catálogo" value={nomeCat} onChange={(e) => setNomeCat(e.target.value)} disabled={enviando} hint={`Origem: ${preview.fonte.toUpperCase()}`} />
            <div>
              <label className="mb-2 block text-[13.5px] font-bold text-text" htmlFor="cat-alvo">
                Atualizar catálogo existente?
              </label>
              <select id="cat-alvo" className={selectCls} value={preview.catalogoId ?? ""} disabled={enviando} onChange={(e) => mudarAlvo(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Criar novo catálogo</option>
                {catalogos.map((c) => (
                  <option key={c.id} value={c.id}>
                    Atualizar: {c.nome}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[12px] text-muted">Ao atualizar, os itens são mesclados por código (descrição/unidade atualizadas) e os tipos já configurados são preservados.</p>
            </div>
            <div>
              <p className="mb-2 text-[13.5px] font-bold text-text">Tipos de DFD padrão (aplicados aos itens novos)</p>
              <TipoDfdPicker value={tiposPadrao} onChange={setTiposPadrao} disabled={enviando} />
            </div>

            {preview.verificando && <Callout kind="info">Verificando conflitos de código…</Callout>}
            {preview.duplicadosNoArquivo.length > 0 && (
              <Callout kind="warn" icon={<IconAlert className="h-4 w-4" />}>
                Códigos repetidos no próprio arquivo: {preview.duplicadosNoArquivo.slice(0, 8).join(", ")}
                {preview.duplicadosNoArquivo.length > 8 ? "…" : ""}. Cada código será mantido uma vez.
              </Callout>
            )}
            {preview.conflitos.length > 0 && (
              <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
                {preview.conflitos.length} código(s) já cadastrado(s) em OUTRO catálogo (o código é único global):{" "}
                {preview.conflitos.slice(0, 6).map((c) => `${c.codigo} (${c.catalogoNome})`).join(", ")}
                {preview.conflitos.length > 6 ? "…" : ""}. Ajuste/atualize o catálogo de origem para importar.
              </Callout>
            )}

            <div className="rounded-card border border-border px-4 pt-3">
              <DataTable columns={colunasPreview} rows={preview.itens} getKey={(r) => r._k} pageSize={20} minWidth={720} resumo={(l) => `${l.length} ${l.length === 1 ? "item" : "itens"}`} />
            </div>
          </div>
        )}
      </Modal>

      {/* Editar catálogo (nome + tipos padrão) */}
      <Modal
        open={editandoCat != null}
        onClose={() => {
          if (!salvandoCat) setEditandoCat(null);
        }}
        bloqueado={salvandoCat}
        titulo="Editar catálogo"
        size="md"
        rodape={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditandoCat(null)}>
              Cancelar
            </Button>
            <Button loading={salvandoCat} disabled={!editNome.trim()} onClick={salvarEdicao}>
              Salvar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <TextField label="Nome do catálogo" value={editNome} onChange={(e) => setEditNome(e.target.value)} disabled={salvandoCat} />
          <div>
            <p className="mb-2 text-[13.5px] font-bold text-text">Tipos de DFD padrão</p>
            <TipoDfdPicker value={editTipos} onChange={setEditTipos} disabled={salvandoCat} />
            <p className="mt-1.5 text-[12px] text-muted">Aplicado a novos itens; não altera os tipos já definidos em cada item.</p>
          </div>
        </div>
      </Modal>

      {/* Itens de um catálogo aberto (mestre-detalhe: item no lateral) */}
      <Modal
        open={abertoId != null}
        onClose={() => {
          setAbertoId(null);
          setPainelItem(null);
          setSel(new Set());
          setBusca("");
          setTipoFiltro([]);
        }}
        titulo={catalogoAberto?.nome ?? "Catálogo"}
        size="full"
        lateral={{
          aberto: abertoId != null && painelItem != null,
          titulo: "Detalhe do item",
          onClose: () => setPainelItem(null),
          children: abertoId != null && painelItem ? detalheItem(painelItem) : <div />,
        }}
        rodape={
          podeEditar && sel.size > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Definir tipos nos selecionados:</span>
                <TipoDfdPicker value={bulkTipos} onChange={setBulkTipos} />
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={aplicarBulk}>Aplicar</Button>
                <Button variant="ghost" onClick={() => setSel(new Set())}>
                  Limpar
                </Button>
                <span className="text-xs text-muted">{sel.size} selecionado(s)</span>
              </div>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {podeEditar && catalogoAberto && (
              <Button variant="ghost" icon={<IconPencil className="h-4 w-4" />} onClick={() => abrirEdicao(catalogoAberto)}>
                Editar catálogo
              </Button>
            )}
            <Button variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={() => catalogoAberto && exportarCatalogoXlsx(catalogoAberto.nome, itensAberto)}>
              XLSX
            </Button>
            <Button
              variant="secondary"
              icon={<IconDownload className="h-4 w-4" />}
              onClick={() => {
                try {
                  if (catalogoAberto) exportarCatalogoPdf(catalogoAberto.nome, itensAberto);
                } catch (e) {
                  setErroImport(e instanceof Error ? e.message : "Falha ao exportar PDF.");
                }
              }}
            >
              PDF
            </Button>
          </div>
          {barraTipoBusca}
          <DataTable
            columns={colBase}
            rows={itensAbertoFiltrados}
            getKey={(r) => r.id}
            pageSize={20}
            minWidth={900}
            selectable={podeEditar}
            selected={sel}
            onSelected={setSel}
            onRowClick={(r) => setPainelItem(r)}
            activeKey={abertoId != null ? (painelItem?.id ?? null) : null}
            resumo={(l) => `${l.length} ${l.length === 1 ? "item" : "itens"}`}
          />
        </div>
      </Modal>

      {/* Detalhe do item na visão Lista (banner próprio) */}
      <Modal open={abertoId == null && painelItem != null} onClose={() => setPainelItem(null)} titulo="Detalhe do item" size="lg">
        {abertoId == null && painelItem ? detalheItem(painelItem) : <div />}
      </Modal>
    </div>
  );
}
