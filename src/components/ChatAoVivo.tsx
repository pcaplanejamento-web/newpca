"use client";

import Link from "next/link";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type CartaoLink,
  type ConfigChat,
  type Conversa,
  cartoesDoTexto,
  conversaPrivada,
  DIGITANDO_DURA_MS,
  horaChat,
  idDaConversa,
  INTERVALO_DIGITANDO_MS,
  juntarMensagem,
  lerMensagemRecebida,
  limparTextoChat,
  MAX_TEXTO_CHAT,
  MAX_TRECHO_RESPOSTA,
  type MensagemChat,
  mencaoEmCurso,
  novoIdMensagem,
  quantosLeram,
  type RespostaChat,
  rotuloDiaChat,
} from "@/lib/chat-core";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Avatar } from "./Avatar";
import { EVENTO_CHAT_PRIVADO, useCanalGrupo, useNaoPerturbe } from "./CanalGrupo";
import { IconArrowDown, IconChat, IconChevronLeft, IconClose, IconEnviar, IconLidas, IconCheck, IconResponder, IconUsers } from "./icons";
import { tocarSom } from "./PreferenciasNotificacoes";
import { SeloAoVivo } from "./PresencaGrupo";
import { TextoFormatado } from "./TextoFormatado";
import { toast } from "./Toast";

type Envio = "enviando" | "enviada" | "falhou" | "nao-entregue";
type MsgTela = MensagemChat & { minha: boolean; envio?: Envio; motivo?: string };
type ConversaTela = { msgs: MsgTela[]; naoLidas: number; lidaAte: Map<number, string>; digitando: Map<number, number> };

const nova = (): ConversaTela => ({ msgs: [], naoLidas: 0, lidaAte: new Map(), digitando: new Map() });
/** Sem a confirmação do servidor em 8 s, a mensagem do grupo fica "não enviada" (com "Tentar de novo"). */
const ESPERA_CONFIRMACAO_MS = 8000;

/**
 * O estado do CHAT AO VIVO (na memória da aba — nada é gravado; some no F5): as conversas (a do grupo e as privadas desta
 * sessão), o envio (grupo pelo socket do grupo; privado pela rota → a caixa pessoal), a confirmação, "digitando", "lida",
 * as não lidas e o aviso da mensagem que chega.
 */
