"use client";

import { useMemo } from "react";
import { brl } from "@/lib/format";
import type { AlvoVinculo, LinhaVinculo, TipoVinculo } from "@/lib/orcamento-vinculo";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { type Column, DataTable } from "./DataTable";
import { selectCls } from "./formStyles";
import { IconLink } from "./icons";

export type VinculoAlterado = { tipo: TipoVinculo; texto: string; alvoId: number | null };

/**
 * VÍNCULOS do orçamento: cada Órgão/Unidade DISTINTO do CUBO (texto próprio do relatório) ligado a
 * um órgão/unidade CADASTRADO no sistema. Tabela filtrável (estado · tipo · nome no orçamento ·
 * vínculo · lançamentos · dotação); o editor escolhe o alvo num `select` (unidades agrupadas por
 * órgão; ocultos só aparecem se já vinculados) ou aceita a SUGESTÃO automática (nome/sigla),
 * uma a uma ou todas de uma vez. Apresentacional: grava via `onVincular`.
 */
export function OrcamentoVinculos({
  linhas,
  alvos,
  podeEditar,
  salvando = false,
  onVincular,
}: {
  linhas: LinhaVinculo[];
  alvos: { orgaos: AlvoVinculo[]; unidades: AlvoVinculo[] };
  podeEditar: boolean;
  salvando?: boolean;
  onVincular: (lista: VinculoAlterado[]) => void;
}) {
  const porId = useMemo(
    () => ({
      orgao: new Map(alvos.orgaos.map((o) => [o.id, o])),
      unidade: new Map(alvos.unidades.map((u) => [u.id, u])),
    }),
    [alvos],
  );
  // Unidades agrupadas pelo órgão (ordem da tela de órgãos; sem órgão por último).
  const gruposUnidades = useMemo(() => {
    const grupos = alvos.orgaos.map((o) => ({ rotulo: o.nome, itens: alvos.unidades.filter((u) => u.orgaoId === o.id) }));
    const soltas = alvos.unidades.filter((u) => u.orgaoId == null || !porId.orgao.has(u.orgaoId));
    if (soltas.length) grupos.push({ rotulo: "Sem órgão", itens: soltas });
    return grupos.filter((g) => g.itens.length > 0);
  }, [alvos, porId]);

  const rotulo = (tipo: TipoVinculo, id: number | null) => {
    const a = id != null ? porId[tipo].get(id) : undefined;
    return a ? `${a.sigla} — ${a.nome}` : "";
  };
  const estado = (l: LinhaVinculo) => (l.alvoId != null ? "Vinculado" : l.sugestaoId != null ? "Sugestão" : "Sem vínculo");
  const sugeridas = linhas.filter((l) => l.alvoId == null && l.sugestaoId != null);
  const mudar = (l: LinhaVinculo, alvoId: number | null) => onVincular([{ tipo: l.tipo, texto: l.texto, alvoId }]);

  const opcoes = (l: LinhaVinculo) => {
    const vis = (a: AlvoVinculo) => !a.oculto || a.id === l.alvoId;
    const opt = (a: AlvoVinculo) => (
      <option key={a.id} value={a.id}>
        {a.sigla} — {a.nome}
        {a.oculto ? " (oculto)" : ""}
      </option>
    );
    return l.tipo === "orgao"
      ? alvos.orgaos.filter(vis).map(opt)
      : gruposUnidades.map((g) => {
          const itens = g.itens.filter(vis);
          return itens.length ? (
            <optgroup key={g.rotulo} label={g.rotulo}>
              {itens.map(opt)}
            </optgroup>
          ) : null;
        });
  };

  const colunas: Column<LinhaVinculo>[] = [
    {
      key: "estado",
      header: "Estado",
      nowrap: true,
      value: estado,
      render: (l) => (
        <Badge tone={l.alvoId != null ? "emerald" : l.sugestaoId != null ? "amber" : "slate"}>{estado(l)}</Badge>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      nowrap: true,
      value: (l) => (l.tipo === "orgao" ? "Órgão" : "Unidade"),
      render: (l) => <Badge tone={l.tipo === "orgao" ? "blue" : "violet"}>{l.tipo === "orgao" ? "Órgão" : "Unidade"}</Badge>,
    },
    {
      key: "texto",
      header: "No orçamento",
      align: "left",
      minWidth: 260,
      value: (l) => l.texto,
      render: (l) => (
        <span className="block max-w-[340px]">
          <span className="block truncate font-medium text-text" title={l.texto}>
            {l.texto}
          </span>
          {l.contexto && (
            <span className="block truncate text-xs text-muted" title={l.contexto}>
              {l.contexto}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "vinculo",
      header: "No sistema",
      align: "left",
      minWidth: 280,
      value: (l) => rotulo(l.tipo, l.alvoId),
      render: (l) =>
        podeEditar ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <select
              aria-label={`Vínculo de ${l.texto}`}
              className={`${selectCls} min-h-[44px] w-full max-w-[320px] sm:min-h-0`}
              value={l.alvoId ?? ""}
              disabled={salvando}
              onChange={(e) => mudar(l, e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Sem vínculo</option>
              {opcoes(l)}
            </select>
            {l.alvoId == null && l.sugestaoId != null && (
              <Button variant="ghost" disabled={salvando} onClick={() => mudar(l, l.sugestaoId)} title={rotulo(l.tipo, l.sugestaoId)}>
                Aceitar {porId[l.tipo].get(l.sugestaoId)?.sigla}
              </Button>
            )}
          </div>
        ) : (
          <span className="block max-w-[320px] truncate text-text-2">{rotulo(l.tipo, l.alvoId) || "—"}</span>
        ),
    },
    {
      key: "lancamentos",
      header: "Lançamentos",
      nowrap: true,
      filter: "range",
      numero: (l) => l.lancamentos,
      render: (l) => <span className="tabular-nums text-text-2">{l.lancamentos}</span>,
    },
    {
      key: "dotacao",
      header: "Dotação inicial",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (l) => l.valorInicial,
      render: (l) => <span className="tabular-nums font-semibold text-text">{brl(l.valorInicial)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Vincule cada Órgão/Unidade do relatório ao cadastro do sistema. O vínculo vale para todos os orçamentos, inclusive os próximos anos.
        </p>
        {podeEditar && sugeridas.length > 0 && (
          <Button
            variant="secondary"
            icon={<IconLink className="h-4 w-4" />}
            loading={salvando}
            onClick={() => onVincular(sugeridas.map((l) => ({ tipo: l.tipo, texto: l.texto, alvoId: l.sugestaoId })))}
          >
            Vincular {sugeridas.length} {sugeridas.length === 1 ? "sugestão" : "sugestões"}
          </Button>
        )}
      </div>
      <DataTable
        columns={colunas}
        rows={linhas}
        getKey={(l) => `${l.tipo}|${l.chave}`}
        pageSize={20}
        minWidth={1000}
        resumo={(ls) => (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>{ls.length === 1 ? "1 texto" : `${ls.length} textos`}</span>
            <span className="text-text-2">
              Vinculados <span className="font-semibold tabular-nums text-text">{ls.filter((l) => l.alvoId != null).length}</span>
            </span>
            <span className="text-text-2">
              Dotação <span className="font-semibold tabular-nums text-text">{brl(ls.reduce((s, l) => s + l.valorInicial, 0))}</span>
            </span>
          </span>
        )}
      />
    </div>
  );
}
