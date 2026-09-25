"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { brl, num } from "@/lib/format";
import type { OrcamentoResumo } from "@/lib/orcamento";
import { AbasEspaco } from "./AbasEspaco";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { IconChevronLeft, IconTrash } from "./icons";
import { PcaCapa } from "./PcaCard";

export type AbaOrcamento = "lancamentos" | "vinculos" | "visoes";

/**
 * TELA DO ORÇAMENTO (`/painel/orcamento/[id]`) — aberta pelo card: cabeçalho (capa 4:5 em miniatura, nome, ano,
 * dotação e lançamentos) + excluir (editor) e as abas **Lançamentos · Vínculos · Visões** no MESMO espaço
 * (`AbasEspaco`: o servidor monta SÓ a aba ativa). Espelha o espaço do PCA.
 */
export function OrcamentoEspacoView({
  orcamento: o,
  aba,
  podeEditar,
  children,
}: {
  orcamento: OrcamentoResumo;
  aba: AbaOrcamento;
  podeEditar: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [excluindo, setExcluindo] = useState(false);
  const [falha, setFalha] = useState(false);

  async function excluir() {
    if (!confirm(`Excluir o orçamento "${o.nome}" (${o.ano}) e seus ${o.totalItens} lançamentos? Esta ação não pode ser desfeita.`)) return;
    setExcluindo(true);
    setFalha(false);
    const r = await fetch(`/api/orcamento/${o.id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      router.push("/painel/orcamento");
      router.refresh();
      return;
    }
    setExcluindo(false);
    setFalha(true);
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      <Link href="/painel/orcamento" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text-2">
        <IconChevronLeft className="h-4 w-4" /> Orçamento
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-16 shrink-0 sm:w-20">
          <PcaCapa capa={null} ano={o.ano} className="!rounded-xl" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full truncate text-2xl font-black tracking-tight text-text sm:text-3xl">{o.nome}</h1>
            <Badge tone="blue">{o.ano}</Badge>
          </div>
          <p className="text-sm text-muted">
            Dotação inicial <span className="font-semibold tabular-nums text-text-2">{brl(o.valorInicial)}</span> · {num(o.totalItens)}{" "}
            {o.totalItens === 1 ? "lançamento" : "lançamentos"}
          </p>
        </div>
        {podeEditar && (
          <Button variant="ghost" loading={excluindo} icon={<IconTrash className="h-4 w-4" style={{ color: "var(--danger)" }} />} onClick={excluir}>
            Excluir
          </Button>
        )}
      </div>

      <AbasEspaco<AbaOrcamento>
        aba={aba}
        opcoes={[
          { value: "lancamentos", label: "Lançamentos" },
          { value: "vinculos", label: "Vínculos" },
          { value: "visoes", label: "Visões" },
        ]}
      >
        {children}
      </AbasEspaco>

      {falha && (
        <AvisoFlutuante kind="danger" titulo="Atenção" onClose={() => setFalha(false)}>
          Não foi possível excluir o orçamento.
        </AvisoFlutuante>
      )}
    </div>
  );
}
