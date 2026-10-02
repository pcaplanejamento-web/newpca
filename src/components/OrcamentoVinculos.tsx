"use client";

import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import {
  type AlvosVinculo,
  type LinhaVinculo,
  linhasVinculos,
  type PendenciaVinculo,
  rotuloCadastro,
  semVinculo,
  type UnidadeOrcamento,
  type VinculoOrcamento,
} from "@/lib/orcamento-vinculo";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { FerramentasAba } from "./AbasEspaco";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { type Column, DataTable } from "./DataTable";
import { type AberturaVinculo, type DadosVinculo, EditorVinculoOrcamento, useRotuloUnidade } from "./EditorVinculoOrcamento";
import { SearchField } from "./Field";
import { IconLink, IconPencil, IconPlus } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";

type Vista = "vinculos" | "sem";

/** Resumo das ações de um vínculo: "Todas as demais", "As demais, menos N" ou "k ações". */
const textoAcoes = (l: LinhaVinculo) =>
  l.vinculo.acoes == null
    ? l.vinculo.acoesFora.length > 0
      ? `As demais, menos ${num(l.vinculo.acoesFora.length)}`
      : "Todas as demais"
    : `${num(l.acoes.length)} ${l.acoes.length === 1 ? "ação" : "ações"}`;

const abertura = (v: VinculoOrcamento): AberturaVinculo => ({ id: v.id, chave: v.chave, alvoId: v.alvoId, acoes: v.acoes, acoesFora: v.acoesFora });

/**
 * VÍNCULOS do orçamento CRIADOS pelo usuário: cada um liga uma UNIDADE do CUBO a UMA unidade cadastrada, com as AÇÕES
 * dele — a mesma unidade do orçamento pode ter vários (as ações divididas). Duas vistas (`Segmented`): **Vínculos** (os
 * criados que aparecem neste orçamento: unidade do orçamento · unidade e órgão do cadastro · ações · lançamentos ·
 * dotação vinculada; tocar edita) e **Sem vínculo** (as unidades com ações sem vínculo — "Vincular" abre o editor com
 * ela; a SUGESTÃO por nome/sigla para as que não têm nenhum, uma a uma ou todas). "Novo vínculo" na barra das abas. O
 * vínculo vale para TODOS os orçamentos (é pelo texto). Apresentacional: grava via `onCriar`/`onEditar`/`onExcluir`.
 */
