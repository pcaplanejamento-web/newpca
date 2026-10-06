"use client";

import Link from "next/link";
import { createContext, type KeyboardEvent, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  type CartaoLink,
  type ConfigChat,
  type Conversa,
  cartoesDoTexto,
  conversaPrivada,
  conversaValida,
  ehConversaEmGrupo,
  limparNomeConversa,
  MAX_MEMBROS_CONVERSA,
  MAX_NOME_CONVERSA,
  novaConversaEmGrupo,
  abrirBolha,
  bolhasVisiveis,
  lerPosicaoBolhas,
  POSICAO_BOLHAS_PADRAO,
  type PosicaoBolhas,
  rotuloConversa,
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
import { EVENTO_ABRIR_CHAT, EVENTO_CHAT_PRIVADO, useCanalGrupo, useNaoPerturbe } from "./CanalGrupo";
import { IconArrowDown, IconChat, IconCheck, IconChevronLeft, IconClose, IconEnviar, IconFixar, IconLidas, IconMenos, IconPlus, IconResponder, IconUsers } from "./icons";
import { tocarSom } from "./PreferenciasNotificacoes";
import { type Bolha, BolhasChat } from "./BolhasChat";
import { TextoFormatado } from "./TextoFormatado";

type Envio = "enviando" | "enviada" | "falhou" | "nao-entregue";
type MsgTela = MensagemChat & { minha: boolean; envio?: Envio; motivo?: string };
type ConversaTela = {
  msgs: MsgTela[];
  naoLidas: number;
  lidaAte: Map<number, string>;
  digitando: Map<number, number>;
  /** Conversa em grupo escolhida: todos os membros (com você) e o nome. */
  membros?: number[];
  nome?: string;
  /** A última mensagem GUARDADA (a lista mostra antes de abrir a conversa). */
  previa?: { de: number; texto: string; em: number } | null;
  /** O histórico guardado já veio (abrir a conversa o busca uma vez). */
  carregada?: boolean;
};

const nova = (): ConversaTela => ({ msgs: [], naoLidas: 0, lidaAte: new Map(), digitando: new Map() });

/** A última mensagem da conversa (a da tela ou a guardada). */
const ultimaDaConversa = (c: ConversaTela | undefined, meuId: number) => {
  const m = c?.msgs.at(-1);
  return m ? { de: m.de, texto: m.texto, em: m.em, minha: m.minha } : c?.previa ? { ...c.previa, minha: c.previa.de === meuId } : null;
};

/**
 * O estado do CHAT (as conversas GUARDADAS por 7 dias voltam ao abrir o sistema — `GET /api/chat/conversas` — e o histórico
 * ao abrir cada conversa — `GET /api/chat/historico`): o envio (tudo pela rota, que guarda e entrega: o grupo pelo objeto do
 * grupo, a privada/em grupo pelas caixas pessoais), "digitando", "lida" (guardada), as não lidas e a mensagem que chega.
 */
function useChat(config: ConfigChat, aberto: { painel: boolean; conversa: Conversa | null }, aoChegar: (c: Conversa) => void) {
  const canal = useCanalGrupo();
  const naoPerturbe = useNaoPerturbe();
  const meuId = canal?.usuarioId ?? 0;
  const [conversas, setConversas] = useState<Map<Conversa, ConversaTela>>(() => new Map());
  const conversasRef = useRef(conversas);
  conversasRef.current = conversas;
  const grupoAtual = canal?.grupoId ?? null;
  /** O sinal (lida — guardada — e digitando) pela rota: a privada/em grupo pelas caixas; a "lida" do grupo pelo objeto do
   * grupo. Sem bloquear a tela. */
  const enviarSinal = useCallback(
    (c: Conversa, t: "lida" | "digitando", ate?: string) => {
      const privada = idDaConversa(c);
      const para = c === "grupo" ? [] : privada != null ? [privada] : (conversasRef.current.get(c)?.membros ?? []).filter((x) => x !== meuId);
      if (c !== "grupo" && !para.length) return;
      if (c === "grupo" && grupoAtual == null) return;
      void fetch("/api/chat/sinal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversa: c, para, t, ...(c === "grupo" ? { grupo: grupoAtual } : {}), ...(ate ? { ate } : {}) }),
      }).catch(() => {});
    },
    [meuId, grupoAtual],
  );
  /** Quem escreveu no privado sem estar no grupo ativo (foto + nome vêm na mensagem). */
  const [autores, setAutores] = useState<Map<number, Pessoa>>(() => new Map());
  const [, setRelogio] = useState(0);
  const abertoRef = useRef(aberto);
  abertoRef.current = aberto;
  const dndRef = useRef(naoPerturbe);
  dndRef.current = naoPerturbe;
  const chegarRef = useRef(aoChegar);
  chegarRef.current = aoChegar;
  const grupoId = canal?.grupoId ?? null;

  const mudar = useCallback((c: Conversa, f: (x: ConversaTela) => ConversaTela) => {
    setConversas((m) => {
      const n = new Map(m);
      n.set(c, f(n.get(c) ?? nova()));
      return n;
    });
  }, []);

  // As CONVERSAS GUARDADAS (7 dias) voltam ao abrir o sistema e ao trocar de grupo (a do grupo é outra): a lista com a
  // última mensagem e as não lidas — o histórico vem ao abrir cada conversa.
  useEffect(() => {
    let vivo = true;
    setConversas((m) => {
      if (!m.has("grupo")) return m;
      const n = new Map(m);
      n.delete("grupo");
      return n;
    });
    if (!meuId) return;
    void (async () => {
      try {
        const r = await fetch(`/api/chat/conversas${grupoId != null ? `?grupo=${grupoId}` : ""}`);
        const j = (await r.json()) as {
          ok?: boolean;
          conversas?: { conversa: Conversa; nome: string; membros: number[]; naoLidas: number; ultima: { de: number; texto: string; em: number } | null }[];
          grupo?: { naoLidas: number; ultima: { de: number; texto: string; em: number } } | null;
          autores?: Pessoa[];
        };
        if (!vivo || !j.ok) return;
        setAutores((x) => {
          const n = new Map(x);
          for (const p of j.autores ?? []) n.set(p.id, p);
          return n;
        });
        setConversas((m) => {
          const n = new Map(m);
          for (const c of j.conversas ?? []) {
            const atual = n.get(c.conversa) ?? nova();
            n.set(c.conversa, { ...atual, naoLidas: atual.carregada ? atual.naoLidas : c.naoLidas, membros: c.membros.length ? c.membros : atual.membros, nome: c.nome || atual.nome, previa: c.ultima });
          }
          if (j.grupo) {
            const atual = n.get("grupo") ?? nova();
            n.set("grupo", { ...atual, naoLidas: atual.carregada ? atual.naoLidas : j.grupo.naoLidas, previa: j.grupo.ultima });
          }
          return n;
        });
      } catch {
        /* sem a lista guardada: o chat segue ao vivo */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [grupoId, meuId]);

  /** Abrir uma conversa: o HISTÓRICO guardado (uma vez), juntando com o que já chegou ao vivo. */
  const carregar = useCallback(
    async (c: Conversa) => {
      const atual = conversasRef.current.get(c);
      if (atual?.carregada || !meuId) return;
      mudar(c, (x) => ({ ...x, carregada: true }));
      try {
        const r = await fetch(`/api/chat/historico?conversa=${encodeURIComponent(c)}${c === "grupo" && grupoId != null ? `&grupo=${grupoId}` : ""}`);
        const j = (await r.json()) as { ok?: boolean; mensagens?: Record<string, unknown>[]; lidas?: [number, string][]; autores?: Pessoa[] };
        if (!j.ok) throw new Error();
        setAutores((x) => {
          const n = new Map(x);
          for (const p of j.autores ?? []) n.set(p.id, p);
          return n;
        });
        const antigas = (j.mensagens ?? []).map((o) => lerMensagemRecebida({ ...o, conversa: c })).filter((m): m is MensagemChat => !!m);
        mudar(c, (x) => {
          let msgs: MsgTela[] = [];
          for (const m of antigas) msgs = juntarMensagem(msgs, { ...m, minha: m.de === meuId, envio: m.de === meuId ? "enviada" : undefined });
          for (const m of x.msgs) msgs = juntarMensagem(msgs, m);
          msgs.sort((p, q) => p.em - q.em);
          const lidaAte = new Map(x.lidaAte);
          for (const [quem, ate] of j.lidas ?? []) if (!lidaAte.has(quem)) lidaAte.set(quem, ate);
          return { ...x, msgs, lidaAte, carregada: true };
        });
      } catch {
        // Falhou: tenta de novo na próxima vez que abrir.
        mudar(c, (x) => ({ ...x, carregada: false }));
      }
    },
    [meuId, grupoId, mudar],
  );

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
          ...(m.membros?.length ? { membros: m.membros } : {}),
          ...(m.nome ? { nome: m.nome } : {}),
          msgs: juntarMensagem(c.msgs, msg),
          naoLidas: minha || vendo || ja ? c.naoLidas : c.naoLidas + 1,
        };
      });
      if (minha || vendo) return;
      if (!dndRef.current) tocarSom();
      // A conversa vira (ou sobe na pilha como) uma BOLHA que quica — o aviso é a própria bolha.
      chegarRef.current(m.conversa);
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
        if (!Number.isInteger(de) || !conversaValida(c)) return;
        mudar(c, (x) => ({ ...x, digitando: new Map(x.digitando).set(de, Date.now() + DIGITANDO_DURA_MS) }));
      }),
      canal.ouvir("lida", (o) => {
        const de = Number(o.de);
        const c = String(o.conversa);
        if (!Number.isInteger(de) || typeof o.ate !== "string" || !conversaValida(c)) return;
        mudar(c, (x) => ({ ...x, lidaAte: new Map(x.lidaAte).set(de, o.ate as string) }));
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
        const o = JSON.parse(String((e as CustomEvent).detail)) as Record<string, unknown>;
        // O SINAL (lida/digitando) da privada e da conversa em grupo também chega pela caixa.
        if (o.t === "chat-sinal") {
          const de = Number(o.de);
          const c = o.conversa;
          if (!Number.isInteger(de) || !conversaValida(c) || c === "grupo") return;
          if (o.tipo === "digitando") mudar(c, (x) => ({ ...x, digitando: new Map(x.digitando).set(de, Date.now() + DIGITANDO_DURA_MS) }));
          else if (o.tipo === "lida" && typeof o.ate === "string") mudar(c, (x) => ({ ...x, lidaAte: new Map(x.lidaAte).set(de, o.ate as string) }));
          return;
        }
        const m = lerMensagemRecebida(o);
        if (m && m.conversa !== "grupo") receber(m);
      } catch {
        /* mensagem ilegível */
      }
    };
    window.addEventListener(EVENTO_CHAT_PRIVADO, ouvir);
    return () => window.removeEventListener(EVENTO_CHAT_PRIVADO, ouvir);
  }, [config.privado, receber, mudar]);

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
        // Pela rota (fica GUARDADA — o ✓✓ e as não lidas valem depois de recarregar).
        enviarSinal(c, "lida", ultimaDosOutros);
      }
    };
    marcar();
    document.addEventListener("visibilitychange", marcar);
    return () => document.removeEventListener("visibilitychange", marcar);
  }, [aberto.painel, aberto.conversa, ultimaDosOutros, canal, mudar, enviarSinal]);

  /** ENVIAR: grupo pelo socket do grupo (o servidor confirma pelo id); privado pela rota (não entregue = sem aba aberta). */
  const enviar = useCallback(
    async (c: Conversa, textoBruto: string, resp: RespostaChat | null, idExistente?: string) => {
      const texto = limparTextoChat(textoBruto);
      if (!texto || !canal) return;
      const id = idExistente ?? novoIdMensagem();
      mudar(c, (x) => ({ ...x, msgs: juntarMensagem(x.msgs, { id, conversa: c, de: meuId, em: Date.now(), texto, resp, minha: true, envio: "enviando", motivo: undefined }) }));
      const falhar = (motivo: string) => mudar(c, (x) => ({ ...x, msgs: x.msgs.map((m) => (m.id === id && m.envio === "enviando" ? { ...m, envio: "falhou", motivo } : m)) }));
      // Tudo pela ROTA (guarda por 7 dias e entrega): o grupo pelo objeto do grupo; a privada/em grupo pelas caixas.
      const meta = conversasRef.current.get(c);
      const privada = idDaConversa(c);
      const para = c === "grupo" ? [] : privada != null ? [privada] : (meta?.membros ?? []).filter((x) => x !== meuId);
      if (c !== "grupo" && !para.length) return falhar("Ninguém nesta conversa.");
      try {
        const r = await fetch("/api/chat/enviar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversa: c, para, id, texto, resp, ...(c === "grupo" ? { grupo: canal.grupoId } : {}), ...(meta?.nome ? { nome: meta.nome } : {}) }),
        });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; entregues?: number; naoEntregues?: number[] } | null;
        if (!r.ok || !j?.ok) return falhar(j?.error ?? "Não enviada — tente de novo.");
        // Guardada: quem não está com o sistema aberto vê ao entrar (até 7 dias).
        const fora = c === "grupo" ? [] : (j.naoEntregues ?? []);
        const motivo = fora.length
          ? `${fora.map((x) => nomeRef.current(x)).join(", ")} ${fora.length === 1 ? "não está" : "não estão"} online agora — ${fora.length === 1 ? "vai" : "vão"} ver ao entrar.`
          : undefined;
        mudar(c, (x) => ({ ...x, msgs: x.msgs.map((m) => (m.id === id ? { ...m, envio: "enviada", motivo } : m)) }));
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
      if (c === "grupo") canal.enviar({ t: "digitando", conversa: c });
      else enviarSinal(c, "digitando");
    },
    [canal, enviarSinal],
  );

  const garantir = useCallback((c: Conversa) => setConversas((m) => (m.has(c) ? m : new Map(m).set(c, nova()))), []);
  /** Uma CONVERSA EM GRUPO nova (só nesta aba até a 1ª mensagem chegar aos outros). */
  const criarEmGrupo = useCallback(
    (membros: number[], nome: string) => {
      const c = novaConversaEmGrupo();
      setConversas((m) => new Map(m).set(c, { ...nova(), membros: [meuId, ...membros.filter((x) => x !== meuId)], nome: limparNomeConversa(nome) || undefined }));
      return c;
    },
    [meuId],
  );
  const naoLidas = [...conversas.values()].reduce((s, c) => s + c.naoLidas, 0);
  return { conversas, autores, nomeDe, enviar, digitando, garantir, criarEmGrupo, naoLidas, meuId, carregar };
}

