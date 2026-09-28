"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { predicadoBusca } from "@/lib/tabela-filtros";
import type { ConjuntoQuadros } from "@/lib/tarefas-core";
import { ChipsEscolha } from "./ChipsEscolha";
import { SearchField } from "./Field";
import { Modal } from "./Modal";
import { GradeQuadros, SecoesDeQuadros } from "./SecoesQuadros";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Skeleton } from "./Skeleton";
import { toast } from "./Toast";

/**
 * MUDAR DE QUADROS (como o do Trello): o gatilho (o "Mudar de quadros" da pílula de vistas) abre o painel com a BUSCA
 * dos quadros, os CHIPS por grupo (Tudo · grupo…) e as MESMAS seções da tela de Tarefas (`SecoesDeQuadros`: Favoritos,
 * Recentes, os CONJUNTOS da pessoa e cada GRUPO — minimizáveis), com o MESMO `QuadroCard` na MESMA grade
 * (`GradeQuadros` — o card não muda de forma; o painel é largo). Escolher leva ao quadro na MESMA aba; o atual fica marcado. Os quadros (de
 * todos os grupos da pessoa) vêm só ao abrir — `GET /api/tarefas/quadros`.
 */
export function TrocarQuadro({
  quadro,
  aba,
  favoritos,
  onFavorito,
  gatilho,
  triggerClassName = "",
}: {
  quadro: { id: number; nome: string };
  aba: string;
  favoritos: number[];
  /** Marca/desmarca o favorito (a estrela dos cards do painel). */
  onFavorito?: (id: number) => void;
  gatilho: ReactNode;
  triggerClassName?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-label={`Mudar de quadros — atual: ${quadro.nome}`} onClick={() => setAberto(true)} className={`inline-flex items-center ${triggerClassName}`}>
        {gatilho}
      </button>
      <Modal open={aberto} onClose={() => setAberto(false)} titulo="Mudar de quadros" size="full">
        {aberto && <PainelQuadros atual={quadro.id} aba={aba} favoritos={favoritos} onFavorito={onFavorito} onEscolhido={() => setAberto(false)} />}
      </Modal>
    </>
  );
}

function PainelQuadros({
  atual,
  aba,
  favoritos,
  onFavorito,
  onEscolhido,
}: {
  atual: number;
  aba: string;
  favoritos: number[];
  onFavorito?: (id: number) => void;
  onEscolhido: () => void;
}) {
  const [dados, setDados] = useState<{ quadros: QuadroCardDados[]; conjuntos: ConjuntoQuadros[] } | null>(null);
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("__tudo");
  useEffect(() => {
    let vivo = true;
    chamar<{ quadros: QuadroCardDados[]; conjuntos: ConjuntoQuadros[] }>("/api/tarefas/quadros")
      .then((j) => vivo && setDados(j))
      .catch((e) => vivo && toast.error((e as Error).message));
    return () => {
      vivo = false;
    };
  }, []);
  const grupos = useMemo(() => [...new Set((dados?.quadros ?? []).map((q) => q.grupoNome))].sort((a, b) => a.localeCompare(b, "pt-BR")), [dados]);

  if (!dados)
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-60 w-full" />
        ))}
      </div>
    );

  const casa = predicadoBusca(busca);
  const doGrupo = grupo === "__tudo" ? dados.quadros : dados.quadros.filter((q) => q.grupoNome === grupo);
  const grade = { favoritos, onFavorito, atual, aba, onAbrir: onEscolhido };
  const achados = casa ? doGrupo.filter((q) => casa([q.nome, q.grupoNome])) : null;

  return (
    <div className="space-y-4">
      <SearchField
        compacto
        autoFocus
        placeholder="Pesquisar seus quadros"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onClear={() => setBusca("")}
        aria-label="Pesquisar seus quadros"
      />
      {grupos.length > 1 && (
        <ChipsEscolha ariaLabel="Grupo" valor={grupo} onEscolher={setGrupo} opcoes={[{ value: "__tudo", label: "Tudo" }, ...grupos.map((g) => ({ value: g, label: g }))]} />
      )}
      {achados ? (
        achados.length ? (
          <GradeQuadros quadros={achados} {...grade} />
        ) : (
          <p className="py-8 text-center text-[13px] text-muted">Nenhum quadro com “{busca}”.</p>
        )
      ) : (
        <SecoesDeQuadros quadros={doGrupo} conjuntos={dados.conjuntos} {...grade} />
      )}
    </div>
  );
}
