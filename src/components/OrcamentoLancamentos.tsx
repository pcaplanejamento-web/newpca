"use client";

import { useMemo, useState } from "react";
import { exportarOrcamentoPdf, exportarOrcamentoXlsx } from "@/lib/exportar-orcamento";
import { brl, num } from "@/lib/format";
import type { OrcamentoItemRow, OrcamentoResumo } from "@/lib/orcamento";
import { type AlvoVinculo, alvoDoTexto, mapaVinculos, type VinculoOrcamento } from "@/lib/orcamento-vinculo";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { FerramentasAba } from "./AbasEspaco";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { type Column, DataTable } from "./DataTable";
import { SearchField } from "./Field";
import { IconDownload, IconUpload } from "./icons";
import { ImportarOrcamento } from "./ImportarOrcamento";
import { Modal } from "./Modal";
import { OrcamentoItemDetalhe } from "./OrcamentoItemDetalhe";

const soma = (linhas: OrcamentoItemRow[], campo: "valorInicial" | "saldo") => linhas.reduce((s, r) => s + (r[campo] || 0), 0);

/** Coluna de TEXTO longo (truncada, com o texto inteiro no `title`). */
const colTexto = (key: string, header: string, get: (r: OrcamentoItemRow) => string | null, minWidth: number, forte = false): Column<OrcamentoItemRow> => ({
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
const colCodigo = (key: string, header: string, get: (r: OrcamentoItemRow) => string | null): Column<OrcamentoItemRow> => ({
  key,
  header,
  nowrap: true,
  value: (r) => get(r) ?? "",
  render: (r) => <span className="whitespace-nowrap font-mono text-[13px] text-muted">{get(r) || "—"}</span>,
});

/** Coluna de VALOR (R$ à direita, filtro por faixa). */
const colValor = (key: string, header: string, get: (r: OrcamentoItemRow) => number, forte = false): Column<OrcamentoItemRow> => ({
  key,
  header,
  align: "right",
  nowrap: true,
  filter: "range",
  numero: get,
  render: (r) => <span className={`tabular-nums ${forte ? "font-semibold text-text" : "text-text-2"}`}>{brl(get(r))}</span>,
});

/**
 * Aba LANÇAMENTOS da tela do orçamento: TODAS as colunas do CUBO (Órgão · Unidade · No sistema · Função ·
 * Programa · Ação · Elemento · Código · Ficha · Fonte + os valores) na tabela padrão da Mesa (`scrollInterno` +
 * `compact`: o corpo rola por dentro e as linhas por página seguem Configurações → Tabelas), somatório no rodapé;
 * busca e exportação XLSX/PDF na barra das abas (`FerramentasAba`). Clicar numa linha abre o detalhe SÓ-LEITURA (`OrcamentoItemDetalhe`) com o
 * vínculo do Órgão/Unidade ao cadastro. Os lançamentos vêm do sistema oficial — não são editados aqui; o editor
 * REENVIA a planilha pelo botão no rodapé da tabela (como o "Importar" da Mesa → `ImportarOrcamento` com `alvo`).
 */
export function OrcamentoLancamentos({
  orcamento,
  podeEditar,
  itens,
  vinculos,
  alvos,
}: {
  orcamento: OrcamentoResumo;
  podeEditar: boolean;
  itens: OrcamentoItemRow[];
  vinculos: VinculoOrcamento[];
  alvos: { orgaos: AlvoVinculo[]; unidades: AlvoVinculo[] };
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<OrcamentoItemRow | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [reenviar, setReenviar] = useState(0); // cada valor novo abre o lançador do reenvio
  const titulo = `${orcamento.nome} · ${orcamento.ano}`;

  const mapa = useMemo(() => mapaVinculos(vinculos), [vinculos]);
  const alvoPorId = useMemo(
    () => ({ orgao: new Map(alvos.orgaos.map((o) => [o.id, o])), unidade: new Map(alvos.unidades.map((u) => [u.id, u])) }),
    [alvos],
  );
  // O vínculo de cada lançamento, resolvido UMA vez (a coluna, o filtro dela e o detalhe leem daqui).
  const vinculoPorId = useMemo(() => {
    const m = new Map<number, { orgao: string | null; unidade: string | null; siglas: string }>();
    for (const r of itens) {
      const o = alvoPorId.orgao.get(alvoDoTexto(mapa, "orgao", r.orgao) ?? -1);
      const u = alvoPorId.unidade.get(alvoDoTexto(mapa, "unidade", r.unidade) ?? -1);
      m.set(r.id, {
        orgao: o ? `${o.sigla} — ${o.nome}` : null,
        unidade: u ? `${u.sigla} — ${u.nome}` : null,
        siglas: [o?.sigla, u?.sigla].filter(Boolean).join(" / "),
      });
    }
    return m;
  }, [itens, mapa, alvoPorId]);
  const vinculoDe = (r: OrcamentoItemRow) => vinculoPorId.get(r.id) ?? { orgao: null, unidade: null, siglas: "" };

  const filtrados = useMemo(() => {
    const casa = predicadoBusca(busca); // vários termos de uma vez com ":"
    return casa
      ? itens.filter((r) => casa([r.orgao, r.unidade, r.funcao, r.programa, r.acao, r.nomeElemento, r.codigoElemento, r.ficha, r.fonte]))
      : itens;
  }, [itens, busca]);

  const colunas: Column<OrcamentoItemRow>[] = [
    colTexto("orgao", "Órgão", (r) => r.orgao, 210, true),
    colTexto("unidade", "Unidade", (r) => r.unidade, 190),
    {
      key: "sistema",
      header: "No sistema",
      nowrap: true,
      value: (r) => vinculoDe(r).siglas,
      render: (r) => {
        const v = vinculoDe(r);
        return v.siglas ? (
          <span className="whitespace-nowrap text-text-2" title={[v.orgao, v.unidade].filter(Boolean).join(" · ")}>
            {v.siglas}
          </span>
        ) : (
          <span className="text-faint">—</span>
        );
      },
    },
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
  ];

  const exportarPdf = () => {
    try {
      exportarOrcamentoPdf(titulo, filtrados);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao exportar PDF.");
    }
  };
  const detalhe = aberto ? vinculoDe(aberto) : null;

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
        <Button size="sm" variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={() => exportarOrcamentoXlsx(titulo, filtrados)}>
          XLSX
        </Button>
        <Button size="sm" variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportarPdf}>
          PDF
        </Button>
      </FerramentasAba>
      <DataTable
        columns={colunas}
        rows={filtrados}
        getKey={(r) => r.id}
        scrollInterno
        density="compact"
        minWidth={2600}
        onRowClick={(r) => setAberto(r)}
        activeKey={aberto?.id ?? null}
        acoesRodape={
          podeEditar ? (
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
        {aberto && detalhe ? <OrcamentoItemDetalhe key={aberto.id} item={aberto} vinculo={{ orgao: detalhe.orgao, unidade: detalhe.unidade }} /> : <div />}
      </Modal>
      {podeEditar && <ImportarOrcamento iniciar={reenviar} alvo={orcamento} />}
      {erro && (
        <AvisoFlutuante kind="danger" titulo="Não foi possível exportar" onClose={() => setErro(null)}>
          {erro}
        </AvisoFlutuante>
      )}
    </>
  );
}
