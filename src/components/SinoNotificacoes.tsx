"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { esperaReconexao } from "@/lib/ao-vivo-core";
import type { Notificacao, PaginaNotificacoes } from "@/lib/notificacoes";
import { MAX_AVISOS_NA_TELA, dataHoraCompleta, mesclarPrimeiraPagina, secoesDeAvisos, tempoRelativo, tituloComContagem } from "@/lib/notificacoes-tela-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import type { TipoNotificacao } from "@/lib/tarefas-core";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { ChipsIcone } from "./ChipsIcone";
import { useConfirmacao } from "./Confirmacao";
import { Dropdown } from "./Dropdown";
import { IconAdiar, IconBell, IconChevronDown, IconLidas, IconLimpar, IconNaoLida, IconSemAvisos, IconSettings, IconSpinner, IconTrash } from "./icons";
import { Modal, duracaoMotionMs } from "./Modal";
import { VISUAL_AVISO, visualAviso } from "./notificacoesVisual";
import { alertaSistema, tocarSom, usePreferenciasNotificacoes } from "./PreferenciasNotificacoes";
import { Segmented } from "./Segmented";
import { toast } from "./Toast";

const VISUAL = VISUAL_AVISO;

/** Quantos avisos por página (rolagem infinita). */
const POR_PAGINA = 20;
/** O "Desfazer" de limpar vale tanto (só então o banco é limpo). */
const DESFAZER_MS = 6000;

