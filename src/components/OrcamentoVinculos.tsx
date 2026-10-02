"use client";

import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import type { AlvoVinculo, AlvosVinculo, LinhaVinculo } from "@/lib/orcamento-vinculo";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { FerramentasAba } from "./AbasEspaco";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { type Column, DataTable } from "./DataTable";
import { SearchField } from "./Field";
import { selectCls } from "./formStyles";
import { IconLink } from "./icons";
import { SeletorMultiplo } from "./SeletorMultiplo";

/** Um vínculo a gravar: a unidade do CUBO (texto), a unidade do cadastro e as chaves das AÇÕES que ficam de fora. */
export type VinculoAlterado = { texto: string; alvoId: number | null; acoesFora: string[] };

/**
 * VÍNCULOS do orçamento: cada UNIDADE DISTINTA do CUBO (texto próprio do relatório) ligada a uma unidade CADASTRADA e,
 * dentro dela, as AÇÕES que entram no vínculo (as desmarcadas ficam "Sem vínculo"). O ÓRGÃO não se vincula — ver por
 * órgão é a soma das unidades vinculadas. Tabela filtrável (estado · no orçamento · no sistema · ações · lançamentos ·
 * dotação · dotação vinculada); o editor escolhe a unidade num `select` (agrupadas por órgão; ocultas só se já
 * vinculadas) ou aceita a SUGESTÃO (nome/sigla), uma a uma ou todas de uma vez. O vínculo vale para TODOS os orçamentos
 * (é pelo texto). Busca e "Vincular N sugestões" nas `FerramentasAba`. Apresentacional: grava via `onVincular`.
 * `scrollInterno` = tabela padrão da Mesa (corpo rola por dentro; linhas por página de Configurações).
 */
