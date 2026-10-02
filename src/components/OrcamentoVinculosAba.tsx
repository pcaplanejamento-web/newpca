"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { OrcamentoItemRow } from "@/lib/orcamento";
import { type AlvosVinculo, chaveVinculo, linhasVinculo, type VinculoOrcamento } from "@/lib/orcamento-vinculo";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { type VinculoAlterado, OrcamentoVinculos } from "./OrcamentoVinculos";

const SEM_PENDENTES: ReadonlyMap<string, VinculoAlterado> = new Map();

/**
 * Aba VÍNCULOS da tela do orçamento: as UNIDADES DISTINTAS dos lançamentos DESTE orçamento, cada uma ligada a uma unidade
 * do cadastro e com as AÇÕES que entram (`OrcamentoVinculos`). O vínculo é GLOBAL (pelo texto normalizado) — vale para
 * todos os orçamentos. Gravação OTIMISTA e em FILA (um PUT por vez — marcar várias ações seguidas nunca grava fora de
 * ordem): as pendentes valem só sobre a base de vínculos em que foram feitas — quando a página recarrega os vínculos
 * gravados (nova base), somem sozinhas.
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
  const [pend, setPend] = useState<{ base: VinculoOrcamento[]; m: Map<string, VinculoAlterado> }>(() => ({ base: vinculos, m: new Map() }));
  const pendentes = pend.base === vinculos ? pend.m : SEM_PENDENTES;
  const alterarPendentes = (fn: (m: Map<string, VinculoAlterado>) => void) =>
    setPend((p) => {
      const m = new Map(p.base === vinculos ? p.m : SEM_PENDENTES);
      fn(m);
      return { base: vinculos, m };
    });
  const [salvando, setSalvando] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const fila = useRef<Promise<void>>(Promise.resolve());

  const efetivos = useMemo(() => {
    if (pendentes.size === 0) return vinculos;
    const m = new Map(vinculos.map((v) => [v.chave, v]));
    for (const [k, p] of pendentes) m.set(k, { chave: k, texto: p.texto, alvoId: p.alvoId, acoesFora: p.acoesFora });
    return [...m.values()];
  }, [vinculos, pendentes]);
  const linhas = useMemo(() => linhasVinculo(itens, efetivos, alvos.unidades), [itens, efetivos, alvos]);

  function salvar(lista: VinculoAlterado[]) {
    const chaves = lista.map((v) => chaveVinculo(v.texto));
    setErro(null);
    alterarPendentes((m) => {
      for (let i = 0; i < lista.length; i++) m.set(chaves[i], lista[i]);
    });
    setSalvando((n) => n + 1);
    fila.current = fila.current.then(async () => {
      try {
        for (let i = 0; i < lista.length; i += 200) {
          const resp = await fetch("/api/orcamento/vinculos", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vinculos: lista.slice(i, i + 200) }),
          });
          const j = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!resp.ok || !j.ok) throw new Error(j.error ?? "Não foi possível gravar o vínculo.");
        }
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível gravar o vínculo.");
        alterarPendentes((m) => {
          for (const k of chaves) m.delete(k);
        });
        router.refresh();
      } finally {
        setSalvando((n) => n - 1);
      }
    });
  }

  return (
    <>
      <OrcamentoVinculos linhas={linhas} alvos={alvos} podeEditar={podeEditar} salvando={salvando > 0} scrollInterno onVincular={salvar} />
      {erro && (
        <AvisoFlutuante kind="danger" titulo="Não foi possível vincular" onClose={() => setErro(null)}>
          {erro}
        </AvisoFlutuante>
      )}
    </>
  );
}
