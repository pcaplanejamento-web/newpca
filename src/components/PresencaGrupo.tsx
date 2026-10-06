"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nomeExibicao, type Pessoa } from "@/lib/pessoa";
import {
  type EstadoPresenca,
  type InfoPresenca,
  MAX_RECADO,
  opcoesAte,
  ordenarPresenca,
  ROTULO_STATUS,
  STATUS_PRESENCA,
  type StatusPresenca,
  statusVigente,
  textoAtividade,
  vistoHa,
} from "@/lib/presenca-core";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { type MeuStatus, useCanalGrupo } from "./CanalGrupo";
import { ChipsEscolha } from "./ChipsEscolha";
import { AtividadePessoa } from "./PresencaNoItem";
import { Dropdown } from "./Dropdown";
import { SearchField, SelectField, TextField } from "./Field";
import { IconClipboard, IconUsers } from "./icons";
import { Modal } from "./Modal";
import { BotaoWhatsapp } from "./Telefone";
import { toast } from "./Toast";

/** Fotos à vista no cabeçalho (as demais viram "+N"). */
const MAX_FOTOS = 3;
/** Com mais pessoas que isto, o painel ganha a busca. */
const BUSCA_A_PARTIR = 8;

/** A cor do STATUS: Disponível = verde; Ocupado/Não perturbe = vermelho; Em reunião = âmbar. */
const COR_STATUS: Record<StatusPresenca, string> = {
  disponivel: "text-[var(--ok)]",
  ocupado: "text-[var(--danger)]",
  reuniao: "text-[var(--warn)]",
  "nao-perturbe": "text-[var(--danger)]",
};

