"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { favoritosPrimeiro } from "@/lib/tarefas-core";
import { buscarDestinos, type DestinoCopia } from "./CopiarMoverTarefa";
import { Dropdown } from "./Dropdown";
import { IconChevronDown } from "./icons";
import { SeletorBusca } from "./SeletorBusca";
import { Skeleton } from "./Skeleton";
import { toast } from "./Toast";

/**
 * TROCAR DE QUADRO pelo nome no cabeçalho (como o do Trello): o nome é o gatilho; abre a lista com BUSCA dos quadros
 * ativos que a pessoa vê — os FAVORITOS primeiro (marcados) — e escolher leva ao quadro na MESMA aba. Os quadros vêm só
 * ao abrir.
 */
export function TrocarQuadro({ quadro, aba, favoritos }: { quadro: { id: number; nome: string; cor: string }; aba: string; favoritos: number[] }) {
  return (
    <Dropdown
      width={320}
      ariaLabel={`Trocar de quadro — atual: ${quadro.nome}`}
      triggerClassName="min-h-11 min-w-0 gap-1.5 rounded-control px-1.5 hover:bg-surface-2 lg:min-h-[var(--h-control-sm)]"
      trigger={
        <>
          <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: quadro.cor }} />
          <span className="min-w-0 truncate text-lg font-bold text-text" title={quadro.nome}>
            {quadro.nome}
          </span>
          <IconChevronDown className="h-4 w-4 shrink-0 text-muted" />
        </>
      }
    >
      {(fechar) => <ListaQuadros atual={quadro.id} aba={aba} favoritos={favoritos} onEscolhido={fechar} />}
    </Dropdown>
  );
}

function ListaQuadros({ atual, aba, favoritos, onEscolhido }: { atual: number; aba: string; favoritos: number[]; onEscolhido: () => void }) {
  const router = useRouter();
  const [quadros, setQuadros] = useState<DestinoCopia[] | null>(null);
  useEffect(() => {
    let vivo = true;
    buscarDestinos()
      .then((q) => vivo && setQuadros(q))
      .catch((e) => vivo && toast.error((e as Error).message));
    return () => {
      vivo = false;
    };
  }, []);
  const opcoes = useMemo(
    () =>
      favoritosPrimeiro(quadros ?? [], favoritos).map((q) => ({
        valor: String(q.id),
        rotulo: q.nome,
        detalhe: `${favoritos.includes(q.id) ? "Favorito · " : ""}${q.grupoNome}`,
      })),
    [quadros, favoritos],
  );
  if (!quadros)
    return (
      <div className="space-y-2 p-1">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  return (
    <SeletorBusca
      ariaLabel="Quadros"
      placeholder="Buscar quadro…"
      vazio="Nenhum quadro"
      opcoes={opcoes}
      valor={String(atual)}
      onChange={(v) => {
        onEscolhido();
        if (Number(v) !== atual) router.push(`/painel/tarefas/${v}?aba=${aba}`);
      }}
    />
  );
}
