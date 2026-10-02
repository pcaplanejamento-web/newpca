"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { OrcamentoItemRow } from "@/lib/orcamento";
import { type AlvosVinculo, unidadesDoOrcamento, type VinculoOrcamento } from "@/lib/orcamento-vinculo";
import { AvisoFlutuante } from "./AvisoFlutuante";
import type { DadosVinculo } from "./EditorVinculoOrcamento";
import { OrcamentoVinculos } from "./OrcamentoVinculos";
import { toast } from "./Toast";

/**
 * Aba VÍNCULOS da tela do orçamento: as UNIDADES dos lançamentos DESTE orçamento e os VÍNCULOS criados para elas
 * (`OrcamentoVinculos`) — criar (`POST /api/orcamento/vinculos`, vários de uma vez nas sugestões), editar e excluir
 * (`PATCH`/`DELETE …/[id]`). O vínculo é GLOBAL (pelo texto normalizado) — vale para todos os orçamentos. Uma gravação
 * por vez; depois, a página recarrega os vínculos; o erro fica no editor aberto (ou num aviso flutuante).
 */
export function OrcamentoVinculosAba({
  itens,
  vinculos,
  alvos,
  podeEditar,
}: {
  itens: Pick<OrcamentoItemRow, "orgao" | "unidade" | "acao" | "valorInicial">[];
  vinculos: VinculoOrcamento[];
  alvos: AlvosVinculo;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const unidades = useMemo(() => unidadesDoOrcamento(itens), [itens]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gravar(url: string, metodo: "POST" | "PATCH" | "DELETE", corpo: unknown, sucesso: string): Promise<boolean> {
    if (salvando) return false;
    setErro(null);
    setSalvando(true);
    try {
      const resp = await fetch(url, {
        method: metodo,
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const j = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || !j.ok) throw new Error(j.error ?? "Não foi possível gravar o vínculo.");
      toast.success(sucesso);
      router.refresh();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar o vínculo.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <OrcamentoVinculos
        unidades={unidades}
        vinculos={vinculos}
        alvos={alvos}
        podeEditar={podeEditar}
        salvando={salvando}
        erro={erro}
        scrollInterno
        onCriar={(lista: DadosVinculo[]) =>
          gravar("/api/orcamento/vinculos", "POST", { vinculos: lista }, lista.length === 1 ? "Vínculo criado." : `${lista.length} vínculos criados.`)
        }
        onEditar={(id, d) => gravar(`/api/orcamento/vinculos/${id}`, "PATCH", { alvoId: d.alvoId, acoes: d.acoes, acoesFora: d.acoesFora }, "Vínculo salvo.")}
        onExcluir={(id) => gravar(`/api/orcamento/vinculos/${id}`, "DELETE", null, "Vínculo excluído.")}
      />
      {erro && (
        <AvisoFlutuante kind="danger" titulo="Não foi possível gravar o vínculo" onClose={() => setErro(null)}>
          {erro}
        </AvisoFlutuante>
      )}
    </>
  );
}