export function OrcamentoVinculos({
  linhas,
  alvos,
  podeEditar,
  salvando = false,
  scrollInterno = false,
  onVincular,
}: {
  linhas: LinhaVinculo[];
  alvos: AlvosVinculo;
  podeEditar: boolean;
  salvando?: boolean;
  scrollInterno?: boolean;
  onVincular: (lista: VinculoAlterado[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const unidadePorId = useMemo(() => new Map(alvos.unidades.map((u) => [u.id, u])), [alvos]);
  const orgaoPorId = useMemo(() => new Map(alvos.orgaos.map((o) => [o.id, o])), [alvos]);
  // Unidades agrupadas pelo órgão (ordem da tela de órgãos — toda unidade pertence a um órgão).
  const gruposUnidades = useMemo(
    () => alvos.orgaos.map((o) => ({ rotulo: o.nome, itens: alvos.unidades.filter((u) => u.orgaoId === o.id) })).filter((g) => g.itens.length > 0),
    [alvos],
  );

  // Sigla REPETIDA entre unidades (ex.: a unidade própria de um órgão dual): o órgão entra no rótulo — nunca duas iguais.
  const siglasRepetidas = useMemo(() => {
    const conta = new Map<string, number>();
    for (const u of alvos.unidades) {
      const k = u.sigla.trim().toUpperCase();
      conta.set(k, (conta.get(k) ?? 0) + 1);
    }
    return new Set([...conta].filter(([, n]) => n > 1).map(([k]) => k));
  }, [alvos]);
  const textoAlvo = (a: AlvoVinculo) => {
    const o = siglasRepetidas.has(a.sigla.trim().toUpperCase()) && a.orgaoId != null ? orgaoPorId.get(a.orgaoId) : undefined;
    return `${a.sigla} — ${a.nome}${o ? ` (${o.sigla || o.nome})` : ""}`;
  };
  const rotulo = (id: number | null) => {
    const a = id != null ? unidadePorId.get(id) : undefined;
    return a ? textoAlvo(a) : "";
  };
  const estado = (l: LinhaVinculo) => (l.alvoId != null ? "Vinculado" : l.sugestaoId != null ? "Sugestão" : "Sem vínculo");
  const sugeridas = linhas.filter((l) => l.alvoId == null && l.sugestaoId != null);
  // Trocar a unidade mantém as ações escolhidas; escolher as ações mantém a unidade.
  const mudar = (l: LinhaVinculo, alvoId: number | null) => onVincular([{ texto: l.texto, alvoId, acoesFora: l.acoesFora }]);
  const mudarAcoes = (l: LinhaVinculo, dentro: string[]) => {
    const marcadas = new Set(dentro);
    onVincular([{ texto: l.texto, alvoId: l.alvoId, acoesFora: l.acoes.filter((a) => !marcadas.has(a.texto)).map((a) => a.chave) }]);
  };
  /** A dotação que o vínculo leva (só as ações que entram). */
  const dotacaoVinculada = (l: LinhaVinculo) => {
    if (l.alvoId == null) return 0;
    const fora = new Set(l.acoesFora);
    return l.acoes.reduce((s, a) => (fora.has(a.chave) ? s : s + a.valorInicial), 0);
  };
  const acoesDentro = (l: LinhaVinculo) => {
    const fora = new Set(l.acoesFora);
    return l.acoes.filter((a) => !fora.has(a.chave));
  };

  const opcoes = (l: LinhaVinculo) => {
    const vis = (a: AlvoVinculo) => !a.oculto || a.id === l.alvoId;
    return gruposUnidades.map((g) => {
      const itens = g.itens.filter(vis);
      return itens.length ? (
        <optgroup key={g.rotulo} label={g.rotulo}>
          {itens.map((a) => (
            <option key={a.id} value={a.id}>
              {textoAlvo(a)}
              {a.oculto ? " (oculto)" : ""}
            </option>
          ))}
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
      key: "texto",
      header: "Unidade no orçamento",
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
      value: (l) => rotulo(l.alvoId),
      render: (l) =>
        podeEditar ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <select
              aria-label={`Vínculo de ${l.texto}`}
              className={`${selectCls} min-h-[44px] w-full max-w-[300px] lg:min-h-0`}
              value={l.alvoId ?? ""}
              disabled={salvando}
              onChange={(e) => mudar(l, e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Sem vínculo</option>
              {opcoes(l)}
            </select>
            {l.alvoId == null && l.sugestaoId != null && (
              <Button size="xs" variant="ghost" disabled={salvando} onClick={() => mudar(l, l.sugestaoId)} title={rotulo(l.sugestaoId)}>
                Aceitar {unidadePorId.get(l.sugestaoId)?.sigla}
              </Button>
            )}
          </div>
        ) : (
          <span className="block max-w-[320px] truncate text-text-2">{rotulo(l.alvoId) || "—"}</span>
        ),
    },
    {
      key: "acoes",
      header: "Ações vinculadas",
      align: "left",
      minWidth: 240,
      value: (l) => (l.alvoId == null ? "Sem vínculo" : l.acoesFora.length === 0 ? "Todas" : `${acoesDentro(l).length} de ${l.acoes.length}`),
      render: (l) =>
        l.alvoId == null ? (
          <span className="text-faint">Vincule a unidade primeiro</span>
        ) : podeEditar ? (
          <div className="w-full max-w-[280px]">
            <SeletorMultiplo
              suspenso
              rotulo={l.acoesFora.length === 0 ? `Todas as ações (${l.acoes.length})` : `${acoesDentro(l).length} de ${l.acoes.length} ações`}
              opcoes={l.acoes.map((a) => ({ valor: a.texto, contagem: a.lancamentos }))}
              selecionados={acoesDentro(l).map((a) => a.texto)}
              textoVazio="Nenhuma"
              onChange={(v) => mudarAcoes(l, v)}
            />
          </div>
        ) : (
          <span className="text-text-2">{l.acoesFora.length === 0 ? `Todas (${l.acoes.length})` : `${acoesDentro(l).length} de ${l.acoes.length}`}</span>
        ),
    },
    {
      key: "lancamentos",
      header: "Lançamentos",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
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
      render: (l) => <span className="tabular-nums text-text-2">{brl(l.valorInicial)}</span>,
    },
    {
      key: "vinculada",
      header: "Dotação vinculada",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: dotacaoVinculada,
      render: (l) => <span className="tabular-nums font-semibold text-text">{brl(dotacaoVinculada(l))}</span>,
    },
  ];

  const casa = predicadoBusca(busca);
  const visiveis = casa ? linhas.filter((l) => casa([l.texto, l.contexto, rotulo(l.alvoId)])) : linhas;

  return (
    <>
      <FerramentasAba>
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <SearchField
            compacto
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onClear={() => setBusca("")}
            placeholder="Buscar… (vários com :)"
            aria-label="Buscar nos vínculos"
          />
        </div>
        {podeEditar && sugeridas.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            icon={<IconLink className="h-4 w-4" />}
            loading={salvando}
            title="O vínculo vale para todos os orçamentos"
            onClick={() => onVincular(sugeridas.map((l) => ({ texto: l.texto, alvoId: l.sugestaoId, acoesFora: l.acoesFora })))}
          >
            Vincular {sugeridas.length} {sugeridas.length === 1 ? "sugestão" : "sugestões"}
          </Button>
        )}
      </FerramentasAba>
      <DataTable
        columns={colunas}
        rows={visiveis}
        getKey={(l) => l.chave}
        scrollInterno={scrollInterno}
        pageSize={scrollInterno ? undefined : 20}
        density="compact"
        minWidth={1240}
        exportar={{ nome: "Vínculos do orçamento" }}
        vazio={busca ? "Nenhuma unidade para esta busca." : "Nenhuma unidade neste orçamento."}
        resumo={(ls) =>
          `${num(ls.length)} ${ls.length === 1 ? "unidade" : "unidades"} · ${num(ls.filter((l) => l.alvoId != null).length)} vinculadas · Dotação ${brl(
            ls.reduce((s, l) => s + l.valorInicial, 0),
          )} · vinculada ${brl(ls.reduce((s, l) => s + dotacaoVinculada(l), 0))}`
        }
      />
    </>
  );
}
