"use client";

import { useEffect, useMemo, useState } from "react";
import { brl, dataBR, dec, num } from "@/lib/format";
import { Skeleton } from "./Skeleton";
import { IconChevronLeft, IconChevronRight, IconSearch, IconSort } from "./icons";

type Row = {
  id: number;
  idProduto: string | null;
  sequencial: number | null;
  nomeProduto: string | null;
  unidadeMedida: string | null;
  quantidade: number | null;
  valorReferencia: number | null;
  valorTotal: number | null;
  classificacao: string | null;
  dataDesejada: string | null;
  codigo: string | null;
  municipio: string | null;
};

type Resp = { rows: Row[]; total: number; page: number; pageSize: number; pages: number };
type Sort = "valor" | "nome" | "seq" | "quantidade";

const selCls =
  "rounded-control border border-border-2 bg-surface px-3 py-2 text-sm text-text-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

export function ItemTable({
  unidadeId,
  classificacoes,
  anos,
  showUnidade,
}: {
  unidadeId?: number;
  classificacoes: string[];
  anos: number[];
  showUnidade: boolean;
}) {
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [classificacao, setClassificacao] = useState("");
  const [ano, setAno] = useState("");
  const [sort, setSort] = useState<Sort>("valor");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDeb(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [qDeb, classificacao, ano, sort, dir, unidadeId]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (unidadeId) params.set("unidade", String(unidadeId));
    if (qDeb.trim()) params.set("q", qDeb.trim());
    if (classificacao) params.set("classificacao", classificacao);
    if (ano) params.set("ano", ano);
    params.set("sort", sort);
    params.set("dir", dir);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    let cancel = false;
    setLoading(true);
    setErro(null);
    fetch(`/api/itens?${params.toString()}`)
      .then((r) => r.json())
      .then((json: Resp & { error?: string }) => {
        if (cancel) return;
        if (json.error) setErro(json.error);
        setData(json);
      })
      .catch(() => !cancel && setErro("Falha ao carregar os itens."))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [unidadeId, qDeb, classificacao, ano, sort, dir, page]);

  function toggleSort(col: Sort) {
    if (sort === col) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(col);
      setDir(col === "nome" || col === "seq" ? "asc" : "desc");
    }
  }

  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const rows = data?.rows ?? [];

  const faixa = useMemo(() => {
    if (!total) return "0 itens";
    const ini = (page - 1) * pageSize + 1;
    const fim = Math.min(page * pageSize, total);
    return `${num(ini)}–${num(fim)} de ${num(total)}`;
  }, [page, total]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[220px]">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full rounded-control border border-border-2 bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </div>

        <select value={classificacao} onChange={(e) => setClassificacao(e.target.value)} className={selCls}>
          <option value="">Todas as classificações</option>
          {classificacoes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {anos.length > 0 && (
          <select value={ano} onChange={(e) => setAno(e.target.value)} className={selCls}>
            <option value="">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-[10.5px] uppercase tracking-[0.05em] text-faint">
              <Th onClick={() => toggleSort("seq")} active={sort === "seq"} dir={dir}>Seq.</Th>
              <Th onClick={() => toggleSort("nome")} active={sort === "nome"} dir={dir}>Produto</Th>
              <th className="px-3 py-2.5 font-semibold">Classificação</th>
              {showUnidade && <th className="px-3 py-2.5 font-semibold">Unid.</th>}
              <th className="px-3 py-2.5 font-semibold">Medida</th>
              <Th onClick={() => toggleSort("quantidade")} active={sort === "quantidade"} dir={dir} right>Qtd.</Th>
              <th className="px-3 py-2.5 text-right font-semibold">Vlr. Ref.</th>
              <Th onClick={() => toggleSort("valor")} active={sort === "valor"} dir={dir} right>Vlr. Total</Th>
              <th className="px-3 py-2.5 font-semibold">Data</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={9} className="px-3 py-2">
                    <Skeleton className="h-8 w-full rounded-control" />
                  </td>
                </tr>
              ))
            ) : erro ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-[color:var(--sit-cancelado)]">
                  {erro}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-faint">
                  Nenhum item encontrado com os filtros atuais.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5 text-faint tabular-nums">{r.sequencial ?? "—"}</td>
                  <td className="max-w-[320px] px-3 py-2.5">
                    <span className="block truncate font-medium text-text" title={r.nomeProduto ?? ""}>
                      {r.nomeProduto ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block max-w-[180px] truncate rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-2" title={r.classificacao ?? ""}>
                      {r.classificacao ?? "—"}
                    </span>
                  </td>
                  {showUnidade && <td className="px-3 py-2.5 text-muted tabular-nums">{r.codigo ?? "—"}</td>}
                  <td className="px-3 py-2.5 text-muted">{r.unidadeMedida ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right text-text-2 tabular-nums">
                    {r.quantidade != null ? dec(r.quantidade) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-2 tabular-nums">
                    {r.valorReferencia != null ? brl(r.valorReferencia) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-text tabular-nums">
                    {r.valorTotal != null ? brl(r.valorTotal) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted tabular-nums">{dataBR(r.dataDesejada)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">{loading ? "Carregando..." : faixa}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border-2 text-text-2 disabled:opacity-40 enabled:hover:bg-surface-2"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-muted tabular-nums">{page} / {pages}</span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border-2 text-text-2 disabled:opacity-40 enabled:hover:bg-surface-2"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  right,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  right?: boolean;
}) {
  return (
    <th className={`px-3 py-2.5 font-semibold ${right ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 uppercase transition-colors hover:text-text-2 ${
          active ? "text-accent" : ""
        } ${right ? "flex-row-reverse" : ""}`}
      >
        {children}
        <IconSort className="h-3.5 w-3.5 opacity-60" />
        {active && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