/** O ícone do tipo (ou a foto do autor com o ícone do tipo no canto). */
function MarcaAviso({ n }: { n: Notificacao }) {
  const { Icone, cor } = visualAviso(n.tipo);
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

/** O ADIAR: o instante de cada opção (1 h, 3 h, amanhã às 8 h de Brasília). */
export function opcoesAdiar(agora = Date.now()): { rotulo: string; em: number }[] {
  const amanha8 = (() => {
    const local = agora - 3 * 3_600_000;
    const dia = Math.floor(local / 86_400_000) * 86_400_000;
    return dia + 86_400_000 + 8 * 3_600_000 + 3 * 3_600_000;
  })();
  return [
    { rotulo: "1 h", em: agora + 3_600_000 },
    { rotulo: "3 h", em: agora + 3 * 3_600_000 },
    { rotulo: "Amanhã 8h", em: amanha8 },
  ];
}

/** Um botão de AÇÃO do aviso: só o ícone (o nome na dica e no nome acessível), 32px no desktop e 44px no toque. */
function Acao({ rotulo, onClick, children, perigo = false, ativo = false }: { rotulo: string; onClick: () => void; children: ReactNode; perigo?: boolean; ativo?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={ativo || undefined}
      className={`grid h-8 w-8 place-items-center rounded-control transition-colors pointer-coarse:h-11 pointer-coarse:w-11 ${
        ativo ? "bg-accent-soft text-accent" : `text-muted hover:bg-surface ${perigo ? "hover:text-[var(--danger)]" : "hover:text-text"}`
      }`}
    >
      {children}
    </button>
  );
}

/** Uma opção curta (pílula) da linha de ADIAR/SILENCIAR que abre embaixo do aviso. */
function Pilula({ children, onClick, dica }: { children: ReactNode; onClick: () => void; dica: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={dica}
      className="min-h-8 rounded-control border border-border-2 bg-surface px-2.5 text-[12px] font-semibold text-text-2 transition-colors hover:border-accent hover:text-accent pointer-coarse:min-h-11"
    >
      {children}
    </button>
  );
}

/**
 * UM aviso da lista: a foto do autor (ou o ícone do tipo), título, texto, hora RELATIVA (a completa na dica) e, no hover/
 * foco (sempre à vista no toque), as AÇÕES só com ícone — lida/não lida, ADIAR (1 h · 3 h · amanhã), SILENCIAR (a
 * tarefa · o quadro) e excluir. Tocar abre o que o aviso aponta. Os REPETIDOS (`outros`) aparecem como "+N".
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
  onAdiar,
  onSilenciar,
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
  onAdiar?: (n: Notificacao, em: number) => void;
  onSilenciar?: (n: Notificacao, alvo: "tarefa" | "quadro") => void;
  /** A posição na entrada (a animação de chegada escalonada). */
  ordem?: number;
}) {
  const [menu, setMenu] = useState<"adiar" | "silenciar" | null>(null);
  const podeSilenciar = onSilenciar && (n.tarefaId != null || n.quadroId != null);
  return (
    <div className="animate-fade-in-up" style={{ animationDelay: `${Math.min(ordem, 10) * 25}ms` }}>
      <div className="group/aviso relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-control px-2 py-1.5 transition-colors focus-within:bg-surface-2 hover:bg-surface-2">
        <button
          type="button"
          data-aviso={n.id}
          onClick={() => onAbrir(n)}
          title={`${n.titulo}${n.texto ? ` — ${n.texto}` : ""}\n${dataHoraCompleta(n.criadoEm)}${n.link ? "\nClique para abrir" : ""}`}
          className="absolute inset-0 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="sr-only">
            {n.lida ? "" : "Não lida: "}
            {n.titulo}
            {n.texto ? ` — ${n.texto}` : ""} ({tempoRelativo(n.criadoEm, agora)})
          </span>
        </button>
        <MarcaAviso n={n} />
        <span className="pointer-events-none min-w-0" aria-hidden="true">
          <span className={`line-clamp-2 block text-[13px] leading-snug ${n.lida ? "text-text-2" : "font-semibold text-text"}`}>{n.titulo}</span>
          {n.texto && (
            // A versão nova traz a LISTA do que mudou (uma linha por mudança).
            <span className={`mt-0.5 block text-[12px] text-muted ${n.tipo === "versao" ? "line-clamp-4 whitespace-pre-line" : "line-clamp-1"}`}>{n.texto}</span>
          )}
          <span className="mt-0.5 block text-[11px] text-faint">{tempoRelativo(n.criadoEm, agora)}</span>
        </span>
        <span className="relative z-10 flex flex-col items-end gap-1 pt-1.5">
          {!n.lida && <span className="h-2 w-2 rounded-full bg-accent" title="Não lida" aria-hidden="true" />}
        </span>
        {outros.length > 0 && onExpandir && (
          <button
            type="button"
            onClick={onExpandir}
            aria-expanded={expandido}
            title={expandido ? "Recolher os parecidos" : `Ver mais ${outros.length} aviso${outros.length === 1 ? "" : "s"} parecido${outros.length === 1 ? "" : "s"}`}
            aria-label={`${outros.length} parecidos — ${expandido ? "recolher" : "ver"}`}
            className="relative z-10 col-start-2 mt-1 inline-flex min-h-7 items-center gap-0.5 justify-self-start rounded-full bg-surface-2 px-2 text-[11px] font-semibold text-text-2 ring-1 ring-border hover:bg-accent-soft hover:text-accent pointer-coarse:min-h-11"
          >
            +{outros.length} parecido{outros.length === 1 ? "" : "s"}
            <IconChevronDown className={`h-3 w-3 transition-transform ${expandido ? "rotate-180" : ""}`} />
          </button>
        )}
        {/* As AÇÕES flutuam por cima (não roubam a largura do texto); no toque, ficam numa linha embaixo. */}
        <span
          className={`absolute top-1 right-1 z-20 flex items-center rounded-control bg-surface-2 shadow-soft ring-1 ring-border transition-opacity group-focus-within/aviso:opacity-100 group-hover/aviso:opacity-100 pointer-coarse:static pointer-coarse:col-start-2 pointer-coarse:col-end-4 pointer-coarse:mt-1 pointer-coarse:bg-transparent pointer-coarse:opacity-100 pointer-coarse:shadow-none pointer-coarse:ring-0 ${menu ? "opacity-100" : "pointer-events-none opacity-0 group-focus-within/aviso:pointer-events-auto group-hover/aviso:pointer-events-auto pointer-coarse:pointer-events-auto"}`}
        >
          {onLida && (
            <Acao rotulo={n.lida ? "Marcar como não lida" : "Marcar como lida"} onClick={() => onLida(n, !n.lida)}>
              {n.lida ? <IconNaoLida className="h-4 w-4" /> : <IconLidas className="h-4 w-4" />}
            </Acao>
          )}
          {onAdiar && (
            <Acao rotulo="Adiar (lembrar depois)" ativo={menu === "adiar"} onClick={() => setMenu((m) => (m === "adiar" ? null : "adiar"))}>
              <IconAdiar className="h-4 w-4" />
            </Acao>
          )}
          {podeSilenciar && (
            <Acao rotulo="Silenciar a tarefa ou o quadro" ativo={menu === "silenciar"} onClick={() => setMenu((m) => (m === "silenciar" ? null : "silenciar"))}>
              <IconSemAvisos className="h-4 w-4" />
            </Acao>
          )}
          {onExcluir && (
            <Acao rotulo="Excluir" perigo onClick={() => onExcluir(n)}>
              <IconTrash className="h-4 w-4" />
            </Acao>
          )}
        </span>
      </div>
      {menu && (
        <fieldset className="flex animate-fade-in-up flex-wrap items-center gap-1 pb-1.5 pl-12" aria-label={menu === "adiar" ? "Adiar para" : "Silenciar"}>
          {menu === "adiar" && onAdiar
            ? opcoesAdiar(agora).map((o) => (
                <Pilula
                  key={o.rotulo}
                  dica={`Lembrar ${o.rotulo === "Amanhã 8h" ? "amanhã às 8h" : `daqui a ${o.rotulo}`} — some do sino até lá`}
                  onClick={() => {
                    setMenu(null);
                    onAdiar(n, o.em);
                  }}
                >
                  {o.rotulo}
                </Pilula>
              ))
            : (
                [
                  ["tarefa", "Esta tarefa", n.tarefaId],
                  ["quadro", "Este quadro", n.quadroId],
                ] as const
              )
                .filter(([, , id]) => id != null)
                .map(([alvo, rotulo]) => (
                  <Pilula
                    key={alvo}
                    dica={alvo === "tarefa" ? "Parar os avisos desta tarefa (atribuição e menção continuam)" : "Parar os avisos deste quadro (atribuição e menção continuam)"}
                    onClick={() => {
                      setMenu(null);
                      onSilenciar?.(n, alvo);
                    }}
                  >
                    {rotulo}
                  </Pilula>
                ))}
        </fieldset>
      )}
    </div>
  );
}

