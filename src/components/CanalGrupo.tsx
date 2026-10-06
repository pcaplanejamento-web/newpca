"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { esperaReconexao } from "@/lib/ao-vivo-core";
import type { Pessoa } from "@/lib/pessoa";
import {
  type Atividade,
  type EstadoPresenca,
  type InfoPresenca,
  lerAtividade,
  lerListaMensagem,
  lerVendoMensagem,
  MAX_VENDO,
  ondeDaRota,
  type StatusPresenca,
  statusVigente,
  type TelaOnde,
} from "@/lib/presenca-core";

/** Abrir o CHAT de qualquer lugar (ex.: "Conversar sobre este protocolo"): `{conversa, texto}`. */
export const EVENTO_ABRIR_CHAT = "pca:abrir-chat";

/** O evento da janela com a mensagem PRIVADA do chat (chega pela caixa pessoal — o canal do sino). */
export const EVENTO_CHAT_PRIVADO = "pca:chat-privado";

/** O que o layout passa quando o ADM ligou a presença (desligada = `null`: nada é montado nem conectado). */
export type PresencaShell = {
  pessoas: Pessoa[];
  /** id → telefone (só de quem marcou o contato como WhatsApp). */
  whatsapp: Record<number, string>;
  invisivel: boolean;
  /** Minutos parado até virar "ausente" (0 = só a aba em segundo plano). */
  inativoMin: number;
  status: MeuStatus;
};
export type MeuStatus = { status: StatusPresenca; recado: string; ate: string | null };

/** O estado de presença POR PESSOA, num armazém com assinatura: cada `usePresencaDe(id)` só re-renderiza quando o estado
 * DAQUELA pessoa muda (centenas de fotos nas tabelas não acompanham cada entrada/saída do grupo). */
