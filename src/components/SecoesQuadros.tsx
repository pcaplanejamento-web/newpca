"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { predicadoBusca } from "@/lib/tabela-filtros";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import { CHAVE_CONJUNTOS_TAREFAS, type ConjuntoQuadros, MAX_NOME_CONJUNTO, MAX_QUADROS_CONJUNTO, PALETA_ETIQUETAS, quadrosDoConjunto, salvarConjunto } from "@/lib/tarefas-core";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { Dropdown } from "./Dropdown";
import { Checkbox, SearchField, TextField } from "./Field";
import { IconChevronRight, IconClock, IconEstrela, IconLayers, IconMais, IconPencil, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { QuadroCard } from "./QuadroCard";
import { toast } from "./Toast";
import { useSetLocal } from "./useSetLocal";

/**
 * A GRADE de quadros — o MESMO `QuadroCard` e a MESMA grade na tela de Tarefas e no "Mudar de quadros": colunas de no
 * mínimo 15rem que se ajustam à largura (o card nunca muda de forma — sobra espaço, não encolhe). `extra` = o último item
 * (ex.: o card "Novo quadro").
 */
export function GradeQuadros({
  quadros,
  favoritos,
  onFavorito,
  atual,
  aba,
  onAbrir,
  extra,
}: {
  quadros: QuadroCardDados[];
  favoritos: number[];
  onFavorito?: (id: number) => void;
  /** O quadro aberto agora (o "Mudar de quadros"). */
  atual?: number;
  /** A aba em que o quadro abre (`?aba=`). */
  aba?: string;
  onAbrir?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
      {quadros.map((q) => (
        <QuadroCard
          key={q.id}
          quadro={q}
          href={`/painel/tarefas/${q.id}${aba ? `?aba=${aba}` : ""}`}
          atual={q.id === atual}
          favorito={favoritos.includes(q.id)}
          onFavorito={onFavorito && (() => onFavorito(q.id))}
          onAbrir={onAbrir}
        />
      ))}
      {extra}
    </div>
  );
}

/** Os quadros abertos por ÚLTIMO neste aparelho (conveniência — `localStorage`, com try/catch). */
const CHAVE_RECENTES = "tarefas:quadros-recentes";
const MAX_RECENTES = 8;

function lerRecentes(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

/** Registra o quadro aberto (o 1º dos recentes). Chamado pelo espaço do quadro. */
export function registrarQuadroRecente(id: number) {
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([id, ...lerRecentes().filter((x) => x !== id)].slice(0, MAX_RECENTES)));
  } catch {
    // sem armazenamento: sem recentes
  }
}

/** Os ids dos quadros RECENTES (lidos depois da montagem — o HTML do servidor nasce sem eles). */
export function useQuadrosRecentes(): number[] {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => setIds(lerRecentes()), []);
  return ids;
}

/** As SEÇÕES recolhidas (minimizadas) — as mesmas chaves na tela de Tarefas e no "Mudar de quadros", neste aparelho. */
export const useSecoesRecolhidas = () => useSetLocal<string>("tarefas:secoes-recolhidas");

/**
 * Uma SEÇÃO de quadros (como as do Trello: Favoritos, Visualizados recentemente, cada área de trabalho): o título com o
 * ícone e a contagem MINIMIZA/MAXIMIZA a grade (a seta gira; `aria-expanded`); `acoes` fica à direita (ex.: o menu do
 * conjunto). O conteúdo só é montado aberto.
 */
export function SecaoQuadros({
  titulo,
  icone,
  quantidade,
  recolhida,
  onAlternar,
  acoes,
  children,
}: {
  titulo: string;
  icone?: ReactNode;
  quantidade: number;
  recolhida: boolean;
  onAlternar: () => void;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          aria-expanded={!recolhida}
          title={recolhida ? `Mostrar ${titulo}` : `Minimizar ${titulo}`}
          onClick={onAlternar}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control px-1 text-left text-[15px] font-semibold text-text hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-9"
        >
          <IconChevronRight className={`h-4 w-4 shrink-0 text-muted transition-transform duration-[var(--motion-duration)] ${recolhida ? "" : "rotate-90"}`} />
          {icone}
          <span className="min-w-0 truncate">{titulo}</span>
          <span className="shrink-0 text-[12px] font-normal text-muted tabular-nums">{quantidade}</span>
        </button>
        {acoes}
      </div>
      {!recolhida && <div className="animate-fade-in-up">{children}</div>}
    </section>
  );
}

/**
 * As SEÇÕES de quadros (como a página de quadros do Trello) — as MESMAS na tela de Tarefas e no "Mudar de quadros":
 * **Favoritos** · **Recentes** (deste aparelho) · cada **CONJUNTO** da pessoa (com o menu editar/excluir, quando há
 * `onEditarConjunto`) · cada **GRUPO** (o `extraFinal` — ex.: o card "Novo quadro" — entra no último). Toda seção
 * MINIMIZA/MAXIMIZA pelo título (guardado neste aparelho, igual nas duas telas). Seção sem quadro não aparece (o
 * conjunto vazio aparece, com a dica).
 */