/** A posição da pilha de bolhas fica no aparelho (conveniência — some ao limpar o navegador). */
const CHAVE_POSICAO = "chat:posicao";
/** O alfinete "manter a conversa aberta" (no aparelho): sem ele, qualquer toque fora minimiza. */
const CHAVE_FIXADA = "chat:fixada";
/** As bolhas abertas (no aparelho) — voltam depois de recarregar, como as conversas guardadas. */
const CHAVE_BOLHAS = "chat:bolhas";

/** O que o painel "Ao vivo" do cabeçalho usa do chat: a lista das conversas, as não lidas e o pedido de abrir a lista (o
 * "+N" das bolhas). */
type ChatAoVivoValor = {
  config: ConfigChat;
  chat: Chat;
  abrirConversa: (c: Conversa) => void;
  naoLidas: number;
  /** Muda a cada pedido de abrir a lista (o painel "Ao vivo" abre na aba Conversas). */
  pedidoLista: number;
};
const ChatCtx = createContext<ChatAoVivoValor | null>(null);
/** O chat ao vivo (`null` = desligado pelo ADM). */
export const useChatAoVivo = () => useContext(ChatCtx);

/**
 * O CHAT AO VIVO no estilo Messenger (com o canal do grupo) — o PROVEDOR em volta do painel "Ao vivo" do cabeçalho (que
 * mostra a lista das conversas numa aba): cada conversa aberta vira uma BOLHA flutuante com a foto (`BolhasChat` —
 * arrastável, encosta na borda) e tocar nela abre a JANELA da conversa ao lado. Mensagem nova = a bolha aparece quicando.
 * As mensagens NÃO SÃO SALVAS: chegam só a quem está com o sistema aberto e somem ao recarregar/fechar.
 */