function criarArmazem() {
  let estados = new Map<number, InfoPresenca>();
  const ouvintes = new Set<() => void>();
  return {
    definir(m: Map<number, InfoPresenca>) {
      estados = m;
      for (const f of ouvintes) f();
    },
    estadoDe: (id: number): EstadoPresenca | undefined => estados.get(id)?.estado,
    assinar(f: () => void) {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
  };
}
type Armazem = ReturnType<typeof criarArmazem>;

export type PessoaVendo = { id: number; editando: boolean };

/** O "VENDO AGORA" e a ATIVIDADE num armazém com assinatura: cada `useVendoDe(alvo)` (a linha de UM protocolo, DFD ou
 * tarefa) e cada `useAtividadeDe(id)` só re-renderiza quando O DELE muda — o valor que não mudou mantém a MESMA referência. */
function criarArmazemVendo() {
  let vendo = new Map<string, PessoaVendo[]>();
  let chaves = new Map<string, string>();
  let atividade = new Map<number, Atividade>();
  let chavesAt = new Map<number, string>();
  const ouvintes = new Set<() => void>();
  function estavel<K, V>(novo: Map<K, V>, velho: Map<K, V>, chavesVelhas: Map<K, string>): [Map<K, V>, Map<K, string>] {
    const out = new Map<K, V>();
    const ch = new Map<K, string>();
    for (const [k, v] of novo) {
      const c = JSON.stringify(v);
      ch.set(k, c);
      out.set(k, chavesVelhas.get(k) === c ? (velho.get(k) as V) : v);
    }
    return [out, ch];
  }
  return {
    definir(v: Map<string, PessoaVendo[]>, a: Map<number, Atividade> | null) {
      [vendo, chaves] = estavel(v, vendo, chaves);
      [atividade, chavesAt] = estavel(a ?? new Map(), atividade, chavesAt);
      for (const f of ouvintes) f();
    },
    vendoDe: (alvo: string) => vendo.get(alvo),
    atividadeDe: (id: number) => atividade.get(id),
    assinar(f: () => void) {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
  };
}
type ArmazemVendo = ReturnType<typeof criarArmazemVendo>;

type Ouvinte = (msg: Record<string, unknown>) => void;

export type CanalGrupoValor = {
  usuarioId: number;
  grupoId: number;
  grupoNome: string | null;
  pessoas: Pessoa[];
  whatsapp: Record<number, string>;
  invisivel: boolean;
  estados: Map<number, InfoPresenca>;
  vistos: Map<number, number>;
  aoVivo: boolean;
  meuStatus: MeuStatus;
  definirStatus: (s: MeuStatus) => Promise<void>;
  /** Manda pelo socket do grupo (false = sem conexão). */
  enviar: (msg: Record<string, unknown>) => boolean;
  /** Ouve um tipo de mensagem do canal (`t`) — o chat e o "vendo agora" usam o MESMO socket. */
  ouvir: (tipo: string, fn: Ouvinte) => () => void;
  /** O chat do grupo está ligado (o "Conversar sobre…" do "vendo agora"). */
  chatGrupo: boolean;
  /** O chat privado (e as conversas em grupo) está ligado — o "Conversar" de cada pessoa. */
  chatPrivado: boolean;
  /** Quem está VENDO cada alvo ("protocolo:12"…) e quem está editando. */
  vendo: Map<string, { id: number; editando: boolean }[]>;
  /** Registra o que ESTA tela está vendo (o banner aberto; `rotulo` = "Protocolo 144756/2026") — devolve a função que tira. */
  registrarVendo: (alvo: string, editando: boolean, rotulo?: string) => () => void;
  /** ONDE cada pessoa está e o que está fazendo (`null` = o ADM não mostra a atividade). */
  atividade: Map<number, Atividade> | null;
  /** A tela em que ESTA aba está. */
  meuOnde: { tela: TelaOnde; rotulo: string };
  /** O nome que a página dá ao "onde" (o quadro, o PCA) — devolve a função que tira. */
  definirDetalheOnde: (texto: string) => () => void;
  armazem: Armazem;
  armazemVendo: ArmazemVendo;
};

const Ctx = createContext<CanalGrupoValor | null>(null);

/** A parte ESTÁVEL do canal (quem é você, as pessoas, o armazém do "vendo") — as linhas das tabelas leem só dela, então
 * não re-renderizam a cada entrada/saída do grupo. */
type CanalEstavel = { usuarioId: number; pessoas: Map<number, Pessoa>; armazemVendo: ArmazemVendo };
const CtxEstavel = createContext<CanalEstavel | null>(null);
export const useCanalEstavel = () => useContext(CtxEstavel);

/** O canal do GRUPO (presença; depois o chat e o "vendo agora") — `null` fora do painel ou com a presença desligada. */
export const useCanalGrupo = () => useContext(Ctx);

const nada = () => () => {};
const indefinido = () => undefined;

/** O estado de presença de UMA pessoa (online/ausente; `undefined` = fora, ou presença desligada). */
export function usePresencaDe(id: number | null | undefined): EstadoPresenca | undefined {
  const c = useContext(Ctx);
  const a = c?.armazem;
  return useSyncExternalStore(
    a ? a.assinar : nada,
    a && id != null ? () => a.estadoDe(id) : indefinido,
    indefinido,
  );
}

/** Quem (fora você) está com o item aberto — só a linha dele re-renderiza quando muda. */
export function useVendoDe(alvo: string): PessoaVendo[] | undefined {
  const c = useContext(CtxEstavel);
  const a = c?.armazemVendo;
  return useSyncExternalStore(a ? a.assinar : nada, a ? () => a.vendoDe(alvo) : indefinido, indefinido);
}

/** Onde UMA pessoa está e o que está fazendo (`undefined` = sem atividade, desligada ou invisível). */
export function useAtividadeDe(id: number | null | undefined): Atividade | undefined {
  const c = useContext(CtxEstavel);
  const a = c?.armazemVendo;
  return useSyncExternalStore(a ? a.assinar : nada, a && id != null ? () => a.atividadeDe(id) : indefinido, indefinido);
}

/** A página dá o nome do "onde" (o quadro, o PCA, o orçamento) — ex.: `useOndeDetalhe(quadro.nome)`. */
export function useOndeDetalhe(texto: string | null | undefined) {
  const definir = useContext(Ctx)?.definirDetalheOnde;
  useEffect(() => (definir && texto ? definir(texto) : undefined), [definir, texto]);
}

/** "Não perturbe" vigente (o sino não toca som nem alerta do sistema). */
export function useNaoPerturbe(): boolean {
  const c = useContext(Ctx);
  return !!c && statusVigente(c.meuStatus).status === "nao-perturbe";
}

/** Os eventos que contam como "mexendo" (a inatividade zera). */
const ATIVIDADE = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * O PROVEDOR do canal do grupo, no `AppShell`: um WebSocket por aba (`/api/presenca/ao-vivo?grupo=`), ping a cada 45 s
 * (auto-resposta, não acorda o servidor), reconexão com espera crescente; "ausente" com a aba em segundo plano OU parada há
 * `inativoMin` (só manda quando muda); trocar de grupo ou passar a invisível reconecta.
 */
export function CanalGrupo({
  presenca,
  usuarioId,
  grupoId,
  grupoNome,
  chatGrupo = false,
  chatPrivado = false,
  children,
}: {
  presenca: PresencaShell | null;
  usuarioId: number;
  grupoId: number | null;
  grupoNome: string | null;
  chatGrupo?: boolean;
  chatPrivado?: boolean;
  children: ReactNode;
}) {
  // SEMPRE a mesma árvore (ligado ou não): ligar/desligar a presença nunca REMONTA a tela inteira — só troca o contexto.
  return (
    <CanalAtivo presenca={presenca} usuarioId={usuarioId} grupoId={grupoId} grupoNome={grupoNome} chatGrupo={chatGrupo} chatPrivado={chatPrivado}>
      {children}
    </CanalAtivo>
  );
}

const PRESENCA_VAZIA: PresencaShell = { pessoas: [], whatsapp: {}, invisivel: false, inativoMin: 0, status: { status: "disponivel", recado: "", ate: null } };

function CanalAtivo({
  presenca: presencaOuNada,
  usuarioId,
  grupoId: grupoOuNada,
  grupoNome,
  chatGrupo,
  chatPrivado,
  children,
}: {
  presenca: PresencaShell | null;
  usuarioId: number;
  grupoId: number | null;
  grupoNome: string | null;
  chatGrupo: boolean;
  chatPrivado: boolean;
  children: ReactNode;
}) {
  const ativo = presencaOuNada != null && grupoOuNada != null;
  const presenca = presencaOuNada ?? PRESENCA_VAZIA;
  const grupoId = grupoOuNada ?? 0;
  const [estados, setEstados] = useState<Map<number, InfoPresenca>>(() => new Map());
  const [vistos, setVistos] = useState<Map<number, number>>(() => new Map());
  const [aoVivo, setAoVivo] = useState(false);
  const [meuStatus, setMeuStatus] = useState<MeuStatus>(presenca.status);
  const armazem = useMemo(criarArmazem, []);
  const ws = useRef<WebSocket | null>(null);
  const ouvintes = useRef(new Map<string, Set<Ouvinte>>());
  const { invisivel, inativoMin } = presenca;
  const [vendo, setVendo] = useState<Map<string, { id: number; editando: boolean }[]>>(() => new Map());
  // O que as telas desta aba estão vendo (um registro por banner aberto) — vai junto ao servidor, com uma espera curta.
  const registros = useRef(new Map<number, { alvo: string; editando: boolean; rotulo: string }>());
  const armazemVendo = useMemo(criarArmazemVendo, []);
  const [atividade, setAtividade] = useState<Map<number, Atividade> | null>(null);
  const proximoRegistro = useRef(0);
  const ultimoVendo = useRef("");
  const timerVendo = useRef(0);
  const mandarVendo = useCallback((forcar = false) => {
    window.clearTimeout(timerVendo.current);
    timerVendo.current = window.setTimeout(() => {
      const regs = [...registros.current.values()];
      const alvos = [...new Set(regs.map((r) => r.alvo))].slice(0, MAX_VENDO);
      const editando = [...new Set(regs.filter((r) => r.editando).map((r) => r.alvo))].filter((a) => alvos.includes(a));
      const rotulos = alvos.map((a) => regs.find((r) => r.alvo === a && r.rotulo)?.rotulo ?? "");
      const msg = JSON.stringify({ t: "vendo", alvos, editando, rotulos });
      if (!forcar && msg === ultimoVendo.current) return;
      const s = ws.current;
      if (s?.readyState === WebSocket.OPEN) {
        s.send(msg);
        ultimoVendo.current = msg;
      }
    }, 250);
  }, []);
  const registrarVendo = useCallback(
    (alvo: string, editando: boolean, rotulo = "") => {
      const id = ++proximoRegistro.current;
      registros.current.set(id, { alvo, editando, rotulo });
      mandarVendo();
      return () => {
        registros.current.delete(id);
        mandarVendo();
      };
    },
    [mandarVendo],
  );

  // ONDE esta aba está: a rota (+ o nome que a página dá) — vai ao servidor só quando muda (e de novo na reconexão).
  const pathname = usePathname();
  const busca = useSearchParams().toString();
  const detalhes = useRef(new Map<number, string>());
  const [detalhe, setDetalhe] = useState("");
  const definirDetalheOnde = useCallback((texto: string) => {
    const id = ++proximoRegistro.current;
    detalhes.current.set(id, texto);
    setDetalhe(texto);
    return () => {
      detalhes.current.delete(id);
      setDetalhe([...detalhes.current.values()].at(-1) ?? "");
    };
  }, []);
  const meuOnde = useMemo(() => ondeDaRota(pathname ?? "", busca, detalhe), [pathname, busca, detalhe]);
  const meuOndeRef = useRef(meuOnde);
  meuOndeRef.current = meuOnde;
  const ultimoOnde = useRef("");
  const mandarOnde = useCallback(() => {
    const msg = JSON.stringify({ t: "onde", ...meuOndeRef.current });
    const s = ws.current;
    if (msg === ultimoOnde.current || s?.readyState !== WebSocket.OPEN) return;
    s.send(msg);
    ultimoOnde.current = msg;
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: manda quando a tela muda.
  useEffect(() => {
    const t = window.setTimeout(mandarOnde, 300);
    return () => window.clearTimeout(t);
  }, [meuOnde, mandarOnde]);

  // O status do servidor muda (outra aba gravou, a página recarregou) → vale o dele.
  const statusServidor = JSON.stringify(presenca.status);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a chave em texto evita reaplicar o mesmo objeto.
  useEffect(() => setMeuStatus(presenca.status), [statusServidor]);

  const enviar = useCallback((msg: Record<string, unknown>) => {
    const s = ws.current;
    if (!s || s.readyState !== WebSocket.OPEN) return false;
    s.send(JSON.stringify(msg));
    return true;
  }, []);

  const ouvir = useCallback((tipo: string, fn: Ouvinte) => {
    const set = ouvintes.current.get(tipo) ?? new Set<Ouvinte>();
    ouvintes.current.set(tipo, set);
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `invisivel` só RECONECTA (o servidor lê a escolha na abertura).
  useEffect(() => {
    setEstados(new Map());
    if (!ativo) {
      armazem.definir(new Map());
      armazemVendo.definir(new Map(), null);
      setAoVivo(false);
      return;
    }
    armazem.definir(new Map());
    setAoVivo(false);
    let tentativa = 0;
    let timer = 0;
    let batida = 0;
    let semPong = 0;
    let vivo = true;
    let ultimaAtividade = Date.now();
    let enviado: EstadoPresenca = "online";
    const estadoDaAba = (): EstadoPresenca =>
      document.visibilityState === "visible" && (inativoMin <= 0 || Date.now() - ultimaAtividade < inativoMin * 60_000) ? "online" : "ausente";
    const conferir = () => {
      const e = estadoDaAba();
      if (e !== enviado && ws.current?.readyState === WebSocket.OPEN) {
        // Ao virar "ausente", diz há quanto tempo está parada (o "ausente há 12 min" dos outros conta desde então).
        const ha = e === "ausente" && document.visibilityState === "visible" ? Date.now() - ultimaAtividade : 0;
        ws.current.send(JSON.stringify(ha > 0 ? { t: "estado", estado: e, ha } : { t: "estado", estado: e }));
        enviado = e;
      }
    };
    const mexeu = () => {
      ultimaAtividade = Date.now();
      if (enviado === "ausente") conferir();
    };
    const agendar = () => {
      if (vivo) timer = window.setTimeout(conectar, esperaReconexao(tentativa++));
    };
    function conectar() {
      if (!vivo) return;
      let s: WebSocket;
      try {
        s = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/presenca/ao-vivo?grupo=${grupoId}`);
      } catch {
        agendar();
        return;
      }
      ws.current = s;
      s.onopen = () => {
        tentativa = 0;
        setAoVivo(true);
        // O servidor começa "online": a aba aberta em segundo plano (ou parada) avisa logo.
        enviado = "online";
        conferir();
        // O que esta aba está vendo vale de novo na conexão nova.
        ultimoVendo.current = "";
        if (registros.current.size) mandarVendo(true);
        ultimoOnde.current = "";
        mandarOnde();
        // A BATIDA: "ping" a cada 45 s; sem o "pong" em 10 s, a conexão morreu sem avisar (rede caiu) — fecha e reconecta.
        batida = window.setInterval(() => {
          if (s.readyState !== WebSocket.OPEN) return;
          s.send("ping");
          window.clearTimeout(semPong);
          semPong = window.setTimeout(() => s.close(), 10_000);
        }, 45_000);
      };
      s.onmessage = (e) => {
        if (e.data === "pong") {
          window.clearTimeout(semPong);
          return;
        }
        const lista = lerListaMensagem(e.data);
        if (lista) {
          setEstados(lista.estados);
          setVistos(lista.vistos);
          armazem.definir(lista.estados);
          return;
        }
        try {
          const m = JSON.parse(e.data) as Record<string, unknown>;
          const v = lerVendoMensagem(m);
          if (v) {
            const a = lerAtividade(m);
            setVendo(v);
            setAtividade(a);
            armazemVendo.definir(v, a);
            return;
          }
          if (typeof m.t === "string") for (const f of ouvintes.current.get(m.t) ?? []) f(m);
        } catch {
          /* mensagem desconhecida */
        }
      };
      s.onclose = (e) => {
        if (ws.current === s) ws.current = null;
        setAoVivo(false);
        window.clearInterval(batida);
        window.clearTimeout(semPong);
        // 4000 = abas demais desta pessoa no grupo: esta aba fica fora (não disputa com as outras).
        if (e.code !== 4000) agendar();
      };
    }
    conectar();
    // Sem rede: fecha na hora ("Reconectando…"); a rede voltou: reconecta já, sem esperar a espera crescente.
    const semRede = () => ws.current?.close();
    const comRede = () => {
      if (ws.current) return;
      window.clearTimeout(timer);
      tentativa = 0;
      conectar();
    };
    window.addEventListener("offline", semRede);
    window.addEventListener("online", comRede);
    document.addEventListener("visibilitychange", conferir);
    for (const ev of ATIVIDADE) window.addEventListener(ev, mexeu, { passive: true });
    // Um temporizador só: a inatividade vira "ausente" sem depender de evento.
    const relogio = inativoMin > 0 ? window.setInterval(conferir, 30_000) : 0;
    return () => {
      vivo = false;
      window.removeEventListener("offline", semRede);
      window.removeEventListener("online", comRede);
      window.clearTimeout(semPong);
      document.removeEventListener("visibilitychange", conferir);
      for (const ev of ATIVIDADE) window.removeEventListener(ev, mexeu);
      window.clearInterval(relogio);
      window.clearTimeout(timer);
      window.clearInterval(batida);
      ws.current?.close();
      ws.current = null;
    };
  }, [ativo, grupoId, invisivel, inativoMin, armazem, armazemVendo, mandarVendo, mandarOnde]);

  const definirStatus = useCallback(
    async (s: MeuStatus) => {
      const antes = meuStatus;
      setMeuStatus(s);
      enviar({ t: "status", ...s });
      try {
        const r = await fetch("/api/perfil/presenca", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Não foi possível salvar o status.");
      } catch (e) {
        setMeuStatus(antes);
        enviar({ t: "status", ...antes });
        throw e;
      }
    },
    [meuStatus, enviar],
  );

  const valor = useMemo<CanalGrupoValor>(
    () => ({
      usuarioId,
      grupoId,
      grupoNome,
      pessoas: presenca.pessoas,
      whatsapp: presenca.whatsapp,
      invisivel,
      estados,
      vistos,
      aoVivo,
      meuStatus,
      definirStatus,
      enviar,
      ouvir,
      chatGrupo,
      chatPrivado,
      vendo,
      registrarVendo,
      atividade,
      meuOnde,
      definirDetalheOnde,
      armazem,
      armazemVendo,
    }),
    [
      chatGrupo,
      chatPrivado,
      usuarioId,
      grupoId,
      grupoNome,
      presenca.pessoas,
      presenca.whatsapp,
      invisivel,
      estados,
      vistos,
      aoVivo,
      meuStatus,
      definirStatus,
      enviar,
      ouvir,
      vendo,
      registrarVendo,
      atividade,
      meuOnde,
      definirDetalheOnde,
      armazem,
      armazemVendo,
    ],
  );
  const estavel = useMemo<CanalEstavel>(() => ({ usuarioId, pessoas: new Map(presenca.pessoas.map((p) => [p.id, p])), armazemVendo }), [usuarioId, presenca.pessoas, armazemVendo]);
  return (
    <CtxEstavel.Provider value={ativo ? estavel : null}>
      <Ctx.Provider value={ativo ? valor : null}>{children}</Ctx.Provider>
    </CtxEstavel.Provider>
  );
}

/** Para o CATÁLOGO do design system: um canal sem servidor, com os estados dados. */
export function CanalGrupoDemo({
  valor,
  children,
}: {
  valor: Omit<CanalGrupoValor, "armazem" | "armazemVendo" | "ouvir" | "enviar" | "definirStatus" | "registrarVendo" | "vendo" | "atividade" | "meuOnde" | "definirDetalheOnde"> & {
    vendo?: CanalGrupoValor["vendo"];
    atividade?: CanalGrupoValor["atividade"];
    meuOnde?: CanalGrupoValor["meuOnde"];
  };
  children: ReactNode;
}) {
  const armazem = useMemo(criarArmazem, []);
  const armazemVendo = useMemo(criarArmazemVendo, []);
  useEffect(() => armazem.definir(valor.estados), [armazem, valor.estados]);
  useEffect(() => armazemVendo.definir(valor.vendo ?? new Map(), valor.atividade ?? null), [armazemVendo, valor.vendo, valor.atividade]);
  const [meuStatus, setMeuStatus] = useState(valor.meuStatus);
  const v = useMemo<CanalGrupoValor>(
    () => ({
      ...valor,
      vendo: valor.vendo ?? new Map(),
      atividade: valor.atividade ?? null,
      meuOnde: valor.meuOnde ?? { tela: "dfd", rotulo: "Mesa" },
      definirDetalheOnde: () => () => {},
      meuStatus,
      armazem,
      armazemVendo,
      ouvir: () => () => {},
      enviar: () => false,
      registrarVendo: () => () => {},
      definirStatus: async (s) => setMeuStatus(s),
    }),
    [valor, meuStatus, armazem, armazemVendo],
  );
  const estavel = useMemo<CanalEstavel>(() => ({ usuarioId: valor.usuarioId, pessoas: new Map(valor.pessoas.map((p) => [p.id, p])), armazemVendo }), [valor.usuarioId, valor.pessoas, armazemVendo]);
  return (
    <CtxEstavel.Provider value={estavel}>
      <Ctx.Provider value={v}>{children}</Ctx.Provider>
    </CtxEstavel.Provider>
  );
}
