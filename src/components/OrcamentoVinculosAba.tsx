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
 * A GRAVAÇÃO dos vínculos (a aba Vínculos e o lápis da linha do orçamento do PCA): uma por vez; cada resposta traz a lista
 * GRAVADA no banco, aplicada na hora (`atuais` — vale até a página trazer os vínculos de novo); o erro fica para o editor.
 */
export function useGravacaoVinculos(vinculos: VinculoOrcamento[]) {
  const router = useRouter();
  // A lista que o servidor devolveu na última gravação (sobre a base `vinculos` em que foi feita).
  const [gravados, setGravados] = useState<{ base: VinculoOrcamento[]; lista: VinculoOrcamento[] } | null>(null);
  const atuais = gravados && gravados.base === vinculos ? gravados.lista : vinculos;
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
      const j = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string; vinculos?: VinculoOrcamento[] };
      if (!resp.ok || !j.ok) throw new Error(j.error ?? "Não foi possível gravar o vínculo.");
      if (j.vinculos) setGravados({ base: vinculos, lista: j.vinculos });
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

  return {
    atuais,
    salvando,
    erro,
    limparErro: () => setErro(null),
    criar: (lista: DadosVinculo[]) =>
      gravar("/api/orcamento/vinculos", "POST", { vinculos: lista }, lista.length === 1 ? "Vínculo criado." : `${lista.length} vínculos criados.`),
    editar: (id: number, d: DadosVinculo) =>
      gravar(`/api/orcamento/vinculos/${id}`, "PATCH", { alvoId: d.alvoId, acoes: d.acoes, acoesFora: d.acoesFora }, "Vínculo salvo."),
    excluir: (id: number) => gravar(`/api/orcamento/vinculos/${id}`, "DELETE", null, "Vínculo excluído."),
  };
}

/**
 * Aba VÍNCULOS da tela do orçamento: as UNIDADES dos lançamentos DESTE orçamento e os VÍNCULOS criados para elas
 * (`OrcamentoVinculos`) — criar (`POST /api/orcamento/vinculos`, vários de uma vez nas sugestões), editar e excluir
 * (`PATCH`/`DELETE …/[id]`) — pelo `useGravacaoVinculos`. O vínculo é GLOBAL (pelo texto normalizado) — vale para todos
 * os orçamentos; o erro fica no editor aberto (ou num aviso flutuante).
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
  const unidades = useMemo(() => unidadesDoOrcamento(itens), [itens]);
  const g = useGravacaoVinculos(vinculos);
  return (
    <>
      <OrcamentoVinculos
        unidades={unidades}
        vinculos={g.atuais}
        alvos={alvos}
        podeEditar={podeEditar}
        salvando={g.salvando}
        erro={g.erro}
        scrollInterno
        onCriar={g.criar}
        onEditar={g.editar}
        onExcluir={g.excluir}
      />
      {g.erro && (
        <AvisoFlutuante kind="danger" titulo="Não foi possível gravar o vínculo" onClose={g.limparErro}>
          {g.erro}
        </AvisoFlutuante>
      )}
    </>
  );
}
