"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { predicadoBusca } from "@/lib/tabela-filtros";
import type { QuadroCard as QuadroCardDados } from "@/lib/tarefas";
import {
  CHAVE_CONJUNTOS_TAREFAS,
  type ConjuntoQuadros,
  type DestinoGrade,
  excluirPasta,
  itensDaGrade,
  MAX_NOME_CONJUNTO,
  MAX_QUADROS_CONJUNTO,
  moverNaGrade,
  PALETA_ETIQUETAS,
  type PastasQuadros,
  salvarConjunto,
} from "@/lib/tarefas-core";
import { Button } from "./Button";
import { ChipsEscolha } from "./ChipsEscolha";
import { useConfirmacao } from "./Confirmacao";
import { Dropdown } from "./Dropdown";
import { Checkbox, SearchField, TextField } from "./Field";
import { IconChevronRight, IconClock, IconEstrela, IconLayers, IconMais, IconPencil, IconTrash } from "./icons";
import { Modal } from "./Modal";
import { GradePastas } from "./PastasQuadros";
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
 * **Favoritos** · **Recentes** (deste aparelho) · **Seus quadros** = a `GradePastas` (as PASTAS e os quadros soltos, na
 * ordem da pessoa — abrir a pasta no lugar, arrastar para reordenar e para dentro/fora das pastas; com 2+ grupos, os chips
 * filtram por grupo). O `extraFinal` (ex.: o card "Novo quadro") entra no fim da grade. Toda seção MINIMIZA/MAXIMIZA pelo
 * título (guardado neste aparelho, igual nas duas telas).
 */
