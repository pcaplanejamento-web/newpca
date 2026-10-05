"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ComponentType, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { esperaReconexao } from "@/lib/ao-vivo-core";
import type { Notificacao, PaginaNotificacoes } from "@/lib/notificacoes";
import { MAX_AVISOS_NA_TELA, dataHoraCompleta, mesclarPrimeiraPagina, secoesDeAvisos, tempoRelativo, tituloComContagem } from "@/lib/notificacoes-tela-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { TipoNotificacao } from "@/lib/tarefas-core";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { ChipsEscolha } from "./ChipsEscolha";
import { useConfirmacao } from "./Confirmacao";
import { Dropdown } from "./Dropdown";
import {
  IconAtribuir,
  IconAutomacao,
  IconBell,
  IconCadastro,
  IconCalendar,
  IconChevronDown,
  IconClipboard,
  IconComentario,
  IconEventoAlterado,
  IconLayers,
  IconLidas,
  IconMencao,
  IconNaoLida,
  IconPrazo,
  IconSemAvisos,
  IconSettings,
  IconSpinner,
  IconTrash,
} from "./icons";
import { Modal, duracaoMotionMs } from "./Modal";
import { Segmented } from "./Segmented";
import { toast } from "./Toast";

/** Ícone e cor (token) de cada tipo — a cor do semáforo nas de prazo. */
const VISUAL: Record<TipoNotificacao, { Icone: ComponentType<{ className?: string }>; cor: string; rotulo: string }> = {
  atribuida: { Icone: IconAtribuir, cor: "var(--accent)", rotulo: "Atribuídas" },
  mencionada: { Icone: IconMencao, cor: "var(--info)", rotulo: "Menções" },
  comentario: { Icone: IconComentario, cor: "var(--info)", rotulo: "Comentários" },
  vence_hoje: { Icone: IconPrazo, cor: "var(--warn)", rotulo: "Vencem hoje" },
  vence_amanha: { Icone: IconPrazo, cor: "var(--warn)", rotulo: "Vencem amanhã" },
  atrasada: { Icone: IconPrazo, cor: "var(--danger)", rotulo: "Atrasadas" },
  automacao: { Icone: IconAutomacao, cor: "var(--accent)", rotulo: "Automações" },
  lembrete: { Icone: IconCalendar, cor: "var(--info)", rotulo: "Lembretes" },
  convite: { Icone: IconCalendar, cor: "var(--accent)", rotulo: "Convites" },
  resposta: { Icone: IconCalendar, cor: "var(--ok)", rotulo: "Respostas" },
  evento: { Icone: IconEventoAlterado, cor: "var(--warn)", rotulo: "Eventos alterados" },
  protocolo: { Icone: IconClipboard, cor: "var(--accent)", rotulo: "Protocolos" },
  pca: { Icone: IconLayers, cor: "var(--info)", rotulo: "PCA" },
  cadastro: { Icone: IconCadastro, cor: "var(--accent)", rotulo: "Cadastros" },
};

/** Quantos avisos por página (rolagem infinita). */
const POR_PAGINA = 20;
/** O "Desfazer" de limpar vale tanto (só então o banco é limpo). */
const DESFAZER_MS = 6000;

/** O ícone do tipo (ou a foto do autor com o ícone do tipo no canto). */
function MarcaAviso({ n }: { n: Notificacao }) {
  const { Icone, cor } = VISUAL[n.tipo] ?? VISUAL.automacao;
  return (
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
  );
}

/**
 * UM aviso da lista: a foto do autor (ou o ícone do tipo), título, texto, hora RELATIVA (a completa na dica) e, no hover/
 * foco (sempre à vista no toque), as AÇÕES — marcar como lida/não lida e excluir. Tocar abre o que o aviso aponta. Os
 * REPETIDOS (`outros`) aparecem como "+N" e se abrem embaixo.
 */
