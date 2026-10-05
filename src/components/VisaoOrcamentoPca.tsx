"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { brl, num } from "@/lib/format";
import { aplicarVisao, contarAusentes, resumoVisao, type VisaoOrcamento, valoresAusentes } from "@/lib/orcamento-visao";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { EditorVisaoOrcamento, type LinhaVisaoOrcamento } from "./EditorVisaoOrcamento";
import { SelectField } from "./Field";
import { IconPencil, IconPlus } from "./icons";
import { Modal } from "./Modal";
import { toast } from "./Toast";

/**
 * A VISÃO DO ORÇAMENTO do PCA pela ENGRENAGEM da aba Orçamento (contêiner): escolher a visão (grava na hora no PCA —
 * `PATCH /api/pca/[id]`, o mesmo da Configuração) e, para quem configura o Orçamento, EDITAR a visão escolhida ou criar
 * uma NOVA (que já vira a do PCA) no MESMO editor da tela do orçamento (`EditorVisaoOrcamento`). Mostra o Σ que cada
 * escolha pega do orçamento do ano, os outros PCAs que usam a visão e os valores que o orçamento atual não traz.
 */
export function VisaoOrcamentoPca({
  pcaId,
  aberto,
  onFechar,
  visaoId,
  visoes,
  itens,
  podeEditarVisao,
}: {
  pcaId: number;
  aberto: boolean;
  onFechar: () => void;
  /** A visão gravada no PCA (`null` = orçamento inteiro). */
  visaoId: number | null;
  visoes: VisaoOrcamento[];
  /** Os lançamentos do orçamento do ano (`null` = nenhum importado — escolher vale, editar não). */
  itens: LinhaVisaoOrcamento[] | null;
  /** Configura o ORÇAMENTO (as visões são de lá e globais). */
  podeEditarVisao: boolean;
}) {
  const router = useRouter();
  const [escolha, setEscolha] = useState<number | null>(visaoId);
  const [gravando, setGravando] = useState(false);
  const [editor, setEditor] = useState<VisaoOrcamento | "nova" | null>(null);

  // Abriu (ou a tela recarregou) — parte do que está gravado no PCA.
  useEffect(() => {
    if (aberto) setEscolha(visaoId);
  }, [aberto, visaoId]);

  const visao = visoes.find((v) => v.id === escolha) ?? null;
  const total = useMemo(() => (itens ?? []).reduce((s, i) => s + i.valorInicial, 0), [itens]);
  const naVisao = useMemo(() => (itens && visao ? aplicarVisao(itens, visao.filtros) : (itens ?? [])), [itens, visao]);
  const soma = naVisao.reduce((s, i) => s + i.valorInicial, 0);
  const ausentes = useMemo(() => (itens && visao ? contarAusentes(valoresAusentes(itens, visao.filtros)) : 0), [itens, visao]);
  const outros = (visao?.pcas ?? []).length - (visaoId != null && visaoId === visao?.id ? 1 : 0);

  async function gravar(id: number | null, msg = "Visão do orçamento do PCA salva.") {
    setGravando(true);
    try {
      const r = await fetch(`/api/pca/${pcaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orcamentoVisaoId: id }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Não foi possível salvar a visão do PCA.");
      setEscolha(id);
      toast.success(msg);
      router.refresh();
    } catch (e) {
      setEscolha(visaoId);
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a visão do PCA.");
    } finally {
      setGravando(false);
    }
  }

  return (
    <>
      <Modal open={aberto && editor == null} onClose={onFechar} bloqueado={gravando} size="md" titulo="Visão do orçamento do PCA">
        <div className="space-y-[var(--gap-block)]">
          <p className="text-sm text-muted">Os lançamentos do orçamento do ano que contam para este PCA (KPIs, PCA × Orçamento, Comparativo e relatório).</p>
          <SelectField
            label="Visão"
            value={escolha ?? ""}
            disabled={gravando}
            onChange={(e) => void gravar(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Orçamento inteiro (sem visão)</option>
            {visoes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome} — {resumoVisao(v.filtros)}
              </option>
            ))}
          </SelectField>
          {itens ? (
            <p className="text-sm text-text-2">
              Considera <b className="tabular-nums">{brl(soma)}</b> de <span className="tabular-nums">{brl(total)}</span> ·{" "}
              {num(naVisao.length)} {naVisao.length === 1 ? "lançamento" : "lançamentos"}
            </p>
          ) : (
            <Callout kind="warn">Nenhum orçamento do ano importado — a visão vale quando ele chegar.</Callout>
          )}
          {outros > 0 && (
            <Callout kind="info">
              Também usada por {num(outros)} outro(s) PCA(s) — editar a visão muda o orçamento deles junto.
            </Callout>
          )}
          {ausentes > 0 && (
            <Callout kind="warn">
              {num(ausentes)} valor(es) da visão não existem no orçamento atual e não contam nada — edite a visão e use “Remover
              ausentes”.
            </Callout>
          )}
          {podeEditarVisao && itens && (
            <div className="flex flex-wrap gap-2">
              {visao && (
                <Button size="sm" variant="secondary" icon={<IconPencil className="h-4 w-4" />} disabled={gravando} onClick={() => setEditor(visao)}>
                  Editar esta visão
                </Button>
              )}
              <Button size="sm" variant="secondary" icon={<IconPlus className="h-4 w-4" />} disabled={gravando} onClick={() => setEditor("nova")}>
                Nova visão
              </Button>
            </div>
          )}
        </div>
      </Modal>
      {itens && (
        <EditorVisaoOrcamento
          aberta={editor}
          itens={itens}
          podeEditar={podeEditarVisao}
          onFechar={() => setEditor(null)}
          onSalva={(r) => {
            setEditor(null);
            if (r.nova) void gravar(r.id, `Visão "${r.nome}" criada e usada neste PCA.`);
            else {
              toast.success("Visão atualizada.");
              router.refresh();
            }
          }}
        />
      )}
    </>
  );
}