export function ChatAoVivo({ config, children }: { config: ConfigChat | null; children: ReactNode }) {
  if (!config) return <>{children}</>;
  return <ChatAtivo config={config}>{children}</ChatAtivo>;
}

function ChatAtivo({ config, children }: { config: ConfigChat; children: ReactNode }) {
  const canal = useCanalGrupo();
  const [pedidoLista, setPedidoLista] = useState(0);
  const [bolhas, setBolhas] = useState<Conversa[]>([]);
  const [ativa, setAtiva] = useState<Conversa | null>(null);
  const [novas, setNovas] = useState<Set<Conversa>>(() => new Set());
  const [posicao, setPosicao] = useState<PosicaoBolhas>(POSICAO_BOLHAS_PADRAO);
  const [fixada, setFixada] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(CHAVE_POSICAO);
      if (v) setPosicao(lerPosicaoBolhas(JSON.parse(v)));
      setFixada(localStorage.getItem(CHAVE_FIXADA) === "1");
      const b = JSON.parse(localStorage.getItem(CHAVE_BOLHAS) ?? "[]") as unknown;
      if (Array.isArray(b)) setBolhas(b.filter(conversaValida).slice(0, 12));
    } catch {
      /* sem armazenamento: a posição padrão, sem o alfinete */
    }
  }, []);
  const alternarFixada = useCallback(() => {
    setFixada((f) => {
      try {
        localStorage.setItem(CHAVE_FIXADA, f ? "0" : "1");
      } catch {
        /* sem armazenamento: vale só nesta página */
      }
      return !f;
    });
  }, []);
  const minimizar = useCallback(() => setAtiva(null), []);
  const mudarPosicao = useCallback((p: PosicaoBolhas) => {
    setPosicao(p);
    try {
      localStorage.setItem(CHAVE_POSICAO, JSON.stringify(p));
    } catch {
      /* sem armazenamento: vale só nesta página */
    }
  }, []);
  const abrirConversa = useCallback((c: Conversa) => {
    setBolhas((b) => abrirBolha(b, c));
    setAtiva(c);
  }, []);
  /** Chegou mensagem: a conversa vira bolha (no topo, se ainda não estava) e QUICA. */
  const aoChegar = useCallback((c: Conversa) => {
    setBolhas((b) => (b.includes(c) ? b : abrirBolha(b, c)));
    setNovas((n) => new Set(n).add(c));
    window.setTimeout(
      () =>
        setNovas((n) => {
          const x = new Set(n);
          x.delete(c);
          return x;
        }),
      700,
    );
  }, []);
  const chat = useChat(config, { painel: ativa != null, conversa: ativa }, aoChegar);
  // Abrir a conversa traz o histórico guardado (uma vez).
  const carregar = chat.carregar;
  useEffect(() => {
    if (ativa) void carregar(ativa);
  }, [ativa, carregar]);
  // As bolhas abertas ficam lembradas no aparelho.
  const lembrar = useRef(false);
  useEffect(() => {
    if (!lembrar.current) {
      lembrar.current = true;
      return;
    }
    try {
      localStorage.setItem(CHAVE_BOLHAS, JSON.stringify(bolhas));
    } catch {
      /* sem armazenamento */
    }
  }, [bolhas]);
  const fecharBolha = useCallback((c: Conversa) => {
    setBolhas((b) => b.filter((x) => x !== c));
    setAtiva((a) => (a === c ? null : a));
  }, []);
  const alternar = useCallback((c: Conversa) => setAtiva((a) => (a === c ? null : c)), []);
  // "Conversar" de qualquer lugar (Online agora, o "vendo agora" de um banner): `{pessoa}` | `{conversa}` + o texto pronto.
  const [rascunho, setRascunho] = useState<{ texto: string; n: number } | null>(null);
  useEffect(() => {
    const abrir = (e: Event) => {
      const d = (e as CustomEvent<{ conversa?: string; pessoa?: number; texto?: string }>).detail ?? {};
      const c: Conversa = Number.isInteger(d.pessoa) ? conversaPrivada(d.pessoa as number) : conversaValida(d.conversa) ? d.conversa : "grupo";
      if (c === "grupo" ? !config.grupo : !config.privado) return;
      chat.garantir(c);
      abrirConversa(c);
      setRascunho((r) => ({ texto: String(d.texto ?? ""), n: (r?.n ?? 0) + 1 }));
    };
    window.addEventListener(EVENTO_ABRIR_CHAT, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_CHAT, abrir);
  }, [config.grupo, config.privado, chat.garantir, abrirConversa]);
  const valor = useMemo<ChatAoVivoValor>(() => ({ config, chat, abrirConversa, naoLidas: chat.naoLidas, pedidoLista }), [config, chat, abrirConversa, pedidoLista]);
  if (!canal) return <>{children}</>;
  const { visiveis, extras } = bolhasVisiveis(bolhas);
  const pessoaDe = (id: number) => canal.pessoas.find((x) => x.id === id) ?? chat.autores.get(id) ?? null;
  const dados: Bolha[] = visiveis.map((c) => {
    const conv = chat.conversas.get(c);
    const base = { conversa: c, naoLidas: conv?.naoLidas ?? 0, nova: novas.has(c) };
    if (c === "grupo") return { ...base, rotulo: `Grupo · ${canal.grupoNome ?? "grupo ativo"}`, fotos: [], grupoAtivo: true };
    const outro = idDaConversa(c);
    if (outro != null) {
      const p = pessoaDe(outro);
      return { ...base, rotulo: p ? nomeExibicao(p) : chat.nomeDe(outro), fotos: [{ nome: p?.nome ?? "?", foto: p?.foto }], presenca: canal.estados.get(outro)?.estado };
    }
    const outros = (conv?.membros ?? []).filter((x) => x !== chat.meuId);
    return {
      ...base,
      rotulo: rotuloConversa(conv?.nome, conv?.membros ?? [], chat.meuId, chat.nomeDe),
      fotos: outros.map((x) => ({ nome: pessoaDe(x)?.nome ?? "?", foto: pessoaDe(x)?.foto })),
    };
  });
  return (
    <ChatCtx.Provider value={valor}>
      {children}
      <BolhasChat
        bolhas={dados}
        extras={extras.length}
        ativa={ativa}
        fixada={fixada}
        posicao={posicao}
        onPosicao={mudarPosicao}
        // Reordenar mexe só nas visíveis; as de fora da pilha ("+N") seguem atrás.
        onReordenar={(ordem) => setBolhas((b) => [...ordem.filter((c) => b.includes(c)), ...b.filter((c) => !ordem.includes(c))])}
        onTocar={alternar}
        onMinimizar={minimizar}
        // A LIXEIRA fecha a bolha — a conversa segue guardada na lista (7 dias).
        onExcluir={fecharBolha}
        onExtras={() => setPedidoLista((n) => n + 1)}
        janela={(c) => (
          <ConversaChat
            config={config}
            conversa={c}
            chat={chat}
            rascunho={rascunho}
            fixada={fixada}
            onFixar={alternarFixada}
            onMinimizar={minimizar}
          />
        )}
      />
    </ChatCtx.Provider>
  );
}