function useChat(config: ConfigChat, aberto: { painel: boolean; conversa: Conversa | null }, abrir: (c: Conversa) => void) {
  const canal = useCanalGrupo();
  const naoPerturbe = useNaoPerturbe();
  const [conversas, setConversas] = useState<Map<Conversa, ConversaTela>>(() => new Map());
  /** Quem escreveu no privado sem estar no grupo ativo (foto + nome vêm na mensagem). */
  const [autores, setAutores] = useState<Map<number, Pessoa>>(() => new Map());
  const [, setRelogio] = useState(0);
  const abertoRef = useRef(aberto);
  abertoRef.current = aberto;
  const dndRef = useRef(naoPerturbe);
  dndRef.current = naoPerturbe;
  const abrirRef = useRef(abrir);
  abrirRef.current = abrir;
  const meuId = canal?.usuarioId ?? 0;
  const grupoId = canal?.grupoId ?? null;

  const mudar = useCallback((c: Conversa, f: (x: ConversaTela) => ConversaTela) => {
    setConversas((m) => {
      const n = new Map(m);
      n.set(c, f(n.get(c) ?? nova()));
      return n;
    });
  }, []);

  // Trocar de grupo: a conversa do grupo é outra (a anterior some — nada é guardado).
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara pela troca de grupo.
  useEffect(() => {
    setConversas((m) => {
      if (!m.has("grupo")) return m;
      const n = new Map(m);
      n.delete("grupo");
      return n;
    });
  }, [grupoId]);

  const nomeDe = useCallback(
    (id: number) => {
      const p = canal?.pessoas.find((x) => x.id === id) ?? autores.get(id);
      return p ? nomeExibicao(p) : "Alguém";
    },
    [canal?.pessoas, autores],
  );
  const nomeRef = useRef(nomeDe);
  nomeRef.current = nomeDe;

  /** Uma mensagem que CHEGOU (do grupo ou privada). */
  const receber = useCallback(
    (m: MensagemChat) => {
      const minha = m.de === meuId;
      if (m.autor && !minha) {
        const a = m.autor;
        setAutores((x) => (x.has(a.id) ? x : new Map(x).set(a.id, { id: a.id, nome: a.nome, apelido: a.apelido, foto: a.foto })));
      }
      const vendo = abertoRef.current.painel && abertoRef.current.conversa === m.conversa && document.visibilityState === "visible";
      mudar(m.conversa, (c) => {
        const digitando = new Map(c.digitando);
        digitando.delete(m.de);
        const ja = c.msgs.some((x) => x.id === m.id);
        // A MINHA que volta: no grupo é a confirmação (enviada); no privado é o eco às minhas outras abas — na aba que
        // enviou, quem decide é a resposta da rota (entregue ou não).
        const msg: MsgTela = minha && ja && m.conversa !== "grupo" ? { ...m, minha } : { ...m, minha, envio: minha ? "enviada" : undefined, motivo: undefined };
        return {
          ...c,
          digitando,
          msgs: juntarMensagem(c.msgs, msg),
          naoLidas: minha || vendo || ja ? c.naoLidas : c.naoLidas + 1,
        };
      });
      if (minha || vendo) return;
      if (!dndRef.current) tocarSom();
      // Com o painel aberto, a lista já mostra a não lida (o aviso flutuante cobriria o campo).
      if (abertoRef.current.painel) return;
      const quem = nomeRef.current(m.de);
      const onde = m.conversa === "grupo" ? " no grupo" : "";
      const trecho = m.texto.replace(/\s+/g, " ").slice(0, 80);
      toast.acao(`${quem}${onde}: ${trecho}`, "Responder", () => abrirRef.current(m.conversa));
    },
    [meuId, mudar],
  );

  // O canal do GRUPO: mensagens, recusas, "digitando" e "lida".
  useEffect(() => {
    if (!canal) return;
    const fora = [
      canal.ouvir("msg", (o) => {
        const m = lerMensagemRecebida(o);
        if (m && m.conversa === "grupo" && config.grupo) receber(m);
      }),
      canal.ouvir("msg-recusada", (o) => {
        const id = String(o.id ?? "");
        mudar("grupo", (c) => ({ ...c, msgs: c.msgs.map((x) => (x.id === id ? { ...x, envio: "falhou", motivo: String(o.motivo ?? "Não enviada.") } : x)) }));
      }),
      canal.ouvir("digitando", (o) => {
        const de = Number(o.de);
        const c = String(o.conversa);
        if (!Number.isInteger(de) || (c !== "grupo" && idDaConversa(c) == null)) return;
        mudar(c as Conversa, (x) => ({ ...x, digitando: new Map(x.digitando).set(de, Date.now() + DIGITANDO_DURA_MS) }));
      }),
      canal.ouvir("lida", (o) => {
        const de = Number(o.de);
        const c = String(o.conversa);
        if (!Number.isInteger(de) || typeof o.ate !== "string" || (c !== "grupo" && idDaConversa(c) == null)) return;
        mudar(c as Conversa, (x) => ({ ...x, lidaAte: new Map(x.lidaAte).set(de, o.ate as string) }));
      }),
    ];
    return () => {
      for (const f of fora) f();
    };
  }, [canal, config.grupo, receber, mudar]);

  // O PRIVADO chega pela caixa pessoal (o canal do sino → evento da janela).
  useEffect(() => {
    if (!config.privado) return;
    const ouvir = (e: Event) => {
      try {
        const m = lerMensagemRecebida(JSON.parse(String((e as CustomEvent).detail)) as Record<string, unknown>);
        if (m && m.conversa !== "grupo") receber(m);
      } catch {
        /* mensagem ilegível */
      }
    };
    window.addEventListener(EVENTO_CHAT_PRIVADO, ouvir);
    return () => window.removeEventListener(EVENTO_CHAT_PRIVADO, ouvir);
  }, [config.privado, receber]);

  // O "digitando" some sozinho (um relógio só enquanto há alguém digitando).
  const algumDigitando = [...conversas.values()].some((c) => c.digitando.size > 0);
  useEffect(() => {
    if (!algumDigitando) return;
    const t = window.setInterval(() => {
      const agora = Date.now();
      setConversas((m) => {
        let mudou = false;
        const n = new Map(m);
        for (const [k, c] of n) {
          const d = new Map([...c.digitando].filter(([, ate]) => ate > agora));
          if (d.size !== c.digitando.size) {
            n.set(k, { ...c, digitando: d });
            mudou = true;
          }
        }
        return mudou ? n : m;
      });
      setRelogio((x) => x + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [algumDigitando]);

  // LER: a conversa aberta à vista zera as não lidas e avisa até onde leu (só quando muda).
  const lidaEnviada = useRef(new Map<Conversa, string>());
  const atual = aberto.conversa ? conversas.get(aberto.conversa) : undefined;
  const ultimaDosOutros = atual ? [...atual.msgs].reverse().find((x) => !x.minha)?.id : undefined;
  useEffect(() => {
    const c = aberto.conversa;
    if (!aberto.painel || !c || !canal) return;
    const marcar = () => {
      if (document.visibilityState !== "visible") return;
      mudar(c, (x) => (x.naoLidas ? { ...x, naoLidas: 0 } : x));
      if (ultimaDosOutros && lidaEnviada.current.get(c) !== ultimaDosOutros) {
        lidaEnviada.current.set(c, ultimaDosOutros);
        canal.enviar({ t: "lida", conversa: c, ate: ultimaDosOutros });
      }
    };
    marcar();
    document.addEventListener("visibilitychange", marcar);
    return () => document.removeEventListener("visibilitychange", marcar);
  }, [aberto.painel, aberto.conversa, ultimaDosOutros, canal, mudar]);

  // Fechar/recarregar a aba com conversa em andamento: o navegador pergunta (nada é guardado).
  const temConversa = [...conversas.values()].some((c) => c.msgs.length > 0);
  useEffect(() => {
    if (!temConversa) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [temConversa]);

  /** ENVIAR: grupo pelo socket do grupo (o servidor confirma pelo id); privado pela rota (não entregue = sem aba aberta). */
  const enviar = useCallback(
    async (c: Conversa, textoBruto: string, resp: RespostaChat | null, idExistente?: string) => {
      const texto = limparTextoChat(textoBruto);
      if (!texto || !canal) return;
      const id = idExistente ?? novoIdMensagem();
      mudar(c, (x) => ({ ...x, msgs: juntarMensagem(x.msgs, { id, conversa: c, de: meuId, em: Date.now(), texto, resp, minha: true, envio: "enviando", motivo: undefined }) }));
      const falhar = (motivo: string, envio: Envio = "falhou") => mudar(c, (x) => ({ ...x, msgs: x.msgs.map((m) => (m.id === id && m.envio === "enviando" ? { ...m, envio, motivo } : m)) }));
      if (c === "grupo") {
        if (!canal.enviar({ t: "msg", id, texto, resp })) return falhar("Sem conexão — tente de novo.");
        window.setTimeout(() => falhar("Sem confirmação — tente de novo."), ESPERA_CONFIRMACAO_MS);
        return;
      }
      const para = idDaConversa(c);
      try {
        const r = await fetch("/api/chat/privado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ para, id, texto, resp }) });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; entregue?: boolean } | null;
        if (!r.ok || !j?.ok) return falhar(j?.error ?? "Não enviada.");
        if (!j.entregue) return falhar(`${nomeRef.current(para ?? 0)} não está com o sistema aberto — a mensagem não foi entregue (nada é guardado).`, "nao-entregue");
        mudar(c, (x) => ({ ...x, msgs: x.msgs.map((m) => (m.id === id ? { ...m, envio: "enviada", motivo: undefined } : m)) }));
      } catch {
        falhar("Sem conexão — tente de novo.");
      }
    },
    [canal, meuId, mudar],
  );

  const ultimoDigitando = useRef(0);
  const digitando = useCallback(
    (c: Conversa) => {
      const agora = Date.now();
      if (!canal || agora - ultimoDigitando.current < INTERVALO_DIGITANDO_MS) return;
      ultimoDigitando.current = agora;
      canal.enviar({ t: "digitando", conversa: c });
    },
    [canal],
  );

  const garantir = useCallback((c: Conversa) => setConversas((m) => (m.has(c) ? m : new Map(m).set(c, nova()))), []);
  const naoLidas = [...conversas.values()].reduce((s, c) => s + c.naoLidas, 0);
  return { conversas, autores, nomeDe, enviar, digitando, garantir, naoLidas };
}

/**
 * O CHAT AO VIVO no cabeçalho (com o canal do grupo): o ícone com as não lidas (pop) e o PAINEL — no desktop ancorado à
 * direita (fica aberto ao navegar), no celular em tela cheia. Conversa do GRUPO ativo e PRIVADAS com as pessoas do grupo.
 * As mensagens NÃO SÃO SALVAS: chegam só a quem está com o sistema aberto e somem ao recarregar/fechar.
 */
export function ChatAoVivo({ config }: { config: ConfigChat }) {
  const canal = useCanalGrupo();
  const [painel, setPainel] = useState(false);
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const abrirConversa = useCallback((c: Conversa) => {
    setPainel(true);
    setConversa(c);
  }, []);
  const chat = useChat(config, { painel, conversa }, abrirConversa);
  const botao = useRef<HTMLButtonElement>(null);
  const fechar = useCallback(() => {
    setPainel(false);
    botao.current?.focus();
  }, []);
  // Esc fecha o painel (menos com um diálogo por cima).
  useEffect(() => {
    if (!painel) return;
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[role='dialog'][aria-modal='true']")) fechar();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [painel, fechar]);
  if (!canal) return null;
  const n = chat.naoLidas;
  const rotulo = n ? `Chat ao vivo — ${n} mensage${n === 1 ? "m" : "ns"} não lida${n === 1 ? "" : "s"}` : "Chat ao vivo";
  return (
    <>
      <button
        ref={botao}
        type="button"
        aria-label={rotulo}
        title={rotulo}
        aria-expanded={painel}
        onClick={() => (painel ? fechar() : setPainel(true))}
        className={`relative inline-flex h-11 w-11 items-center justify-center rounded-control transition-colors hover:bg-surface-2 hover:text-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-[var(--h-control-sm)] lg:w-[var(--h-control-sm)] ${painel ? "bg-accent-soft text-accent" : "text-muted"}`}
      >
        <IconChat className="h-5 w-5" />
        {n > 0 && (
          <span key={n} className="animate-selo-pop absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white lg:top-0 lg:right-0">
            {n > 99 ? "99+" : n}
          </span>
        )}
      </button>
      {/* Por PORTAL no body: o cabeçalho (com desfoque) prenderia o painel fixo dentro dele. */}
      {painel &&
        createPortal(
        <section
          aria-label="Chat ao vivo"
          className="fixed inset-0 z-50 flex animate-fade-in-up flex-col bg-surface lg:inset-auto lg:top-[calc(var(--h-header)+8px)] lg:right-[var(--pad-canvas)] lg:bottom-[var(--pad-canvas)] lg:z-40 lg:w-[380px] lg:rounded-card lg:border lg:border-border lg:shadow-soft"
        >
          {conversa ? (
            <ConversaChat config={config} conversa={conversa} chat={chat} onVoltar={() => setConversa(null)} onFechar={fechar} />
          ) : (
            <ListaConversas config={config} chat={chat} onAbrir={abrirConversa} onFechar={fechar} />
          )}
        </section>,
          document.body,
        )}
    </>
  );
}

type Chat = ReturnType<typeof useChat>;

function CabecalhoPainel({ children, onFechar }: { children: React.ReactNode; onFechar: () => void }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 lg:h-12">
      {children}
      <button type="button" onClick={onFechar} aria-label="Fechar o chat" title="Fechar o chat (Esc)" className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-surface-2 lg:h-9 lg:w-9">
        <IconClose className="h-4 w-4" />
      </button>
    </div>
  );
}

/** A LISTA: a conversa do grupo, as privadas desta sessão e "Nova conversa" (as pessoas do grupo, online primeiro). */
function ListaConversas({ config, chat, onAbrir, onFechar }: { config: ConfigChat; chat: Chat; onAbrir: (c: Conversa) => void; onFechar: () => void }) {
  const canal = useCanalGrupo();
  const [busca, setBusca] = useState("");
  if (!canal) return null;
  const grupo = chat.conversas.get("grupo");
  const privadas = [...chat.conversas.entries()].filter(([k, c]) => k !== "grupo" && (c.msgs.length > 0 || c.naoLidas > 0));
  privadas.sort((a, b) => (b[1].msgs.at(-1)?.em ?? 0) - (a[1].msgs.at(-1)?.em ?? 0));
  const passa = predicadoBusca(busca);
  const pessoas = canal.pessoas
    .filter((p) => p.id !== canal.usuarioId && (!passa || passa([p.nome, p.apelido])))
    .map((p) => ({ p, e: canal.estados.get(p.id)?.estado }))
    .sort((a, b) => Number(!a.e) - Number(!b.e) || Number(a.e === "ausente") - Number(b.e === "ausente") || nomeExibicao(a.p).localeCompare(nomeExibicao(b.p), "pt-BR"));
  const pessoaDe = (id: number) => canal.pessoas.find((x) => x.id === id) ?? chat.autores.get(id) ?? null;
  return (
    <>
      <CabecalhoPainel onFechar={onFechar}>
        <IconChat className="ml-1 h-4 w-4 text-accent" />
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">Chat ao vivo</p>
        <SeloAoVivo aoVivo={canal.aoVivo} />
      </CabecalhoPainel>
      <p className="shrink-0 border-b border-border bg-surface-2 px-3 py-1.5 text-[11.5px] text-muted">As conversas não são salvas — somem ao fechar ou recarregar a página.</p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {config.grupo && (
          <LinhaConversa
            onClick={() => onAbrir("grupo")}
            icone={
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-accent">
                <IconUsers className="h-4 w-4" />
              </span>
            }
            titulo={`Grupo · ${canal.grupoNome ?? "grupo ativo"}`}
            previa={grupo?.msgs.at(-1) ? `${grupo.msgs.at(-1)?.minha ? "Você" : chat.nomeDe(grupo.msgs.at(-1)?.de ?? 0)}: ${grupo.msgs.at(-1)?.texto}` : "Todos do grupo que estão online"}
            hora={grupo?.msgs.at(-1)?.em}
            naoLidas={grupo?.naoLidas ?? 0}
            digitando={(grupo?.digitando.size ?? 0) > 0}
          />
        )}
        {privadas.map(([k, c]) => {
          const id = idDaConversa(k) ?? 0;
          const p = pessoaDe(id);
          const ultima = c.msgs.at(-1);
          return (
            <LinhaConversa
              key={k}
              onClick={() => onAbrir(k)}
              icone={<Avatar nome={p?.nome ?? "?"} foto={p?.foto} size="lg" presenca={canal.estados.get(id)?.estado} pulsar={canal.estados.get(id)?.estado === "online"} />}
              titulo={p ? nomeExibicao(p) : chat.nomeDe(id)}
              previa={ultima ? `${ultima.minha ? "Você: " : ""}${ultima.texto}` : ""}
              hora={ultima?.em}
              naoLidas={c.naoLidas}
              digitando={c.digitando.size > 0}
            />
          );
        })}
        {config.privado && (
          <section aria-label="Nova conversa" className="pt-1">
            <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">Nova conversa</p>
            {pessoas.length > 8 || busca ? (
              <div className="px-3 pb-1">
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar pessoa…"
                  aria-label="Buscar pessoa"
                  className="h-11 w-full rounded-control border border-border bg-surface px-3 text-[13px] text-text placeholder:text-faint focus:border-accent focus:outline-none lg:h-9"
                />
              </div>
            ) : null}
            {pessoas.map(({ p, e }) => (
              <LinhaConversa
                key={p.id}
                onClick={() => {
                  chat.garantir(conversaPrivada(p.id));
                  onAbrir(conversaPrivada(p.id));
                }}
                icone={<Avatar nome={p.nome} foto={p.foto} size="lg" presenca={e} pulsar={e === "online"} className={e ? "" : "opacity-60"} />}
                titulo={nomeExibicao(p)}
                previa={e === "online" ? "Online agora" : e === "ausente" ? "Ausente" : "Não está online — a mensagem pode não chegar"}
              />
            ))}
            {pessoas.length === 0 && <p className="px-3 py-2 text-[12.5px] text-muted">Ninguém encontrado.</p>}
          </section>
        )}
      </div>
    </>
  );
}

function LinhaConversa({
  onClick,
  icone,
  titulo,
  previa,
  hora,
  naoLidas = 0,
  digitando = false,
}: {
  onClick: () => void;
  icone: React.ReactNode;
  titulo: string;
  previa: string;
  hora?: number;
  naoLidas?: number;
  digitando?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
      <span className="shrink-0">{icone}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-[13.5px] ${naoLidas ? "font-semibold text-text" : "font-medium text-text"}`}>{titulo}</span>
          {hora != null && <span className="shrink-0 text-[11px] tabular-nums text-faint">{horaChat(hora)}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[12px] ${digitando ? "text-accent" : "text-muted"}`}>{digitando ? "digitando…" : previa}</span>
          {naoLidas > 0 && (
            <span key={naoLidas} className="animate-selo-pop grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">
              {naoLidas}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/** A CONVERSA: os balões (meus à direita), dia, responder, cartões dos links do sistema, digitando, lida e o campo. */
function ConversaChat({ config, conversa, chat, onVoltar, onFechar }: { config: ConfigChat; conversa: Conversa; chat: Chat; onVoltar: () => void; onFechar: () => void }) {
  const canal = useCanalGrupo();
  const c = chat.conversas.get(conversa);
  const msgs = c?.msgs ?? [];
  const outro = idDaConversa(conversa);
  const pessoaOutro = outro != null ? (canal?.pessoas.find((p) => p.id === outro) ?? chat.autores.get(outro) ?? null) : null;
  const estadoOutro = outro != null ? canal?.estados.get(outro)?.estado : undefined;
  const [texto, setTexto] = useState("");
  const [resp, setResp] = useState<RespostaChat | null>(null);
  const [cursor, setCursor] = useState(0);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const [embaixo, setEmbaixo] = useState(true);
  const [novas, setNovas] = useState(false);
  const permitido = conversa === "grupo" ? config.grupo : config.privado;

  // Rola até o fim quando chega mensagem (se já estava no fim); senão, "↓ Novas mensagens".
  const qtd = msgs.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara pela quantidade de mensagens.
  useEffect(() => {
    const el = lista.current;
    if (!el) return;
    if (embaixo || msgs.at(-1)?.minha) el.scrollTop = el.scrollHeight;
    else setNovas(true);
  }, [qtd]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: ao trocar de conversa.
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
    campo.current?.focus();
    setTexto("");
    setResp(null);
  }, [conversa]);

  const ids = useMemo(() => msgs.map((m) => m.id), [msgs]);
  const mencao = mencaoEmCurso(texto.slice(0, cursor));
  const sugestoes = useMemo(() => {
    if (mencao == null || !canal) return [];
    const q = mencao.toLowerCase();
    return canal.pessoas.filter((p) => p.id !== canal.usuarioId && `${p.apelido ?? ""} ${p.nome}`.toLowerCase().includes(q)).slice(0, 5);
  }, [mencao, canal]);

  const enviar = () => {
    if (!limparTextoChat(texto) || !permitido) return;
    void chat.enviar(conversa, texto, resp);
    setTexto("");
    setResp(null);
    setEmbaixo(true);
  };
  const inserirMencao = (p: Pessoa) => {
    const nome = (p.apelido || p.nome.split(" ")[0]).replace(/\s+/g, "");
    const antes = texto.slice(0, cursor).replace(/@[\p{L}\p{N}._-]*$/u, `@${nome} `);
    const novo = antes + texto.slice(cursor);
    setTexto(novo);
    setCursor(antes.length);
    requestAnimationFrame(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(antes.length, antes.length);
    });
  };
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (sugestoes.length) inserirMencao(sugestoes[0]);
      else enviar();
    }
  };

  const digitandoNomes = [...(c?.digitando.keys() ?? [])].map((id) => chat.nomeDe(id));
  const titulo = conversa === "grupo" ? `Grupo · ${canal?.grupoNome ?? ""}` : pessoaOutro ? nomeExibicao(pessoaOutro) : chat.nomeDe(outro ?? 0);
  const sub = digitandoNomes.length
    ? `${digitandoNomes.join(", ")} ${digitandoNomes.length === 1 ? "está" : "estão"} digitando…`
    : conversa === "grupo"
      ? `${[...(canal?.estados.values() ?? [])].length} online no grupo`
      : estadoOutro === "online"
        ? "Online agora"
        : estadoOutro === "ausente"
          ? "Ausente"
          : "Não está online neste grupo";

  return (
    <>
      <CabecalhoPainel onFechar={onFechar}>
        <button type="button" onClick={onVoltar} aria-label="Voltar às conversas" title="Voltar às conversas" className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-surface-2 lg:h-9 lg:w-9">
          <IconChevronLeft className="h-4 w-4" />
        </button>
        {conversa === "grupo" ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <IconUsers className="h-4 w-4" />
          </span>
        ) : (
          <Avatar nome={pessoaOutro?.nome ?? "?"} foto={pessoaOutro?.foto} size="md" presenca={estadoOutro} pulsar={estadoOutro === "online"} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-text">{titulo}</span>
          <span className={`block truncate text-[11.5px] ${digitandoNomes.length ? "text-accent" : "text-muted"}`}>{sub}</span>
        </span>
      </CabecalhoPainel>
      <div
        ref={lista}
        onScroll={(e) => {
          const el = e.currentTarget;
          const fim = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          setEmbaixo(fim);
          if (fim) setNovas(false);
        }}
        className="relative min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3"
        aria-live="polite"
        aria-relevant="additions"
      >
        {msgs.length === 0 && (
          <p className="mx-auto mt-8 max-w-[16rem] text-center text-[12.5px] text-muted">
            {conversa === "grupo" ? "Mande uma mensagem para quem do grupo está online agora." : "Comece a conversa."} Nada é guardado: a conversa some ao fechar ou recarregar.
          </p>
        )}
        {msgs.map((m, i) => {
          const ant = msgs[i - 1];
          const dia = rotuloDiaChat(m.em);
          const novoDia = !ant || rotuloDiaChat(ant.em) !== dia;
          const seguida = !novoDia && ant && ant.de === m.de && m.em - ant.em < 5 * 60_000;
          const autor = canal?.pessoas.find((p) => p.id === m.de) ?? chat.autores.get(m.de) ?? (m.autor ? { ...m.autor } : null);
          const leram = m.minha && m.envio === "enviada" && c ? quantosLeram(ids, c.lidaAte, i, m.de) : 0;
          return (
            <div key={m.id}>
              {novoDia && <p className="py-2 text-center text-[11px] font-medium text-faint">{dia}</p>}
              <Balao
                m={m}
                autor={autor}
                grupo={conversa === "grupo"}
                seguida={!!seguida}
                leram={leram}
                privado={conversa !== "grupo"}
                nomeDe={chat.nomeDe}
                onResponder={() => {
                  setResp({ id: m.id, de: m.de, trecho: m.texto.replace(/\s+/g, " ").slice(0, MAX_TRECHO_RESPOSTA) });
                  campo.current?.focus();
                }}
                onTentar={() => void chat.enviar(conversa, m.texto, m.resp, m.id)}
              />
            </div>
          );
        })}
        {digitandoNomes.length > 0 && <Digitando />}
      </div>
      {novas && (
        <button
          type="button"
          onClick={() => {
            lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
            setNovas(false);
          }}
          className="animate-selo-pop absolute bottom-24 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1 rounded-full bg-accent px-3 text-[12px] font-semibold text-white shadow-soft"
        >
          <IconArrowDown className="h-3.5 w-3.5" /> Novas mensagens
        </button>
      )}
      <div className="relative shrink-0 border-t border-border p-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] lg:pb-2">
        {sugestoes.length > 0 && (
          <fieldset aria-label="Mencionar" className="absolute m-0 min-w-0 p-0 right-2 bottom-full left-2 mb-1 overflow-hidden rounded-control border border-border bg-surface shadow-soft">
            {sugestoes.map((p, i) => (
              <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => inserirMencao(p)} className={`flex min-h-10 w-full items-center gap-2 px-2.5 text-left text-[13px] hover:bg-surface-2 ${i === 0 ? "bg-surface-2" : ""}`}>
                  <Avatar nome={p.nome} foto={p.foto} size="xs" />
                  {nomeExibicao(p)}
                </button>
            ))}
          </fieldset>
        )}
        {resp && (
          <div className="mb-1.5 flex items-start gap-2 rounded-control border-l-2 border-accent bg-surface-2 px-2.5 py-1.5">
            <IconResponder className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 text-[12px]">
              <span className="font-semibold text-text">{chat.nomeDe(resp.de)}</span>
              <span className="block truncate text-muted">{resp.trecho}</span>
            </span>
            <button type="button" onClick={() => setResp(null)} aria-label="Cancelar a resposta" className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-surface">
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {permitido ? (
          <div className="flex items-end gap-2">
            <textarea
              ref={campo}
              value={texto}
              rows={1}
              maxLength={MAX_TEXTO_CHAT}
              placeholder={conversa === "grupo" ? "Mensagem para o grupo…" : "Mensagem…"}
              aria-label="Mensagem"
              onChange={(e) => {
                setTexto(e.target.value);
                setCursor(e.target.selectionStart ?? e.target.value.length);
                if (e.target.value.trim()) chat.digitando(conversa);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
              onKeyDown={tecla}
              className="max-h-[140px] min-h-11 flex-1 resize-none rounded-control border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint focus:border-accent focus:outline-none lg:min-h-10 lg:text-[13.5px]"
            />
            <button
              type="button"
              onClick={enviar}
              disabled={!limparTextoChat(texto)}
              aria-label="Enviar (Enter)"
              title="Enviar (Enter) — Shift+Enter quebra a linha"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent text-white transition-transform active:scale-95 disabled:opacity-40 lg:h-10 lg:w-10"
            >
              <IconEnviar className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="px-1 py-2 text-[12.5px] text-muted">Este chat foi desligado pelo administrador.</p>
        )}
      </div>
    </>
  );
}

/** Os três pontos do "digitando…". */
export function Digitando() {
  return (
    <span className="inline-flex items-center gap-1 rounded-2xl bg-surface-2 px-3 py-2.5" role="img" aria-label="digitando">
      <span className="ponto-digitando h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="ponto-digitando h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="ponto-digitando h-1.5 w-1.5 rounded-full bg-muted" />
    </span>
  );
}

/** Um BALÃO de mensagem (meus à direita na cor do sistema), com a resposta citada, os cartões dos links do sistema, a hora,
 * o estado do envio (✓ enviada, ✓✓ lida — "lida por N" no grupo) e "Responder". */
export function Balao({
  m,
  autor,
  grupo,
  seguida,
  leram,
  privado,
  nomeDe,
  onResponder,
  onTentar,
}: {
  m: MsgTela;
  autor: Pick<Pessoa, "nome" | "apelido" | "foto"> | null;
  grupo: boolean;
  seguida: boolean;
  leram: number;
  privado: boolean;
  nomeDe: (id: number) => string;
  onResponder: () => void;
  onTentar: () => void;
}) {
  const cartoes: CartaoLink[] = useMemo(() => cartoesDoTexto(m.texto, typeof location === "undefined" ? undefined : location.host), [m.texto]);
  const nome = autor ? nomeExibicao(autor) : nomeDe(m.de);
  return (
    <div className={`group/balao animate-balao flex items-end gap-2 ${m.minha ? "justify-end" : ""} ${seguida ? "" : "pt-1.5"}`}>
      {!m.minha && (
        <span className="w-7 shrink-0">{!seguida && <Avatar nome={autor?.nome ?? nome} foto={autor?.foto} size="sm" />}</span>
      )}
      <div className={`flex max-w-[80%] min-w-0 flex-col ${m.minha ? "items-end" : "items-start"}`}>
        {!m.minha && grupo && !seguida && <span className="mb-0.5 px-1 text-[11.5px] font-semibold text-text-2">{nome}</span>}
        <div className="flex items-center gap-1">
          {m.minha && (
            <button type="button" onClick={onResponder} aria-label="Responder" title="Responder" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-faint opacity-0 hover:bg-surface-2 hover:text-text group-hover/balao:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100">
              <IconResponder className="h-3.5 w-3.5" />
            </button>
          )}
          <div
            className={`min-w-0 rounded-2xl px-3 py-2 ${m.minha ? `rounded-br-md bg-accent text-white ${m.envio === "falhou" || m.envio === "nao-entregue" ? "opacity-70" : ""}` : "rounded-bl-md bg-surface-2 text-text"}`}
          >
            {m.resp && (
              <div className={`mb-1 rounded-md border-l-2 px-2 py-1 text-[11.5px] ${m.minha ? "border-white/70 bg-white/15" : "border-accent bg-surface"}`}>
                <span className="font-semibold">{nomeDe(m.resp.de)}</span>
                <span className="block truncate opacity-80">{m.resp.trecho}</span>
              </div>
            )}
            <TextoFormatado texto={m.texto} className={`!text-[13.5px] !leading-snug ${m.minha ? "!text-white [&_*]:!text-white [&_a]:underline [&_code]:!bg-white/20" : "!text-text"}`} />
            {cartoes.map((k) => (
              <Link key={k.href} href={k.href} className={`mt-1.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium ${m.minha ? "bg-white/15 text-white" : "border border-border bg-surface text-accent"}`}>
                <IconChat className="h-3.5 w-3.5 shrink-0" /> Abrir {k.rotulo}
              </Link>
            ))}
          </div>
          {!m.minha && (
            <button type="button" onClick={onResponder} aria-label="Responder" title="Responder" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-faint opacity-0 hover:bg-surface-2 hover:text-text group-hover/balao:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100">
              <IconResponder className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="mt-0.5 flex items-center gap-1 px-1 text-[10.5px] tabular-nums text-faint">
          {horaChat(m.em)}
          {m.minha && m.envio === "enviando" && <span>· enviando…</span>}
          {m.minha && m.envio === "enviada" && (leram > 0 ? <IconLidas className="h-3.5 w-3.5 text-accent" aria-label={privado ? "Lida" : `Lida por ${leram}`} /> : <IconCheck className="h-3 w-3" aria-label="Enviada" />)}
          {m.minha && m.envio === "enviada" && grupo && leram > 0 && <span>lida por {leram}</span>}
        </span>
        {m.minha && (m.envio === "falhou" || m.envio === "nao-entregue") && (
          <span className="mt-0.5 max-w-full px-1 text-right text-[11px] text-[var(--danger)]">
            {m.motivo}{" "}
            {m.envio === "falhou" || m.envio === "nao-entregue" ? (
              <button type="button" onClick={onTentar} className="font-semibold underline">
                Tentar de novo
              </button>
            ) : null}
          </span>
        )}
      </div>
    </div>
  );
}
