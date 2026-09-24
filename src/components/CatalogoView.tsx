"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CatalogoItemRow, CatalogoResumo, ConflitoCatalogo } from "@/lib/catalogo";
import { itensIguais } from "@/lib/catalogo-conferencia";
import { membrosDoItem } from "@/lib/catalogo-membros";
import { exportarCatalogoPdf, exportarCatalogoXlsx, exportarModeloCatalogoXlsx } from "@/lib/exportar-catalogo";
import { dataBR } from "@/lib/format";
import { criarCatalogoVazio, enviarCatalogoEmLotes } from "@/lib/importar-catalogo";
import { parseCatalogoPdf } from "@/lib/parse-catalogo-pdf";
import { parseCatalogoXlsx } from "@/lib/parse-catalogo-xlsx";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { CatalogoItemDetalhe } from "./CatalogoItemDetalhe";
import { type Column, DataTable } from "./DataTable";
import { Dropzone } from "./Dropzone";
import { SearchField, TextArea, TextField } from "./Field";
import { IconAlert, IconDownload, IconInbox, IconLayers, IconPencil, IconPlus, IconTrash, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { Segmented } from "./Segmented";
import { SkeletonCartao } from "./Skeleton";
import { TipoDfdPicker } from "./TipoDfdPicker";

type Vista = "catalogo" | "lista" | "unidades" | "classificacoes";

// As visões da PADRONIZAÇÃO (Unidades de medida | Classificações) só são baixadas quando abertas (esqueleto na mesma
// moldura de cartão enquanto o código chega).
const UnidadesMedidaView = dynamic(() => import("./UnidadesMedidaView").then((m) => m.UnidadesMedidaView), {
  ssr: false,
  loading: () => <SkeletonCartao />,
});
const ClassificacoesView = dynamic(() => import("./ClassificacoesView").then((m) => m.ClassificacoesView), {
  ssr: false,
  loading: () => <SkeletonCartao />,
});
/** Decisão de um conflito divergente (mesmo código, dados diferentes). */
type Resolucao = "manter" | "substituir" | "compartilhar";
/** Edição, no preview, dos dados de um conflito divergente (para igualar e liberar "Compartilhar"). */
type EdicaoConflito = { novoDesc: string; novoUnid: string; exDesc: string; exUnid: string };

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
  conflitos: ConflitoCatalogo[]; // item EXISTENTE de cada código conflitante (outro catálogo)
  verificando: boolean;
  catalogoId: number | null;
  fonte: string; // extensão (pdf/xlsx) — informativo
};

const selectCls =
  "h-[46px] w-full rounded-control border border-border-2 bg-surface-2 px-3 text-[15px] text-text outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/20";

