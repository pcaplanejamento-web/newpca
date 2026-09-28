"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { predicadoBusca } from "@/lib/tabela-filtros";
import type { AtorPasta, ConjuntoQuadros, PastasQuadros } from "@/lib/tarefas-core";
import { SearchField } from "./Field";
import { Modal } from "./Modal";
import { EditorConjunto, GradeQuadros, SecoesDeQuadros, useConjuntosQuadros } from "./SecoesQuadros";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Skeleton } from "./Skeleton";
import { toast } from "./Toast";

/** O que o painel carrega: os quadros, as PASTAS que a pessoa vê (+ a ordem dela) e quem ela é (as regras das pastas). */
type Dados = { quadros: QuadroCardDados[]; conjuntos: PastasQuadros; ator: AtorPasta };

/**
 * MUDAR DE QUADROS (como o do Trello): o gatilho (o "Mudar de quadros" da pílula de vistas) abre o painel com a BUSCA
 * dos quadros e as MESMAS seções da tela de Tarefas (`SecoesDeQuadros`: Favoritos, Recentes e "Seus quadros" com as
 * PASTAS — abrir no lugar, arrastar, editar; chips por grupo; minimizáveis), com o MESMO `QuadroCard` na MESMA grade
 * (o card não muda de forma; o painel é largo). Escolher leva ao quadro na MESMA aba; o atual fica marcado. Os quadros (de
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
  const [dados, setDados] = useState<Dados | null>(null);
  const vivo = useRef(true);
  // Carrega (e RECARREGA depois de mexer nas pastas — a privacidade dos quadros muda).
  const carregar = useCallback(() => {
    chamar<Dados>("/api/tarefas/quadros")
      .then((j) => vivo.current && setDados(j))
      .catch((e) => vivo.current && toast.error((e as Error).message));
  }, []);
  useEffect(() => {
    vivo.current = true;
    carregar();
    return () => {
      vivo.current = false;
    };
  }, [carregar]);

  if (!dados)
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-60 w-full" />
        ))}
      </div>
    );
  return <ConteudoPainel quadros={dados.quadros} pastasIniciais={dados.conjuntos} ator={dados.ator} aoMudar={carregar} grade={{ favoritos, onFavorito, atual, aba, onAbrir: onEscolhido }} />;
}

/** O conteúdo do painel já carregado: a busca (resultados achatados) ou as SEÇÕES com as PASTAS — o mesmo da tela de Tarefas. */
function ConteudoPainel({
  quadros,
  pastasIniciais,
  ator,
  aoMudar,
  grade,
}: {
  quadros: QuadroCardDados[];
  pastasIniciais: PastasQuadros;
  ator: AtorPasta;
  aoMudar: () => void;
  grade: { favoritos: number[]; onFavorito?: (id: number) => void; atual: number; aba: string; onAbrir: () => void };
}) {
  const [busca, setBusca] = useState("");
  const conj = useConjuntosQuadros(pastasIniciais, { quadros, ator, aoMudar });
  const [editando, setEditando] = useState<ConjuntoQuadros | null>(null);
  const casa = predicadoBusca(busca);
  const achados = casa ? quadros.filter((q) => casa([q.nome, q.grupoNome])) : null;
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
      {achados ? (
        achados.length ? (
          <GradeQuadros quadros={achados} {...grade} />
        ) : (
          <p className="py-8 text-center text-[13px] text-muted">Nenhum quadro com “{busca}”.</p>
        )
      ) : (
        <SecoesDeQuadros quadros={quadros} pastas={conj.estado} onMover={conj.mover} onEditarPasta={setEditando} onExcluirPasta={conj.excluir} ator={ator} {...grade} />
      )}
      <EditorConjunto aberto={editando} quadros={quadros} pastas={conj.estado.lista} ator={ator} onFechar={() => setEditando(null)} onSalvar={conj.salvar} />
      {conj.confirmacao}
    </div>
  );
}
