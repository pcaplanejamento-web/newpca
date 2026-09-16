"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CatalogoItemRow, CatalogoResumo } from "@/lib/catalogo";
import { enviarCatalogoEmLotes } from "@/lib/importar-catalogo";
import { parseCatalogoPdf } from "@/lib/parse-catalogo-pdf";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CatalogoItemDetalhe } from "./CatalogoItemDetalhe";
import { type Column, DataTable } from "./DataTable";
import { Dropzone } from "./Dropzone";
import { SearchField, TextField } from "./Field";
import { IconAlert, IconInbox, IconTrash, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { TipoDfdPicker } from "./TipoDfdPicker";

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
  catalogoId: number | null; // alvo de atualização (null = novo)
};

const selectCls =
  "h-[46px] w-full rounded-control border border-border-2 bg-surface-2 px-3 text-[15px] text-text outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/20";

/**
 * Módulo CATÁLOGO: lista de catálogos, importação de PDF (parse no cliente + pré-checagem
 * de conflito de código + preview), consulta dos itens (busca/filtro por tipo), edição dos
 * tipos de DFD por item ou em massa, e exclusão. Só editor gerencia; demais consultam.
 * 100% componentes/tokens do design-system; reaproveita DataTable/Modal/Dropzone/etc.
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

  // Consulta / edição dos itens
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [bulkTipos, setBulkTipos] = useState<string[]>([]);
  const [painelItem, setPainelItem] = useState<CatalogoItemRow | null>(null);
  const [salvandoTipos, setSalvandoTipos] = useState(false);

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
    try {
      const parsed = await parseCatalogoPdf(file);
      if (parsed.itens.length === 0) {
        setErroImport("Não encontrei uma tabela de itens (código, descrição, unidade) neste PDF.");
        return;
      }
      const alvoCat = alvo != null ? catalogos.find((c) => c.id === alvo) : null;
      setNomeCat((alvoCat?.nome ?? parsed.nome ?? file.name.replace(/\.pdf$/i, "")).slice(0, 200));
      setTiposPadrao(alvoCat?.tiposPadrao ?? []);
      const itensPrev: PreviewItem[] = parsed.itens.map((it, i) => ({ _k: i, ...it }));
      setPreview({ itens: itensPrev, duplicadosNoArquivo: parsed.duplicadosNoArquivo, conflitos: [], verificando: true, catalogoId: alvo });
      const conflitos = await verificarConflitos(
        itensPrev.map((i) => i.codigo),
        alvo,
      );
      setPreview((p) => (p ? { ...p, conflitos, verificando: false } : p));
    } catch (e) {
      setErroImport(e instanceof Error ? e.message : "Falha ao ler o PDF.");
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

  async function definirTipos(ids: number[], tipos: string[]) {
    await fetch("/api/catalogo/itens", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, tipos }),
    });
  }

  async function aplicarBulk() {
    const ids = [...sel].map(Number);
    if (ids.length === 0) return;
    await definirTipos(ids, bulkTipos);
    setSel(new Set());
    router.refresh();
  }

  async function salvarTiposItem(item: CatalogoItemRow, tipos: string[]) {
    setSalvandoTipos(true);
    await definirTipos([item.id], tipos);
    setSalvandoTipos(false);
    setPainelItem(null);
    router.refresh();
  }

  // Itens filtrados (busca livre + filtro por tipo, OR entre os tipos escolhidos).
  const itensFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itensAberto.filter((r) => {
      const okTexto = !t || r.codigo.toLowerCase().includes(t) || r.descricao.toLowerCase().includes(t);
      const okTipo = tipoFiltro.length === 0 || tipoFiltro.some((tp) => r.tipos.includes(tp));
      return okTexto && okTipo;
    });
  }, [itensAberto, busca, tipoFiltro]);

  const colunasItens: Column<CatalogoItemRow>[] = [
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
    {
      key: "unidade",
      header: "Unidade",
      minWidth: 110,
      value: (r) => r.unidade ?? "",
      render: (r) => <span className="text-muted">{r.unidade ?? "—"}</span>,
    },
    {
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
    },
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
    {
      key: "unidade",
      header: "Unidade",
      minWidth: 100,
      filter: "none",
      value: (r) => r.unidade ?? "",
      render: (r) => <span className="text-muted">{r.unidade ?? "—"}</span>,
    },
  ];

  const podeImportar = preview != null && !preview.verificando && preview.conflitos.length === 0 && nomeCat.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Catálogo</h1>
          <p className="text-sm text-muted">Catálogos de produtos para padronização — consulta e comparação.</p>
        </div>
        {podeEditar && (
          <Button
            icon={<IconUpload className="h-[18px] w-[18px]" />}
            onClick={() => {
              setPendingAlvo(null);
              setLauncher(true);
            }}
          >
            Importar catálogo
          </Button>
        )}
      </div>

      {erroImport && !preview && (
        <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
          {erroImport}
        </Callout>
      )}

      {catalogos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
          <IconInbox className="h-10 w-10 text-faint" />
          <p className="text-sm text-muted">
            Nenhum catálogo ainda.{podeEditar ? " Clique em “Importar catálogo” para subir um PDF." : ""}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {catalogos.map((c) => (
            <div key={c.id} className="flex flex-col rounded-card border border-border bg-surface p-4 shadow-ring">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 break-words font-semibold text-text">{c.nome}</h3>
                <Badge tone="slate">{c.totalItens === 1 ? "1 item" : `${c.totalItens} itens`}</Badge>
              </div>
              {c.tiposPadrao.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.tiposPadrao.map((t) => (
                    <Badge key={t} tone="blue">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setAbertoId(c.id)}>
                  Abrir
                </Button>
                {podeEditar && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPendingAlvo(c.id);
                      setLauncher(true);
                    }}
                  >
                    Atualizar
                  </Button>
                )}
                {podeEditar && (
                  <Button
                    variant="ghost"
                    aria-label={`Excluir ${c.nome}`}
                    onClick={() => excluir(c)}
                    icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lançador de importação */}
      <Modal
        open={launcher}
        onClose={() => setLauncher(false)}
        titulo={pendingAlvo != null ? "Atualizar catálogo" : "Importar catálogo"}
        size="lg"
      >
        <Dropzone
          accept=".pdf"
          onFile={handleFile}
          titulo={pendingAlvo != null ? "Solte o PDF para atualizar este catálogo" : "Solte o catálogo em PDF"}
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
            <TextField label="Nome do catálogo" value={nomeCat} onChange={(e) => setNomeCat(e.target.value)} disabled={enviando} />
            <div>
              <label className="mb-2 block text-[13.5px] font-bold text-text" htmlFor="cat-alvo">
                Atualizar catálogo existente?
              </label>
              <select
                id="cat-alvo"
                className={selectCls}
                value={preview.catalogoId ?? ""}
                disabled={enviando}
                onChange={(e) => mudarAlvo(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Criar novo catálogo</option>
                {catalogos.map((c) => (
                  <option key={c.id} value={c.id}>
                    Atualizar: {c.nome}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[12px] text-muted">
                Ao atualizar, os itens são mesclados por código (descrição/unidade atualizadas) e os tipos já configurados são
                preservados.
              </p>
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

            <div className="rounded-card border border-border">
              <div className="px-4 pt-3">
                <DataTable
                  columns={colunasPreview}
                  rows={preview.itens}
                  getKey={(r) => r._k}
                  pageSize={20}
                  minWidth={720}
                  resumo={(l) => `${l.length} ${l.length === 1 ? "item" : "itens"}`}
                />
              </div>
            </div>
          </div>
        )}
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
          aberto: painelItem != null,
          titulo: "Detalhe do item",
          onClose: () => setPainelItem(null),
          children: painelItem ? (
            <CatalogoItemDetalhe
              key={painelItem.id}
              item={painelItem}
              podeEditar={podeEditar}
              salvando={salvandoTipos}
              onSalvarTipos={(t) => salvarTiposItem(painelItem, t)}
            />
          ) : (
            <div />
          ),
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-sm flex-1">
              <SearchField
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onClear={() => setBusca("")}
                placeholder="Buscar código ou descrição…"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Filtrar por tipo:</span>
              <TipoDfdPicker value={tipoFiltro} onChange={setTipoFiltro} />
            </div>
          </div>
          <DataTable
            columns={colunasItens}
            rows={itensFiltrados}
            getKey={(r) => r.id}
            pageSize={20}
            minWidth={900}
            selectable={podeEditar}
            selected={sel}
            onSelected={setSel}
            onRowClick={(r) => setPainelItem(r)}
            activeKey={painelItem?.id ?? null}
            resumo={(l) => `${l.length} ${l.length === 1 ? "item" : "itens"}`}
          />
        </div>
      </Modal>
    </div>
  );
}
