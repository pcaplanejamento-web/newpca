"use client";

import { useMemo, useState } from "react";
import type { EdicaoTabela } from "@/lib/edicoes-tabela-core";
import { brl, num } from "@/lib/format";
import type { OrcamentoItemRow, OrcamentoResumo } from "@/lib/orcamento";
import { type DimensoesCadastro, SEM_VINCULO_ORC } from "@/lib/orcamento-vinculo";
import { aplicarVisao, type VisaoOrcamento } from "@/lib/orcamento-visao";
import type { PodeTela } from "@/lib/papeis-core";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { FerramentasAba } from "./AbasEspaco";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { type Column, DataTable, type EdicoesDaTabela } from "./DataTable";
import { SearchField } from "./Field";
import { IconUpload } from "./icons";
import { ImportarOrcamento } from "./ImportarOrcamento";
import { Modal } from "./Modal";
import { OrcamentoItemDetalhe } from "./OrcamentoItemDetalhe";

/** O lançamento com a Unidade/Órgão do CADASTRO (`comVinculos`). */
type Lancamento = OrcamentoItemRow & DimensoesCadastro;

const soma = (linhas: Lancamento[], campo: "valorInicial" | "saldo") => linhas.reduce((s, r) => s + (r[campo] || 0), 0);

/** Coluna de TEXTO longo (truncada, com o texto inteiro no `title`). */
const colTexto = (key: string, header: string, get: (r: Lancamento) => string | null, minWidth: number, forte = false): Column<Lancamento> => ({
  key,
  header,
  minWidth,
  value: (r) => get(r) ?? "",
  render: (r) => (
    <span className={`block truncate ${forte ? "text-text" : "text-text-2"}`} style={{ maxWidth: minWidth + 90 }} title={get(r) ?? ""}>
      {get(r) || "—"}
    </span>
  ),
});

/** Coluna de CÓDIGO curto (mono, sem quebra). */
const colCodigo = (key: string, header: string, get: (r: Lancamento) => string | null): Column<Lancamento> => ({
  key,
  header,
  nowrap: true,
  value: (r) => get(r) ?? "",
  render: (r) => <span className="whitespace-nowrap font-mono text-[13px] text-muted">{get(r) || "—"}</span>,
});

/** Coluna de VALOR (R$ à direita, filtro por faixa). */
const colValor = (key: string, header: string, get: (r: Lancamento) => number, forte = false): Column<Lancamento> => ({
  key,
  header,
  align: "right",
  nowrap: true,
  filter: "range",
  numero: get,
  render: (r) => <span className={`tabular-nums ${forte ? "font-semibold text-text" : "text-text-2"}`}>{brl(get(r))}</span>,
});

/**
 * Aba LANÇAMENTOS da tela do orçamento: TODAS as colunas do CUBO (Órgão · Unidade · Função · Programa · Ação · Elemento ·
 * Código · Ficha · Fonte + os valores), a UNIDADE e o ÓRGÃO DO CADASTRO (pelos Vínculos, com as ações escolhidas — o órgão
 * é a soma das unidades vinculadas) e UMA COLUNA POR VISÃO salva (o lançamento entra ou não nela). Tabela padrão da Mesa
 * (`scrollInterno` + `compact`) com a EDIÇÃO da tabela e as edições salvas (`edicoes`, chave `orcamento-lancamentos:`) e o
 * Exportar XLSX/PDF no rodapé; busca na barra das abas. Clicar numa linha abre o detalhe SÓ-LEITURA. Os lançamentos vêm do
 * sistema oficial — o editor REENVIA a planilha pelo botão no rodapé (`ImportarOrcamento` com `alvo`).
 */