/** O selo "AO VIVO": o ponto com o radar (pulsa) + o texto; sem conexão, cinza com "Reconectando…". */
export function SeloAoVivo({ aoVivo, className = "" }: { aoVivo: boolean; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium ${aoVivo ? "text-[var(--ok)]" : "text-muted"} ${className}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${aoVivo ? "ponto-vivo bg-[var(--ok)]" : "animate-pulse bg-[var(--muted)]"}`} />
      {aoVivo ? "Ao vivo" : "Reconectando…"}
    </span>
  );
}

/** Quem ENTROU há menos de 3 s (a foto brilha) — e o texto do leitor de tela ("Ana entrou. Bruno saiu"). */
function useChegadas(ids: number[], nomes: Map<number, string>) {
  const antes = useRef<Set<number> | null>(null);
  const [novos, setNovos] = useState<Set<number>>(() => new Set());
  const [anuncio, setAnuncio] = useState("");
  const chave = ids.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: a chave em texto representa os ids.
  useEffect(() => {
    const agora = new Set(ids);
    const ant = antes.current;
    antes.current = agora;
    if (!ant) return;
    const entraram = ids.filter((id) => !ant.has(id));
    const sairam = [...ant].filter((id) => !agora.has(id));
    const nome = (id: number) => nomes.get(id) ?? "Alguém";
    const partes = [
      ...(entraram.length ? [`${entraram.map(nome).join(", ")} ${entraram.length === 1 ? "entrou" : "entraram"}`] : []),
      ...(sairam.length ? [`${sairam.map(nome).join(", ")} ${sairam.length === 1 ? "saiu" : "saíram"}`] : []),
    ];
    if (partes.length) setAnuncio(partes.join(". "));
    if (!entraram.length) return;
    setNovos((s) => new Set([...s, ...entraram]));
    const t = window.setTimeout(() => setNovos((s) => new Set([...s].filter((id) => !entraram.includes(id)))), 3000);
    return () => window.clearTimeout(t);
  }, [chave]);
  return { novos, anuncio };
}

type Linha = { pessoa: Pessoa; info: InfoPresenca | null; voce: boolean; visto: number | null };

/**
 * QUEM DO GRUPO ESTÁ ONLINE, AO VIVO, no cabeçalho (lê o `CanalGrupo`): no desktop as fotos com o ponto que PULSA, em
 * LEQUE ao passar o mouse, "+N" que desliza e o brilho em quem acabou de entrar; no celular o ícone com o número verde.
 * Tocar abre "Online agora": o seu status, a busca, Online · Ausente · Visto recentemente e, ao tocar numa pessoa, as ações
 * (WhatsApp, ver na Mesa). Só existe com a presença ligada pelo ADM.
 */
export function PresencaGrupo({ verMesa = false }: { /** A pessoa abre a Mesa (a ação "Ver na Mesa"). */ verMesa?: boolean }) {
  const c = useCanalGrupo();
  const [folha, setFolha] = useState(false);
  const linhas = useMemo<Linha[]>(() => {
    if (!c) return [];
    const comVoce = new Map(c.estados);
    if (!comVoce.has(c.usuarioId)) comVoce.set(c.usuarioId, { estado: "online", ...statusVigente(c.meuStatus) });
    const presentes: Linha[] = ordenarPresenca(c.pessoas, comVoce, c.usuarioId).map((l) => ({ pessoa: l.pessoa, info: comVoce.get(l.pessoa.id) ?? null, voce: l.voce, visto: null }));
    const ids = new Set(presentes.map((l) => l.pessoa.id));
    const recentes: Linha[] = c.pessoas
      .filter((p) => !ids.has(p.id) && c.vistos.has(p.id))
      .map((p) => ({ pessoa: p, info: null, voce: false, visto: c.vistos.get(p.id) as number }))
      .sort((a, b) => (b.visto ?? 0) - (a.visto ?? 0));
    return [...presentes, ...recentes];
  }, [c]);
  const outros = useMemo(() => linhas.filter((l) => !l.voce && l.info), [linhas]);
  const nomes = useMemo(() => new Map((c?.pessoas ?? []).map((p) => [p.id, nomeExibicao(p)])), [c?.pessoas]);
  const { novos, anuncio } = useChegadas(
    outros.map((l) => l.pessoa.id),
    nomes,
  );
  if (!c) return null;

  const online = outros.filter((l) => l.info?.estado === "online").length;
  const ausentes = outros.length - online;
  const rotulo = !c.aoVivo
    ? "Quem está online — conectando"
    : `Quem está online${c.grupoNome ? ` em ${c.grupoNome}` : ""} — ${outros.length ? `${online} online${ausentes ? `, ${ausentes} ausente${ausentes === 1 ? "" : "s"}` : ""}` : "só você"}`;
  const fotos = outros.slice(0, MAX_FOTOS);
  const resto = outros.length - fotos.length;
  const gatilho =
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
          width={340}
          triggerClassName={`${gatilho} group/pilha inline-flex h-[var(--h-control-sm)] min-w-[var(--h-control-sm)] gap-1.5 px-1.5`}
          trigger={
            fotos.length ? (
              <>
                <span className="flex items-center">
                  {/* A primeira por cima (o ponto, no canto direito, não fica coberto); ao passar o mouse, abrem em leque. */}
                  {fotos.map(({ pessoa, info }, i) => (
                    <span
                      key={pessoa.id}
                      className={`animate-entrar-pessoa relative rounded-full ring-2 ring-surface transition-[margin] duration-[var(--motion-duration)] ${
                        i ? "-ml-2 group-hover/pilha:ml-0.5 group-focus-visible/pilha:ml-0.5" : ""
                      } ${novos.has(pessoa.id) ? "animate-brilho-novo" : ""}`}
                      style={{ zIndex: fotos.length - i }}
                      title={(() => {
                        const a = c.atividade?.get(pessoa.id);
                        return `${nomeExibicao(pessoa)}${a ? ` — ${textoAtividade(a)}` : ""}`;
                      })()}
                    >
                      <Avatar nome={pessoa.nome} foto={pessoa.foto} size="sm" presenca={info?.estado} pulsar={info?.estado === "online"} />
                    </span>
                  ))}
                </span>
                {resto > 0 && (
                  <span key={resto} className="animate-contador text-[12px] font-semibold tabular-nums text-text-2">
                    +{resto}
                  </span>
                )}
              </>
            ) : (
              <IconUsers className={`h-5 w-5 ${c.aoVivo ? "" : "opacity-50"}`} />
            )
          }
        >
          {() => <PainelOnline linhas={linhas} verMesa={verMesa} />}
        </Dropdown>
      </div>
      <button type="button" aria-label={rotulo} title={rotulo} aria-haspopup="dialog" onClick={() => setFolha(true)} className={`${gatilho} inline-flex h-11 w-11 lg:hidden`}>
        <IconUsers className={`h-5 w-5 ${c.aoVivo ? "" : "opacity-50"}`} />
        {online > 0 && (
          <span key={online} className="animate-selo-pop absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--ok)] px-1 text-[10px] font-bold leading-none text-white">
            <span aria-hidden="true" className="ponto-vivo absolute inset-0 -z-10 rounded-full bg-[var(--ok)]" />
            {online > 99 ? "99+" : online}
          </span>
        )}
      </button>
      <Modal open={folha} onClose={() => setFolha(false)} titulo={`Online agora${c.grupoNome ? ` · ${c.grupoNome}` : ""}`} size="md">
        {folha && <PainelOnline linhas={linhas} verMesa={verMesa} semTitulo onNavegar={() => setFolha(false)} />}
      </Modal>
    </>
  );
}

/** O painel "Online agora": o seu status, a busca, as seções e as ações de cada pessoa. */
function PainelOnline({ linhas, verMesa, semTitulo = false, onNavegar }: { linhas: Linha[]; verMesa: boolean; semTitulo?: boolean; onNavegar?: () => void }) {
  const c = useCanalGrupo();
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<number | null>(null);
  if (!c) return null;
  const passa = predicadoBusca(busca);
  const filtradas = passa ? linhas.filter((l) => l.voce || passa([l.pessoa.nome, l.pessoa.apelido])) : linhas;
  // "Nesta tela": quem está na MESMA tela que você (o mesmo quadro, a mesma Mesa…) — primeiro, fora das outras seções.
  const aqui = (l: Linha) => {
    const a = !l.voce && l.info ? c.atividade?.get(l.pessoa.id) : undefined;
    return !!a && a.tela === c.meuOnde.tela && a.rotulo === c.meuOnde.rotulo;
  };
  const secoes: { titulo: string; itens: Linha[] }[] = [
    { titulo: "Nesta tela", itens: filtradas.filter(aqui) },
    { titulo: "Online", itens: filtradas.filter((l) => l.info?.estado === "online" && !aqui(l)) },
    { titulo: "Ausente", itens: filtradas.filter((l) => l.info?.estado === "ausente" && !aqui(l)) },
    { titulo: "Visto recentemente", itens: filtradas.filter((l) => !l.info && l.visto != null) },
  ];
  const outros = linhas.filter((l) => !l.voce && l.info).length;
  return (
    <div className="flex max-h-[min(72vh,560px)] flex-col">
      {!semTitulo && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <IconUsers className="h-4 w-4 text-accent" />
          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">Online agora{c.grupoNome ? ` · ${c.grupoNome}` : ""}</p>
          <SeloAoVivo aoVivo={c.aoVivo} />
        </div>
      )}
      <MeuStatusEditor />
      {linhas.length > BUSCA_A_PARTIR && (
        <div className="px-3 pt-2">
          <SearchField compacto value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} placeholder="Buscar pessoa…" aria-label="Buscar pessoa" />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-1">
        {secoes.map(
          (s) =>
            s.itens.length > 0 && (
              <section key={s.titulo} aria-label={s.titulo}>
                <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
                  {s.titulo} <span className="tabular-nums">· {s.itens.length}</span>
                </p>
                <ul>
                  {s.itens.map((l) => (
                    <LinhaPessoa
                      key={l.pessoa.id}
                      l={l}
                      aberta={aberta === l.pessoa.id}
                      onAlternar={() => setAberta((a) => (a === l.pessoa.id ? null : l.pessoa.id))}
                      verMesa={verMesa}
                      onNavegar={onNavegar}
                    />
                  ))}
                </ul>
              </section>
            ),
        )}
        {outros === 0 && <p className="px-3 py-2 text-[12.5px] text-muted">{c.aoVivo ? "Ninguém mais do grupo está online agora." : "Conectando à presença do grupo…"}</p>}
      </div>
      {semTitulo && (
        <div className="border-t border-border px-3 py-2">
          <SeloAoVivo aoVivo={c.aoVivo} />
        </div>
      )}
    </div>
  );
}

function LinhaPessoa({ l, aberta, onAlternar, verMesa, onNavegar }: { l: Linha; aberta: boolean; onAlternar: () => void; verMesa: boolean; onNavegar?: () => void }) {
  const c = useCanalGrupo();
  const { pessoa, info, voce, visto } = l;
  const st = info && info.status !== "disponivel" ? info.status : null;
  const inv = voce && !!c?.invisivel;
  const tel = c?.whatsapp[pessoa.id] ?? null;
  const temAcoes = !voce && (!!tel || verMesa);
  const atividade = !voce && info ? c?.atividade?.get(pessoa.id) : undefined;
  const sub = st || info?.recado ? null : visto != null ? `Visto ${vistoHa(visto)}` : atividade ? "" : pessoa.apelido && pessoa.apelido !== pessoa.nome ? pessoa.nome : "";
  const conteudo = (
    <>
      <Avatar nome={pessoa.nome} foto={pessoa.foto} size="md" presenca={inv ? undefined : info?.estado} pulsar={!inv && info?.estado === "online"} className={info ? "" : "opacity-60"} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13.5px] font-medium text-text">
          {nomeExibicao(pessoa)}
          {voce && <span className="font-normal text-muted"> (você)</span>}
        </span>
        {(st || info?.recado || sub) && (
          <span className="block truncate text-[12px] text-muted">
            {st && <span className={`font-medium ${COR_STATUS[st]}`}>{ROTULO_STATUS[st]}</span>}
            {st && info?.recado ? " · " : ""}
            {info?.recado}
            {sub}
          </span>
        )}
        {atividade && <AtividadePessoa atividade={atividade} />}
      </span>
      <span className={`shrink-0 text-[12px] ${inv ? "text-muted" : info?.estado === "online" ? "text-[var(--ok)]" : info ? "text-[var(--warn)]" : "text-faint"}`}>
        {inv ? "Invisível" : info ? (info.estado === "online" ? "Online" : "Ausente") : ""}
      </span>
    </>
  );
  return (
    <li className="animate-fade-in-up">
      {temAcoes ? (
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberta}
          className="flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
        >
          {conteudo}
        </button>
      ) : (
        <div className="flex min-h-11 items-center gap-2.5 px-3 py-1.5">{conteudo}</div>
      )}
      {aberta && temAcoes && (
        <div className="flex animate-fade-in-up flex-wrap items-center gap-2 px-3 pb-2 pl-[3.25rem]">
          {tel && <BotaoWhatsapp telefone={tel} comNumero={false} />}
          {verMesa && (
            <Button
              href={`/painel/mesa?responsavel=${pessoa.id}`}
              size="xs"
              variant="secondary"
              icon={<IconClipboard className="h-4 w-4" />}
              onClick={onNavegar}
              title={`Os protocolos de ${nomeExibicao(pessoa)} na Mesa`}
            >
              Ver na Mesa
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** O SEU status (todos do grupo veem): Disponível · Ocupado · Em reunião · Não perturbe + recado + até quando. Grava na hora
 * (socket + preferência); "Não perturbe" silencia o som e o alerta do sino. */
function MeuStatusEditor() {
  const c = useCanalGrupo();
  const [rascunho, setRascunho] = useState<MeuStatus | null>(null);
  const [gravando, setGravando] = useState(false);
  const ops = useMemo(() => opcoesAte(), []);
  if (!c) return null;
  const vigente = statusVigente(c.meuStatus);
  const cancelar = () => setRascunho(null);
  const salvar = async (r: MeuStatus) => {
    setGravando(true);
    try {
      const limpo = r.recado.trim();
      await c.definirStatus({ status: r.status, recado: limpo, ate: r.status === "disponivel" && !limpo ? null : r.ate });
      setRascunho(null);
      toast.success("Status atualizado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGravando(false);
    }
  };
  if (!rascunho)
    return (
      <div className="border-b border-border px-3 py-1.5">
        <button
          type="button"
          onClick={() => setRascunho({ status: vigente.status, recado: vigente.recado, ate: vigente.status === c.meuStatus.status ? c.meuStatus.ate : null })}
          className="flex min-h-11 w-full items-center gap-2 rounded-control text-left text-[12.5px] lg:min-h-8"
          title="Definir o seu status"
        >
          <span className="text-muted">Seu status:</span>
          <span className={`font-medium ${COR_STATUS[vigente.status]}`}>{ROTULO_STATUS[vigente.status]}</span>
          {vigente.recado && <span className="min-w-0 truncate text-muted">· {vigente.recado}</span>}
          <span className="ml-auto shrink-0 text-[12px] text-accent">Alterar</span>
        </button>
      </div>
    );
  const r = rascunho;
  return (
    <div className="animate-fade-in-up space-y-2 border-b border-border px-3 py-2.5">
      <ChipsEscolha ariaLabel="Seu status" valor={r.status} opcoes={STATUS_PRESENCA.map((s) => ({ value: s, label: ROTULO_STATUS[s] }))} onEscolher={(s) => setRascunho({ ...r, status: s })} />
      <TextField label="Recado (opcional)" value={r.recado} maxLength={MAX_RECADO} placeholder="Ex.: volto às 14h" onChange={(e) => setRascunho({ ...r, recado: e.target.value })} />
      <SelectField label="Até" value={r.ate ?? ""} onChange={(e) => setRascunho({ ...r, ate: e.target.value || null })}>
        {ops.map((o) => (
          <option key={o.rotulo} value={o.ate ?? ""}>
            {o.rotulo}
          </option>
        ))}
        {r.ate && !ops.some((o) => o.ate === r.ate) && (
          <option value={r.ate}>Até {new Date(r.ate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</option>
        )}
      </SelectField>
      {r.status === "nao-perturbe" && <p className="text-[12px] text-muted">Enquanto valer, o sino não toca som nem alerta do sistema.</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={cancelar} disabled={gravando}>
          Cancelar
        </Button>
        <Button size="sm" loading={gravando} onClick={() => salvar(r)}>
          Salvar status
        </Button>
      </div>
    </div>
  );
}

/** O estado de uma pessoa por extenso (a dica das fotos fora do painel). */
export const rotuloEstado = (e: EstadoPresenca | undefined) => (e === "online" ? "online agora" : e === "ausente" ? "ausente" : null);