/**
 * Módulo CATÁLOGO. Quatro visões (Segmented, com transição suave): **Catálogo** (cards
 * por catálogo; abrir mostra os itens num banner), **Lista de Itens** (todos os itens
 * numa tabela única) e a PADRONIZAÇÃO — **Unidades de medida** (cadastro + comparação das
 * unidades dos itens) e **Classificações** (cadastro + classificação automática dos itens),
 * carregadas sob demanda. Importa PDF **ou** XLSX (parse no cliente + pré-checagem de
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
  // Agrupa por PERTENCIMENTO: um item compartilhado aparece no bucket de cada catálogo em
  // que está ([catalogo_id, ...catalogos_extra]).
  const itensPorCatalogo = useMemo(() => {
    const m = new Map<number, CatalogoItemRow[]>();
    for (const it of itens) {
      for (const cid of membrosDoItem(it.catalogoId, it.catalogosExtra)) {
        const a = m.get(cid) ?? [];
        a.push(it);
        m.set(cid, a);
      }
    }
    return m;
  }, [itens]);
  const nomePorCatalogo = useMemo(() => new Map(catalogos.map((c) => [c.id, c.nome])), [catalogos]);

  const [vista, setVista] = useState<Vista>("catalogo");
  // Unidades de medida | Classificações: as visões da PADRONIZAÇÃO (sem os controles de catálogo — exportar modelo, importar).
  const padronizacao = vista === "unidades" || vista === "classificacoes";
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

  // Resolução dos conflitos (por id do existente): idêntico [Manter|Compartilhar];
  // divergente [Manter|Substituir|Compartilhar].
  const [resolucoes, setResolucoes] = useState<Map<number, Resolucao>>(new Map());
  // Edição dos dados de um divergente (para igualar novo × existente e liberar Compartilhar).
  const [edicoes, setEdicoes] = useState<Map<number, EdicaoConflito>>(new Map());

  // Novo catálogo (card "+"): criar manual OU importar.
  const [novoAberto, setNovoAberto] = useState(false);
  const [novoModo, setNovoModo] = useState<"manual" | "importar">("manual");
  const [novoNome, setNovoNome] = useState("");
  const [novoTipos, setNovoTipos] = useState<string[]>([]);
  const [criandoCat, setCriandoCat] = useState(false);

  // Consulta / edição dos itens
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [bulkTipos, setBulkTipos] = useState<string[]>([]);
  const [painelItem, setPainelItem] = useState<CatalogoItemRow | null>(null);
  const [criandoItem, setCriandoItem] = useState(false); // lateral em modo "criar item"
  const [salvandoItem, setSalvandoItem] = useState(false);
  const [erroItem, setErroItem] = useState<string | null>(null);

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
    setNovoAberto(false);
    setErroImport(null);
    setResolucoes(new Map());
    setEdicoes(new Map());
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
    setResolucoes(new Map());
    setEdicoes(new Map());
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

  // Classificação dos conflitos do preview: idêntico (código+descrição+unidade) × divergente.
  const conflitoPorCodigo = useMemo(
    () => new Map((preview?.conflitos ?? []).map((c) => [c.codigo, c] as const)),
    [preview?.conflitos],
  );
  const { identicos, divergentes } = useMemo(() => {
    const ident: { item: PreviewItem; existente: ConflitoCatalogo }[] = [];
    const div: { item: PreviewItem; existente: ConflitoCatalogo }[] = [];
    for (const it of preview?.itens ?? []) {
      const ex = conflitoPorCodigo.get(it.codigo);
      if (!ex) continue;
      (itensIguais(it, ex) ? ident : div).push({ item: it, existente: ex });
    }
    return { identicos: ident, divergentes: div };
  }, [preview?.itens, conflitoPorCodigo]);
  const resolucaoDe = (id: number): Resolucao => resolucoes.get(id) ?? "manter";
  // Valores ATUAIS de um conflito divergente (edições do preview aplicadas) — p/ igualar.
  const valoresConflito = (d: { item: PreviewItem; existente: ConflitoCatalogo }): EdicaoConflito => {
    const e = edicoes.get(d.existente.id);
    return {
      novoDesc: e?.novoDesc ?? d.item.descricao,
      novoUnid: e?.novoUnid ?? d.item.unidade ?? "",
      exDesc: e?.exDesc ?? d.existente.descricao,
      exUnid: e?.exUnid ?? d.existente.unidade ?? "",
    };
  };
  const conflitoIgual = (d: { item: PreviewItem; existente: ConflitoCatalogo }): boolean => {
    const v = valoresConflito(d);
    return itensIguais({ descricao: v.novoDesc, unidade: v.novoUnid }, { descricao: v.exDesc, unidade: v.exUnid });
  };

  // Idênticos "Manter" cujo existente NÃO cobre o tiposPadrão → só mesclar tipos (como hoje).
  const mesclarIds = useMemo(
    () =>
      identicos
        .filter((i) => (resolucoes.get(i.existente.id) ?? "manter") === "manter" && tiposPadrao.some((t) => !i.existente.tipos.includes(t)))
        .map((i) => i.existente.id),
    [identicos, tiposPadrao, resolucoes],
  );
  const substituirCount = useMemo(
    () => divergentes.filter((d) => resolucoes.get(d.existente.id) === "substituir").length,
    [divergentes, resolucoes],
  );
  const compartilharCount = useMemo(
    () =>
      identicos.filter((i) => resolucoes.get(i.existente.id) === "compartilhar").length +
      divergentes.filter((d) => resolucoes.get(d.existente.id) === "compartilhar").length,
    [identicos, divergentes, resolucoes],
  );
  // Divergente marcado "Compartilhar" mas ainda com dados diferentes → trava o envio.
  const compartilharInvalido = divergentes.some((d) => resolucoes.get(d.existente.id) === "compartilhar" && !conflitoIgual(d));
  // Itens que de fato vão para o payload (não-conflito + divergentes "substituir").
  const importaveis = preview ? preview.itens.length - identicos.length - (divergentes.length - substituirCount) : 0;

  async function importar() {
    if (!preview) return;
    setEnviando(true);
    setProgresso(0);
    setErroImport(null);
    const jsonH = { "Content-Type": "application/json" };
    try {
      // Divergentes-compartilhar: grava a descrição/unidade ACORDADA no item EXISTENTE.
      for (const d of divergentes) {
        if (resolucaoDe(d.existente.id) !== "compartilhar") continue;
        const v = valoresConflito(d);
        if (v.exDesc !== d.existente.descricao || (v.exUnid.trim() || null) !== (d.existente.unidade ?? null))
          await fetch(`/api/catalogo/item/${d.existente.id}`, { method: "PATCH", headers: jsonH, body: JSON.stringify({ descricao: v.exDesc.trim(), unidade: v.exUnid.trim() || null }) });
      }
      const compartilharItens = [
        ...identicos.filter((i) => resolucaoDe(i.existente.id) === "compartilhar").map((i) => i.existente.id),
        ...divergentes.filter((d) => resolucaoDe(d.existente.id) === "compartilhar").map((d) => d.existente.id),
      ];
      const excluirItens = divergentes.filter((d) => resolucaoDe(d.existente.id) === "substituir").map((d) => d.existente.id);
      // Fora do payload: TODOS os idênticos + divergentes que não são "substituir".
      const identKs = new Set(identicos.map((i) => i.item._k));
      const naoSubst = new Set(divergentes.filter((d) => resolucaoDe(d.existente.id) !== "substituir").map((d) => d.item._k));
      const substEdit = new Map(divergentes.filter((d) => resolucaoDe(d.existente.id) === "substituir").map((d) => [d.item._k, valoresConflito(d)] as const));
      const payload = preview.itens
        .filter((i) => !identKs.has(i._k) && !naoSubst.has(i._k))
        .map((i) => {
          const e = substEdit.get(i._k);
          return e ? { ...i, descricao: e.novoDesc.trim(), unidade: e.novoUnid.trim() || null } : i;
        });

      if (payload.length > 0) {
        await enviarCatalogoEmLotes(
          { catalogoId: preview.catalogoId, nome: nomeCat.trim() || "Catálogo", tiposPadrao, excluirItens, compartilharItens },
          payload.map((i) => ({ sequencial: i.sequencial, codigo: i.codigo, codigoRaw: i.codigoRaw, descricao: i.descricao, unidade: i.unidade })),
          (env, tot) => setProgresso(Math.round((env / tot) * 100)),
        );
      } else if (compartilharItens.length > 0) {
        // Sem itens novos — cria/usa o catálogo alvo e compartilha os existentes nele.
        const alvo = preview.catalogoId ?? (await criarCatalogoVazio(nomeCat.trim() || "Catálogo", tiposPadrao));
        await fetch("/api/catalogo/compartilhar", { method: "POST", headers: jsonH, body: JSON.stringify({ catalogoId: alvo, itemIds: compartilharItens }) });
      }
      // Idênticos "Manter" com tipo novo → o existente ganha os tipos (união).
      if (mesclarIds.length > 0)
        await fetch("/api/catalogo/itens", { method: "PATCH", headers: jsonH, body: JSON.stringify({ ids: mesclarIds, tipos: tiposPadrao, modo: "mesclar" }) });
      setEnviando(false);
      setPreview(null);
      router.refresh();
    } catch (e) {
      setEnviando(false);
      setErroImport(e instanceof Error ? e.message : "Falha ao importar o catálogo.");
    }
  }

  async function excluir(c: CatalogoResumo) {
    const n = itensPorCatalogo.get(c.id)?.length ?? c.totalItens;
    if (!confirm(`Excluir o catálogo "${c.nome}" e seus ${n} ${n === 1 ? "item" : "itens"}? Itens compartilhados com outros catálogos são preservados. Esta ação não pode ser desfeita.`)) return;
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

  // Cria um catálogo VAZIO (manual) e o abre para adicionar itens.
  async function criarManual() {
    if (!novoNome.trim()) return;
    setCriandoCat(true);
    setErroImport(null);
    try {
      const id = await criarCatalogoVazio(novoNome.trim(), novoTipos);
      setCriandoCat(false);
      setNovoAberto(false);
      setNovoNome("");
      setNovoTipos([]);
      router.refresh();
      setAbertoId(id); // abre o catálogo novo p/ adicionar itens
    } catch (e) {
      setCriandoCat(false);
      setErroImport(e instanceof Error ? e.message : "Falha ao criar o catálogo.");
    }
  }

  async function criarItem(campos: { codigo: string; descricao: string; unidade: string | null; tipos: string[] }) {
    if (abertoId == null) return;
    setSalvandoItem(true);
    setErroItem(null);
    try {
      const res = await fetch("/api/catalogo/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogoId: abertoId, ...campos }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "Falha ao adicionar o item.");
      setSalvandoItem(false);
      setCriandoItem(false);
      router.refresh();
    } catch (e) {
      setSalvandoItem(false);
      setErroItem(e instanceof Error ? e.message : "Falha ao adicionar o item.");
    }
  }

  async function excluirItem(item: CatalogoItemRow) {
    if (!confirm(`Excluir o item ${item.codigoRaw ?? item.codigo}? Esta ação não pode ser desfeita.`)) return;
    setSalvandoItem(true);
    await fetch(`/api/catalogo/item/${item.id}`, { method: "DELETE" });
    setSalvandoItem(false);
    setPainelItem(null);
    router.refresh();
  }

  // Catálogos em que um item está (origem + compartilhados), com nome — para o detalhe.
  const catalogosDoItem = (item: CatalogoItemRow) =>
    membrosDoItem(item.catalogoId, item.catalogosExtra).map((id) => ({ id, nome: nomePorCatalogo.get(id) ?? `#${id}`, origem: id === item.catalogoId }));

  // Remove o item de UM catálogo (desfaz o compartilhamento); permanece nos demais.
  async function removerDoCatalogo(item: CatalogoItemRow, catalogoId: number) {
    const nome = nomePorCatalogo.get(catalogoId) ?? `#${catalogoId}`;
    if (!confirm(`Remover o item ${item.codigoRaw ?? item.codigo} do catálogo "${nome}"? Ele permanece nos demais catálogos em que está.`)) return;
    setSalvandoItem(true);
    await fetch(`/api/catalogo/item/${item.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogoId }),
    });
    setSalvandoItem(false);
    setPainelItem(null);
    router.refresh();
  }

  // Filtro (busca + tipo) — memoizado e reusado nas duas visões.
  const filtroPredicado = useMemo(() => {
    const casa = predicadoBusca(busca); // vários códigos/termos de uma vez com ":"
    return (r: CatalogoItemRow) => {
      const okTexto = !casa || casa([r.codigo, r.descricao]);
      const okTipo = tipoFiltro.length === 0 || tipoFiltro.some((tp) => r.tipos.includes(tp));
      return okTexto && okTipo;
    };
  }, [busca, tipoFiltro]);
  const itensAbertoFiltrados = useMemo(() => itensAberto.filter(filtroPredicado), [itensAberto, filtroPredicado]);
  const itensListaFiltrados = useMemo(() => itens.filter(filtroPredicado), [itens, filtroPredicado]);

  const colTipos: Column<CatalogoItemRow> = {
    key: "tipos",
    header: "Tipos",
    filter: "none",
    nowrap: true,
    value: (r) => r.tipos.join(", "),
    render: (r) =>
      r.tipos.length > 0 ? (
        <span className="inline-flex flex-nowrap gap-1">
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
      align: "center",
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

  const identSet = new Set(identicos.map((i) => i.item.codigo));
  const divSet = new Set(divergentes.map((d) => d.item.codigo));
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
          {identSet.has(r.codigo) && <Badge tone="blue">idêntico</Badge>}
          {divSet.has(r.codigo) && <Badge tone="amber">divergente</Badge>}
          {!identSet.has(r.codigo) && !divSet.has(r.codigo) && dupSet.has(r.codigo) && <Badge tone="amber">repetido</Badge>}
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

  const podeImportar =
    preview != null &&
    !preview.verificando &&
    nomeCat.trim().length > 0 &&
    !compartilharInvalido &&
    (importaveis > 0 || mesclarIds.length > 0 || compartilharCount > 0);

  // Detalhe/edição de um item existente (lateral). O editor também exclui.
  const detalheItem = (item: CatalogoItemRow) => (
    <CatalogoItemDetalhe
      key={item.id}
      item={item}
      podeEditar={podeEditar}
      salvando={salvandoItem}
      erro={erroItem}
      catalogos={catalogosDoItem(item)}
      onSalvar={(campos) => salvarItem(item, campos)}
      onExcluir={podeEditar ? () => excluirItem(item) : undefined}
      onRemoverCatalogo={podeEditar ? (cid) => removerDoCatalogo(item, cid) : undefined}
    />
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

  function abrirNovo() {
    setPendingAlvo(null); // catálogo NOVO (não é atualização)
    setNovoModo("manual");
    setNovoNome("");
    setNovoTipos([]);
    setErroImport(null);
    setNovoAberto(true);
  }

  // Card "+" (mesmo tamanho dos cards de catálogo) — cria manual OU importa. Só editor.
  const addCard = (
    <button
      type="button"
      onClick={abrirNovo}
      className="group flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-2 bg-surface p-4 text-muted transition-colors hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
    >
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
        <IconPlus className="h-6 w-6" />
      </span>
      <span className="text-sm font-semibold">Novo catálogo</span>
    </button>
  );

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Catálogo</h1>
          <p className="text-sm text-muted">
            {catalogos.length} {catalogos.length === 1 ? "catálogo" : "catálogos"} · {itens.length} {itens.length === 1 ? "item" : "itens"} · para padronização e consulta
          </p>
        </div>
        {/* "Exportar modelo" ANTES do Segmented: sem ele (nas visões da padronização), as visões não saem do lugar. */}
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {podeEditar && !padronizacao && (
            <Button
              variant="secondary"
              icon={<IconDownload className="h-[18px] w-[18px]" />}
              onClick={exportarModeloCatalogoXlsx}
              title="Baixar um modelo .xlsx para preencher e importar"
            >
              Exportar modelo
            </Button>
          )}
          <Segmented
            value={vista}
            onChange={trocarVista}
            ariaLabel="Visões do catálogo"
            options={[
              { value: "catalogo", label: "Catálogo" },
              { value: "lista", label: "Lista de Itens", curto: "Itens" },
              { value: "unidades", label: "Unidades de medida", curto: "Unid. medida" },
              { value: "classificacoes", label: "Classificações", curto: "Classif." },
            ]}
          />
        </div>
      </div>

      {erroImport && !preview && !padronizacao && (
        <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
          {erroImport}
        </Callout>
      )}

      {padronizacao ? (
        <div key={vista} className="animate-cat-morph">
          {vista === "unidades" ? <UnidadesMedidaView podeEditar={podeEditar} /> : <ClassificacoesView podeEditar={podeEditar} />}
        </div>
      ) : catalogos.length === 0 ? (
        podeEditar ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{addCard}</div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
            <IconInbox className="h-10 w-10 text-faint" />
            <p className="text-sm text-muted">Nenhum catálogo ainda.</p>
          </div>
        )
      ) : (
        <div key={vista} className="animate-cat-morph">
          {vista === "catalogo" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalogos.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring transition-colors hover:border-accent/40"
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
                        {(() => {
                          const n = itensPorCatalogo.get(c.id)?.length ?? c.totalItens;
                          return n === 1 ? "1 item" : `${n} itens`;
                        })()}
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
              {podeEditar && addCard}
            </div>
          ) : (
            <div className="space-y-[var(--gap-block)] rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
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

      {/* Lançador de ATUALIZAÇÃO (re-subir um catálogo pelo botão do card) */}
      <Modal open={launcher} onClose={() => setLauncher(false)} titulo="Atualizar catálogo" size="lg">
        <Dropzone
          accept=".pdf,.xlsx,.xls"
          onFile={handleFile}
          titulo="Solte o PDF ou a planilha para atualizar"
          icon={<IconUpload className="h-7 w-7" />}
          dica="Extraímos código, descrição e unidade de medida de cada item."
        />
      </Modal>

      {/* Novo catálogo (card "+"): criar manual OU importar */}
      <Modal
        open={novoAberto}
        onClose={() => {
          if (!criandoCat) setNovoAberto(false);
        }}
        bloqueado={criandoCat}
        titulo="Novo catálogo"
        size="md"
        rodape={
          novoModo === "manual" ? (
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setNovoAberto(false)} disabled={criandoCat}>
                Cancelar
              </Button>
              <Button onClick={criarManual} loading={criandoCat} disabled={!novoNome.trim()}>
                Criar catálogo
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-[var(--gap-block)]">
          <Segmented<"manual" | "importar">
            value={novoModo}
            onChange={(v) => setNovoModo(v)}
            options={[
              { value: "manual", label: "Criar manualmente" },
              { value: "importar", label: "Importar arquivo" },
            ]}
          />
          {novoModo === "manual" ? (
            <>
              <TextField label="Nome do catálogo" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} disabled={criandoCat} placeholder="Ex.: Material de expediente" />
              <div>
                <p className="mb-2 text-[13.5px] font-bold text-text">Tipos de DFD padrão</p>
                <TipoDfdPicker value={novoTipos} onChange={setNovoTipos} disabled={criandoCat} />
                <p className="mt-1.5 text-[12px] text-muted">Aplicado aos itens que você adicionar depois. O catálogo começa vazio — adicione itens à mão ou importe.</p>
              </div>
            </>
          ) : (
            <Dropzone
              accept=".pdf,.xlsx,.xls"
              onFile={handleFile}
              titulo="Solte o catálogo (PDF ou planilha .xlsx)"
              icon={<IconUpload className="h-7 w-7" />}
              dica="Extraímos código, descrição e unidade de cada item; você confere antes de gravar."
            />
          )}
        </div>
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
                  {importaveis > 0
                    ? `Importar ${importaveis} ${importaveis === 1 ? "item" : "itens"}`
                    : compartilharCount > 0
                      ? `Compartilhar ${compartilharCount} ${compartilharCount === 1 ? "item" : "itens"}`
                      : mesclarIds.length > 0
                        ? "Aplicar tipos"
                        : "Importar"}
                </Button>
              </div>
            )
          ) : undefined
        }
      >
        {preview && (
          <div className="space-y-[var(--gap-block)]">
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
            {identicos.length > 0 && (
              <div className="space-y-3 rounded-card border border-border-2 bg-surface-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[13.5px] font-bold text-text">Itens idênticos ({identicos.length})</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Já cadastrados (mesmo código, descrição e unidade) em outro catálogo. <strong>Manter</strong> = não importa (só
                      soma os tipos ao existente); <strong>Compartilhar</strong> = o MESMO item nos dois catálogos.
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="rounded-control border border-border-2 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
                      onClick={() => setResolucoes((m) => { const n = new Map(m); for (const i of identicos) n.set(i.existente.id, "compartilhar"); return n; })}
                    >
                      Compartilhar todos
                    </button>
                    <button
                      type="button"
                      className="rounded-control border border-border-2 px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface"
                      onClick={() => setResolucoes((m) => { const n = new Map(m); for (const i of identicos) n.set(i.existente.id, "manter"); return n; })}
                    >
                      Manter todos
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {identicos.map(({ item, existente }) => (
                    <div key={existente.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface p-2.5">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-[13px] font-bold text-text">{item.codigoRaw ?? item.codigo}</span>
                        <span className="ml-2 text-xs text-muted">· {existente.catalogoNome}</span>
                        <p className="truncate text-[12.5px] text-text-2" title={item.descricao}>{item.descricao}</p>
                      </div>
                      <Segmented<Resolucao>
                        value={resolucaoDe(existente.id) === "compartilhar" ? "compartilhar" : "manter"}
                        onChange={(v) => setResolucoes((m) => new Map(m).set(existente.id, v))}
                        options={[
                          { value: "manter", label: "Manter" },
                          { value: "compartilhar", label: "Compartilhar" },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {divergentes.length > 0 && (
              <div className="space-y-3 rounded-card border border-border-2 bg-surface-2 p-4">
                <div>
                  <p className="text-[13.5px] font-bold text-text">Conflitos a resolver ({divergentes.length})</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Mesmo código, dados diferentes. <strong>Manter</strong> (não importa este) · <strong>Substituir</strong> (exclui o
                    existente e importa este) · <strong>Compartilhar</strong> (o mesmo item nos dois — <em>edite os dois lados para
                    ficarem iguais</em>).
                  </p>
                </div>
                {divergentes.map((d) => {
                  const { item, existente } = d;
                  const v = valoresConflito(d);
                  const igual = conflitoIgual(d);
                  const r = resolucaoDe(existente.id);
                  const setE = (patch: Partial<EdicaoConflito>) => setEdicoes((m) => new Map(m).set(existente.id, { ...v, ...patch }));
                  return (
                    <div key={existente.id} className="rounded-card border border-border bg-surface p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-mono text-[13px] font-bold text-text">{item.codigoRaw ?? item.codigo}</span>
                        <Badge tone={igual ? "emerald" : "amber"}>{igual ? "iguais" : "diferentes"}</Badge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2 rounded-control border border-border-2 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Novo (do arquivo)</p>
                          <TextArea label="Descrição" value={v.novoDesc} rows={2} onChange={(e) => setE({ novoDesc: e.target.value })} />
                          <TextField label="Unidade" value={v.novoUnid} onChange={(e) => setE({ novoUnid: e.target.value })} />
                        </div>
                        <div className="space-y-2 rounded-control border border-border-2 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Existente · {existente.catalogoNome}</p>
                          <TextArea label="Descrição" value={v.exDesc} rows={2} onChange={(e) => setE({ exDesc: e.target.value })} />
                          <TextField label="Unidade" value={v.exUnid} onChange={(e) => setE({ exUnid: e.target.value })} />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Segmented<Resolucao>
                          value={r}
                          onChange={(val) => setResolucoes((m) => new Map(m).set(existente.id, val))}
                          options={[
                            { value: "manter", label: "Manter existente" },
                            { value: "substituir", label: "Substituir" },
                            { value: "compartilhar", label: "Compartilhar" },
                          ]}
                        />
                        {r === "compartilhar" && !igual && (
                          <span className="text-xs font-medium" style={{ color: "var(--warn)" }}>
                            Edite os dois lados para ficarem iguais.
                          </span>
                        )}
                        {r === "compartilhar" && igual && (
                          <span className="text-xs text-muted">Será o mesmo item nos dois catálogos.</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
        <div className="space-y-[var(--gap-block)]">
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
          setCriandoItem(false);
          setErroItem(null);
          setSel(new Set());
          setBusca("");
          setTipoFiltro([]);
        }}
        titulo={catalogoAberto?.nome ?? "Catálogo"}
        size="full"
        lateral={{
          aberto: abertoId != null && (painelItem != null || criandoItem),
          titulo: criandoItem ? "Adicionar item" : "Detalhe do item",
          onClose: () => {
            setPainelItem(null);
            setCriandoItem(false);
            setErroItem(null);
          },
          children:
            abertoId != null && criandoItem ? (
              <CatalogoItemDetalhe key="novo" modo="criar" podeEditar={podeEditar} salvando={salvandoItem} erro={erroItem} onCriar={criarItem} />
            ) : abertoId != null && painelItem ? (
              detalheItem(painelItem)
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
        <div className="space-y-[var(--gap-block)]">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {podeEditar && (
              <Button
                className="mr-auto"
                icon={<IconPlus className="h-4 w-4" />}
                onClick={() => {
                  setPainelItem(null);
                  setErroItem(null);
                  setCriandoItem(true);
                }}
              >
                Adicionar item
              </Button>
            )}
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
            onRowClick={(r) => {
              setCriandoItem(false);
              setErroItem(null);
              setPainelItem(r);
            }}
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
