"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dataHoraBR } from "@/lib/format";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Badge, type Tone } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { useConfirmacao } from "./Confirmacao";
import { ErroCarga } from "./ErroCarga";
import { IconTrello } from "./icons";
import { LinkExterno } from "./LinkExterno";
import { Modal } from "./Modal";
import { SeletorBusca } from "./SeletorBusca";
import { Progress } from "./Progress";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

/** O estado da ligação que a rota devolve. */
export type EstadoTrello = {
  estado: string;
  boardUrl: string | null;
  sincronizadoEm: string | null;
  ultimoErro: string | null;
  pendentes: number;
  erros: number;
  /** O Trello não deixou usar campos personalizados neste board. */
  semCampos?: boolean;
};
type BoardTrello = { id: string; nome: string; url: string; ultimaAtividade: string | null; ligado: boolean };
type Progresso = Record<"listas" | "etiquetas" | "cartoes" | "checklists" | "comentarios", [number, number]>;

const ROTULO_PROGRESSO: Record<keyof Progresso, string> = { listas: "Listas", etiquetas: "Etiquetas", cartoes: "Cartões", checklists: "Checklists e itens", comentarios: "Comentários" };
/** O que fica só no PCA (o Trello não tem o equivalente). */
export const NAO_SINCRONIZA = ["observadores", "equipes", "eventos da tarefa", "recorrência (a próxima tarefa gerada sincroniza)", "automações", "lista de concluídas e limite de cartões"];

/** O selo do estado (tom + rótulo). */
export function seloTrello(l: EstadoTrello | null): [Tone, string] {
  if (!l) return ["slate", "Não ligado"];
  if (l.estado === "vinculando") return ["amber", "Ligando ao Trello"];
  if (l.estado === "pausado") return ["slate", "Pausado"];
  if (l.estado === "erro" || l.erros > 0) return ["red", "Com erro"];
  if (l.pendentes > 0) return ["amber", `${l.pendentes} pendente(s)`];
  return ["emerald", "Sincronizado"];
}

const COR_TOM: Partial<Record<Tone, string>> = { emerald: "var(--ok)", amber: "var(--warn)", red: "var(--danger)" };

/** O INDICADOR do Trello na faixa do quadro ligado: o ícone + o ponto do estado (tocar leva à seção Trello). */
export function IndicadorTrello({ ligacao, onAbrir }: { ligacao: EstadoTrello; onAbrir: () => void }) {
  const [tom, rotulo] = seloTrello(ligacao);
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`Trello: ${rotulo}`}
      aria-label={`Trello: ${rotulo}`}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-control text-text-2 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] lg:h-9 lg:w-9"
    >
      <IconTrello className="h-4 w-4" />
      <span aria-hidden className="absolute top-2 right-2 h-2 w-2 rounded-full ring-2 ring-surface lg:top-1.5 lg:right-1.5" style={{ background: COR_TOM[tom] ?? "var(--muted)" }} />
    </button>
  );
}

/**
 * A seção TRELLO da Configuração do quadro: sem ligação, "Criar no Trello" (o board ADAPTADO — listas, etiquetas na mesma
 * paleta, campos personalizados Prioridade/Estimativa/Ticket + os do quadro, membros ligados, cartões, checklists,
 * comentários e anexos) ou "Ligar a um quadro existente" (a FUSÃO: casa pelo nome; o que só existe de um lado vai ao
 * outro), em etapas com o PROGRESSO (retomável: parar no meio não duplica nada); ligado, o estado, "Abrir no Trello",
 * "Continuar" (se parou no meio) e "Desligar". Mostra o que NÃO sincroniza.
 */