export function ItemNotificacao({
  n,
  onAbrir,
  agora = Date.now(),
  outros = [],
  expandido = false,
  onExpandir,
  onLida,
  onExcluir,
  ordem = 0,
}: {
  n: Notificacao;
  onAbrir: (n: Notificacao) => void;
  agora?: number;
  outros?: Notificacao[];
  expandido?: boolean;
  onExpandir?: () => void;
  onLida?: (n: Notificacao, lida: boolean) => void;
  onExcluir?: (n: Notificacao) => void;
  /** A posição na entrada (a animação de chegada escalonada). */
  ordem?: number;
}) {
  return (
    <div
      className="group/aviso relative flex animate-fade-in-up items-start gap-2.5 rounded-control px-2 py-2 transition-colors focus-within:bg-surface-2 hover:bg-surface-2"
      style={{ animationDelay: `${Math.min(ordem, 10) * 25}ms` }}
    >
      <button
        type="button"
        data-aviso={n.id}
        onClick={() => onAbrir(n)}
        className="absolute inset-0 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="sr-only">
          {n.lida ? "" : "Não lida: "}
          {n.titulo}
          {n.texto ? ` — ${n.texto}` : ""} ({tempoRelativo(n.criadoEm, agora)})
        </span>
      </button>
      <MarcaAviso n={n} />
      <span className="pointer-events-none min-w-0 flex-1" aria-hidden="true">
        <span className={`block text-[13px] leading-snug ${n.lida ? "text-text-2" : "font-semibold text-text"}`}>{n.titulo}</span>
        {n.texto && <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted">{n.texto}</span>}
        <span className="mt-0.5 block text-[11px] text-faint" title={dataHoraCompleta(n.criadoEm)}>
          {tempoRelativo(n.criadoEm, agora)}
        </span>
      </span>
      <span className="relative z-10 flex shrink-0 flex-col items-end gap-1">
        <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/aviso:opacity-100 group-hover/aviso:opacity-100 pointer-coarse:opacity-100">
          {onLida && (
            <button
              type="button"
              onClick={() => onLida(n, !n.lida)}
              title={n.lida ? "Marcar como não lida" : "Marcar como lida"}
              aria-label={n.lida ? `Marcar como não lida: ${n.titulo}` : `Marcar como lida: ${n.titulo}`}
              className="grid h-8 w-8 place-items-center rounded-control text-muted hover:bg-surface hover:text-text pointer-coarse:h-11 pointer-coarse:w-11"
            >
              {n.lida ? <IconNaoLida className="h-4 w-4" /> : <IconLidas className="h-4 w-4" />}
            </button>
          )}
          {onExcluir && (
            <button
              type="button"
              onClick={() => onExcluir(n)}
              title="Excluir"
              aria-label={`Excluir: ${n.titulo}`}
              className="grid h-8 w-8 place-items-center rounded-control text-muted hover:bg-surface hover:text-[var(--danger)] pointer-coarse:h-11 pointer-coarse:w-11"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          )}
        </span>
        {!n.lida && <span className="mr-3 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />}
        {outros.length > 0 && onExpandir && (
          <button
            type="button"
            onClick={onExpandir}
            aria-expanded={expandido}
            className="inline-flex min-h-8 items-center gap-0.5 rounded-full bg-surface-2 px-2 text-[11px] font-semibold text-text-2 hover:bg-accent-soft hover:text-accent pointer-coarse:min-h-11"
          >
            +{outros.length}
            <IconChevronDown className={`h-3 w-3 transition-transform ${expandido ? "rotate-180" : ""}`} />
          </button>
        )}
      </span>
    </div>
  );
}

/** O estado do sino compartilhado (o gatilho, o painel e a prévia). */
type Caixa = {
  naoLidas: number;
  setNaoLidas: (n: number | ((n: number) => number)) => void;
  /** Muda a cada aviso AO VIVO — o painel aberto recarrega. */
  versao: number;
};

/**
 * O PAINEL do sino: abas Todas | Não lidas, filtro por tipo, avisos AGRUPADOS por dia (e os repetidos juntos), rolagem
 * infinita (até `MAX_AVISOS_NA_TELA` na memória), ações por aviso e, no rodapé, marcar todas como lidas, LIMPAR (as lidas
 * ou tudo — com "Desfazer"; só então o banco é limpo) e configurar.
 */
function PainelNotificacoes({ caixa, fechar, configurarHref, semTitulo = false }: { caixa: Caixa; fechar: () => void; configurarHref: string; semTitulo?: boolean }) {
  const router = useRouter();
  const { confirmar, confirmacao } = useConfirmacao();
  const [filtro, setFiltro] = useState<"todas" | "nao-lidas">("todas");
  const [tipo, setTipo] = useState<TipoNotificacao | "">("");
  const [itens, setItens] = useState<Notificacao[] | null>(null);
  const [mais, setMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [falha, setFalha] = useState(false);
  const [saindo, setSaindo] = useState<Set<number>>(new Set());
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [agora, setAgora] = useState(() => Date.now());
  const fim = useRef<HTMLDivElement>(null);
  const carga = useRef(0);
  const { setNaoLidas } = caixa;

  // A hora relativa anda sozinha (a cada minuto).
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  /** Os avisos que a tela está LIMPANDO (o "Desfazer" ainda vale) — uma recarga não os traz de volta. */
  const ocultos = useRef<Set<number>>(new Set());
  /** `antes` = a próxima página (rolagem); `mesclar` = a 1ª página por cima da lista (o aviso ao vivo). */
  const pagina = useCallback(
    async (antes?: number, mesclar = false) => {
      const minha = ++carga.current;
      setCarregando(true);
      try {
        const q = new URLSearchParams({ filtro, limite: String(POR_PAGINA) });
        if (antes) q.set("antes", String(antes));
        const j = await chamar<PaginaNotificacoes>(`/api/notificacoes?${q}`);
        if (minha !== carga.current) return;
        setNaoLidas(j.naoLidas);
        setItens((xs) => {
          if (mesclar) return mesclarPrimeiraPagina(xs ?? [], j.itens, j.mais, ocultos.current);
          const base = antes ? (xs ?? []) : [];
          const vistos = new Set(base.map((x) => x.id));
          return [...base, ...j.itens.filter((x) => !vistos.has(x.id) && !ocultos.current.has(x.id))].slice(0, MAX_AVISOS_NA_TELA);
        });
        setMais((m) => (mesclar ? m || j.mais : j.mais));
        setFalha(false);
        setAgora(Date.now());
      } catch {
        if (minha === carga.current) setFalha(true);
      } finally {
        if (minha === carga.current) setCarregando(false);
      }
    },
    [filtro, setNaoLidas],
  );

  // A 1ª página ao abrir e ao trocar de aba; cada aviso AO VIVO MESCLA a 1ª página (as já carregadas ficam).
  useEffect(() => {
    void pagina();
  }, [pagina]);
  const versaoVista = useRef(caixa.versao);
  useEffect(() => {
    if (caixa.versao === versaoVista.current) return;
    versaoVista.current = caixa.versao;
    void pagina(undefined, true);
  }, [caixa.versao, pagina]);

  // Rolagem infinita: o fim da lista à vista pede a próxima página.
  const naMemoria = itens?.length ?? 0;
  useEffect(() => {
    const el = fim.current;
    if (!el || !mais || carregando || naMemoria >= MAX_AVISOS_NA_TELA) return;
    const obs = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && itens?.length) void pagina(itens[itens.length - 1].id);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [mais, carregando, naMemoria, itens, pagina]);

  /** Tira avisos da lista com a altura recolhendo (a animação de saída). */
  const sair = useCallback((ids: number[]) => {
    setSaindo((s) => new Set([...s, ...ids]));
    window.setTimeout(() => {
      setItens((xs) => xs?.filter((x) => !ids.includes(x.id)) ?? xs);
      setSaindo((s) => new Set([...s].filter((id) => !ids.includes(id))));
    }, duracaoMotionMs());
  }, []);

  const abrir = async (n: Notificacao) => {
    if (!n.lida) {
      setNaoLidas((c) => Math.max(0, c - 1));
      // Espera gravar antes de navegar (a reconta da tela nova não traz o número velho).
      await chamar("/api/notificacoes", "PATCH", { ids: [n.id], lida: true }).catch(() => {});
    }
    fechar();
    if (n.link) router.push(n.link);
  };

  const alternarLida = async (n: Notificacao, lida: boolean) => {
    const ids = [n.id];
    setItens((xs) => xs?.map((x) => (x.id === n.id ? { ...x, lida } : x)) ?? xs);
    setNaoLidas((c) => Math.max(0, c + (lida ? -1 : 1)));
    if (lida && filtro === "nao-lidas") sair([n.id]);
    try {
      await chamar("/api/notificacoes", "PATCH", { ids, lida });
    } catch (e) {
      setItens((xs) => xs?.map((x) => (x.id === n.id ? { ...x, lida: !lida } : x)) ?? xs);
      setNaoLidas((c) => Math.max(0, c + (lida ? 1 : -1)));
      toast.error((e as Error).message);
    }
  };

  const excluir = async (alvos: Notificacao[]) => {
    const ids = alvos.map((x) => x.id);
    const naoLidas = alvos.filter((x) => !x.lida).length;
    for (const id of ids) ocultos.current.add(id);
    sair(ids);
    setNaoLidas((c) => Math.max(0, c - naoLidas));
    try {
      await chamar("/api/notificacoes", "DELETE", { ids });
    } catch (e) {
      toast.error((e as Error).message);
      void pagina();
    }
  };

  // LIMPAR com Desfazer: tira da tela na hora e só limpa o banco ao fim do prazo (ou ao sair da página — `keepalive`).
  const pendente = useRef<{ alvo: "lidas" | "todas"; timer: number } | null>(null);
  const enviarLimpeza = useCallback((alvo: "lidas" | "todas", keepalive = false) => {
    void fetch("/api/notificacoes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limpar: alvo }), keepalive }).catch(() => {});
  }, []);
  useEffect(() => {
    const aoSair = () => {
      if (pendente.current) {
        window.clearTimeout(pendente.current.timer);
        enviarLimpeza(pendente.current.alvo, true);
        pendente.current = null;
      }
    };
    window.addEventListener("pagehide", aoSair);
    return () => {
      window.removeEventListener("pagehide", aoSair);
      aoSair();
    };
  }, [enviarLimpeza]);

  const limpar = async (alvo: "lidas" | "todas") => {
    if (!itens) return;
    if (alvo === "todas" && !(await confirmar({ titulo: "Limpar todas as notificações?", texto: "Elas saem do sino e do banco de dados.", confirmar: "Limpar tudo", perigo: true }))) return;
    if (pendente.current) {
      window.clearTimeout(pendente.current.timer);
      enviarLimpeza(pendente.current.alvo);
    }
    const antes = itens;
    const contagemAntes = caixa.naoLidas;
    const saem = itens.filter((x) => alvo === "todas" || x.lida).map((x) => x.id);
    for (const id of saem) ocultos.current.add(id);
    sair(saem);
    if (alvo === "todas") setNaoLidas(0);
    const timer = window.setTimeout(() => {
      enviarLimpeza(alvo);
      pendente.current = null;
    }, DESFAZER_MS);
    pendente.current = { alvo, timer };
    toast.desfazer(
      alvo === "todas" ? "Notificações limpas." : "Notificações lidas limpas.",
      () => {
        if (!pendente.current) return;
        window.clearTimeout(pendente.current.timer);
        pendente.current = null;
        for (const id of saem) ocultos.current.delete(id);
        setItens(antes);
        setNaoLidas(contagemAntes);
      },
      DESFAZER_MS,
    );
  };

  const marcarTodas = async () => {
    const antes = itens;
    setItens((xs) => xs?.map((x) => ({ ...x, lida: true })) ?? xs);
    setNaoLidas(0);
    if (filtro === "nao-lidas" && itens) sair(itens.map((x) => x.id));
    try {
      await chamar("/api/notificacoes", "PATCH", { todas: true });
    } catch (e) {
      setItens(antes);
      toast.error((e as Error).message);
      void pagina();
    }
  };

  // ↑/↓ entre os avisos; Delete exclui o aviso em foco.
  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    const botoes = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-aviso]")];
    const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      botoes[Math.max(0, Math.min(botoes.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
    } else if (e.key === "Delete" && i >= 0) {
      e.preventDefault();
      const n = itens?.find((x) => String(x.id) === botoes[i].dataset.aviso);
      if (n) void excluir([n]);
      (botoes[i + 1] ?? botoes[i - 1])?.focus();
    }
  };

  const tipos = useMemo(() => [...new Set((itens ?? []).map((x) => x.tipo))], [itens]);
  const visiveis = useMemo(() => (itens ?? []).filter((x) => !tipo || x.tipo === tipo), [itens, tipo]);
  const secoes = useMemo(() => secoesDeAvisos(visiveis, agora), [visiveis, agora]);
  const temLidas = (itens ?? []).some((x) => x.lida);
  let ordem = 0;

  return (
    <div className="flex max-h-[inherit] min-h-0 flex-col">
      {confirmacao}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-2 pt-1 pb-2">
        {!semTitulo && <p className="text-sm font-semibold text-text">Notificações</p>}
        <div className={semTitulo ? "" : "ml-auto"}>
          <Segmented<"todas" | "nao-lidas">
            value={filtro}
            onChange={(f) => {
              setFiltro(f);
              setItens(null);
            }}
            ariaLabel="Quais notificações"
            options={[
              { value: "todas", label: "Todas" },
              { value: "nao-lidas", label: caixa.naoLidas ? `Não lidas (${caixa.naoLidas > 99 ? "99+" : caixa.naoLidas})` : "Não lidas" },
            ]}
          />
        </div>
        {tipos.length > 1 && (
          <div className="w-full">
            <ChipsEscolha<string>
              ariaLabel="Tipo de notificação"
              valor={tipo}
              onEscolher={(v) => setTipo(v as TipoNotificacao | "")}
              opcoes={[{ value: "", label: "Todos" }, ...tipos.map((t) => ({ value: t, label: VISUAL[t]?.rotulo ?? t }))]}
            />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1" onKeyDown={teclado} role="presentation">
        {itens === null && !falha && (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted">
            <IconSpinner className="h-4 w-4" /> Carregando…
          </p>
        )}
        {falha && itens === null && (
          <div className="px-2 py-6 text-center text-xs text-muted">
            <p>Não foi possível carregar as notificações.</p>
            <Button className="mt-2" size="sm" variant="secondary" onClick={() => pagina()}>
              Tentar de novo
            </Button>
          </div>
        )}
        {itens && visiveis.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-faint">
              <IconSemAvisos className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-text">{filtro === "nao-lidas" ? "Nenhuma não lida" : "Você está em dia"}</p>
            <p className="text-xs text-muted">Os avisos novos chegam aqui na hora.</p>
          </div>
        )}
        {secoes.map((sec) => (
          <section key={sec.grupo} aria-label={sec.grupo}>
            <h3 className="sticky top-0 z-20 bg-surface px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">{sec.grupo}</h3>
            {sec.linhas.map(({ principal, outros }) => {
              const aberto = expandidos.has(principal.id);
              return (
                <div key={principal.id} className="aviso-linha" data-saindo={saindo.has(principal.id) || undefined}>
                  <div className="min-h-0 overflow-hidden">
                    <ItemNotificacao
                      n={principal}
                      agora={agora}
                      ordem={ordem++}
                      outros={outros}
                      expandido={aberto}
                      onExpandir={() => setExpandidos((s) => (s.has(principal.id) ? new Set([...s].filter((x) => x !== principal.id)) : new Set([...s, principal.id])))}
                      onAbrir={abrir}
                      onLida={alternarLida}
                      onExcluir={(n) => excluir(aberto ? [n] : [n, ...outros])}
                    />
                    {aberto &&
                      outros.map((o) => (
                        <div key={o.id} className="aviso-linha ml-6 border-l border-border pl-1" data-saindo={saindo.has(o.id) || undefined}>
                          <div className="min-h-0 overflow-hidden">
                            <ItemNotificacao n={o} agora={agora} onAbrir={abrir} onLida={alternarLida} onExcluir={(n) => excluir([n])} />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        <div ref={fim} className="h-1" />
        {carregando && itens !== null && (
          <p className="flex items-center justify-center gap-2 py-3 text-xs text-muted">
            <IconSpinner className="h-4 w-4" /> Carregando mais…
          </p>
        )}
        {naMemoria >= MAX_AVISOS_NA_TELA && mais && <p className="px-2 py-3 text-center text-[11px] text-faint">Mostrando as {MAX_AVISOS_NA_TELA} mais recentes — limpe as antigas para ver o resto.</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-border px-1 pt-2">
        <Button size="sm" variant="ghost" icon={<IconLidas className="h-4 w-4" />} onClick={marcarTodas} disabled={!caixa.naoLidas}>
          Marcar todas como lidas
        </Button>
        <Button size="sm" variant="ghost" onClick={() => limpar("lidas")} disabled={!temLidas}>
          Limpar lidas
        </Button>
        <Button size="sm" variant="ghost" icon={<IconTrash className="h-4 w-4" />} onClick={() => limpar("todas")} disabled={!itens?.length}>
          Limpar tudo
        </Button>
        <Link
          href={configurarHref}
          onClick={fechar}
          aria-label="Configurar notificações"
          title="Configurar notificações"
          className="ml-auto grid h-11 w-11 place-items-center rounded-control text-muted hover:bg-surface-2 hover:text-text lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]"
        >
          <IconSettings className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

/**
 * O estado do sino: o número de NÃO LIDAS (vem do layout), o canal AO VIVO (WebSocket → a caixa da pessoa: cada aviso
 * novo, lido ou limpo chega na hora — em qualquer aba ou aparelho) e, sem o canal, a consulta de reserva (a cada 60 s
 * com a aba à vista). O aviso NOVO dá a prévia flutuante, balança o sino e é anunciado ao leitor de tela.
 */
function useCaixa(inicial: number) {
  const pathname = usePathname();
  const [naoLidas, setNaoLidas] = useState(inicial);
  const [versao, setVersao] = useState(0);
  const [aoVivo, setAoVivo] = useState(false);
  const [novo, setNovo] = useState<Notificacao | null>(null);
  const [toque, setToque] = useState(0);
  const ultimoId = useRef<number | null>(null);
  const contadaEm = useRef(0);

  /** Confere o aviso mais recente: o de id maior que o último visto vira a PRÉVIA (o 1º só marca a base). */
  const conferirNovo = useCallback(async () => {
    try {
      const j = await chamar<PaginaNotificacoes>("/api/notificacoes?filtro=nao-lidas&limite=1");
      setNaoLidas(j.naoLidas);
      contadaEm.current = Date.now();
      const n = j.itens[0];
      if (!n) return;
      if (ultimoId.current != null && n.id > ultimoId.current) {
        setNovo(n);
        setToque((x) => x + 1);
      }
      ultimoId.current = Math.max(ultimoId.current ?? 0, n.id);
    } catch {
      /* fica o último número */
    }
  }, []);

  const recontar = useCallback(async (forcar = false) => {
    if (!forcar && Date.now() - contadaEm.current < 15_000) return;
    contadaEm.current = Date.now();
    try {
      const j = await chamar<{ naoLidas: number }>("/api/notificacoes?contar=1");
      setNaoLidas(j.naoLidas);
    } catch {
      /* fica o último número */
    }
  }, []);

  // O canal AO VIVO (reconecta com espera crescente; a caixa responde ao "ping" sem acordar).
  useEffect(() => {
    let ws: WebSocket | null = null;
    let tentativa = 0;
    let timer = 0;
    let batida = 0;
    let vivo = true;
    const agendar = () => {
      if (vivo) timer = window.setTimeout(conectar, esperaReconexao(tentativa++));
    };
    function conectar() {
      if (!vivo) return;
      try {
        ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/notificacoes/ao-vivo`);
      } catch {
        agendar();
        return;
      }
      ws.onopen = () => {
        tentativa = 0;
        setAoVivo(true);
        void conferirNovo();
        batida = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 45_000);
      };
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        setVersao((v) => v + 1);
        void conferirNovo();
      };
      ws.onclose = () => {
        setAoVivo(false);
        window.clearInterval(batida);
        agendar();
      };
    }
    void conferirNovo();
    conectar();
    return () => {
      vivo = false;
      window.clearTimeout(timer);
      window.clearInterval(batida);
      ws?.close();
    };
  }, [conferirNovo]);

  // Sem o canal: reconta ao trocar de tela, ao voltar à janela e a cada 60 s com a aba à vista.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara pela troca de tela.
  useEffect(() => {
    if (!aoVivo) void recontar();
  }, [pathname]);
  useEffect(() => {
    const aoVoltar = () => document.visibilityState === "visible" && void (aoVivo ? conferirNovo() : recontar());
    document.addEventListener("visibilitychange", aoVoltar);
    const t = aoVivo ? 0 : window.setInterval(() => document.visibilityState === "visible" && void conferirNovo(), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.clearInterval(t);
    };
  }, [aoVivo, recontar, conferirNovo]);

  // O título da aba com o número ("(3) Mesa") — também depois de cada navegação (o Next troca o título).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reaplica a cada tela.
  useEffect(() => {
    const t = window.setTimeout(() => {
      document.title = tituloComContagem(document.title, naoLidas);
    }, 120);
    return () => window.clearTimeout(t);
  }, [naoLidas, pathname]);

  return { caixa: { naoLidas, setNaoLidas, versao } as Caixa, aoVivo, novo, fecharNovo: () => setNovo(null), toque };
}

/**
 * O SINO do cabeçalho: o número de NÃO LIDAS (o selo anima a troca) e, ao abrir, o painel das notificações — no desktop
 * um painel preso ao sino; no celular uma folha de baixo. Avisos novos chegam AO VIVO (prévia flutuante + o sino balança).
 */
export function SinoNotificacoes({ naoLidas: inicial = 0, configurarHref = "/painel/perfil" }: { naoLidas?: number; configurarHref?: string }) {
  const router = useRouter();
  const { caixa, novo, fecharNovo, toque, aoVivo } = useCaixa(inicial);
  const [folha, setFolha] = useState(false);
  const n = caixa.naoLidas;
  const rotulo = n ? `Notificações — ${n} não lida${n === 1 ? "" : "s"}` : "Notificações";
  const icone = (
    <>
      <span key={toque} className={toque ? "animate-sino-tocar" : ""}>
        <IconBell className="h-5 w-5" />
      </span>
      {n > 0 && (
        <span
          key={`n${n}`}
          className="animate-selo-pop absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold leading-none text-white lg:top-0 lg:right-0"
        >
          {n > 99 ? "99+" : n}
        </span>
      )}
    </>
  );
  const classeGatilho =
    "relative h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text-2 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)]";

  return (
    <>
      <div className="hidden lg:block">
        <Dropdown align="end" papel="dialog" ariaLabel={rotulo} title={aoVivo ? "Notificações (ao vivo)" : "Notificações"} triggerClassName={`${classeGatilho} inline-flex`} trigger={icone} width={400}>
          {(fechar) => (
            <div className="flex max-h-[min(78vh,640px)] flex-col">
              <PainelNotificacoes caixa={caixa} fechar={fechar} configurarHref={configurarHref} />
            </div>
          )}
        </Dropdown>
      </div>
      <button type="button" aria-label={rotulo} aria-haspopup="dialog" onClick={() => setFolha(true)} className={`${classeGatilho} inline-flex lg:hidden`}>
        {icone}
      </button>
      <Modal open={folha} onClose={() => setFolha(false)} titulo="Notificações" size="md">
        <div className="flex h-[min(72dvh,640px)] flex-col">
          {folha && <PainelNotificacoes caixa={caixa} fechar={() => setFolha(false)} configurarHref={configurarHref} semTitulo />}
        </div>
      </Modal>
      <span className="sr-only" aria-live="polite">
        {novo ? `Nova notificação: ${novo.titulo}` : ""}
      </span>
      {novo && (
        <AvisoFlutuante
          kind="info"
          titulo={novo.titulo}
          duracao={6000}
          onClose={fecharNovo}
          acoes={
            novo.link ? (
              <Button
                size="sm"
                onClick={() => {
                  const alvo = novo;
                  fecharNovo();
                  void chamar("/api/notificacoes", "PATCH", { ids: [alvo.id], lida: true })
                    .then(() => caixa.setNaoLidas((c) => Math.max(0, c - 1)))
                    .catch(() => {});
                  if (alvo.link) router.push(alvo.link);
                }}
              >
                Abrir
              </Button>
            ) : undefined
          }
        >
          {novo.texto}
        </AvisoFlutuante>
      )}
    </>
  );
}
