"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { brl, num } from "@/lib/format";
import { enviarOrcamentoEmLotes } from "@/lib/importar-orcamento";
import type { OrcamentoResumo } from "@/lib/orcamento";
import type { OrcamentoItemParseado } from "@/lib/parse-orcamento-comum";
import { parseOrcamentoXlsx } from "@/lib/parse-orcamento-xlsx";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { Dropzone } from "./Dropzone";
import { TextField } from "./Field";
import { IconAlert, IconInbox, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { OrcamentoCard, OrcamentoNovoCard } from "./OrcamentoCard";
import { Progress } from "./Progress";

type Preview = { itens: OrcamentoItemParseado[]; total: number };

const ANO_ATUAL = new Date().getFullYear();

/** Coluna de texto da prévia (truncada). */
const colPrevia = (key: keyof OrcamentoItemParseado, header: string, minWidth: number): Column<OrcamentoItemParseado> => ({
  key,
  header,
  minWidth,
  filter: "none",
  value: (r) => String(r[key] ?? ""),
  render: (r) => (
    <span className="block truncate text-text-2" style={{ maxWidth: minWidth + 60 }} title={String(r[key] ?? "")}>
      {String(r[key] ?? "") || "—"}
    </span>
  ),
});

const COLUNAS_PREVIA: Column<OrcamentoItemParseado>[] = [
  colPrevia("orgao", "Órgão", 200),
  colPrevia("unidade", "Unidade", 170),
  colPrevia("acao", "Ação", 200),
  colPrevia("nomeElemento", "Elemento", 220),
  colPrevia("ficha", "Ficha", 70),
  colPrevia("fonte", "Fonte", 200),
  {
    key: "inicial",
    header: "Valor inicial",
    align: "right",
    nowrap: true,
    filter: "none",
    render: (r) => <span className="tabular-nums font-semibold text-text">{brl(r.valorInicial)}</span>,
  },
];

/**
 * Módulo ORÇAMENTO (relatório CUBO) — a LISTA: um card 4:5 por orçamento importado (`OrcamentoCard`: ano, nome,
 * dotação, lançamentos) + o card "+" (editor) que importa o `.xlsx` (parse no cliente) informando o ANO. Clicar
 * num card abre a TELA DO ORÇAMENTO (`/painel/orcamento/[id]`: Lançamentos · Vínculos · Visões); ao importar, a
 * tela do orçamento novo abre sozinha. 100% design-system.
 */
export function OrcamentoView({
  orcamentos,
  podeEditar,
  filtro = null,
}: {
  orcamentos: OrcamentoResumo[];
  podeEditar: boolean;
  /** PCA escolhido no CABEÇALHO (filtro global) — só os orçamentos do ano dele vieram. */
  filtro?: string | null;
}) {
  const router = useRouter();
  const [launcher, setLauncher] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [nome, setNome] = useState("");
  const [ano, setAno] = useState(String(ANO_ATUAL));
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erroImport, setErroImport] = useState<string | null>(null);

  async function handleFile(file: File) {
    setLauncher(false);
    setErroImport(null);
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") {
      setErroImport("Formato não suportado. Envie a planilha .xlsx do orçamento (CUBO).");
      return;
    }
    try {
      const parsed = await parseOrcamentoXlsx(file);
      if (parsed.itens.length === 0) {
        setErroImport("Não encontrei os lançamentos (Órgão, Unidade, Elemento, valores) neste arquivo.");
        return;
      }
      setNome((parsed.nome ?? file.name.replace(/\.(xlsx|xls)$/i, "")).slice(0, 200));
      setAno(String(ANO_ATUAL));
      setPreview({ itens: parsed.itens, total: parsed.total });
    } catch (e) {
      setErroImport(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    }
  }

  const anoNum = ano.trim() ? Number(ano) : null;
  const anoValido = anoNum != null && Number.isInteger(anoNum) && anoNum >= 2000 && anoNum <= 2100;
  const podeImportar = preview != null && nome.trim().length > 0 && anoValido;

  async function importar() {
    if (!preview || !anoValido || !anoNum) return;
    setEnviando(true);
    setProgresso(0);
    setErroImport(null);
    try {
      const { orcamentoId } = await enviarOrcamentoEmLotes({ nome: nome.trim() || "Orçamento", ano: anoNum }, preview.itens, (env, tot) =>
        setProgresso(Math.round((env / tot) * 100)),
      );
      setEnviando(false);
      setPreview(null);
      router.push(`/painel/orcamento/${orcamentoId}`);
    } catch (e) {
      setEnviando(false);
      setErroImport(e instanceof Error ? e.message : "Falha ao importar o orçamento.");
    }
  }

  const abrirImportacao = () => {
    setErroImport(null);
    setLauncher(true);
  };
  const totalLancamentos = orcamentos.reduce((s, o) => s + o.totalItens, 0);

  return (
    <div className="space-y-[var(--gap-block)]">
      <div>
        <h1 className="text-xl font-bold text-text">Orçamento</h1>
        <p className="text-sm text-muted">
          {orcamentos.length} {orcamentos.length === 1 ? "orçamento" : "orçamentos"} · {num(totalLancamentos)}{" "}
          {totalLancamentos === 1 ? "lançamento" : "lançamentos"} ·{" "}
          {filtro ? `do ano do ${filtro}, o PCA escolhido no cabeçalho` : "abra um orçamento para ver os lançamentos, vínculos e visões"}
        </p>
      </div>

      {erroImport && !preview && (
        <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
          {erroImport}
        </Callout>
      )}

      {orcamentos.length === 0 && !podeEditar ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
          <IconInbox className="h-10 w-10 text-faint" />
          <p className="text-sm text-muted">{filtro ? `Nenhum orçamento do ano do ${filtro}.` : "Nenhum orçamento ainda."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--gap-block)] min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {orcamentos.map((o) => (
            <OrcamentoCard key={o.id} orcamento={o} href={`/painel/orcamento/${o.id}`} />
          ))}
          {podeEditar && <OrcamentoNovoCard onClick={abrirImportacao} />}
        </div>
      )}

      {/* Lançador de importação (só .xlsx do CUBO) */}
      <Modal open={launcher} onClose={() => setLauncher(false)} titulo="Importar orçamento" size="lg">
        <Dropzone
          accept=".xlsx,.xls"
          onFile={handleFile}
          titulo="Solte a planilha do orçamento (.xlsx)"
          icon={<IconUpload className="h-7 w-7" />}
          dica="Lemos Órgão, Unidade, Função, Programa, Ação, Elemento de despesa, Ficha, Fonte e os valores de cada lançamento. Você confere e informa o ano antes de gravar."
        />
      </Modal>

      {/* Prévia do envio: nome + ANO + prévia */}
      <Modal
        open={preview != null}
        onClose={() => {
          if (!enviando) setPreview(null);
        }}
        bloqueado={enviando}
        titulo="Novo orçamento"
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
                  Importar {preview.itens.length} {preview.itens.length === 1 ? "lançamento" : "lançamentos"}
                </Button>
              </div>
            )
          ) : undefined
        }
      >
        {preview && (
          <div className="space-y-[var(--gap-block)]">
            <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
              <TextField label="Nome do orçamento" value={nome} onChange={(e) => setNome(e.target.value)} disabled={enviando} placeholder="Ex.: Orçamento anual" />
              <TextField
                label="Ano do orçamento"
                value={ano}
                onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
                disabled={enviando}
                placeholder={String(ANO_ATUAL)}
                inputMode="numeric"
                hint={anoValido ? undefined : "Informe um ano entre 2000 e 2100."}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-border-2 bg-surface-2 px-4 py-3 text-sm">
              <span className="text-muted">
                Lançamentos: <span className="font-semibold text-text">{preview.itens.length}</span>
              </span>
              <span className="text-muted">
                Dotação inicial: <span className="font-semibold tabular-nums text-text">{brl(preview.total)}</span>
              </span>
            </div>
            <div className="rounded-card border border-border px-4 pt-3">
              <DataTable
                columns={COLUNAS_PREVIA}
                rows={preview.itens}
                getKey={(r) => r.sequencial}
                pageSize={20}
                minWidth={1200}
                resumo={(l) => `${l.length} ${l.length === 1 ? "lançamento" : "lançamentos"}`}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