/** A LISTA DAS CONVERSAS dentro do painel "Ao vivo" do cabeçalho: escolher abre a bolha + a janela (e fecha o painel). */
export function ConversasDoChat({ onEscolher }: { onEscolher: () => void }) {
  const v = useChatAoVivo();
  if (!v) return null;
  return (
    <ListaConversas
      config={v.config}
      chat={v.chat}
      onAbrir={(c) => {
        v.abrirConversa(c);
        onEscolher();
      }}
      onFechar={onEscolher}
    />
  );
}

type Chat = ReturnType<typeof useChat>;

function CabecalhoPainel({
  children,
  onFechar,
  rotuloFechar = "Fechar o chat (Esc)",
  iconeFechar,
}: {
  children: React.ReactNode;
  onFechar: () => void;
  rotuloFechar?: string;
  iconeFechar?: ReactNode;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2 lg:h-12">
      {children}
      <button type="button" onClick={onFechar} aria-label={rotuloFechar} title={rotuloFechar} className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-surface-2 lg:h-9 lg:w-9">
        {iconeFechar ?? <IconClose className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** A LISTA: a conversa do grupo, as privadas desta sessão e "Nova conversa" (as pessoas do grupo, online primeiro). */
function ListaConversas({ config, chat, onAbrir, onFechar }: { config: ConfigChat; chat: Chat; onAbrir: (c: Conversa) => void; onFechar: () => void }) {
  const canal = useCanalGrupo();
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  if (!canal) return null;
  if (criando)
    return (
      <NovaConversaGrupo
        onVoltar={() => setCriando(false)}
        onFechar={onFechar}
        onCriar={(membros, nome) => {
          setCriando(false);
          onAbrir(chat.criarEmGrupo(membros, nome));
        }}
      />
    );
  const grupo = chat.conversas.get("grupo");
  const privadas = [...chat.conversas.entries()].filter(([k, c]) => k !== "grupo" && (c.msgs.length > 0 || c.naoLidas > 0 || !!c.previa || ehConversaEmGrupo(k)));
  privadas.sort((a, b) => (ultimaDaConversa(b[1], chat.meuId)?.em ?? 0) - (ultimaDaConversa(a[1], chat.meuId)?.em ?? 0));
  const ultGrupo = ultimaDaConversa(grupo, chat.meuId);
  const passa = predicadoBusca(busca);
  const pessoas = canal.pessoas
    .filter((p) => p.id !== canal.usuarioId && (!passa || passa([p.nome, p.apelido])))
    .map((p) => ({ p, e: canal.estados.get(p.id)?.estado }))
    .sort((a, b) => Number(!a.e) - Number(!b.e) || Number(a.e === "ausente") - Number(b.e === "ausente") || nomeExibicao(a.p).localeCompare(nomeExibicao(b.p), "pt-BR"));
  const pessoaDe = (id: number) => canal.pessoas.find((x) => x.id === id) ?? chat.autores.get(id) ?? null;
  return (
    <>
      <p className="shrink-0 rounded-control bg-surface-2 px-3 py-1.5 text-[11.5px] text-muted">As conversas ficam guardadas por 7 dias.</p>
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
            previa={ultGrupo ? `${ultGrupo.minha ? "Você" : chat.nomeDe(ultGrupo.de)}: ${ultGrupo.texto}` : "Todos do grupo"}
            hora={ultGrupo?.em}
            naoLidas={grupo?.naoLidas ?? 0}
            digitando={(grupo?.digitando.size ?? 0) > 0}
          />
        )}
        {privadas.map(([k, c]) => {
          const ultima = ultimaDaConversa(c, chat.meuId);
          if (ehConversaEmGrupo(k)) {
            const outros = (c.membros ?? []).filter((x) => x !== chat.meuId);
            return (
              <LinhaConversa
                key={k}
                onClick={() => onAbrir(k)}
                icone={<FotoBolhaPequena fotos={outros.slice(0, 3).map((x) => ({ nome: pessoaDe(x)?.nome ?? "?", foto: pessoaDe(x)?.foto }))} />}
                titulo={rotuloConversa(c.nome, c.membros ?? [], chat.meuId, chat.nomeDe)}
                previa={ultima ? `${ultima.minha ? "Você" : chat.nomeDe(ultima.de)}: ${ultima.texto}` : `${c.membros?.length ?? 0} pessoas · conversa em grupo`}
                hora={ultima?.em}
                naoLidas={c.naoLidas}
                digitando={c.digitando.size > 0}
              />
            );
          }
          const id = idDaConversa(k) ?? 0;
          const p = pessoaDe(id);
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
            {canal.pessoas.length > 2 && (
              <LinhaConversa
                onClick={() => setCriando(true)}
                icone={
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-accent text-accent">
                    <IconPlus className="h-4 w-4" />
                  </span>
                }
                titulo="Nova conversa em grupo"
                previa="Escolha 2 ou mais pessoas do grupo"
              />
            )}
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

/** O mosaico pequeno (até 3 fotos) de uma conversa em grupo, na lista e no cabeçalho da janela. */
function FotoBolhaPequena({ fotos }: { fotos: { nome: string; foto?: string | null }[] }) {
  if (!fotos.length)
    return (
      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-accent">
        <IconUsers className="h-4 w-4" />
      </span>
    );
  return (
    <span className="relative block h-9 w-9 shrink-0">
      {fotos.slice(0, 2).map((f, i) => (
        <span key={`${f.nome}-${i}`} className={`absolute flex rounded-full ring-2 ring-surface ${i ? "right-0 bottom-0" : "top-0 left-0"}`}>
          <Avatar nome={f.nome} foto={f.foto} size="sm" />
        </span>
      ))}
    </span>
  );
}

/** NOVA CONVERSA EM GRUPO: as pessoas do grupo ativo (2 a 19 além de você) e um nome opcional. Só ao vivo: existe enquanto
 * alguém dela está com o sistema aberto. */
function NovaConversaGrupo({ onCriar, onVoltar, onFechar }: { onCriar: (membros: number[], nome: string) => void; onVoltar: () => void; onFechar: () => void }) {
  const canal = useCanalGrupo();
  const [nome, setNome] = useState("");
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set());
  const [busca, setBusca] = useState("");
  if (!canal) return null;
  const passa = predicadoBusca(busca);
  const pessoas = canal.pessoas
    .filter((p) => p.id !== canal.usuarioId && (!passa || passa([p.nome, p.apelido])))
    .map((p) => ({ p, e: canal.estados.get(p.id)?.estado }))
    .sort((a, b) => Number(!a.e) - Number(!b.e) || nomeExibicao(a.p).localeCompare(nomeExibicao(b.p), "pt-BR"));
  const max = MAX_MEMBROS_CONVERSA - 1;
  const alternar = (id: number) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else if (n.size < max) n.add(id);
      return n;
    });
  const pode = marcados.size >= 2;
  return (
    <>
      <CabecalhoPainel onFechar={onFechar}>
        <button type="button" onClick={onVoltar} aria-label="Voltar às conversas" title="Voltar às conversas" className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-surface-2 lg:h-9 lg:w-9">
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">Nova conversa em grupo</p>
      </CabecalhoPainel>
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={MAX_NOME_CONVERSA}
          placeholder="Nome da conversa (opcional)"
          aria-label="Nome da conversa"
          className="h-11 w-full rounded-control border border-border bg-surface px-3 text-[13.5px] text-text placeholder:text-faint focus:border-accent focus:outline-none lg:h-9"
        />
        {canal.pessoas.length > 9 && (
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pessoa…"
            aria-label="Buscar pessoa"
            className="h-11 w-full rounded-control border border-border bg-surface px-3 text-[13px] text-text placeholder:text-faint focus:border-accent focus:outline-none lg:h-9"
          />
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1" aria-label="Pessoas do grupo">
        {pessoas.map(({ p, e }) => {
          const marcado = marcados.has(p.id);
          return (
            <li key={p.id}>
              <label className="relative flex min-h-12 w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-2 has-[:focus-visible]:bg-surface-2">
                <input type="checkbox" className="peer sr-only" checked={marcado} onChange={() => alternar(p.id)} aria-label={nomeExibicao(p)} />
                <Avatar nome={p.nome} foto={p.foto} size="lg" presenca={e} pulsar={e === "online"} className={e ? "" : "opacity-60"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-text">{nomeExibicao(p)}</span>
                  <span className="block truncate text-[11.5px] text-muted">{e === "online" ? "Online agora" : e === "ausente" ? "Ausente" : "Não está online"}</span>
                </span>
                <span className={`grid h-5 w-5 place-items-center rounded-md border ${marcado ? "border-accent bg-accent text-white" : "border-border"}`}>
                  {marcado && <IconCheck className="h-3.5 w-3.5" />}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex shrink-0 items-center gap-2 border-t border-border p-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] lg:pb-2">
        <span className="min-w-0 flex-1 truncate px-1 text-[12px] text-muted">{marcados.size ? `${marcados.size} escolhida${marcados.size === 1 ? "" : "s"}` : "Escolha 2 ou mais pessoas"}</span>
        <button
          type="button"
          disabled={!pode}
          onClick={() => onCriar([...marcados], nome)}
          className="inline-flex h-11 items-center gap-1.5 rounded-control bg-accent px-4 text-[13px] font-semibold text-white disabled:opacity-40 lg:h-9"
        >
          <IconChat className="h-4 w-4" /> Criar conversa
        </button>
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
function ConversaChat({
  config,
  conversa,
  chat,
  rascunho,
  fixada,
  onFixar,
  onMinimizar,
}: {
  config: ConfigChat;
  conversa: Conversa;
  chat: Chat;
  /** Texto pronto para o campo (o "Conversar sobre…"); `n` muda a cada pedido. */
  rascunho: { texto: string; n: number } | null;
  /** O alfinete: a janela fica aberta mesmo tocando fora. */
  fixada: boolean;
  onFixar: () => void;
  /** Fecha a janela (a bolha fica — excluir é arrastá-la até a lixeira). */
  onMinimizar: () => void;
}) {
  const canal = useCanalGrupo();
  const c = chat.conversas.get(conversa);
  const msgs = c?.msgs ?? [];
  const outro = idDaConversa(conversa);
  const pessoaOutro = outro != null ? (canal?.pessoas.find((p) => p.id === outro) ?? chat.autores.get(outro) ?? null) : null;
  const estadoOutro = outro != null ? canal?.estados.get(outro)?.estado : undefined;
  const emGrupo = ehConversaEmGrupo(conversa);
  const membros = c?.membros ?? [];
  const [texto, setTexto] = useState("");
  const [resp, setResp] = useState<RespostaChat | null>(null);
  const [cursor, setCursor] = useState(0);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const [embaixo, setEmbaixo] = useState(true);
  const [novas, setNovas] = useState(false);
  const permitido = conversa === "grupo" ? config.grupo : config.privado;
  const pessoaDe = (id: number) => canal?.pessoas.find((p) => p.id === id) ?? chat.autores.get(id) ?? null;

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

  // O texto pronto ("Sobre este protocolo: <link>") entra no campo, com o cursor no fim.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a cada pedido novo (`n`).
  useEffect(() => {
    if (!rascunho?.texto) return;
    setTexto(rascunho.texto);
    setCursor(rascunho.texto.length);
    requestAnimationFrame(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(rascunho.texto.length, rascunho.texto.length);
    });
  }, [rascunho?.n]);
  const ids = useMemo(() => msgs.map((m) => m.id), [msgs]);
  const mencao = mencaoEmCurso(texto.slice(0, cursor));
  const sugestoes = useMemo(() => {
    if (mencao == null || !canal) return [];
    const q = mencao.toLowerCase();
    const base = emGrupo ? membros.map((id) => canal.pessoas.find((p) => p.id === id) ?? chat.autores.get(id)).filter((p): p is Pessoa => !!p) : canal.pessoas;
    return base.filter((p) => p.id !== canal.usuarioId && `${p.apelido ?? ""} ${p.nome}`.toLowerCase().includes(q)).slice(0, 5);
  }, [mencao, canal, emGrupo, membros, chat.autores]);

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
  const titulo =
    conversa === "grupo"
      ? `Grupo · ${canal?.grupoNome ?? ""}`
      : emGrupo
        ? rotuloConversa(c?.nome, membros, chat.meuId, chat.nomeDe)
        : pessoaOutro
          ? nomeExibicao(pessoaOutro)
          : chat.nomeDe(outro ?? 0);
  const onlineNaConversa = membros.filter((id) => id !== chat.meuId && canal?.estados.get(id)?.estado === "online").length;
  const sub = digitandoNomes.length
    ? `${digitandoNomes.join(", ")} ${digitandoNomes.length === 1 ? "está" : "estão"} digitando…`
    : emGrupo
      ? `${membros.length} pessoas · ${onlineNaConversa} online`
      : conversa === "grupo"
      ? `${[...(canal?.estados.values() ?? [])].length} online no grupo`
      : estadoOutro === "online"
        ? "Online agora"
        : estadoOutro === "ausente"
          ? "Ausente"
          : "Não está online neste grupo";

  return (
    <>
      <CabecalhoPainel onFechar={onMinimizar} rotuloFechar="Minimizar (Esc)" iconeFechar={<IconMenos className="h-4 w-4" />}>
        {emGrupo ? (
          <FotoBolhaPequena fotos={membros.filter((x) => x !== chat.meuId).slice(0, 3).map((x) => ({ nome: pessoaDe(x)?.nome ?? "?", foto: pessoaDe(x)?.foto }))} />
        ) : conversa === "grupo" ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <IconUsers className="h-4 w-4" />
          </span>
        ) : (
          <Avatar nome={pessoaOutro?.nome ?? "?"} foto={pessoaOutro?.foto} size="md" presenca={estadoOutro} pulsar={estadoOutro === "online"} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-text">{titulo}</span>
          <span className={`block truncate text-[11.5px] ${digitandoNomes.length ? "text-accent" : "text-muted"}`} title={emGrupo ? membros.map((x) => chat.nomeDe(x)).join(", ") : undefined}>
            {sub}
          </span>
        </span>
        <button
          type="button"
          onClick={onFixar}
          aria-pressed={fixada}
          aria-label={fixada ? "Manter aberta: ligado (tocar fora não minimiza)" : "Manter aberta: desligado (tocar fora minimiza)"}
          title={fixada ? "Fixada: tocar fora não minimiza — toque para soltar" : "Manter a conversa aberta ao tocar fora"}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-control transition-colors hover:bg-surface-2 lg:h-9 lg:w-9 ${fixada ? "text-accent" : "text-muted"}`}
        >
          <IconFixar className={`h-4 w-4 transition-transform duration-[var(--motion-duration)] ${fixada ? "-rotate-45" : ""}`} />
        </button>
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
            {c?.carregada === false || !c ? "Carregando a conversa…" : conversa === "grupo" ? "Mande uma mensagem para o grupo." : emGrupo ? "Mande a 1ª mensagem da conversa." : "Comece a conversa."} As mensagens ficam guardadas por 7 dias.
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
        {m.minha && m.envio === "enviada" && m.motivo && <span className="mt-0.5 max-w-full px-1 text-right text-[11px] text-[var(--warn)]">{m.motivo}</span>}
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
