"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { esperaReconexao } from "@/lib/ao-vivo-core";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import { type EstadoPresenca, lerListaMensagem, ordenarPresenca } from "@/lib/presenca-core";
import { Avatar } from "./Avatar";
import { Dropdown } from "./Dropdown";
import { IconUsers } from "./icons";
import { Modal } from "./Modal";

/** O que o layout passa ao cabeçalho quando o ADM ligou a presença (desligada = nada é montado). */
export type PresencaShell = { pessoas: Pessoa[]; invisivel: boolean };

/** Fotos à vista no cabeçalho (as demais viram "+N"). */
const MAX_FOTOS = 3;

/**
 * O canal da PRESENÇA do grupo: um WebSocket por aba (`/api/presenca/ao-vivo?grupo=`), ping a cada 45 s (auto-resposta,
 * não acorda o servidor), reconexão com espera crescente, a aba oculta vira "ausente" (só manda quando muda). Trocar de
 * grupo (ou passar a invisível) fecha e abre de novo. Devolve quem está no grupo (id → estado) e se o canal está ligado.
 */
export function usePresencaGrupo(grupoId: number | null, invisivel = false) {
  const [estados, setEstados] = useState<Map<number, EstadoPresenca>>(() => new Map());
  const [aoVivo, setAoVivo] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `invisivel` só RECONECTA (o servidor lê a escolha na abertura).
  useEffect(() => {
    setEstados(new Map());
    setAoVivo(false);
    if (grupoId == null) return;
    let ws: WebSocket | null = null;
    let tentativa = 0;
    let timer = 0;
    let batida = 0;
    let vivo = true;
    const estadoDaAba = (): EstadoPresenca => (document.visibilityState === "visible" ? "online" : "ausente");
    const mandar = () => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ estado: estadoDaAba() }));
    const agendar = () => {
      if (vivo) timer = window.setTimeout(conectar, esperaReconexao(tentativa++));
    };
    function conectar() {
      if (!vivo) return;
      try {
        ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/presenca/ao-vivo?grupo=${grupoId}`);
      } catch {
        agendar();
        return;
      }
      ws.onopen = () => {
        tentativa = 0;
        setAoVivo(true);
        // Abriu em segundo plano: avisa logo (o servidor começa "online").
        if (estadoDaAba() === "ausente") mandar();
        batida = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 45_000);
      };
      ws.onmessage = (e) => {
        const m = lerListaMensagem(e.data);
        if (m) setEstados(m);
      };
      ws.onclose = (e) => {
        setAoVivo(false);
        window.clearInterval(batida);
        // 4000 = abas demais desta pessoa no grupo: esta aba fica fora (não disputa com as outras).
        if (e.code !== 4000) agendar();
      };
    }
    conectar();
    document.addEventListener("visibilitychange", mandar);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", mandar);
      window.clearTimeout(timer);
      window.clearInterval(batida);
      ws?.close();
    };
  }, [grupoId, invisivel]);
  return { estados, aoVivo };
}

const ROTULO_ESTADO: Record<EstadoPresenca, string> = { online: "Online", ausente: "Ausente" };

/**
 * QUEM DO GRUPO ESTÁ ONLINE, ao vivo, no cabeçalho: no desktop, as fotos (com o ponto verde/âmbar) + "+N"; no celular,
 * o ícone com o número. Tocar abre a lista (você primeiro). Só existe quando o ADM ligou a presença (Configurações →
 * Presença). `estados` vem do `usePresencaGrupo` (aqui por prop, para o catálogo mostrar sem servidor).
 */
export function PresencaGrupo({
  pessoas,
  usuarioId,
  estados,
  aoVivo,
  invisivel = false,
  grupoNome,
}: {
  /** O diretório do grupo ativo (foto + apelido). O canal manda só ids. */
  pessoas: Pessoa[];
  usuarioId: number;
  estados: ReadonlyMap<number, EstadoPresenca>;
  aoVivo: boolean;
  /** Você escolheu aparecer invisível (você vê os outros; eles não te veem). */
  invisivel?: boolean;
  grupoNome?: string | null;
}) {
  const [folha, setFolha] = useState(false);
  // Você aparece sempre (o canal não te manda quando você está invisível).
  const comVoce = useMemo(() => {
    const m = new Map(estados);
    if (!m.has(usuarioId)) m.set(usuarioId, "online");
    return m;
  }, [estados, usuarioId]);
  const lista = useMemo(() => ordenarPresenca(pessoas, comVoce, usuarioId), [pessoas, comVoce, usuarioId]);
  const outros = useMemo(() => lista.filter((l) => !l.voce), [lista]);
  const online = outros.filter((l) => l.estado === "online").length;
  const anuncio = useAnuncio(outros);

  const rotulo = !aoVivo
    ? "Quem está online — conectando"
    : outros.length
      ? `Quem está online${grupoNome ? ` em ${grupoNome}` : ""} — ${online} online${outros.length > online ? `, ${outros.length - online} ausente${outros.length - online === 1 ? "" : "s"}` : ""}`
      : `Quem está online${grupoNome ? ` em ${grupoNome}` : ""} — só você`;
  const fotos = outros.slice(0, MAX_FOTOS);
  const resto = outros.length - fotos.length;

  const painel = (semTitulo = false) => (
    <div className="flex max-h-[min(70vh,520px)] flex-col">
      {!semTitulo && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <IconUsers className="h-4 w-4 text-accent" />
          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">Online agora{grupoNome ? ` · ${grupoNome}` : ""}</p>
          <EstadoCanal aoVivo={aoVivo} />
        </div>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {lista.map(({ pessoa, estado, voce }) => (
          <li key={pessoa.id} className="flex animate-fade-in-up items-center gap-2.5 px-3 py-1.5">
            <Avatar nome={pessoa.nome} foto={pessoa.foto} size="md" presenca={voce && invisivel ? undefined : estado} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-text">
                {nomeExibicao(pessoa)}
                {voce && <span className="font-normal text-muted"> (você)</span>}
              </p>
              {pessoa.apelido && pessoa.apelido !== pessoa.nome && <p className="truncate text-[12px] text-muted">{pessoa.nome}</p>}
            </div>
            <span className={`shrink-0 text-[12px] ${voce && invisivel ? "text-muted" : estado === "online" ? "text-[var(--ok)]" : "text-[var(--warn)]"}`}>
              {voce && invisivel ? "Invisível" : ROTULO_ESTADO[estado]}
            </span>
          </li>
        ))}
      </ul>
      {outros.length === 0 && <p className="px-3 pb-3 text-[12.5px] text-muted">{aoVivo ? "Ninguém mais do grupo está online agora." : "Conectando à presença do grupo…"}</p>}
      {semTitulo && (
        <div className="border-t border-border px-3 py-2">
          <EstadoCanal aoVivo={aoVivo} />
        </div>
      )}
    </div>
  );

  const classeGatilho =
    "relative items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

  return (
    <>
      <span className="sr-only" aria-live="polite">
        {anuncio}
      </span>
      <div className="hidden lg:block">
        <Dropdown
          align="end"
          papel="dialog"
          ariaLabel={rotulo}
          title={rotulo}
          width={320}
          triggerClassName={`${classeGatilho} inline-flex h-[var(--h-control-sm)] min-w-[var(--h-control-sm)] gap-1 px-1.5`}
          trigger={
            fotos.length ? (
              <>
                <span className="flex items-center -space-x-1.5">
                  {/* A primeira foto por CIMA (o ponto, no canto direito, não fica coberto pela vizinha). */}
                  {fotos.map(({ pessoa, estado }, i) => (
                    <span key={pessoa.id} className="relative animate-fade-in-up rounded-full ring-2 ring-surface" style={{ zIndex: fotos.length - i }}>
                      <Avatar nome={pessoa.nome} foto={pessoa.foto} size="sm" presenca={estado} />
                    </span>
                  ))}
                </span>
                {resto > 0 && <span className="text-[12px] font-semibold text-text-2">+{resto}</span>}
              </>
            ) : (
              <IconUsers className={`h-5 w-5 ${aoVivo ? "" : "opacity-50"}`} />
            )
          }
        >
          {() => painel()}
        </Dropdown>
      </div>
      <button type="button" aria-label={rotulo} title={rotulo} aria-haspopup="dialog" onClick={() => setFolha(true)} className={`${classeGatilho} inline-flex h-11 w-11 lg:hidden`}>
        <IconUsers className={`h-5 w-5 ${aoVivo ? "" : "opacity-50"}`} />
        {online > 0 && (
          <span key={online} className="animate-selo-pop absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--ok)] px-1 text-[10px] font-bold leading-none text-white">
            {online > 99 ? "99+" : online}
          </span>
        )}
      </button>
      <Modal open={folha} onClose={() => setFolha(false)} titulo={`Online agora${grupoNome ? ` · ${grupoNome}` : ""}`} size="md">
        {folha && painel(true)}
      </Modal>
    </>
  );
}

function EstadoCanal({ aoVivo }: { aoVivo: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11.5px] ${aoVivo ? "text-[var(--ok)]" : "text-muted"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${aoVivo ? "bg-[var(--ok)]" : "bg-[var(--muted)]"}`} aria-hidden="true" />
      {aoVivo ? "Ao vivo" : "Reconectando…"}
    </span>
  );
}

