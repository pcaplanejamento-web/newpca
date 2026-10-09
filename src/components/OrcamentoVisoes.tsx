"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import { aplicarVisao, contarAusentes, resumoVisao, type VisaoOrcamento, valoresAusentes } from "@/lib/orcamento-visao";
import type { AlvosVinculo, VinculoOrcamento } from "@/lib/orcamento-vinculo";
import { FerramentasAba } from "./AbasEspaco";
import { AjudaVisoes } from "./AjudaVisoes";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { EditorVisaoOrcamento, type LinhaVisaoOrcamento } from "./EditorVisaoOrcamento";
import { IconPlus, IconTrash } from "./icons";


/**
 * VISÕES SALVAS do orçamento (globais — o PCA escolhe a sua na Configuração): tabela padrão da Mesa com cada visão, o
 * resumo dos filtros e o Σ que ela pega DESTE orçamento; clicar numa linha abre o editor no BANNER padrão (`Modal`) (nome + uma linha por
 * dimensão da visão — `DIMENSOES_VISAO`; unidade, ações e órgão são dos Vínculos —, opções CONECTADAS + prévia do Σ). "Criar visão" fica na barra das abas (`FerramentasAba`). As
 * visões vêm do servidor; salvar/excluir recarrega a página.
 */
export function OrcamentoVisoes({
  itens,
  visoes,
  vinculos,
  alvos,
  podeEditar,
}: {
  itens: LinhaVisaoOrcamento[];
  visoes: VisaoOrcamento[];
  /** TODOS os vínculos (o padrão e os das visões) + os alvos — a aba Vínculos do banner da visão. */
  vinculos: VinculoOrcamento[];
  alvos: AlvosVinculo;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<VisaoOrcamento | "nova" | null>(null);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();
  const total = useMemo(() => itens.reduce((s, i) => s + i.valorInicial, 0), [itens]);
  const abrir = (v: VisaoOrcamento | "nova") => setEditando(v);

  async function excluir(v: VisaoOrcamento) {
    const ok = await confirmar({
      titulo: `Excluir a visão "${v.nome}"?`,
      texto: v.pcas?.length
        ? `${v.pcas.length === 1 ? "O PCA" : "Os PCAs"} ${v.pcas.join("; ")} ${v.pcas.length === 1 ? "passa" : "passam"} a considerar o orçamento inteiro.`
        : "Nenhum PCA usa esta visão.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    const r = await fetch(`/api/orcamento/visoes/${v.id}`, { method: "DELETE" });
    setAviso(r.ok ? { kind: "ok", texto: "Visão excluída." } : { kind: "danger", texto: "Não foi possível excluir a visão." });
    if (editando !== "nova" && editando?.id === v.id) setEditando(null);
    router.refresh();
  }

  // Σ e lançamentos que cada visão pega DESTE orçamento (informação útil na lista).
  const naVisaoPorId = useMemo(() => {
    const m = new Map<number, { soma: number; linhas: number; ausentes: number }>();
    for (const v of visoes) {
      const f = aplicarVisao(itens, v.filtros);
      m.set(v.id, { soma: f.reduce((s, i) => s + i.valorInicial, 0), linhas: f.length, ausentes: contarAusentes(valoresAusentes(itens, v.filtros)) });
    }
    return m;
  }, [itens, visoes]);
  const colunas: Column<VisaoOrcamento>[] = [
    { key: "nome", header: "Visão", align: "left", minWidth: 200, value: (v) => v.nome, render: (v) => <span className="font-semibold text-text">{v.nome}</span> },
    {
      key: "filtros",
      header: "Filtros",
      align: "left",
      minWidth: 220,
      value: (v) => resumoVisao(v.filtros),
      render: (v) => {
        const n = naVisaoPorId.get(v.id)?.ausentes ?? 0;
        return (
          <span className="text-text-2">
            {resumoVisao(v.filtros)}
            {n > 0 && (
              <span className="ml-1.5 font-semibold" style={{ color: "var(--warn)" }} title="Valores escolhidos que este orçamento não traz">
                · {num(n)} ausente(s)
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "vinculos",
      header: "Vínculos",
      nowrap: true,
      value: (v) => (v.proprias.length ? "Próprios" : "Padrão"),
      render: (v) =>
        v.proprias.length ? (
          <span title="Unidades do orçamento com vínculos próprios nesta visão (as demais seguem o padrão)">
            <Badge tone="violet">{`${num(v.proprias.length)} ${v.proprias.length === 1 ? "própria" : "próprias"}`}</Badge>
          </span>
        ) : (
          <span className="text-text-2">Padrão</span>
        ),
    },
    {
      key: "pcas",
      header: "PCAs",
      align: "left",
      minWidth: 160,
      valores: (v) => (v.pcas?.length ? v.pcas : ["—"]),
      render: (v) => <span className="line-clamp-1 text-text-2">{v.pcas?.length ? v.pcas.join("; ") : "—"}</span>,
    },
    {
      key: "lancamentos",
      header: "Lançamentos",
      nowrap: true,
      filter: "range",
      formatarFaixa: num,
      numero: (v) => naVisaoPorId.get(v.id)?.linhas ?? 0,
      render: (v) => <span className="tabular-nums text-text-2">{num(naVisaoPorId.get(v.id)?.linhas ?? 0)}</span>,
    },
    {
      key: "dotacao",
      header: "Dotação na visão",
      align: "right",
      nowrap: true,
      filter: "range",
      numero: (v) => naVisaoPorId.get(v.id)?.soma ?? 0,
      render: (v) => <span className="tabular-nums font-semibold text-text">{brl(naVisaoPorId.get(v.id)?.soma ?? 0)}</span>,
    },
    ...(podeEditar
      ? [
          {
            key: "acoes",
            header: "",
            filter: "none" as const,
            nowrap: true,
            render: (v: VisaoOrcamento) => (
              <Button
                size="xs"
                variant="ghost"
                aria-label={`Excluir ${v.nome}`}
                icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  void excluir(v);
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <FerramentasAba>
        {podeEditar && (
          <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => abrir("nova")}>
            Criar visão
          </Button>
        )}
        <AjudaVisoes botao="sm" />
      </FerramentasAba>
      <DataTable
        columns={colunas}
        rows={visoes}
        getKey={(v) => v.id}
        scrollInterno
        density="compact"
        minWidth={720}
        onRowClick={(v) => abrir(v)}
        activeKey={editando !== "nova" && editando ? editando.id : null}
        vazio={podeEditar ? "Nenhuma visão salva ainda. Use “Criar visão”." : "Nenhuma visão salva ainda."}
        resumo={(ls) => `${num(ls.length)} ${ls.length === 1 ? "visão" : "visões"} · Dotação do orçamento ${brl(total)}`}
      />
      <EditorVisaoOrcamento
        aberta={editando}
        itens={itens}
        podeEditar={podeEditar}
        vinculos={vinculos}
        alvos={alvos}
        visoes={visoes}
        onFechar={() => setEditando(null)}
        onSalva={(r) => {
          setAviso({ kind: "ok", texto: r.nova ? "Visão criada." : "Visão atualizada." });
          setEditando(null);
          router.refresh();
        }}
      />
      {confirmacao}
      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Pronto" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 4000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}
    </>
  );
}