export function SecoesDeQuadros({
  quadros,
  favoritos,
  onFavorito,
  conjuntos = [],
  onEditarConjunto,
  onExcluirConjunto,
  atual,
  aba,
  onAbrir,
  extraFinal,
}: {
  quadros: QuadroCardDados[];
  favoritos: number[];
  onFavorito?: (id: number) => void;
  conjuntos?: ConjuntoQuadros[];
  onEditarConjunto?: (c: ConjuntoQuadros) => void;
  onExcluirConjunto?: (id: string) => void;
  atual?: number;
  aba?: string;
  onAbrir?: () => void;
  extraFinal?: ReactNode;
}) {
  const [recolhidas, alternar] = useSecoesRecolhidas();
  const recentes = useQuadrosRecentes();
  const porId = new Map(quadros.map((q) => [q.id, q]));
  const favs = quadros.filter((q) => favoritos.includes(q.id));
  const recs = recentes.map((id) => porId.get(id)).filter((q): q is QuadroCardDados => !!q);
  const grupos = [...new Set(quadros.map((q) => q.grupoNome))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const grade = { favoritos, onFavorito, atual, aba, onAbrir };
  const secao = (id: string, titulo: string, icone: ReactNode, lista: QuadroCardDados[], acoes?: ReactNode, extra?: ReactNode, vazio?: string) => (
    <SecaoQuadros key={id} titulo={titulo} icone={icone} quantidade={lista.length} recolhida={recolhidas.has(id)} onAlternar={() => alternar(id)} acoes={acoes}>
      {lista.length || extra ? <GradeQuadros quadros={lista} {...grade} extra={extra} /> : <p className="px-1 py-3 text-[13px] text-muted">{vazio}</p>}
    </SecaoQuadros>
  );
  return (
    <div className="space-y-5">
      {favs.length > 0 && secao("fav", "Favoritos", <IconEstrela className="h-4 w-4 shrink-0" style={{ color: "var(--warn)" }} fill="currentColor" />, favs)}
      {recs.length > 0 && secao("rec", "Visualizados recentemente", <IconClock className="h-4 w-4 shrink-0 text-muted" />, recs)}
      {conjuntos.map((c) =>
        secao(
          `conj:${c.id}`,
          c.nome,
          <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[12px] font-bold text-white" style={{ background: c.cor }}>
            {c.nome.charAt(0).toUpperCase()}
          </span>,
          quadrosDoConjunto(c, quadros),
          onEditarConjunto && onExcluirConjunto ? <MenuConjunto conjunto={c} onEditar={() => onEditarConjunto(c)} onExcluir={() => onExcluirConjunto(c.id)} /> : undefined,
          undefined,
          onEditarConjunto ? "Nenhum quadro neste conjunto — use “Editar conjunto” no menu “…”." : "Nenhum quadro deste conjunto aqui.",
        ),
      )}
      {grupos.map((g, i) => secao(`grupo:${g}`, g, <IconLayers className="h-4 w-4 shrink-0 text-muted" />, quadros.filter((q) => q.grupoNome === g), undefined, i === grupos.length - 1 ? extraFinal : undefined))}
      {!grupos.length && extraFinal && <GradeQuadros quadros={[]} {...grade} extra={extraFinal} />}
    </div>
  );
}

/**
 * Os CONJUNTOS da pessoa (preferência `tarefas:conjuntos`): salvar/excluir é otimista e grava em FILA (como os
 * favoritos); falhou ⇒ volta ao último estado gravado e avisa.
 */
export function useConjuntosQuadros(inicial: ConjuntoQuadros[]) {
  const [conjuntos, setConjuntos] = useState(inicial);
  const gravado = useRef(inicial);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const gravar = (novo: ConjuntoQuadros[]) => {
    setConjuntos(novo);
    fila.current = fila.current.then(() =>
      chamar("/api/preferencias/tabela", "PUT", { chave: CHAVE_CONJUNTOS_TAREFAS, valor: { lista: novo } }).then(
        () => {
          gravado.current = novo;
        },
        (e) => {
          setConjuntos(gravado.current);
          toast.error((e as Error).message);
        },
      ),
    );
  };
  return {
    conjuntos,
    salvar: (c: ConjuntoQuadros) => gravar(salvarConjunto(conjuntos, c)),
    excluir: (id: string) => gravar(conjuntos.filter((c) => c.id !== id)),
  };
}

/** O menu "…" de um conjunto: editar e excluir (com confirmação — os quadros não são tocados). */
export function MenuConjunto({ conjunto, onEditar, onExcluir }: { conjunto: ConjuntoQuadros; onEditar: () => void; onExcluir: () => void }) {
  const { confirmar, confirmacao } = useConfirmacao();
  return (
    <>
      <Dropdown align="end" width={220} ariaLabel={`Ações do conjunto ${conjunto.nome}`} triggerClassName="h-11 w-11 shrink-0 justify-center rounded-control text-muted hover:bg-surface-2 lg:h-9 lg:w-9" trigger={<IconMais className="h-4 w-4" />}>
        {(fechar) => (
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                fechar();
                onEditar();
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] text-text hover:bg-surface-2 lg:min-h-9"
            >
              <IconPencil className="h-4 w-4 text-muted" /> Editar conjunto
            </button>
            <button
              type="button"
              onClick={async () => {
                fechar();
                if (await confirmar({ titulo: `Excluir o conjunto "${conjunto.nome}"?`, texto: "Só o conjunto sai — os quadros continuam como estão.", confirmar: "Excluir", perigo: true }))
                  onExcluir();
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] hover:bg-surface-2 lg:min-h-9"
              style={{ color: "var(--danger)" }}
            >
              <IconTrash className="h-4 w-4" /> Excluir conjunto
            </button>
          </div>
        )}
      </Dropdown>
      {confirmacao}
    </>
  );
}

/**
 * O EDITOR de um conjunto (criar/editar): o NOME, a COR (os tons da paleta, em círculos) e os QUADROS (busca + caixas de
 * marcar, com o grupo de cada um). `quadros` = os que a pessoa pode pôr (os da tela). Gravar devolve o conjunto pronto.
 */
export function EditorConjunto({
  aberto,
  quadros,
  onFechar,
  onSalvar,
}: {
  /** O conjunto em edição (`null` = fechado). */
  aberto: ConjuntoQuadros | null;
  quadros: QuadroCardDados[];
  onFechar: () => void;
  onSalvar: (c: ConjuntoQuadros) => void;
}) {
  return (
    <Modal open={aberto != null} onClose={onFechar} titulo={aberto?.nome ? "Editar conjunto" : "Novo conjunto"} size="md">
      {aberto && <FormConjunto key={aberto.id} inicial={aberto} quadros={quadros} onFechar={onFechar} onSalvar={onSalvar} />}
    </Modal>
  );
}

function FormConjunto({ inicial, quadros, onFechar, onSalvar }: { inicial: ConjuntoQuadros; quadros: QuadroCardDados[]; onFechar: () => void; onSalvar: (c: ConjuntoQuadros) => void }) {
  const [c, setC] = useState(inicial);
  const [busca, setBusca] = useState("");
  const casa = predicadoBusca(busca);
  const visiveis = casa ? quadros.filter((q) => casa([q.nome, q.grupoNome])) : quadros;
  const marcar = (id: number) => setC((x) => ({ ...x, quadros: x.quadros.includes(id) ? x.quadros.filter((q) => q !== id) : [...x.quadros, id].slice(0, MAX_QUADROS_CONJUNTO) }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!c.nome.trim()) return;
        onSalvar({ ...c, nome: c.nome.trim() });
        onFechar();
      }}
    >
      <TextField label="Nome do conjunto" autoFocus value={c.nome} maxLength={MAX_NOME_CONJUNTO} placeholder="Ex.: PCA 2026, Rotinas, Protocolos" onChange={(e) => setC({ ...c, nome: e.target.value })} />
      <fieldset>
        <legend className="mb-1.5 text-[13.5px] font-bold text-text">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {PALETA_ETIQUETAS.slice(10, 20).map((cor) => (
            <button
              key={cor}
              type="button"
              aria-label={`Cor ${cor}`}
              aria-pressed={c.cor === cor}
              onClick={() => setC({ ...c, cor })}
              className="h-11 w-11 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:h-8 lg:w-8"
              style={{ background: cor, boxShadow: c.cor === cor ? "0 0 0 2px var(--surface), 0 0 0 4px var(--text)" : undefined }}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-[13.5px] font-bold text-text">
          Quadros <span className="font-normal text-muted">({c.quadros.length} no conjunto)</span>
        </legend>
        <SearchField compacto placeholder="Buscar quadro" value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} aria-label="Buscar quadro" />
        <div className="max-h-[40vh] space-y-0.5 overflow-y-auto rounded-control border border-border p-1">
          {visiveis.length ? (
            visiveis.map((q) => (
              <div key={q.id} className="flex min-h-11 items-center rounded-control px-2 hover:bg-surface-2 lg:min-h-9">
                <Checkbox
                  checked={c.quadros.includes(q.id)}
                  onChange={() => marcar(q.id)}
                  label={
                    <span className="flex min-w-0 items-center gap-2 text-[13px]">
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: q.cor }} />
                      <span className="truncate text-text">{q.nome}</span>
                      <span className="shrink-0 text-[11.5px] text-muted">{q.grupoNome}</span>
                    </span>
                  }
                />
              </div>
            ))
          ) : (
            <p className="px-2 py-4 text-center text-[13px] text-muted">Nenhum quadro.</p>
          )}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!c.nome.trim()}>
          Salvar conjunto
        </Button>
      </div>
    </form>
  );
}