/** O texto do leitor de tela quando alguém entra ou sai (não anuncia a 1ª lista). */
function useAnuncio(outros: { pessoa: Pessoa }[]): string {
  const antes = useRef<Map<number, string> | null>(null);
  const [texto, setTexto] = useState("");
  useEffect(() => {
    const agora = new Map(outros.map((o) => [o.pessoa.id, nomeExibicao(o.pessoa)]));
    const ant = antes.current;
    antes.current = agora;
    if (!ant) return;
    const entraram = [...agora].filter(([id]) => !ant.has(id)).map(([, n]) => n);
    const sairam = [...ant].filter(([id]) => !agora.has(id)).map(([, n]) => n);
    const partes = [...(entraram.length ? [`${entraram.join(", ")} ${entraram.length === 1 ? "entrou" : "entraram"}`] : []), ...(sairam.length ? [`${sairam.join(", ")} ${sairam.length === 1 ? "saiu" : "saíram"}`] : [])];
    if (partes.length) setTexto(partes.join(". "));
  }, [outros]);
  return texto;
}

/** O contêiner do cabeçalho: o canal + a peça. */
export function PresencaDoCabecalho({ presenca, usuarioId, grupoId, grupoNome }: { presenca: PresencaShell; usuarioId: number; grupoId: number | null; grupoNome?: string | null }) {
  const { estados, aoVivo } = usePresencaGrupo(grupoId, presenca.invisivel);
  if (grupoId == null) return null;
  return <PresencaGrupo pessoas={presenca.pessoas} usuarioId={usuarioId} estados={estados} aoVivo={aoVivo} invisivel={presenca.invisivel} grupoNome={grupoNome} />;
}
