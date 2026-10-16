"use client";

import { useMemo, useState } from "react";
import { brl, dataIsoBrasilia, num } from "@/lib/format";
import type { ReferenciaHistorico } from "@/lib/historico-compra-core";
import { consolidarItens, type ItemConsolidado } from "@/lib/itens-consolidados";
import { blocosRelatorioVariacao, type ItemVariacao, porSigla, relatorioVariacao } from "@/lib/relatorio-variacao";
import { Button } from "./Button";
import { useQuemExporta } from "./ConfigTabelas";
import { usePodeExportar } from "./ExportarTabelas";
import { IconFile } from "./icons";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";
import { SeletorMultiplo } from "./SeletorMultiplo";
import { StatMini } from "./StatMini";
import { Switch } from "./Switch";
import { toast } from "./Toast";

type Modo = "todos" | "filtrados" | "variacao" | "escolher";

/**
 * Relatório de VARIAÇÃO dos preços (PDF) da visão Consolidada dos itens: os itens a reajustar (valor inflado, valor
 * sugerido e impacto), a variação por código e o que ficou sem comparação. Escolha: todos os códigos, os filtrados na
 * tabela, só os de variação alta/atenção ou os escolhidos; um PDF por unidade (sigla) opcional.
 */
export function RelatorioVariacao<T extends ItemVariacao>({
  linhas,
  visiveis,
  historico,
}: {
  linhas: readonly ItemConsolidado<T>[];
  /** As linhas à vista na tabela (com os filtros); sem filtro, as mesmas de `linhas`. */
  visiveis: readonly ItemConsolidado<T>[];
  historico?: Record<string, ReferenciaHistorico> | null;
}) {
  const podeExportar = usePodeExportar();
  const quem = useQuemExporta();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("todos");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [soInflados, setSoInflados] = useState(false);
  const [separados, setSeparados] = useState(false);
  const [gerando, setGerando] = useState(false);
  const comFiltro = visiveis.length < linhas.length;

  const selecao = useMemo(() => {
    if (modo === "filtrados") return [...visiveis];
    if (modo === "variacao") return linhas.filter((l) => l.variacao != null && l.variacao > 0.25);
    if (modo === "escolher") {
      const s = new Set(escolhidos);
      return linhas.filter((l) => s.has(l.chave));
    }
    return [...linhas];
  }, [modo, linhas, visiveis, escolhidos]);
  const previa = useMemo(() => (aberto ? relatorioVariacao(selecao, historico) : null), [aberto, selecao, historico]);
  const opcoes = useMemo(
    () =>
      aberto
        ? linhas.map((l) => ({ valor: l.chave, rotulo: `${l.codigo ?? "Sem código"} — ${l.descricoes[0]?.texto ?? ""}`, detalhe: `${num(l.itens.length)} itens · ${brl(l.valorTotal)}` }))
        : [],
    [aberto, linhas],
  );
  const grupos = useMemo(() => (separados ? porSigla(selecao, (i: T[]) => consolidarItens(i)) : null), [separados, selecao]);
  const qtd = !selecao.length ? 0 : grupos ? grupos.length : 1;

  if (!podeExportar) return null;

  function abrir() {
    setModo(comFiltro ? "filtrados" : "todos");
    setAberto(true);
  }

  async function gerar() {
    if (gerando || !qtd) return;
    setGerando(true);
    try {
      const [{ baixarDocumentoPdf }, { nomeArquivoPdf }] = await Promise.all([import("@/lib/documento-pdf"), import("@/lib/exportar-pdf-core")]);
      const dia = dataIsoBrasilia(new Date().toISOString());
      const lotes = grupos ? grupos.map((g) => ({ sufixo: ` - ${g.sigla}`, linhas: g.linhas })) : [{ sufixo: "", linhas: selecao }];
      for (const [i, l] of lotes.entries()) {
        if (lotes.length > 1) toast.progresso("Gerando os relatórios", i, lotes.length, l.sufixo.slice(3));
        const rel = relatorioVariacao(l.linhas, historico);
        await baixarDocumentoPdf(
          nomeArquivoPdf(`Variação dos preços${l.sufixo}`, dia),
          { titulo: `Variação dos preços dos itens${l.sufixo}`, blocos: blocosRelatorioVariacao(rel, { soInflados }) },
          { usuario: quem },
        );
      }
      toast.success(lotes.length > 1 ? `${lotes.length} relatórios gerados.` : "Relatório gerado.");
      setAberto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" icon={<IconFile className="h-4 w-4" />} onClick={abrir} disabled={!linhas.length} title="Relatório de variação dos preços (PDF)">
        <span className="hidden sm:inline">Relatório de variação</span>
        <span className="sm:hidden">Variação</span>
      </Button>
      <Modal
        open={aberto}
        onClose={() => !gerando && setAberto(false)}
        titulo="Relatório de variação dos preços"
        size="md"
        bloqueado={gerando}
        rodape={
          <div className="flex w-full items-center justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAberto(false)} disabled={gerando}>
              Cancelar
            </Button>
            <Button size="sm" icon={<IconFile className="h-4 w-4" />} loading={gerando} disabled={!qtd} onClick={gerar}>
              {qtd > 1 ? `Gerar ${qtd} PDFs` : "Gerar PDF"}
            </Button>
          </div>
        }
      >
        <div className="space-y-[var(--gap-block)]">
          <Segmented<Modo>
            value={modo}
            onChange={setModo}
            ariaLabel="Códigos do relatório"
            options={[
              { value: "todos", label: `Todos (${num(linhas.length)})` },
              ...(comFiltro ? [{ value: "filtrados" as const, label: `Filtrados na tabela (${num(visiveis.length)})` }] : []),
              { value: "variacao", label: "Variação acima de 25%" },
              { value: "escolher", label: "Escolher" },
            ]}
          />
          {modo === "escolher" && <SeletorMultiplo rotulo="Códigos" opcoes={opcoes} selecionados={escolhidos} onChange={setEscolhidos} textoVazio="Nenhum" suspenso />}
          {previa && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatMini label="Códigos" value={num(previa.resumo.codigos)} />
              <StatMini label="Variação alta" value={num(previa.resumo.alerta)} tone={previa.resumo.alerta ? "danger" : "default"} />
              <StatMini label="Itens a reajustar" value={num(previa.resumo.inflados)} tone={previa.resumo.inflados ? "danger" : "default"} />
              <StatMini label="Impacto" value={brl(previa.resumo.impacto)} tone={previa.resumo.impacto ? "danger" : "default"} />
            </div>
          )}
          <Switch checked={soInflados} onChange={setSoInflados} label="Só os itens a reajustar" />
          <Switch checked={separados} onChange={setSeparados} label="Um PDF para cada unidade (sigla)" />
          <p className="text-[13px] text-muted">
            O item é apontado quando o valor unitário passa em mais de 25% da referência (a média da mesma unidade de medida ou, quando menor, o valor atual do histórico de
            compra). O valor sugerido é a referência; o impacto é a diferença vezes a quantidade.
          </p>
        </div>
      </Modal>
    </>
  );
}
