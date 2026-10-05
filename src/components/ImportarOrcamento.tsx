"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { brl, num } from "@/lib/format";
import { enviarOrcamentoEmLotes, substituirOrcamentoEmLotes } from "@/lib/importar-orcamento";
import type { OrcamentoResumo } from "@/lib/orcamento";
import type { ErroPlanilhaOrcamento, OrcamentoItemParseado } from "@/lib/parse-orcamento-comum";
import { parseOrcamentoXlsx } from "@/lib/parse-orcamento-xlsx";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { Dropzone } from "./Dropzone";
import { TextField } from "./Field";
import { IconUpload } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";

type Preview = { itens: OrcamentoItemParseado[]; total: number; faltam: string[]; erros: ErroPlanilhaOrcamento[] };

/** Os PROBLEMAS da planilha (linha · coluna · o quê) — a prévia os lista e a importação fica travada. */
const COLUNAS_ERROS: Column<ErroPlanilhaOrcamento>[] = [
  { key: "linha", header: "Linha", nowrap: true, value: (e) => (e.linha ? String(e.linha) : ""), render: (e) => (e.linha ? e.linha : "—") },
  { key: "coluna", header: "Coluna", nowrap: true, value: (e) => e.coluna, render: (e) => e.coluna || "—" },
  { key: "motivo", header: "Problema", align: "left", minWidth: 260, value: (e) => e.motivo, render: (e) => <span className="text-text">{e.motivo}</span> },
];

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
 * IMPORTAÇÃO do CUBO (`.xlsx`, lido no navegador) — o fluxo ÚNICO do módulo: lançador (`Dropzone`) → prévia → gravação
 * em lotes com progresso. Dois modos: **novo** (sem `alvo`: informa nome + ANO; ao concluir abre a tela do orçamento
 * novo) e **reenvio** (com `alvo`: a planilha nova SUBSTITUI os lançamentos do orçamento — nome/ano mantidos; a prévia
 * compara atual × novo; o anterior fica intacto se algo falhar). Um ano só tem UM orçamento: no modo novo, um ano que já
 * existe (`existentes`) vira a SUBSTITUIÇÃO daquele orçamento; a substituição também apaga as duplicatas do ano e as
 * visões se adaptam aos textos novos (no servidor). Cada valor NOVO de `iniciar` abre o lançador (o mesmo
 * mecanismo da Mesa). Não renderiza nada no fluxo: só modais e avisos flutuantes.
 */
