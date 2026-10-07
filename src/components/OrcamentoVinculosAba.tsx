"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { OrcamentoItemRow } from "@/lib/orcamento";
import { type AlvosVinculo, type EscopoVinculos, unidadesDoOrcamento, type VinculoOrcamento, type VisaoVinculos, vinculosDaVisao } from "@/lib/orcamento-vinculo";
import { AvisoFlutuante } from "./AvisoFlutuante";
import type { DadosVinculo } from "./EditorVinculoOrcamento";
import { OrcamentoVinculos } from "./OrcamentoVinculos";
import { toast } from "./Toast";

/**
 * A GRAVAÇÃO dos vínculos (a aba Vínculos, o banner da visão e o banner da linha do orçamento do PCA): uma por vez; cada
 * resposta traz a lista GRAVADA no banco — os vínculos (o padrão e os das visões) e as unidades PRÓPRIAS de cada visão —,
 * aplicada na hora (`atuais`/`visoesAtuais` — valem até a página trazer os dados de novo); o erro fica para o editor.
 * Toda gravação leva o ESCOPO (onde salvar: o padrão e/ou as visões).
 */
export function useGravacaoVinculos(vinculos: VinculoOrcamento[], visoes: VisaoVinculos[] = SEM_VISOES) {
  const router = useRouter();
  // A lista que o servidor devolveu na última gravação (sobre a base `vinculos` em que foi feita).
  const [gravados, setGravados] = useState<{ base: VinculoOrcamento[]; lista: VinculoOrcamento[]; proprias: Map<number, string[]> } | null>(null);
  const valido = gravados && gravados.base === vinculos ? gravados : null;
  const atuais = valido ? valido.lista : vinculos;
  const visoesAtuais = useMemo(
    () => (valido ? visoes.map((v) => ({ ...v, proprias: valido.proprias.get(v.id) ?? v.proprias })) : visoes),
    [valido, visoes],
  );
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
      const j = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        vinculos?: VinculoOrcamento[];
        visoes?: { id: number; proprias: string[] }[];
      };
      if (!resp.ok || !j.ok) throw new Error(j.error ?? "Não foi possível gravar o vínculo.");
      if (j.vinculos) setGravados({ base: vinculos, lista: j.vinculos, proprias: new Map((j.visoes ?? []).map((v) => [v.id, v.proprias])) });
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
    visoesAtuais,
    salvando,
    erro,
    limparErro: () => setErro(null),
    criar: (lista: DadosVinculo[], escopo?: EscopoVinculos) =>
      gravar("/api/orcamento/vinculos", "POST", { vinculos: lista, escopo }, lista.length === 1 ? "Vínculo criado." : `${lista.length} vínculos criados.`),
    editar: (id: number, d: DadosVinculo, escopo?: EscopoVinculos) =>
      gravar(`/api/orcamento/vinculos/${id}`, "PATCH", { alvoId: d.alvoId, acoes: d.acoes, acoesFora: d.acoesFora, escopo }, "Vínculo salvo."),
    excluir: (id: number, escopo?: EscopoVinculos) => gravar(`/api/orcamento/vinculos/${id}`, "DELETE", { escopo }, "Vínculo excluído."),
    usarPadrao: (visaoId: number, chave: string) => gravar("/api/orcamento/vinculos/padrao", "POST", { visaoId, chave }, "A visão voltou a seguir o padrão nesta unidade."),
  };
}

const SEM_VISOES: VisaoVinculos[] = [];

/**
 * Aba VÍNCULOS da tela do orçamento: as UNIDADES dos lançamentos DESTE orçamento e os VÍNCULOS criados para elas
 * (`OrcamentoVinculos`) — criar (`POST /api/orcamento/vinculos`, vários de uma vez nas sugestões), editar e excluir
 * (`PATCH`/`DELETE …/[id]`) — pelo `useGravacaoVinculos`. O vínculo é GLOBAL (pelo texto normalizado) — vale para todos
 * os orçamentos. A VISÃO da barra escolhe quais vínculos aparecem e editam (o padrão ou os de uma visão); o erro fica no
 * editor aberto (ou num aviso flutuante).
 */
export function OrcamentoVinculosAba({
  itens,
  vinculos,
  visoes,
  alvos,
  podeEditar,
}: {
  itens: Pick<OrcamentoItemRow, "orgao" | "unidade" | "acao" | "valorInicial">[];
  vinculos: VinculoOrcamento[];
  visoes: VisaoVinculos[];
  alvos: AlvosVinculo;
  podeEditar: boolean;
}) {
  const unidades = useMemo(() => unidadesDoOrcamento(itens), [itens]);
  const g = useGravacaoVinculos(vinculos, visoes);
  const [visaoId, setVisaoId] = useState<number | null>(null);
  const visao = g.visoesAtuais.find((v) => v.id === visaoId) ?? null;
  const efetivos = useMemo(() => vinculosDaVisao(g.atuais, visao), [g.atuais, visao]);
  return (
    <>
      <OrcamentoVinculos
        unidades={unidades}
        vinculos={efetivos}
        alvos={alvos}
        podeEditar={podeEditar}
        salvando={g.salvando}
        erro={g.erro}
        scrollInterno
        contexto={{ visoes: g.visoesAtuais, visaoId: visao?.id ?? null }}
        onVisao={setVisaoId}
        onCriar={g.criar}
        onEditar={g.editar}
        onExcluir={g.excluir}
        onUsarPadrao={visao ? (chave) => g.usarPadrao(visao.id, chave) : undefined}
      />
      {g.erro && (
        <AvisoFlutuante kind="danger" titulo="Não foi possível gravar o vínculo" onClose={g.limparErro}>
          {g.erro}
        </AvisoFlutuante>
      )}
    </>
  );
}