export function SecoesDeQuadros({
  quadros,
  favoritos,
  onFavorito,
  pastas,
  onMover,
  onEditarPasta,
  onExcluirPasta,
  atual,
  aba,
  onAbrir,
  extraFinal,
}: {
  quadros: QuadroCardDados[];
  favoritos: number[];
  onFavorito?: (id: number) => void;
  pastas: PastasQuadros;
  onMover?: (raiz: string[], chave: string, destino: DestinoGrade) => void;
  onEditarPasta?: (c: ConjuntoQuadros) => void;
  onExcluirPasta?: (id: string, raiz: string[]) => void;
  atual?: number;
  aba?: string;
  onAbrir?: () => void;
  extraFinal?: ReactNode;
}) {
  const [recolhidas, alternar] = useSecoesRecolhidas();
  const recentes = useQuadrosRecentes();
  const [grupo, setGrupo] = useState("__tudo");
  const porId = new Map(quadros.map((q) => [q.id, q]));
  const favs = quadros.filter((q) => favoritos.includes(q.id));
  const recs = recentes.map((id) => porId.get(id)).filter((q): q is QuadroCardDados => !!q);
  const grupos = [...new Set(quadros.map((q) => q.grupoNome))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filtrando = grupo !== "__tudo" && grupos.includes(grupo);
  const doGrupo = filtrando ? quadros.filter((q) => q.grupoNome === grupo) : quadros;
  const grade = { favoritos, onFavorito, atual, aba, onAbrir };
  const secao = (id: string, titulo: string, icone: ReactNode, quantidade: number, conteudo: ReactNode) => (
    <SecaoQuadros key={id} titulo={titulo} icone={icone} quantidade={quantidade} recolhida={recolhidas.has(id)} onAlternar={() => alternar(id)}>
      {conteudo}
    </SecaoQuadros>
  );
  const raizTodos = itensDaGrade(quadros, pastas).map((i) => i.chave);
  return (
    <div className="space-y-5">
      {favs.length > 0 && secao("fav", "Favoritos", <IconEstrela className="h-4 w-4 shrink-0" style={{ color: "var(--warn)" }} fill="currentColor" />, favs.length, <GradeQuadros quadros={favs} {...grade} />)}
      {recs.length > 0 && secao("rec", "Visualizados recentemente", <IconClock className="h-4 w-4 shrink-0 text-muted" />, recs.length, <GradeQuadros quadros={recs} {...grade} />)}
      {secao(
        "todos",
        "Seus quadros",
        <IconLayers className="h-4 w-4 shrink-0 text-muted" />,
        doGrupo.length,
        <div className="space-y-3">
          {grupos.length > 1 && (
            <ChipsEscolha ariaLabel="Grupo" valor={filtrando ? grupo : "__tudo"} onEscolher={setGrupo} opcoes={[{ value: "__tudo", label: "Tudo" }, ...grupos.map((g) => ({ value: g, label: g }))]} />
          )}
          <GradePastas
            quadros={doGrupo}
            estado={pastas}
            ocultarVazias={filtrando}
            {...grade}
            extra={extraFinal}
            onMover={onMover}
            menuPasta={
              onEditarPasta && onExcluirPasta ? (c) => <MenuConjunto conjunto={c} onEditar={() => onEditarPasta(c)} onExcluir={() => onExcluirPasta(c.id, raizTodos)} /> : undefined
            }
          />
        </div>,
      )}
    </div>
  );
}

/**
 * As PASTAS da pessoa (preferência `tarefas:conjuntos` = `{lista, ordem}`): salvar/excluir/MOVER é otimista e grava em
 * FILA (como os favoritos); falhou ⇒ volta ao último estado gravado e avisa.
 */
export function useConjuntosQuadros(inicial: PastasQuadros) {
  const [estado, setEstado] = useState(inicial);
  const atual = useRef(inicial);
  const gravado = useRef(inicial);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const gravar = (novo: PastasQuadros) => {
    if (novo === atual.current) return;
    atual.current = novo;
    setEstado(novo);
    fila.current = fila.current.then(() =>
      chamar("/api/preferencias/tabela", "PUT", { chave: CHAVE_CONJUNTOS_TAREFAS, valor: novo }).then(
        () => {
          gravado.current = novo;
        },
        (e) => {
          atual.current = gravado.current;
          setEstado(gravado.current);
          toast.error((e as Error).message);
        },
      ),
    );
  };
  return {
    estado,
    salvar: (c: ConjuntoQuadros) => gravar({ ...atual.current, lista: salvarConjunto(atual.current.lista, c) }),
    excluir: (id: string, raiz: string[]) => gravar(excluirPasta(atual.current, raiz, id)),
    mover: (raiz: string[], chave: string, destino: DestinoGrade) => gravar(moverNaGrade(atual.current, raiz, chave, destino)),
  };
}

/** O menu "…" de uma PASTA: editar e excluir (com confirmação — os quadros voltam à grade, nenhum é tocado). */
export function MenuConjunto({ conjunto, onEditar, onExcluir }: { conjunto: ConjuntoQuadros; onEditar: () => void; onExcluir: () => void }) {
  const { confirmar, confirmacao } = useConfirmacao();
  return (
    <>
      <Dropdown align="end" width={220} ariaLabel={`Ações da pasta ${conjunto.nome}`} triggerClassName="h-11 w-11 shrink-0 justify-center rounded-control text-muted hover:bg-surface-2 lg:h-9 lg:w-9" trigger={<IconMais className="h-4 w-4" />}>
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
              <IconPencil className="h-4 w-4 text-muted" /> Editar pasta
            </button>
            <button
              type="button"
              onClick={async () => {
                fechar();
                if (await confirmar({ titulo: `Excluir a pasta "${conjunto.nome}"?`, texto: "Só a pasta sai — os quadros dela voltam para a grade, como estão.", confirmar: "Excluir", perigo: true }))
                  onExcluir();
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-[13px] hover:bg-surface-2 lg:min-h-9"
              style={{ color: "var(--danger)" }}
            >
              <IconTrash className="h-4 w-4" /> Excluir pasta
            </button>
          </div>
        )}
      </Dropdown>
      {confirmacao}
    </>
  );
}

/**
 * O EDITOR de uma PASTA (criar/editar): o NOME, a COR (os tons da paleta, em círculos) e os QUADROS (busca + caixas de
 * marcar, com o grupo de cada um — o quadro que está em OUTRA pasta mostra que sai de lá). `quadros` = os que a pessoa pode
 * pôr (os da tela). Gravar devolve a pasta pronta.
 */
export function EditorConjunto({
  aberto,
  quadros,
  pastas = [],
  onFechar,
  onSalvar,
}: {
  /** A pasta em edição (`null` = fechado). */
  aberto: ConjuntoQuadros | null;
  quadros: QuadroCardDados[];
  /** Todas as pastas (o aviso "sai da pasta X"). */
  pastas?: ConjuntoQuadros[];
  onFechar: () => void;
  onSalvar: (c: ConjuntoQuadros) => void;
}) {
  return (
    <Modal open={aberto != null} onClose={onFechar} titulo={aberto?.nome ? "Editar pasta" : "Nova pasta"} size="md">
      {aberto && <FormConjunto key={aberto.id} inicial={aberto} quadros={quadros} pastas={pastas} onFechar={onFechar} onSalvar={onSalvar} />}
    </Modal>
  );
}

function FormConjunto({
  inicial,
  quadros,
  pastas,
  onFechar,
  onSalvar,
}: {
  inicial: ConjuntoQuadros;
  quadros: QuadroCardDados[];
  pastas: ConjuntoQuadros[];
  onFechar: () => void;
  onSalvar: (c: ConjuntoQuadros) => void;
}) {
  // Em que OUTRA pasta cada quadro está (um quadro fica em uma pasta só).
  const outraPasta = new Map(pastas.filter((p) => p.id !== inicial.id).flatMap((p) => p.quadros.map((q) => [q, p.nome] as const)));
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
      <TextField label="Nome da pasta" autoFocus value={c.nome} maxLength={MAX_NOME_CONJUNTO} placeholder="Ex.: PCA 2026, Rotinas, Protocolos" onChange={(e) => setC({ ...c, nome: e.target.value })} />
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
          Quadros <span className="font-normal text-muted">({c.quadros.length} na pasta)</span>
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
                      {outraPasta.has(q.id) && (
                        <span className="shrink-0 text-[11.5px]" style={{ color: "var(--warn)" }}>
                          {c.quadros.includes(q.id) ? `sai da pasta ${outraPasta.get(q.id)}` : `na pasta ${outraPasta.get(q.id)}`}
                        </span>
                      )}
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
          Salvar pasta
        </Button>
      </div>
    </form>
  );
}
