"use client";

import { useEffect, useMemo, useState } from "react";
import type { PastaCatalogo } from "@/lib/catalogo-historico";
import { brl, brlCompact, dataBR, num } from "@/lib/format";
import { type HistoricoParseado, nomeSugeridoHistorico, resumoHistorico } from "@/lib/historico-compra-core";
import { enviarHistoricoEmLotes } from "@/lib/importar-historico";
import { parseHistoricoArquivo } from "@/lib/parse-historico";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { SelectField, TextField } from "./Field";
import { IconAlert } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { SkeletonLinhas } from "./Skeleton";
import { StatMini } from "./StatMini";

type Linha = HistoricoParseado["itens"][number];

/**
 * IMPORTAÇÃO do HISTÓRICO DE COMPRA (contêiner): recebe o ARQUIVO escolhido (CSV do sistema de compras ou .xlsx), lê no
 * navegador, mostra a PRÉVIA (os números, as linhas repetidas que saem, a amostra dos itens), pede o NOME e a PASTA e
 * grava em lotes com o progresso (tudo ou nada). Ao terminar, devolve o id do catálogo criado.
 */
export function ImportarHistorico({
  arquivo,
  pastas,
  pastaInicial,
  onFechar,
  onConcluido,
}: {
  arquivo: File | null;
  pastas: PastaCatalogo[];
  pastaInicial: number | null;
  onFechar: () => void;
  onConcluido: (catalogoId: number, nome: string) => void;
}) {
  const [lido, setLido] = useState<HistoricoParseado | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [pastaId, setPastaId] = useState<number | null>(pastaInicial);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!arquivo) return;
    let vivo = true;
    setLido(null);
    setErroLeitura(null);
    setErro(null);
    setPastaId(pastaInicial);
    parseHistoricoArquivo(arquivo)
      .then((r) => {
        if (!vivo) return;
        if (r.faltando.length > 0) setErroLeitura(`Este arquivo não é o histórico de compra do sistema: faltam as colunas ${r.faltando.join(", ")}.`);
        else if (r.itens.length === 0) setErroLeitura("Nenhum item comprado neste arquivo.");
        else {
          setLido(r);
          setNome(nomeSugeridoHistorico(r.ano));
        }
      })
      .catch((e) => vivo && setErroLeitura(e instanceof Error ? e.message : "Falha ao ler o arquivo."));
    return () => {
      vivo = false;
    };
  }, [arquivo, pastaInicial]);

  const resumo = useMemo(() => (lido ? resumoHistorico(lido.itens, lido.contratos) : null), [lido]);
  const credorPorContrato = useMemo(() => new Map((lido?.contratos ?? []).map((c) => [c.idContrato, c.credor ?? ""] as const)), [lido]);

  async function importar() {
    if (!lido || !nome.trim()) return;
    setEnviando(true);
    setErro(null);
    setProgresso(0);
    try {
      const { catalogoId } = await enviarHistoricoEmLotes({ nome: nome.trim(), pastaId }, lido.contratos, lido.itens, (f, t) => setProgresso(Math.round((f / t) * 100)));
      setEnviando(false);
      onConcluido(catalogoId, nome.trim());
    } catch (e) {
      setEnviando(false);
      setErro(e instanceof Error ? e.message : "Falha ao importar o histórico.");
    }
  }

  const colunas: Column<Linha>[] = [
    { key: "credor", header: "Credor", align: "left", minWidth: 200, filter: "none", value: (l) => credorPorContrato.get(l.idContrato) ?? "", render: (l) => <span className="block max-w-[240px] truncate">{credorPorContrato.get(l.idContrato) || "—"}</span> },
    { key: "codigo", header: "Código", nowrap: true, filter: "none", value: (l) => l.codigo, render: (l) => <span className="font-mono text-[13px] text-text-2">{l.codigo}</span> },
    { key: "descricao", header: "Descrição", align: "left", minWidth: 280, filter: "none", value: (l) => l.descricao, render: (l) => <span className="block max-w-[420px] truncate" title={l.descricao}>{l.descricao}</span> },
    { key: "unit", header: "Valor unitário", align: "right", nowrap: true, filter: "none", value: (l) => String(l.valorUnitario ?? ""), render: (l) => (l.valorUnitario != null ? brl(l.valorUnitario) : "—") },
    { key: "total", header: "Valor contratado", align: "right", nowrap: true, filter: "none", value: (l) => String(l.valorContratado ?? ""), render: (l) => (l.valorContratado != null ? brl(l.valorContratado) : "—") },
  ];

  return (
    <Modal
      open={arquivo != null}
      onClose={() => !enviando && onFechar()}
      bloqueado={enviando}
      titulo="Novo histórico de compra"
      size="xl"
      rodape={
        lido ? (
          enviando ? (
            <Progress value={progresso} label={`Importando… ${progresso}%`} />
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {erro && <span className="mr-auto text-xs font-medium text-[var(--danger)]">{erro}</span>}
              <Button variant="ghost" onClick={onFechar}>
                Cancelar
              </Button>
              <Button onClick={importar} disabled={!nome.trim()}>
                Importar {num(lido.itens.length)} {lido.itens.length === 1 ? "item" : "itens"}
              </Button>
            </div>
          )
        ) : undefined
      }
    >
      {erroLeitura ? (
        <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />}>
          {erroLeitura}
        </Callout>
      ) : !lido || !resumo ? (
        <SkeletonLinhas linhas={6} />
      ) : (
        <div className="space-y-[var(--gap-block)]">
          <div className="grid gap-[var(--gap-block)] sm:grid-cols-2">
            <TextField label="Nome do histórico" value={nome} maxLength={200} onChange={(e) => setNome(e.target.value)} disabled={enviando} hint={`Origem: ${arquivo?.name ?? ""}`} />
            <SelectField label="Pasta" value={pastaId ?? ""} onChange={(e) => setPastaId(e.target.value ? Number(e.target.value) : null)} disabled={enviando}>
              <option value="">Sem pasta</option>
              {pastas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid grid-cols-2 gap-[var(--gap-block)] sm:grid-cols-3 xl:grid-cols-6">
            <StatMini label="Itens" value={num(resumo.itens)} tone="accent" />
            <StatMini label="Contratos" value={num(resumo.contratos)} />
            <StatMini label="Produtos" value={num(resumo.produtos)} />
            <StatMini label="Credores" value={num(resumo.credores)} />
            <StatMini label="Valor contratado" value={brlCompact(resumo.valorContratado)} hint={brl(resumo.valorContratado)} />
            <StatMini label="Período (assinatura)" value={resumo.de ? dataBR(resumo.de) : "—"} hint={resumo.ate ? `até ${dataBR(resumo.ate)}` : undefined} />
          </div>
          {(lido.repetidas > 0 || lido.ignoradas > 0) && (
            <Callout kind="info" icon={<IconAlert className="h-4 w-4" />}>
              {lido.repetidas > 0 && (
                <>
                  {num(lido.repetidas)} {lido.repetidas === 1 ? "linha repetida" : "linhas repetidas"} pelo export (idênticas em todas as colunas) — {lido.repetidas === 1 ? "sai" : "saem"} para não
                  somar o mesmo item duas vezes.{" "}
                </>
              )}
              {lido.ignoradas > 0 && (
                <>
                  {num(lido.ignoradas)} {lido.ignoradas === 1 ? "linha sem" : "linhas sem"} contrato, código ou descrição {lido.ignoradas === 1 ? "ficou" : "ficaram"} de fora.
                </>
              )}
            </Callout>
          )}
          <div className="rounded-card border border-border px-4 pt-3">
            <DataTable columns={colunas} rows={lido.itens} getKey={(l) => l.ordem} pageSize={20} minWidth={900} density="compact" resumo={(l) => `${num(l.length)} ${l.length === 1 ? "item" : "itens"}`} />
          </div>
        </div>
      )}
    </Modal>
  );
}
