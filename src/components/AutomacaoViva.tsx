"use client";

import { useEffect, useRef, useState } from "react";
import type { DadosAutomacao } from "@/lib/automacao-dados";
import { AutomacaoAdmin } from "./AutomacaoAdmin";
import { ErroCarga } from "./ErroCarga";
import { SkeletonCartao } from "./Skeleton";

/** A chave do `ManterVivo`/segundo plano da Automação (a página e a Mesa usam a MESMA — o estado segue entre as duas). */
export const CHAVE_AUTOMACAO = "automacao";

/**
 * A tela da Automação VIVA: com os dados do servidor (a página) ou buscando-os sozinha (a Mesa a monta em segundo plano
 * para rodar uma automação sem sair dela). O tipo da raiz é o MESMO nos dois casos — abrir a página com uma execução em
 * curso não remonta nada.
 */
export function AutomacaoViva({ dados }: { dados?: DadosAutomacao }) {
  const [buscados, setBuscados] = useState<DadosAutomacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  // Os últimos dados vistos ficam: a página saindo (sem `dados`) nunca derruba uma automação em curso.
  const guardados = useRef<DadosAutomacao | null>(null);
  if (dados) guardados.current = dados;
  const atual = dados ?? guardados.current ?? buscados;
  useEffect(() => {
    if (dados || guardados.current || buscados) return;
    let vivo = true;
    fetch("/api/admin/automacao/contexto")
      .then((r) => r.json() as Promise<{ ok: boolean; dados?: DadosAutomacao; error?: string }>)
      .then((j) => {
        if (!vivo) return;
        if (j.ok && j.dados) setBuscados(j.dados);
        else setErro(j.error ?? "Não consegui carregar a Automação.");
      })
      .catch(() => vivo && setErro("Sem conexão com o servidor."));
    return () => {
      vivo = false;
    };
  }, [dados, buscados, tentativa]);
  if (atual) return <AutomacaoAdmin protocolos={atual.protocolos} gestao={atual.gestao} banners={atual.banners} />;
  if (erro) return <ErroCarga msg={erro} onTentar={() => (setErro(null), setTentativa((n) => n + 1))} />;
  return <SkeletonCartao />;
}