/** O estado do sino compartilhado (o gatilho, o painel e a prévia). */
type Caixa = {
  naoLidas: number;
  setNaoLidas: (n: number | ((n: number) => number)) => void;
  /** Muda a cada aviso AO VIVO — o painel aberto recarrega. */
  versao: number;
  /** Os avisos que estão SAINDO (limpos com o "Desfazer" valendo, excluídos, adiados) — sobrevivem ao painel fechar. */
  ocultos: { current: Set<number> };
  /** LIMPAR com Desfazer: a tela tira na hora; o banco só é limpo ao fim do prazo (ou ao sair da página). */
  limpar: (alvo: "lidas" | "todas", ids: number[], contagemAntes: number, aoDesfazer: () => void) => void;
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

  /** Os avisos que a tela está tirando (o "Desfazer" ainda vale) — uma recarga não os traz de volta. */
  const { ocultos } = caixa;
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

  const limpar = async (alvo: "lidas" | "todas") => {
    if (!itens) return;
    if (alvo === "todas" && !(await confirmar({ titulo: "Limpar todas as notificações?", texto: "Elas saem do sino e do banco de dados.", confirmar: "Limpar tudo", perigo: true }))) return;
    const antes = itens;
    const saem = itens.filter((x) => alvo === "todas" || x.lida).map((x) => x.id);
    sair(saem);
    caixa.limpar(alvo, saem, caixa.naoLidas, () => setItens(antes));
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

  const adiar = async (n: Notificacao, em: number) => {
    for (const id of [n.id]) ocultos.current.add(id);
    sair([n.id]);
    if (!n.lida) setNaoLidas((c) => Math.max(0, c - 1));
    try {
      await chamar("/api/notificacoes", "PATCH", { ids: [n.id], adiarAte: em });
      toast.success(`Adiado — volta ${new Date(em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit" })}.`);
    } catch (e) {
      ocultos.current.delete(n.id);
      toast.error((e as Error).message);
      void pagina();
    }
  };

  const prefs = usePreferenciasNotificacoes();
  const silenciar = (n: Notificacao, alvo: "tarefa" | "quadro") => {
    const p = prefs.dados?.pessoa;
    const id = alvo === "tarefa" ? n.tarefaId : n.quadroId;
    if (!p || id == null) return;
    const lista = alvo === "tarefa" ? "tarefas" : "quadros";
    prefs.mudar({ pessoa: { ...p, [lista]: [...new Set([...p[lista], id])] } }, true);
    // Os avisos dele saem da lista agora (os diretos — atribuição, menção — continuam chegando).
    const saem = (itens ?? []).filter((x) => (alvo === "tarefa" ? x.tarefaId === id : x.quadroId === id) && x.lida).map((x) => x.id);
    if (saem.length) sair(saem);
    toast.desfazer(alvo === "tarefa" ? "Tarefa silenciada." : "Quadro silenciado.", () => prefs.mudar({ pessoa: p }, true));
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
              { value: "todas", label: "Todas", dica: "Todas as notificações" },
              { value: "nao-lidas", label: caixa.naoLidas ? `Não lidas (${caixa.naoLidas > 99 ? "99+" : caixa.naoLidas})` : "Não lidas", dica: "Só as que você ainda não leu" },
            ]}
          />
        </div>
        {tipos.length > 1 && (
          <div className="w-full">
            <ChipsIcone<string>
              ariaLabel="Filtrar por tipo"
              compacto
              itens={tipos.map((t) => ({ value: t, label: VISUAL[t]?.rotulo ?? t, ...visualAviso(t) }))}
              ligados={tipo ? [tipo] : []}
              onAlternar={(v, ligado) => setTipo(ligado ? (v as TipoNotificacao) : "")}
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
                      onAdiar={adiar}
                      onSilenciar={silenciar}
                      onExcluir={(n) => excluir(aberto ? [n] : [n, ...outros])}
                    />
                    {aberto &&
                      outros.map((o) => (
                        <div key={o.id} className="aviso-linha ml-6 border-l border-border pl-1" data-saindo={saindo.has(o.id) || undefined}>
                          <div className="min-h-0 overflow-hidden">
                            <ItemNotificacao n={o} agora={agora} onAbrir={abrir} onLida={alternarLida} onAdiar={adiar} onExcluir={(n) => excluir([n])} />
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
      <div className="flex shrink-0 items-center gap-0.5 border-t border-border px-1 pt-1.5">
        <Acao rotulo="Marcar todas como lidas" onClick={() => void marcarTodas()}>
          <IconLidas className="h-4 w-4" />
        </Acao>
        <Acao rotulo="Limpar as lidas (apaga do sistema)" onClick={() => void limpar("lidas")}>
          <IconLimpar className="h-4 w-4" />
        </Acao>
        <Acao rotulo="Limpar tudo (apaga do sistema — dá para desfazer)" perigo onClick={() => void limpar("todas")}>
          <IconTrash className="h-4 w-4" />
        </Acao>
        <span className="ml-auto pr-1 text-[11px] text-faint">{caixa.naoLidas ? `${caixa.naoLidas > 99 ? "99+" : caixa.naoLidas} não lida${caixa.naoLidas === 1 ? "" : "s"}` : ""}</span>
        <Link
          href={configurarHref}
          onClick={fechar}
          aria-label="Configurar notificações"
          title="Configurar notificações"
          className="grid h-8 w-8 place-items-center rounded-control text-muted hover:bg-surface-2 hover:text-text pointer-coarse:h-11 pointer-coarse:w-11"
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

  /** As escolhas da pessoa para o APARELHO (som, alerta do sistema) — lidas só quando chega um aviso (10 min de cache). */
  const aparelho = useRef<{ em: number; som: boolean; sistema: boolean } | null>(null);
  const router = useRouter();
  const alertasDoAparelho = useCallback(
    async (n: Notificacao) => {
      try {
        if (!aparelho.current || Date.now() - aparelho.current.em > 600_000) {
          const j = await chamar<{ pessoa: { som: boolean; sistema: boolean } }>("/api/notificacoes/preferencias");
          aparelho.current = { em: Date.now(), som: j.pessoa.som, sistema: j.pessoa.sistema };
        }
        if (aparelho.current.som) tocarSom();
        if (aparelho.current.sistema && document.visibilityState !== "visible") alertaSistema(n, () => n.link && router.push(n.link));
      } catch {
        /* sem preferências: sem som */
      }
    },
    [router],
  );

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
        void alertasDoAparelho(n);
      }
      ultimoId.current = Math.max(ultimoId.current ?? 0, n.id);
    } catch {
      /* fica o último número */
    }
  }, [alertasDoAparelho]);

  /** Confere de novo (o número + o aviso mais recente) — no máximo a cada 15 s (trocar de tela e voltar à janela). */
  const recontar = useCallback(() => {
    if (Date.now() - contadaEm.current < 15_000) return;
    void conferirNovo();
  }, [conferirNovo]);

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
    if (!aoVivo) recontar();
  }, [pathname]);
  useEffect(() => {
    const aoVoltar = () => document.visibilityState === "visible" && recontar();
    document.addEventListener("visibilitychange", aoVoltar);
    // Ao vivo, uma conferência a cada 5 min cobre o aviso enviado a muitas pessoas de uma vez (o comunicado).
    const t = window.setInterval(() => document.visibilityState === "visible" && void conferirNovo(), aoVivo ? 300_000 : 60_000);
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

  const ocultos = useRef<Set<number>>(new Set());
  const pendente = useRef<{ alvo: "lidas" | "todas"; ids: number[]; timer: number } | null>(null);
  const enviarLimpeza = useCallback((alvo: "lidas" | "todas", keepalive = false) => {
    void fetch("/api/notificacoes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limpar: alvo }), keepalive }).catch(() => {});
  }, []);
  // A limpeza pendente vai ao banco se a pessoa sai da página antes do fim do prazo.
  useEffect(() => {
    const aoSair = () => {
      if (!pendente.current) return;
      window.clearTimeout(pendente.current.timer);
      enviarLimpeza(pendente.current.alvo, true);
      pendente.current = null;
    };
    window.addEventListener("pagehide", aoSair);
    return () => window.removeEventListener("pagehide", aoSair);
  }, [enviarLimpeza]);
  const limpar = useCallback(
    (alvo: "lidas" | "todas", ids: number[], contagemAntes: number, aoDesfazer: () => void) => {
      // Uma limpeza ainda pendente vai já (a nova a substitui).
      if (pendente.current) {
        window.clearTimeout(pendente.current.timer);
        enviarLimpeza(pendente.current.alvo);
      }
      for (const id of ids) ocultos.current.add(id);
      if (alvo === "todas") setNaoLidas(0);
      const timer = window.setTimeout(() => {
        enviarLimpeza(alvo);
        pendente.current = null;
      }, DESFAZER_MS);
      pendente.current = { alvo, ids, timer };
      toast.desfazer(
        alvo === "todas" ? "Notificações limpas." : "Notificações lidas limpas.",
        () => {
          if (!pendente.current || pendente.current.timer !== timer) return;
          window.clearTimeout(timer);
          pendente.current = null;
          for (const id of ids) ocultos.current.delete(id);
          setNaoLidas(contagemAntes);
          aoDesfazer();
          // O painel aberto (ou o próximo) volta a mostrar o que foi devolvido.
          setVersao((v) => v + 1);
        },
        DESFAZER_MS,
      );
    },
    [enviarLimpeza],
  );

  return { caixa: { naoLidas, setNaoLidas, versao, ocultos, limpar } as Caixa, aoVivo, novo, fecharNovo: () => setNovo(null), toque };
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