export function OrcamentoVinculos({
  unidades,
  vinculos,
  alvos,
  podeEditar,
  salvando = false,
  erro = null,
  scrollInterno = false,
  onCriar,
  onEditar,
  onExcluir,
}: {
  unidades: UnidadeOrcamento[];
  vinculos: VinculoOrcamento[];
  alvos: AlvosVinculo;
  podeEditar: boolean;
  salvando?: boolean;
  /** O erro da última gravação (aparece no editor aberto). */
  erro?: string | null;
  scrollInterno?: boolean;
  /** Grava vínculos novos; devolve se gravou (o editor fecha). */
  onCriar: (lista: DadosVinculo[]) => Promise<boolean>;
  onEditar: (id: number, dados: DadosVinculo) => Promise<boolean>;
  onExcluir: (id: number) => Promise<boolean>;
}) {
  const [vista, setVista] = useState<Vista>("vinculos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<AberturaVinculo | null>(null);
  const rotulo = useRotuloUnidade(alvos);
  const orgaoDe = useMemo(() => {
    const o = new Map(alvos.orgaos.map((x) => [x.id, x]));
    const u = new Map(alvos.unidades.map((x) => [x.id, x]));
    return (id: number) => {
      const org = o.get(u.get(id)?.orgaoId ?? -1);
      return org ? rotuloCadastro(org) : "—";
    };
  }, [alvos]);

  const linhas = useMemo(() => linhasVinculos(unidades, vinculos), [unidades, vinculos]);
  const pendencias = useMemo(() => semVinculo(unidades, vinculos, alvos.unidades), [unidades, vinculos, alvos]);
  const sugeridas = pendencias.filter((p) => p.sugestaoId != null);
  const casa = predicadoBusca(busca);
  const linhasVis = casa ? linhas.filter((l) => casa([l.unidade.texto, l.unidade.contexto, rotulo.deId(l.vinculo.alvoId)])) : linhas;
  const pendVis = casa ? pendencias.filter((p) => casa([p.unidade.texto, p.unidade.contexto])) : pendencias;

  const fechar = () => setAberto(null);
  const salvar = async (d: DadosVinculo) => {
    const ok = aberto?.id != null ? await onEditar(aberto.id, d) : await onCriar([d]);
    if (ok) fechar();
  };
  const unidadeTexto = (u: UnidadeOrcamento) => (
    <span className="block max-w-[340px]">
      <span className="block truncate font-medium text-text" title={u.texto}>
        {u.texto}
      </span>
      {u.contexto && (
        <span className="block truncate text-xs text-muted" title={u.contexto}>
          {u.contexto}
        </span>
      )}
    </span>
  );

  const colVinculos: Column<LinhaVinculo>[] = [
    { key: "unidade", header: "Unidade no orçamento", align: "left", minWidth: 260, value: (l) => l.unidade.texto, render: (l) => unidadeTexto(l.unidade) },
    {
      key: "cadastro",
      header: "Unidade cadastrada",
      align: "left",
      minWidth: 240,
      value: (l) => rotulo.deId(l.vinculo.alvoId),
      render: (l) => <span className="block max-w-[300px] truncate text-text">{rotulo.deId(l.vinculo.alvoId)}</span>,
    },
    {
      key: "orgao",
      header: "Órgão (cadastro)",
      align: "left",
      minWidth: 180,
      value: (l) => orgaoDe(l.vinculo.alvoId),
      render: (l) => <span className="block max-w-[240px] truncate text-text-2">{orgaoDe(l.vinculo.alvoId)}</span>,
    },
    {
      key: "acoes",
      header: "Ações",
      nowrap: true,
      value: textoAcoes,
      render: (l) => (
        <span title={l.acoes.map((a) => a.texto).join("\n")}>
          <Badge tone={l.vinculo.acoes == null ? "blue" : "violet"}>{textoAcoes(l)}</Badge>
        </span>
      ),
    },
    { key: "lancamentos", header: "Lançamentos", nowrap: true, filter: "range", formatarFaixa: num, numero: (l) => l.lancamentos, render: (l) => num(l.lancamentos) },
    {
      key: "valor",
      header: "Dotação vinculada",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (l) => l.valorInicial,
      render: (l) => <span className="tabular-nums font-semibold text-text">{brl(l.valorInicial)}</span>,
    },
  ];
  if (podeEditar)
    colVinculos.push({
      key: "editar",
      header: "",
      filter: "none",
      nowrap: true,
      render: (l) => (
        <Button
          size="xs"
          variant="ghost"
          icon={<IconPencil className="h-4 w-4" />}
          aria-label={`Editar o vínculo de ${l.unidade.texto}`}
          onClick={(e) => {
            e.stopPropagation();
            setAberto(abertura(l.vinculo));
          }}
        />
      ),
    });

  const colSem: Column<PendenciaVinculo>[] = [
    { key: "unidade", header: "Unidade no orçamento", align: "left", minWidth: 260, value: (p) => p.unidade.texto, render: (p) => unidadeTexto(p.unidade) },
    {
      key: "situacao",
      header: "Situação",
      nowrap: true,
      value: (p) => (p.vinculada ? "Ações sem vínculo" : "Sem vínculo"),
      render: (p) => (
        <span title={p.acoes.map((a) => a.texto).join("\n")}>
          <Badge tone={p.vinculada ? "amber" : "slate"}>
            {p.vinculada ? `${num(p.acoes.length)} de ${num(p.unidade.acoes.length)} ações sem vínculo` : "Sem vínculo"}
          </Badge>
        </span>
      ),
    },
    {
      key: "sugestao",
      header: "Sugestão",
      align: "left",
      minWidth: 200,
      value: (p) => rotulo.deId(p.sugestaoId),
      render: (p) =>
        p.sugestaoId == null ? (
          <span className="text-faint">—</span>
        ) : podeEditar ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={salvando}
            title={rotulo.deId(p.sugestaoId)}
            onClick={(e) => {
              e.stopPropagation();
              void onCriar([{ texto: p.unidade.texto, alvoId: p.sugestaoId as number, acoes: null, acoesFora: [] }]);
            }}
          >
            Aceitar {alvos.unidades.find((u) => u.id === p.sugestaoId)?.sigla}
          </Button>
        ) : (
          <span className="text-text-2">{rotulo.deId(p.sugestaoId)}</span>
        ),
    },
    { key: "lancamentos", header: "Lançamentos", nowrap: true, filter: "range", formatarFaixa: num, numero: (p) => p.lancamentos, render: (p) => num(p.lancamentos) },
    {
      key: "valor",
      header: "Dotação sem vínculo",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (p) => p.valorInicial,
      render: (p) => <span className="tabular-nums font-semibold text-text">{brl(p.valorInicial)}</span>,
    },
  ];
  if (podeEditar)
    colSem.push({
      key: "vincular",
      header: "",
      filter: "none",
      nowrap: true,
      render: (p) => (
        <Button
          size="xs"
          variant="secondary"
          icon={<IconLink className="h-4 w-4" />}
          onClick={(e) => {
            e.stopPropagation();
            // A unidade sem vínculo nenhum: com as demais ações; a que já tem algum: as ações que faltam.
            setAberto({ chave: p.unidade.chave, acoes: p.vinculada ? p.acoes.map((a) => a.chave) : null });
          }}
        >
          Vincular
        </Button>
      ),
    });

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
            title="Cria um vínculo com as ações de cada unidade sugerida (vale para todos os orçamentos)"
            onClick={() => void onCriar(sugeridas.map((p) => ({ texto: p.unidade.texto, alvoId: p.sugestaoId as number, acoes: null, acoesFora: [] })))}
          >
            Vincular {sugeridas.length} {sugeridas.length === 1 ? "sugestão" : "sugestões"}
          </Button>
        )}
        {podeEditar && (
          <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setAberto({})}>
            <span className="max-sm:hidden">Novo vínculo</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        )}
      </FerramentasAba>
      <div className="mb-[var(--gap-block)]">
        <Segmented<Vista>
          value={vista}
          onChange={setVista}
          ariaLabel="Vista dos vínculos"
          options={[
            { value: "vinculos", label: `Vínculos (${linhas.length})` },
            { value: "sem", label: `Sem vínculo (${pendencias.length})` },
          ]}
        />
      </div>
      {vista === "vinculos" ? (
        <DataTable
          key="vinculos"
          columns={colVinculos}
          rows={linhasVis}
          getKey={(l) => l.vinculo.id}
          scrollInterno={scrollInterno}
          pageSize={scrollInterno ? undefined : 20}
          density="compact"
          minWidth={1100}
          onRowClick={podeEditar ? (l) => setAberto(abertura(l.vinculo)) : undefined}
          activeKey={aberto?.id ?? null}
          exportar={{ nome: "Vínculos do orçamento" }}
          vazio={busca ? "Nenhum vínculo para esta busca." : "Nenhum vínculo neste orçamento — use “Novo vínculo” ou a vista “Sem vínculo”."}
          resumo={(ls) => `${num(ls.length)} ${ls.length === 1 ? "vínculo" : "vínculos"} · Dotação vinculada ${brl(ls.reduce((s, l) => s + l.valorInicial, 0))}`}
        />
      ) : (
        <DataTable
          key="sem"
          columns={colSem}
          rows={pendVis}
          getKey={(p) => p.unidade.chave}
          scrollInterno={scrollInterno}
          pageSize={scrollInterno ? undefined : 20}
          density="compact"
          minWidth={1000}
          exportar={{ nome: "Unidades sem vínculo" }}
          vazio={busca ? "Nenhuma unidade para esta busca." : "Todas as ações deste orçamento estão vinculadas."}
          resumo={(ps) => `${num(ps.length)} ${ps.length === 1 ? "unidade" : "unidades"} · Dotação sem vínculo ${brl(ps.reduce((s, p) => s + p.valorInicial, 0))}`}
        />
      )}
      <Modal open={aberto != null} onClose={fechar} titulo={aberto?.id != null ? "Editar vínculo" : "Novo vínculo"} size="lg" bloqueado={salvando}>
        {aberto && (
          <EditorVinculoOrcamento
            key={`${aberto.id ?? "novo"}:${aberto.chave ?? ""}`}
            unidades={unidades}
            vinculos={vinculos}
            alvos={alvos}
            inicial={aberto}
            salvando={salvando}
            erro={erro}
            onSalvar={(d) => void salvar(d)}
            onExcluir={aberto.id != null ? () => void onExcluir(aberto.id as number).then((ok) => ok && fechar()) : undefined}
            onFechar={fechar}
          />
        )}
      </Modal>
    </>
  );
}
