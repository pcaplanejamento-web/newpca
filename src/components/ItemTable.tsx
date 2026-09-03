"use client";

import { useEffect, useMemo, useState } from "react";
import { brl, dataBR, dec, num } from "@/lib/format";
import {
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconSort,
  IconSpinner,
} from "./icons";

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

type Resp = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

type Sort = "valor" | "nome" | "seq" | "quantidade";

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

  // debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setQDeb(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // volta pra página 1 quando muda filtro/unidade
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
      {/* filtros */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[220px]">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-500/20"
          />
        </div>

        <select
          value={classificacao}
          onChange={(e) => setClassificacao(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="">Todas as classificações</option>
          {classificacoes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {anos.length > 0 && (
          <select
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* tabela */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <Th onClick={() => toggleSort("seq")} active={sort === "seq"} dir={dir}>
                Seq.
              </Th>
              <Th onClick={() => toggleSort("nome")} active={sort === "nome"} dir={dir}>
                Produto
              </Th>
              <th className="px-3 py-2.5 font-semibold">Classificação</th>
              {showUnidade && <th className="px-3 py-2.5 font-semibold">Unid.</th>}
              <th className="px-3 py-2.5 font-semibold">Medida</th>
              <Th
                onClick={() => toggleSort("quantidade")}
                active={sort === "quantidade"}
                dir={dir}
                right
              >
                Qtd.
              </Th>
              <th className="px-3 py-2.5 text-right font-semibold">Vlr. Ref.</th>
              <Th
                onClick={() => toggleSort("valor")}
                active={sort === "valor"}
                dir={dir}
                right
              >
                Vlr. Total
              </Th>
              <th className="px-3 py-2.5 font-semibold">Data</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-slate-400">
                  <IconSpinner className="mx-auto h-6 w-6" />
                </td>
              </tr>
            ) : erro ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-red-500">
                  {erro}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-slate-400">
                  Nenhum item encontrado com os filtros atuais.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2.5 text-slate-400 tabular-nums">
                    {r.sequencial ?? "—"}
                  </td>
                  <td className="max-w-[320px] px-3 py-2.5">
                    <span
                      className="block truncate font-medium text-slate-800 dark:text-slate-100"
                      title={r.nomeProduto ?? ""}
                    >
                      {r.nomeProduto ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block max-w-[180px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300" title={r.classificacao ?? ""}>
                      {r.classificacao ?? "—"}
                    </span>
                  </td>
                  {showUnidade && (
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                      {r.codigo ?? "—"}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-slate-500">
                    {r.unidadeMedida ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums dark:text-slate-300">
                    {r.quantidade != null ? dec(r.quantidade) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums dark:text-slate-300">
                    {r.valorReferencia != null ? brl(r.valorReferencia) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                    {r.valorTotal != null ? brl(r.valorTotal) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                    {dataBR(r.dataDesejada)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* paginação */}
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          {loading ? "Carregando..." : faixa}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 enabled:hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:enabled:hover:bg-slate-800"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-slate-500 tabular-nums dark:text-slate-400">
            {page} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 enabled:hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:enabled:hover:bg-slate-800"
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
        className={`inline-flex items-center gap-1 uppercase transition hover:text-slate-800 dark:hover:text-slate-200 ${
          active ? "text-emerald-600 dark:text-emerald-400" : ""
        } ${right ? "flex-row-reverse" : ""}`}
      >
        {children}
        <IconSort className="h-3.5 w-3.5 opacity-60" />
        {active && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
