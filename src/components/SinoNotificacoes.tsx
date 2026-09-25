"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ComponentType, useCallback, useEffect, useRef, useState } from "react";
import { dataHoraBR } from "@/lib/format";
import type { Notificacao } from "@/lib/notificacoes";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { TipoNotificacao } from "@/lib/tarefas-core";
import { Avatar } from "./Avatar";
import { Dropdown } from "./Dropdown";
import { IconAtribuir, IconAutomacao, IconBell, IconComentario, IconMencao, IconPrazo, IconSpinner } from "./icons";

/** Ícone e cor (token) de cada tipo — a cor do semáforo nas de prazo. */
const VISUAL: Record<TipoNotificacao, { Icone: ComponentType<{ className?: string }>; cor: string }> = {
  atribuida: { Icone: IconAtribuir, cor: "var(--accent)" },
  mencionada: { Icone: IconMencao, cor: "var(--info)" },
  comentario: { Icone: IconComentario, cor: "var(--info)" },
  vence_amanha: { Icone: IconPrazo, cor: "var(--warn)" },
  atrasada: { Icone: IconPrazo, cor: "var(--danger)" },
  automacao: { Icone: IconAutomacao, cor: "var(--accent)" },
};

/** Uma notificação da lista: o autor (foto) ou o ícone do tipo, título, texto, data; ponto accent = não lida. */
export function ItemNotificacao({ n, onAbrir }: { n: Notificacao; onAbrir: (n: Notificacao) => void }) {
  const { Icone, cor } = VISUAL[n.tipo];
  return (
    <button
      type="button"
      onClick={() => onAbrir(n)}
      className="flex min-h-11 w-full items-start gap-2.5 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
    >
      <span className="relative mt-0.5 shrink-0">
        {n.ator ? (
          <Avatar nome={n.ator.nome} foto={n.ator.foto} size="sm" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full" style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, var(--surface))` }}>
            <Icone className="h-4 w-4" />
          </span>
        )}
        {n.ator && (
          <span className="absolute -right-1 -bottom-1 grid h-4 w-4 place-items-center rounded-full bg-surface ring-2 ring-surface" style={{ color: cor }}>
            <Icone className="h-3 w-3" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] leading-snug ${n.lida ? "text-text-2" : "font-semibold text-text"}`}>{n.titulo}</span>
        {n.texto && <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted">{n.texto}</span>}
        <span className="mt-0.5 block text-[11px] text-faint">{dataHoraBR(n.criadoEm)}</span>
      </span>
      {!n.lida && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent">
          <span className="sr-only">Não lida</span>
        </span>
      )}
    </button>
  );
}

/** O conteúdo do painel — carrega a lista ao ABRIR (o Dropdown só o monta aberto). */
function PainelNotificacoes({ onContagem, fechar }: { onContagem: (n: number) => void; fechar: () => void }) {
  const router = useRouter();
  const [dados, setDados] = useState<{ itens: Notificacao[]; naoLidas: number } | null>(null);
  const [falha, setFalha] = useState(false);

  useEffect(() => {
    let vivo = true;
    chamar<{ itens: Notificacao[]; naoLidas: number }>("/api/notificacoes")
      .then((j) => {
        if (!vivo) return;
        setDados(j);
        onContagem(j.naoLidas);
      })
      .catch(() => vivo && setFalha(true));
    return () => {
      vivo = false;
    };
  }, [onContagem]);

  const marcar = (corpo: { ids: number[] } | { todas: true }) => chamar("/api/notificacoes", "PATCH", corpo).catch(() => {});
  const abrir = (n: Notificacao) => {
    if (!n.lida) {
      marcar({ ids: [n.id] });
      onContagem(Math.max(0, (dados?.naoLidas ?? 1) - 1));
    }
    fechar();
    if (n.link) router.push(n.link);
  };
  const todas = () => {
    marcar({ todas: true });
    setDados((d) => (d ? { naoLidas: 0, itens: d.itens.map((i) => ({ ...i, lida: true })) } : d));
    onContagem(0);
  };

  return (
    <div className="space-y-1">
      <div className="flex min-h-11 items-center justify-between gap-2 px-2 lg:min-h-9">
        <p className="text-sm font-semibold text-text">Notificações</p>
        {!!dados?.naoLidas && (
          <button type="button" onClick={todas} className="min-h-11 rounded-control px-2 text-[12px] font-semibold text-accent hover:bg-surface-2 lg:min-h-8">
            Marcar todas como lidas
          </button>
        )}
      </div>
      {!dados && !falha && (
        <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted">
          <IconSpinner className="h-4 w-4" /> Carregando…
        </p>
      )}
      {falha && <p className="px-2 py-6 text-center text-xs text-muted">Não foi possível carregar as notificações.</p>}
      {dados?.itens.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted">Você está em dia. Nada por aqui ainda.</p>}
      {dados?.itens.map((n) => (
        <ItemNotificacao key={n.id} n={n} onAbrir={abrir} />
      ))}
    </div>
  );
}

/**
 * O SINO do cabeçalho: o número de NÃO LIDAS (vem do layout e é reconferido ao voltar à janela e ao trocar de tela) e,
 * ao abrir, as últimas notificações — tarefa atribuída, menção, comentário, automação e os PRAZOS (vence amanhã,
 * atrasada — derivados na leitura). Tocar abre a tarefa e marca como lida.
 */
export function SinoNotificacoes({ naoLidas: inicial = 0 }: { naoLidas?: number }) {
  const pathname = usePathname();
  const [naoLidas, setNaoLidas] = useState(inicial);
  const recontar = useCallback(() => {
    chamar<{ naoLidas: number }>("/api/notificacoes?contar=1")
      .then((j) => setNaoLidas(j.naoLidas))
      .catch(() => {});
  }, []);
  // Reconta a cada troca de tela (o layout não re-renderiza na navegação) — a 1ª já veio do servidor.
  const primeira = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara pela troca de tela.
  useEffect(() => {
    if (primeira.current) primeira.current = false;
    else recontar();
  }, [pathname]);
  useEffect(() => {
    const aoVoltar = () => document.visibilityState === "visible" && recontar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [recontar]);

  return (
    <Dropdown
      align="end"
      ariaLabel={naoLidas ? `Notificações — ${naoLidas} não lida${naoLidas === 1 ? "" : "s"}` : "Notificações"}
      triggerClassName="relative h-11 w-11 justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text-2 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
      trigger={
        <>
          <IconBell className="h-5 w-5" />
          {naoLidas > 0 && (
            <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold leading-none text-white lg:top-0 lg:right-0">
              {naoLidas > 99 ? "99+" : naoLidas}
            </span>
          )}
        </>
      }
      width={360}
    >
      {(fechar) => <PainelNotificacoes onContagem={setNaoLidas} fechar={fechar} />}
    </Dropdown>
  );
}
