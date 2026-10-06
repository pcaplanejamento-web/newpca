"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { esperaReconexao } from "@/lib/ao-vivo-core";
import type { Pessoa } from "@/lib/pessoa";
import { type EstadoPresenca, type InfoPresenca, lerListaMensagem, type StatusPresenca, statusVigente } from "@/lib/presenca-core";

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
  armazem: Armazem;
};

const Ctx = createContext<CanalGrupoValor | null>(null);

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
  children,
}: {
  presenca: PresencaShell | null;
  usuarioId: number;
  grupoId: number | null;
  grupoNome: string | null;
  children: ReactNode;
}) {
  if (!presenca || grupoId == null) return <>{children}</>;
  return (
    <CanalAtivo presenca={presenca} usuarioId={usuarioId} grupoId={grupoId} grupoNome={grupoNome}>
      {children}
    </CanalAtivo>
  );
}

function CanalAtivo({ presenca, usuarioId, grupoId, grupoNome, children }: { presenca: PresencaShell; usuarioId: number; grupoId: number; grupoNome: string | null; children: ReactNode }) {
  const [estados, setEstados] = useState<Map<number, InfoPresenca>>(() => new Map());
  const [vistos, setVistos] = useState<Map<number, number>>(() => new Map());
  const [aoVivo, setAoVivo] = useState(false);
  const [meuStatus, setMeuStatus] = useState<MeuStatus>(presenca.status);
  const armazem = useMemo(criarArmazem, []);
  const ws = useRef<WebSocket | null>(null);
  const ouvintes = useRef(new Map<string, Set<Ouvinte>>());
  const { invisivel, inativoMin } = presenca;

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
    armazem.definir(new Map());
    setAoVivo(false);
    let tentativa = 0;
    let timer = 0;
    let batida = 0;
    let vivo = true;
    let ultimaAtividade = Date.now();
    let enviado: EstadoPresenca = "online";
    const estadoDaAba = (): EstadoPresenca =>
      document.visibilityState === "visible" && (inativoMin <= 0 || Date.now() - ultimaAtividade < inativoMin * 60_000) ? "online" : "ausente";
    const conferir = () => {
      const e = estadoDaAba();
      if (e !== enviado && ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ t: "estado", estado: e }));
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
        batida = window.setInterval(() => s.readyState === WebSocket.OPEN && s.send("ping"), 45_000);
      };
      s.onmessage = (e) => {
        if (e.data === "pong") return;
        const lista = lerListaMensagem(e.data);
        if (lista) {
          setEstados(lista.estados);
          setVistos(lista.vistos);
          armazem.definir(lista.estados);
          return;
        }
        try {
          const m = JSON.parse(e.data) as Record<string, unknown>;
          if (typeof m.t === "string") for (const f of ouvintes.current.get(m.t) ?? []) f(m);
        } catch {
          /* mensagem desconhecida */
        }
      };
      s.onclose = (e) => {
        if (ws.current === s) ws.current = null;
        setAoVivo(false);
        window.clearInterval(batida);
        // 4000 = abas demais desta pessoa no grupo: esta aba fica fora (não disputa com as outras).
        if (e.code !== 4000) agendar();
      };
    }
    conectar();
    document.addEventListener("visibilitychange", conferir);
    for (const ev of ATIVIDADE) window.addEventListener(ev, mexeu, { passive: true });
    // Um temporizador só: a inatividade vira "ausente" sem depender de evento.
    const relogio = inativoMin > 0 ? window.setInterval(conferir, 30_000) : 0;
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", conferir);
      for (const ev of ATIVIDADE) window.removeEventListener(ev, mexeu);
      window.clearInterval(relogio);
      window.clearTimeout(timer);
      window.clearInterval(batida);
      ws.current?.close();
      ws.current = null;
    };
  }, [grupoId, invisivel, inativoMin, armazem]);

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
      armazem,
    }),
    [usuarioId, grupoId, grupoNome, presenca.pessoas, presenca.whatsapp, invisivel, estados, vistos, aoVivo, meuStatus, definirStatus, enviar, ouvir, armazem],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Para o CATÁLOGO do design system: um canal sem servidor, com os estados dados. */
export function CanalGrupoDemo({ valor, children }: { valor: Omit<CanalGrupoValor, "armazem" | "ouvir" | "enviar" | "definirStatus">; children: ReactNode }) {
  const armazem = useMemo(criarArmazem, []);
  useEffect(() => armazem.definir(valor.estados), [armazem, valor.estados]);
  const [meuStatus, setMeuStatus] = useState(valor.meuStatus);
  const v = useMemo<CanalGrupoValor>(
    () => ({ ...valor, meuStatus, armazem, ouvir: () => () => {}, enviar: () => false, definirStatus: async (s) => setMeuStatus(s) }),
    [valor, meuStatus, armazem],
  );
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