export function OrcamentoLancamentos({
  orcamento,
  pode,
  itens,
  visoes,
  edicoes,
}: {
  orcamento: OrcamentoResumo;
  /** O que o papel permite: Importar (reenviar a planilha); Exportar segue o `PermissaoExportar` da página. */
  pode: Pick<PodeTela, "importar">;
  itens: Lancamento[];
  /** As visões salvas — uma coluna "Sim/Não" cada. */
  visoes: VisaoOrcamento[];
  edicoes: Omit<EdicoesDaTabela, "onMudar">;
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<Lancamento | null>(null);
  const [reenviar, setReenviar] = useState(0); // cada valor novo abre o lançador do reenvio
  // As edições salvas guardadas aqui: a tabela que remonta volta com as novas.
  const [eds, setEds] = useState<{ lista: EdicaoTabela[]; padroes: Record<string, unknown> }>({ lista: edicoes.lista, padroes: edicoes.padroes });

  // Os lançamentos de CADA visão, resolvidos UMA vez (a coluna e o filtro dela leem daqui).
  const naVisao = useMemo(() => visoes.map((v) => ({ v, ids: new Set(aplicarVisao(itens, v.filtros).map((r) => r.id)) })), [itens, visoes]);

  const filtrados = useMemo(() => {
    const casa = predicadoBusca(busca); // vários termos de uma vez com ":"
    return casa
      ? itens.filter((r) =>
          casa([r.orgao, r.unidade, r.unidadeSistema, r.orgaoSistema, r.funcao, r.programa, r.acao, r.nomeElemento, r.codigoElemento, r.ficha, r.fonte]),
        )
      : itens;
  }, [itens, busca]);

  const colCadastro = (key: "unidadeSistema" | "orgaoSistema", header: string): Column<Lancamento> => ({
    key,
    header,
    minWidth: 200,
    value: (r) => r[key],
    render: (r) =>
      r[key] === SEM_VINCULO_ORC ? (
        <span className="text-faint">{SEM_VINCULO_ORC}</span>
      ) : (
        <span className="block max-w-[290px] truncate text-text" title={r[key]}>
          {r[key]}
        </span>
      ),
  });

  const colunas: Column<Lancamento>[] = [
    colCadastro("orgaoSistema", "Órgão (cadastro)"),
    colCadastro("unidadeSistema", "Unidade (cadastro)"),
    colTexto("orgao", "Órgão", (r) => r.orgao, 210, true),
    colTexto("unidade", "Unidade", (r) => r.unidade, 190),
    colTexto("funcao", "Função", (r) => r.funcao, 150),
    colTexto("programa", "Programa", (r) => r.programa, 220),
    colTexto("acao", "Ação", (r) => r.acao, 220),
    colTexto("elemento", "Elemento", (r) => r.nomeElemento, 260, true),
    colCodigo("codigo", "Código", (r) => r.codigoElemento),
    colCodigo("ficha", "Ficha", (r) => r.ficha),
    colTexto("fonte", "Fonte", (r) => r.fonte, 220),
    colValor("emenda", "Emenda", (r) => r.valorEmendaImpositiva),
    colValor("inicial", "Valor inicial", (r) => r.valorInicial, true),
    colValor("suplement", "Suplementação", (r) => r.valorSuplementacao),
    colValor("empenho", "Empenho", (r) => r.valorEmpenho),
    colValor("saldo", "Saldo", (r) => r.saldo),
    colValor("anulacao", "Anulação", (r) => r.valorAnulacao),
    // Uma coluna por VISÃO salva: o lançamento entra (Sim) ou não nela — filtrar "Sim" = os lançamentos da visão.
    ...naVisao.map(
      ({ v, ids }): Column<Lancamento> => ({
        key: `visao:${v.id}`,
        header: v.nome,
        nowrap: true,
        filterOptions: ["Sim", "Não"],
        value: (r) => (ids.has(r.id) ? "Sim" : "Não"),
        render: (r) => (ids.has(r.id) ? <Badge tone="blue">Sim</Badge> : <span className="text-faint">Não</span>),
      }),
    ),
  ];

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
            aria-label="Buscar nos lançamentos"
          />
        </div>
      </FerramentasAba>
      <DataTable
        columns={colunas}
        rows={filtrados}
        getKey={(r) => r.id}
        scrollInterno
        density="compact"
        minWidth={2900 + 120 * visoes.length}
        onRowClick={(r) => setAberto(r)}
        activeKey={aberto?.id ?? null}
        edicoes={{ ...edicoes, lista: eds.lista, padroes: eds.padroes, onMudar: (lista, padroes) => setEds({ lista, padroes }) }}
        exportar={{ nome: `Lançamentos - ${orcamento.nome} ${orcamento.ano}` }}
        acoesRodape={
          pode.importar ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<IconUpload className="h-4 w-4" />}
              aria-label="Reenviar planilha"
              title="Enviar a planilha nova e substituir os lançamentos"
              onClick={() => setReenviar((n) => n + 1)}
            >
              Reenviar<span className="hidden sm:inline"> planilha</span>
            </Button>
          ) : undefined
        }
        vazio={busca ? "Nenhum lançamento para esta busca." : "Nenhum lançamento neste orçamento."}
        resumo={(linhas) =>
          `${num(linhas.length)} ${linhas.length === 1 ? "lançamento" : "lançamentos"} · Inicial ${brl(soma(linhas, "valorInicial"))} · Saldo ${brl(soma(linhas, "saldo"))}`
        }
      />
      <Modal open={aberto != null} onClose={() => setAberto(null)} titulo="Detalhe do lançamento" size="lg">
        {aberto ? (
          <OrcamentoItemDetalhe
            key={aberto.id}
            item={aberto}
            vinculo={{
              orgao: aberto.orgaoSistema === SEM_VINCULO_ORC ? null : aberto.orgaoSistema,
              unidade: aberto.unidadeSistema === SEM_VINCULO_ORC ? null : aberto.unidadeSistema,
            }}
          />
        ) : (
          <div />
        )}
      </Modal>
      {pode.importar && <ImportarOrcamento iniciar={reenviar} alvo={orcamento} visoes={visoes} />}
    </>
  );
}