export function SincronizacaoTrello({ quadroId, privado }: { quadroId: number; privado: boolean }) {
  const [dados, setDados] = useState<{ configurado: boolean; ligacao: EstadoTrello | null; pode: boolean } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  /** O andamento do "Sincronizar agora" (a tela repete até zerar a fila). */
  const [sinc, setSinc] = useState<{ feito: number; total: number } | null>(null);
  const [escolha, setEscolha] = useState<{ boards: BoardTrello[] | null; falha: string | null; valor: string } | null>(null);
  const vivo = useRef(true);
  const { confirmar, confirmacao } = useConfirmacao();
  const carregar = useCallback(() => {
    setFalha(null);
    chamar<{ configurado: boolean; ligacao: EstadoTrello | null; pode: boolean }>(`/api/tarefas/quadros/${quadroId}/trello`)
      .then((d) => vivo.current && setDados(d))
      .catch((e) => vivo.current && setFalha((e as Error).message));
  }, [quadroId]);
  useEffect(() => {
    vivo.current = true;
    carregar();
    return () => {
      vivo.current = false;
    };
  }, [carregar]);

  /** Cria (ou continua) — repete a etapa até não faltar nada; uma falha para e deixa "Continuar". */
  const executar = async (acao: "criar" | "ligar" | "etapa", boardId?: string) => {
    setRodando(true);
    try {
      let a: "criar" | "ligar" | "etapa" = acao;
      for (let i = 0; i < 500 && vivo.current; i++) {
        const r = await chamar<{ progresso: Progresso; restante: number; ligacao: EstadoTrello; aviso?: string | null }>(`/api/tarefas/quadros/${quadroId}/trello`, "POST", {
          acao: a,
          ...(a === "ligar" ? { boardId } : {}),
        });
        a = "etapa";
        setProgresso(r.progresso);
        setDados((d) => (d ? { ...d, ligacao: r.ligacao } : d));
        if (!r.restante) {
          toast.success(acao === "ligar" ? "Quadro ligado ao Trello — trazendo o que só existe de um lado para o outro." : "Quadro ligado ao Trello.");
          if (r.aviso) toast.warning(r.aviso);
          if (r.ligacao?.pendentes) await sincronizarTudo(true);
          break;
        }
      }
    } catch (e) {
      toast.error(`${(e as Error).message} — use "Continuar" para retomar de onde parou.`);
      carregar();
    } finally {
      if (vivo.current) setRodando(false);
    }
  };

  /** Abre a escolha do quadro existente (os boards da conta institucional). */
  const abrirEscolha = () => {
    setEscolha({ boards: null, falha: null, valor: "" });
    chamar<{ boards: BoardTrello[] }>("/api/integracoes/trello/boards")
      .then((r) => vivo.current && setEscolha((e) => (e ? { ...e, boards: r.boards } : e)))
      .catch((e) => vivo.current && setEscolha((x) => (x ? { ...x, falha: (e as Error).message } : x)));
  };

  /**
   * SINCRONIZAR AGORA até o fim: cada chamada trata um lote da fila dentro da requisição e a tela repete enquanto houver
   * pendentes e o lote andar (sem andar = só erros/esperas — para e mostra). Fechar a tela interrompe.
   */
  const sincronizarTudo = async (continuar = false) => {
    setRodando(true);
    let feitos = 0;
    let falhas = 0;
    let total = 0;
    let esperas = 0;
    try {
      for (let i = 0; i < 400 && vivo.current; i++) {
        const r = await chamar<{ ligacao: EstadoTrello; feitos: number; falhas: number; adiados?: number }>(`/api/tarefas/quadros/${quadroId}/trello`, "POST", {
          acao: "sincronizar",
          continuar: continuar || i > 0,
        });
        feitos += r.feitos;
        falhas += r.falhas;
        const pendentes = r.ligacao?.pendentes ?? 0;
        total = Math.max(total, feitos + pendentes);
        setSinc({ feito: feitos, total });
        setDados((d) => (d ? { ...d, ligacao: r.ligacao } : d));
        if (!pendentes) break;
        if (!r.feitos) {
          // Outra sincronização está no quadro (a trava): espera um pouco e tenta de novo, em vez de parar.
          if (!r.adiados || ++esperas > 20) break;
          await new Promise((ok) => setTimeout(ok, 3000));
        }
      }
      if (!vivo.current) return;
      const resta = total - feitos;
      if (falhas || resta) toast.warning(`${feitos} sincronizado(s)${resta ? `; ${resta} ainda na fila (tentando de novo em instantes)` : ""}${falhas ? `; ${falhas} com erro` : ""}.`);
      else toast.success(`Sincronizado — ${feitos} item(ns).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (vivo.current) {
        setRodando(false);
        setSinc(null);
      }
    }
  };

  /** Os campos personalizados de novo (depois de a conta virar administradora do board ou ligar o Power-Up no Trello). */
  const camposDeNovo = async () => {
    setRodando(true);
    try {
      const r = await chamar<{ ligacao: EstadoTrello; campos: boolean }>(`/api/tarefas/quadros/${quadroId}/trello`, "POST", { acao: "campos" });
      setDados((d) => (d ? { ...d, ligacao: r.ligacao } : d));
      if (r.campos) toast.success("Campos personalizados criados no Trello — os valores estão indo para os cartões.");
      else toast.warning("O Trello ainda não liberou os campos personalizados neste quadro.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (vivo.current) setRodando(false);
    }
  };

  /** Pausar / retomar. */
  const acaoSimples = async (acao: "pausar" | "retomar") => {
    setRodando(true);
    try {
      const r = await chamar<{ ligacao: EstadoTrello }>(`/api/tarefas/quadros/${quadroId}/trello`, "POST", { acao });
      setDados((d) => (d ? { ...d, ligacao: r.ligacao } : d));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (vivo.current) setRodando(false);
    }
  };

  if (falha && !dados) return <ErroCarga msg={falha} onTentar={carregar} />;
  if (!dados) return <SkeletonLinhas linhas={3} />;
  const l = dados.ligacao;
  const [tom, rotulo] = seloTrello(l);
  const total = progresso ? Object.values(progresso).reduce((s, [, b]) => s + b, 0) : 0;
  const feito = progresso ? Object.values(progresso).reduce((s, [a]) => s + a, 0) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <IconTrello className="h-5 w-5 text-accent" />
        <Badge tone={tom} dot>
          {rotulo}
        </Badge>
        {l?.sincronizadoEm && <span className="text-[12px] text-muted">Última sincronização: {dataHoraBR(l.sincronizadoEm)}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {l?.boardUrl && <LinkExterno href={l.boardUrl}>Abrir no Trello</LinkExterno>}
          {dados.pode && !l && (
            <>
              <Button size="sm" variant="secondary" disabled={!dados.configurado || rodando} onClick={abrirEscolha}>
                Ligar a um quadro existente
              </Button>
              <Button size="sm" disabled={!dados.configurado || rodando} loading={rodando} onClick={() => executar("criar")}>
                Criar no Trello
              </Button>
            </>
          )}
          {dados.pode && l?.estado === "vinculando" && !rodando && (
            <Button size="sm" onClick={() => executar("etapa")}>
              Continuar
            </Button>
          )}
          {dados.pode && l && l.estado !== "vinculando" && (
            <>
              <Button size="sm" variant="secondary" disabled={rodando || l.estado === "pausado"} loading={rodando} onClick={() => sincronizarTudo()}>
                Sincronizar agora
              </Button>
              <Button size="sm" variant="ghost" disabled={rodando} onClick={() => acaoSimples(l.estado === "pausado" ? "retomar" : "pausar")}>
                {l.estado === "pausado" ? "Retomar" : "Pausar"}
              </Button>
            </>
          )}
          {dados.pode && l && (
            <Button
              size="sm"
              variant="ghost"
              disabled={rodando}
              onClick={async () => {
                if (!(await confirmar({ titulo: "Desligar do Trello?", texto: "A sincronização para. O quadro daqui e o board do Trello ficam como estão.", confirmar: "Desligar", perigo: true }))) return;
                try {
                  await chamar(`/api/tarefas/quadros/${quadroId}/trello`, "POST", { acao: "desligar" });
                  setProgresso(null);
                  carregar();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Desligar
            </Button>
          )}
        </div>
      </div>
      {!dados.configurado && !l && <Callout kind="info">A integração com o Trello não está ativa. O administrador a configura em Administração → Integrações.</Callout>}
      {privado && dados.pode && !l && <Callout kind="warn">Quadro privado: no Trello ele fica num board privado, visível também à conta institucional da integração.</Callout>}
      {l?.ultimoErro && <Callout kind="danger">{l.ultimoErro}</Callout>}
      {l?.semCampos && (
        <Callout kind="warn">
          <p>
            O Trello não liberou os campos personalizados neste quadro: Prioridade, Estimativa, Ticket e os campos do quadro ficam só aqui. O resto sincroniza normalmente.
            Para liberar, torne a conta institucional ADMINISTRADORA deste quadro no Trello (ou ligue lá o Power-Up “Campos personalizados”) e tente de novo.
          </p>
          {dados.pode && (
            <Button size="sm" variant="secondary" className="mt-2" disabled={rodando} onClick={camposDeNovo}>
              Tentar de novo
            </Button>
          )}
        </Callout>
      )}
      {sinc && (
        <Progress value={sinc.total ? (sinc.feito / sinc.total) * 100 : 0} label={`Sincronizando ${sinc.feito} de ${sinc.total}…`} />
      )}
      {progresso && !sinc && (rodando || feito < total) && (
        <div className="space-y-2">
          <Progress value={total ? (feito / total) * 100 : 0} label="Ligando ao Trello" />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-muted sm:grid-cols-3">
            {(Object.keys(ROTULO_PROGRESSO) as (keyof Progresso)[]).map((k) => (
              <li key={k} className="tabular-nums">
                {ROTULO_PROGRESSO[k]}: {progresso[k][0]} de {progresso[k][1]}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[12px] text-muted">
        Ficam só aqui (o Trello não tem o equivalente): {NAO_SINCRONIZA.join(", ")}.
      </p>
      <Modal
        open={!!escolha}
        onClose={() => setEscolha(null)}
        titulo="Ligar a um quadro existente do Trello"
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEscolha(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!escolha?.valor}
              onClick={() => {
                const b = escolha?.valor;
                setEscolha(null);
                if (b) void executar("ligar", b);
              }}
            >
              Ligar
            </Button>
          </div>
        }
      >
        {escolha && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted">
              Listas, etiquetas e cartões de MESMO nome são casados (o cartão, dentro da lista casada); nas diferenças vale a alteração mais recente. O que só existe
              de um lado é criado no outro.
            </p>
            {escolha.falha ? (
              <ErroCarga msg={escolha.falha} onTentar={abrirEscolha} />
            ) : !escolha.boards ? (
              <SkeletonLinhas linhas={4} />
            ) : (
              <SeletorBusca
                opcoes={escolha.boards
                  .filter((b) => !b.ligado)
                  .map((b) => ({ valor: b.id, rotulo: b.nome, detalhe: b.ultimaAtividade ? `Última atividade: ${dataHoraBR(b.ultimaAtividade)}` : undefined }))}
                valor={escolha.valor}
                onChange={(v) => setEscolha({ ...escolha, valor: v })}
                ariaLabel="Quadro do Trello"
                placeholder="Buscar quadro do Trello"
                vazio="Nenhum quadro livre na conta do Trello"
              />
            )}
          </div>
        )}
      </Modal>
      {confirmacao}
    </div>
  );
}