export function ImportarOrcamento({
  iniciar,
  alvo,
  existentes = [],
}: {
  iniciar: number;
  alvo?: OrcamentoResumo;
  /** No modo NOVO: os orçamentos já importados (todos os anos) — o ano que já existe é substituído, nunca duplicado. */
  existentes?: OrcamentoResumo[];
}) {
  const router = useRouter();
  const [launcher, setLauncher] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [nome, setNome] = useState("");
  const [ano, setAno] = useState(String(ANO_ATUAL));
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  const ultimo = useRef(iniciar);
  useEffect(() => {
    if (iniciar === ultimo.current) return;
    ultimo.current = iniciar;
    setAviso(null);
    setLauncher(true);
  }, [iniciar]);

  async function handleFile(file: File) {
    setLauncher(false);
    setAviso(null);
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") {
      setAviso({ kind: "danger", texto: "Formato não suportado. Envie a planilha .xlsx do orçamento (CUBO)." });
      return;
    }
    try {
      const parsed = await parseOrcamentoXlsx(file);
      if (parsed.itens.length === 0) {
        setAviso({ kind: "danger", texto: "Não encontrei os lançamentos (Órgão, Unidade, Elemento, valores) neste arquivo." });
        return;
      }
      setNome(alvo ? alvo.nome : (parsed.nome ?? file.name.replace(/\.(xlsx|xls)$/i, "")).slice(0, 200));
      setAno(String(alvo ? alvo.ano : ANO_ATUAL));
      setPreview({ itens: parsed.itens, total: parsed.total, faltam: parsed.faltam, erros: parsed.erros });
    } catch (e) {
      setAviso({ kind: "danger", texto: e instanceof Error ? e.message : "Falha ao ler o arquivo." });
    }
  }

  const anoNum = ano.trim() ? Number(ano) : null;
  const anoValido = anoNum != null && Number.isInteger(anoNum) && anoNum >= 2000 && anoNum <= 2100;
  // Só com TODAS as colunas obrigatórias e TODOS os dados corretos (a planilha é conferida ao ler).
  const planilhaOk = preview != null && preview.faltam.length === 0 && preview.erros.length === 0;
  // O orçamento que a planilha substitui: o do reenvio ou, no modo novo, o que já existe no ano informado.
  const destino = alvo ?? (anoValido ? existentes.find((o) => o.ano === anoNum) : undefined);
  const podeImportar = preview != null && planilhaOk && (destino != null || nome.trim().length > 0) && anoValido;

  async function importar() {
    if (!preview || !anoValido || !anoNum) return;
    if (
      destino &&
      !(await confirmar({
        titulo: "Substituir a planilha?",
        texto: `Os ${num(destino.totalItens)} lançamentos de "${destino.nome}" (${destino.ano}) dão lugar aos ${num(preview.itens.length)} da planilha nova. Os dados antigos são apagados; as visões se adaptam aos textos novos.`,
        confirmar: "Substituir",
      }))
    )
      return;
    setEnviando(true);
    setProgresso(0);
    setAviso(null);
    const onLote = (env: number, tot: number) => setProgresso(Math.round((env / tot) * 100));
    try {
      if (destino) {
        const r = await substituirOrcamentoEmLotes(destino, preview.itens, onLote);
        const extras = [
          r.visoesAdaptadas ? `${num(r.visoesAdaptadas)} visão(ões) adaptada(s)` : "",
          r.excluidos ? `${num(r.excluidos)} orçamento(s) repetido(s) de ${destino.ano} excluído(s)` : "",
        ].filter(Boolean);
        setAviso({ kind: "ok", texto: `Planilha substituída — ${num(preview.itens.length)} lançamentos${extras.length ? ` · ${extras.join(" · ")}` : ""}.` });
        if (alvo) router.refresh();
        else router.push(`/painel/orcamento/${destino.id}`);
      } else {
        const { orcamentoId } = await enviarOrcamentoEmLotes({ nome: nome.trim() || "Orçamento", ano: anoNum }, preview.itens, onLote);
        router.push(`/painel/orcamento/${orcamentoId}`);
      }
      setPreview(null);
    } catch (e) {
      setAviso({ kind: "danger", texto: e instanceof Error ? e.message : "Falha ao importar o orçamento." });
    } finally {
      setEnviando(false);
    }
  }

  const verbo = destino ? "Substituir por" : "Importar";
  return (
    <>
      <Modal open={launcher} onClose={() => setLauncher(false)} titulo={alvo ? `Reenviar planilha · ${alvo.nome}` : "Importar orçamento"} size="lg">
        <Dropzone
          accept=".xlsx,.xls"
          onFile={handleFile}
          titulo="Solte a planilha do orçamento (.xlsx)"
          icon={<IconUpload className="h-7 w-7" />}
          dica={
            alvo
              ? "A planilha nova substitui TODOS os lançamentos deste orçamento (nome e ano ficam). Você confere a prévia antes de gravar; se algo falhar, o orçamento atual é mantido."
              : "Lemos Órgão, Unidade, Função, Programa, Ação, Elemento de despesa, Ficha, Fonte e os valores de cada lançamento. Você confere e informa o ano antes de gravar."
          }
        />
      </Modal>

      <Modal
        open={preview != null}
        onClose={() => {
          if (!enviando) setPreview(null);
        }}
        bloqueado={enviando}
        titulo={alvo ? "Reenviar planilha" : "Novo orçamento"}
        size="xl"
        rodape={
          preview ? (
            enviando ? (
              <Progress value={progresso} label={`${destino ? "Enviando a planilha nova" : "Importando"}… ${progresso}%`} />
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setPreview(null)}>
                  Cancelar
                </Button>
                <Button onClick={importar} disabled={!podeImportar} title={planilhaOk ? undefined : "Corrija a planilha e envie de novo"}>
                  {planilhaOk ? `${verbo} ${num(preview.itens.length)} ${preview.itens.length === 1 ? "lançamento" : "lançamentos"}` : "Planilha com problemas"}
                </Button>
              </div>
            )
          ) : undefined
        }
      >
        {preview && (
          <div className="space-y-[var(--gap-block)]">
            <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
              <TextField
                label="Nome do orçamento"
                value={destino ? destino.nome : nome}
                onChange={(e) => setNome(e.target.value)}
                disabled={enviando || destino != null}
                placeholder="Ex.: Orçamento anual"
              />
              <TextField
                label="Ano do orçamento"
                value={ano}
                onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
                disabled={enviando || alvo != null}
                placeholder={String(ANO_ATUAL)}
                inputMode="numeric"
                hint={anoValido ? undefined : "Informe um ano entre 2000 e 2100."}
              />
            </div>
            <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-card border border-border-2 bg-surface-2 px-4 py-3 text-sm">
              {destino && (
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted">Atual</dt>
                  <dd className="tabular-nums text-text-2">
                    {num(destino.totalItens)} lanç. · {brl(destino.valorInicial)}
                  </dd>
                </div>
              )}
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted">{destino ? "Nova planilha" : "Lançamentos"}</dt>
                <dd className="font-semibold tabular-nums text-text">
                  {destino ? `${num(preview.itens.length)} lanç. · ${brl(preview.total)}` : num(preview.itens.length)}
                </dd>
              </div>
              {!destino && (
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-muted">Dotação inicial</dt>
                  <dd className="font-semibold tabular-nums text-text">{brl(preview.total)}</dd>
                </div>
              )}
            </dl>
            {destino && !alvo && (
              <Callout kind="info">
                Já existe o orçamento de {destino.ano} ("{destino.nome}") — a planilha nova SUBSTITUI os lançamentos dele (um ano tem um só orçamento).
              </Callout>
            )}
            {preview.faltam.length > 0 && (
              <Callout kind="danger">
                Faltam {preview.faltam.length === 1 ? "a coluna obrigatória" : `${num(preview.faltam.length)} colunas obrigatórias`}:{" "}
                <strong>{preview.faltam.join(", ")}</strong>. Exporte o relatório CUBO completo (Órgão, Unidade, Função, Programa, Ação,
                Nome Elemento, Código Elemento, Ficha, Fonte e os valores) e envie de novo.
              </Callout>
            )}
            {preview.erros.length > 0 && (
              <>
                <Callout kind="danger">
                  A planilha tem dados incorretos — corrija as linhas abaixo e envie de novo. Nada foi gravado.
                </Callout>
                <DataTable
                  columns={COLUNAS_ERROS}
                  rows={preview.erros}
                  getKey={(e) => `${e.linha}:${e.coluna}:${e.motivo}`}
                  pageSize={10}
                  density="compact"
                  minWidth={520}
                  exportar={{ nome: "Problemas da planilha do orçamento" }}
                  resumo={(l) => `${num(l.length)} ${l.length === 1 ? "problema" : "problemas"}`}
                />
              </>
            )}
            <DataTable
              columns={COLUNAS_PREVIA}
              rows={preview.itens}
              getKey={(r) => r.sequencial}
              pageSize={20}
              density="compact"
              minWidth={1200}
              resumo={(l) => `${num(l.length)} ${l.length === 1 ? "lançamento" : "lançamentos"} · ${brl(l.reduce((s, r) => s + r.valorInicial, 0))}`}
            />
          </div>
        )}
      </Modal>

      {confirmacao}
      {aviso && (
        <AvisoFlutuante
          kind={aviso.kind}
          titulo={aviso.kind === "ok" ? "Pronto" : "Não foi possível importar"}
          onClose={() => setAviso(null)}
          duracao={aviso.kind === "ok" ? 4000 : undefined}
        >
          {aviso.texto}
        </AvisoFlutuante>
      )}
    </>
  );
}
