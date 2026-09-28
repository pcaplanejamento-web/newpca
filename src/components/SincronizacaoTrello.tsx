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
import { Progress } from "./Progress";
import { SkeletonLinhas } from "./Skeleton";
import { toast } from "./Toast";

/** O estado da ligação que a rota devolve. */
export type EstadoTrello = { estado: string; boardUrl: string | null; sincronizadoEm: string | null; ultimoErro: string | null; pendentes: number; erros: number };
type Progresso = Record<"listas" | "etiquetas" | "cartoes" | "checklists" | "comentarios", [number, number]>;

const ROTULO_PROGRESSO: Record<keyof Progresso, string> = { listas: "Listas", etiquetas: "Etiquetas", cartoes: "Cartões", checklists: "Checklists e itens", comentarios: "Comentários" };
/** O que fica só no PCA (o Trello não tem o equivalente). */
export const NAO_SINCRONIZA = ["observadores", "equipes", "eventos da tarefa", "recorrência (a próxima tarefa gerada sincroniza)", "automações", "lista de concluídas e limite de cartões"];

/** O selo do estado (tom + rótulo). */
export function seloTrello(l: EstadoTrello | null): [Tone, string] {
  if (!l) return ["slate", "Não ligado"];
  if (l.estado === "vinculando") return ["amber", "Criando no Trello"];
  if (l.estado === "pausado") return ["slate", "Pausado"];
  if (l.estado === "erro" || l.erros > 0) return ["red", "Com erro"];
  if (l.pendentes > 0) return ["amber", `${l.pendentes} pendente(s)`];
  return ["emerald", "Sincronizado"];
}

/**
 * A seção TRELLO da Configuração do quadro: sem ligação, "Criar no Trello" (o board ADAPTADO — listas, etiquetas na mesma
 * paleta, campos personalizados Prioridade/Estimativa/Ticket + os do quadro, membros ligados, cartões, checklists,
 * comentários e anexos), em etapas com o PROGRESSO (retomável: parar no meio não duplica nada); ligado, o estado, "Abrir no
 * Trello", "Continuar" (se parou no meio) e "Desligar". Mostra o que NÃO sincroniza.
 */
export function SincronizacaoTrello({ quadroId, privado }: { quadroId: number; privado: boolean }) {
  const [dados, setDados] = useState<{ configurado: boolean; ligacao: EstadoTrello | null; pode: boolean } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
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
  const executar = async (acao: "criar" | "etapa") => {
    setRodando(true);
    try {
      let a: "criar" | "etapa" = acao;
      for (let i = 0; i < 500 && vivo.current; i++) {
        const r = await chamar<{ progresso: Progresso; restante: number; ligacao: EstadoTrello }>(`/api/tarefas/quadros/${quadroId}/trello`, "POST", { acao: a });
        a = "etapa";
        setProgresso(r.progresso);
        setDados((d) => (d ? { ...d, ligacao: r.ligacao } : d));
        if (!r.restante) {
          toast.success("Quadro criado no Trello.");
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
            <Button size="sm" disabled={!dados.configurado || rodando} loading={rodando} onClick={() => executar("criar")}>
              Criar no Trello
            </Button>
          )}
          {dados.pode && l?.estado === "vinculando" && !rodando && (
            <Button size="sm" onClick={() => executar("etapa")}>
              Continuar
            </Button>
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
      {progresso && (rodando || feito < total) && (
        <div className="space-y-2">
          <Progress value={total ? (feito / total) * 100 : 0} label="Criando no Trello" />
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
      {confirmacao}
    </div>
  );
}
