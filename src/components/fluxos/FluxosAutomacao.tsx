"use client";

import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chaveOrgaoCenti, type ProtocoloAutomacao } from "@/lib/automacao-centi-core";
import type { PedirExtensao } from "@/lib/arquivo-navegador";
import { dataHoraBR } from "@/lib/format";
import {
  caminhosDosItens,
  executarFluxo,
  type Frequencia,
  GRAFO_VAZIO,
  type Grafo,
  type Item,
  lerFrequencia,
  lerGrafo,
  type NoFluxo,
  novoIdNo,
  type PassoExec,
  proximaExecucao,
  type ResultadoExec,
  resumoExecucao,
  rotuloFrequencia,
  validarGrafo,
} from "@/lib/fluxo-core";
import { type CacheLeitura, chaveLeitura, emissaoDoServidor, lerProtocoloPorCodigo } from "@/lib/fluxo-navegador";
import { type ContextoImportacao, importarProtocolo } from "@/lib/importar-protocolo-auto";
import { NOS_POR_CATEGORIA, REGISTRO_NOS } from "@/lib/fluxo-nos";
import { MODELOS_FLUXO } from "@/lib/fluxo-modelos";
import type { FluxoAutomacao } from "@/lib/fluxos";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Callout } from "../Callout";
import { useConfirmacao } from "../Confirmacao";
import { SearchField, SelectField, TextField } from "../Field";
import { IconChevronLeft, IconEnquadrar, IconFluxo, IconMinus, IconParar, IconPlay, IconPlus, IconSave, IconTrash } from "../icons";
import { Modal } from "../Modal";
import { Switch } from "../Switch";
import { toast } from "../Toast";
import { CanvasFluxo, LARGURA_NO, type Vista } from "./CanvasFluxo";
import { IconeNo } from "./IconeNo";
import { PainelNo } from "./PainelNo";

type Pedir = (acao: string, dados: unknown, ms: number) => Promise<Record<string, unknown> & { ok?: boolean; erro?: string; loteId?: string; interrompido?: boolean }>;
const CARTAO = "rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring";

async function api<T = Record<string, unknown>>(caminho: string, init?: { method?: string; body?: unknown }): Promise<T & { ok?: boolean; error?: string }> {
  try {
    const r = await fetch(caminho, {
      method: init?.method ?? "GET",
      cache: "no-store",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    return (await r.json()) as T & { ok?: boolean; error?: string };
  } catch {
    return { ok: false, error: "Sem conexão com o sistema." } as T & { ok?: boolean; error?: string };
  }
}

/**
 * FLUXOS DE AUTOMAÇÃO (estilo N8N): a lista dos fluxos e o EDITOR visual (paleta · canvas · painel do nó), a execução no
 * navegador (a Centi responde pela extensão) com o andamento por nó e a FREQUÊNCIA — enquanto esta tela estiver aberta
 * com a extensão pronta, os fluxos ligados rodam sozinhos na hora marcada (um por vez, uma aba por fluxo).
 */
export function FluxosAutomacao({
  pedir,
  lote,
  interrompido,
  pronto,
  mapaEntidades,
  protocolos,
  importacao,
  onRodando,
}: {
  pedir: Pedir;
  lote: MutableRefObject<string | null>;
  interrompido: MutableRefObject<boolean>;
  pronto: boolean;
  mapaEntidades: Record<string, string>;
  protocolos: ProtocoloAutomacao[];
  /** O contexto da importação na Mesa (unidades, órgãos, regras, PCAs) — o nó "Importar protocolo". */
  importacao: ContextoImportacao;
  onRodando: (r: boolean) => void;
}) {
  const [fluxos, setFluxos] = useState<FluxoAutomacao[] | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const [rodando, setRodando] = useState<number | null>(null);
  const [passos, setPassos] = useState<Record<string, PassoExec>>({});
  const [resultado, setResultado] = useState<ResultadoExec | null>(null);
  const [novo, setNovo] = useState(false);
  const cancelar = useRef(false);
  const { confirmar, confirmacao } = useConfirmacao();
  useEffect(() => onRodando(rodando != null), [rodando, onRodando]);

  const carregar = useCallback(async () => {
    const r = await api<{ fluxos?: FluxoAutomacao[] }>("/api/admin/automacao/fluxos");
    if (r.ok && r.fluxos) setFluxos(r.fluxos);
    else if (!fluxos) setFluxos([]);
  }, [fluxos]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: carrega uma vez ao abrir
  useEffect(() => {
    void carregar();
  }, []);

  const emissao = useRef<ReturnType<typeof emissaoDoServidor> | null>(null);
  /** Os protocolos lidos na execução em curso (zerado a cada execução). */
  const leituras = useRef<CacheLeitura>(new Map());
  /** O resultado por protocolo do nó "Importar protocolo" (vai ao servidor → aviso no sino). */
  const relatorio = useRef<Item[]>([]);
  const host = useMemo(
    () => ({
      mapaEntidades,
      chaveOrgao: chaveOrgaoCenti,
      protocolos: protocolos as unknown as Item[],
      lerProtocolo: async (it: Item) => {
        emissao.current ??= emissaoDoServidor();
        return lerProtocoloPorCodigo(pedir as unknown as PedirExtensao, await emissao.current, it, importacao.regras, leituras.current);
      },
      importarProtocolo: async (it: Item, apontamentos: string[]) => {
        const lido = leituras.current.get(chaveLeitura(it.protocolo ?? it.numero, it.ano));
        if (!lido) return { importado: false, motivo: "O protocolo não foi lido nesta execução (ligue o nó “Ler protocolo” antes)." };
        return importarProtocolo(lido, apontamentos, importacao);
      },
      avisar: (t: string) => toast.info(t, 8000),
      relatorio: (l: Item[]) => {
        relatorio.current.push(...l);
      },
    }),
    [mapaEntidades, protocolos, pedir, importacao],
  );

  /** Executa um fluxo (o grafo passado — o do editor, mesmo sem salvar) e grava o resumo. */
  const executar = useCallback(
    async (f: Pick<FluxoAutomacao, "id" | "nome">, grafo: Grafo, agendado = false): Promise<ResultadoExec | null> => {
      if (rodando != null) return null;
      if (!pronto) {
        if (!agendado) toast.warning("A extensão da Centi não está pronta (instale, abra a Centi e entre).");
        return null;
      }
      setRodando(f.id);
      setPassos({});
      setResultado(null);
      leituras.current = new Map();
      relatorio.current = [];
      cancelar.current = false;
      interrompido.current = false;
      try {
        const l = await pedir("lote", { fase: "inicio", titulo: `Fluxo · ${f.nome}`, total: grafo.nos.length }, 8000);
        lote.current = typeof l.loteId === "string" ? l.loteId : null;
        let feitos = 0;
        const r = await executarFluxo(
          grafo,
          REGISTRO_NOS,
          { centi: (a, d, ms) => pedir(a, d, ms), api, cancelado: () => cancelar.current || interrompido.current, host },
          (p) => {
            setPassos((m) => ({ ...m, [p.no]: p }));
            if (p.estado === "ok" && lote.current) {
              feitos++;
              void pedir("lote", { fase: "passo", loteId: lote.current, feito: Math.min(feitos, grafo.nos.length), total: grafo.nos.length, texto: p.no }, 8000);
            }
          },
        );
        setResultado(r);
        if (lote.current) await pedir("lote", { fase: "fim", loteId: lote.current, resumo: r.estado === "concluido" ? "Fluxo concluído." : (r.erro ?? r.estado) }, 8000);
        const g = await api<{ fluxo?: FluxoAutomacao }>(`/api/admin/automacao/fluxos/${f.id}`, {
          method: "POST",
          body: {
            ...resumoExecucao(r),
            relatorio: relatorio.current.length
              ? relatorio.current.slice(0, 500).map((x) => ({
                  protocolo: `${String(x.protocolo ?? "")}${x.ano ? `/${String(x.ano)}` : ""}`.slice(0, 40),
                  status: x.status === "importado" ? ("importado" as const) : ("nao-importado" as const),
                  motivo: x.motivo == null ? undefined : String(x.motivo).slice(0, 300),
                  apontamentos: typeof x.apontamentos === "number" ? x.apontamentos : 0,
                }))
              : undefined,
          },
        });
        if (g.ok && g.fluxo) setFluxos((fs) => fs?.map((x) => (x.id === f.id ? { ...x, ...g.fluxo, grafo: x.grafo } : x)) ?? fs);
        const msg = `${f.nome}: ${r.estado === "concluido" ? "concluído" : r.estado === "cancelado" ? "interrompido" : `falhou — ${r.erro}`}${r.apontados.length ? ` · ${r.apontados.length} erro(s) apontado(s)` : ""}`;
        if (r.estado === "concluido" && !r.apontados.length) toast.success(msg);
        else toast.warning(msg, 12000);
        return r;
      } finally {
        leituras.current = new Map();
        lote.current = null;
        setRodando(null);
      }
    },
    [rodando, pronto, pedir, lote, interrompido, host],
  );

  // AGENDADOR: com a tela aberta e a extensão pronta, a cada minuto roda o 1º fluxo ligado cuja hora chegou.
  const executarRef = useRef(executar);
  executarRef.current = executar;
  const fluxosRef = useRef(fluxos);
  fluxosRef.current = fluxos;
  useEffect(() => {
    if (!pronto) return;
    const tique = async () => {
      if (document.visibilityState === "hidden" && !("locks" in navigator)) return;
      const agora = Date.now();
      const devido = (fluxosRef.current ?? []).find((f) => f.ativo && f.proximaEm && Date.parse(f.proximaEm) <= agora);
      if (!devido) return;
      const rodar = () => executarRef.current(devido, devido.grafo, true);
      // Uma aba por fluxo (outra aba do sistema aberta não roda o mesmo junto).
      const locks = (navigator as Navigator & { locks?: { request: (n: string, o: { ifAvailable: boolean }, cb: (l: unknown) => Promise<unknown>) => Promise<unknown> } }).locks;
      if (locks) await locks.request(`fluxo-${devido.id}`, { ifAvailable: true }, async (l) => (l ? rodar() : null));
      else await rodar();
      await carregarRef.current();
    };
    const id = window.setInterval(() => void tique(), 60_000);
    void tique();
    return () => window.clearInterval(id);
  }, [pronto]);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  async function criar(modelo: (typeof MODELOS_FLUXO)[number] | null, nome: string) {
    const r = await api<{ fluxo?: FluxoAutomacao }>("/api/admin/automacao/fluxos", { method: "POST", body: {
        nome,
        grafo: modelo?.grafo ?? GRAFO_VAZIO_COM_INICIO,
        descricao: modelo?.descricao,
        ...(modelo?.frequencia ? { frequencia: modelo.frequencia, ativo: modelo.ativo === true } : {}),
      },
    });
    if (!r.ok || !r.fluxo) return toast.error(r.error ?? "Não consegui criar o fluxo.");
    setFluxos((fs) => [r.fluxo as FluxoAutomacao, ...(fs ?? [])]);
    setNovo(false);
    setAberto(r.fluxo.id);
  }

  async function excluir(f: FluxoAutomacao) {
    if (!(await confirmar({ titulo: `Excluir o fluxo “${f.nome}”?`, texto: "Não dá para desfazer.", confirmar: "Excluir", perigo: true }))) return;
    const r = await api(`/api/admin/automacao/fluxos/${f.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error(r.error ?? "Não consegui excluir.");
    setFluxos((fs) => fs?.filter((x) => x.id !== f.id) ?? fs);
    setAberto(null);
  }

  const fluxo = fluxos?.find((f) => f.id === aberto) ?? null;
  return (
    <div className="min-w-0 lg:min-h-0">
      {fluxo ? (
        <EditorFluxo
          key={fluxo.id}
          fluxo={fluxo}
          rodando={rodando === fluxo.id}
          outroRodando={rodando != null && rodando !== fluxo.id}
          passos={rodando === fluxo.id || resultado ? passos : {}}
          resultado={resultado}
          onVoltar={() => {
            setAberto(null);
            setPassos({});
            setResultado(null);
          }}
          onSalvo={(f) => setFluxos((fs) => fs?.map((x) => (x.id === f.id ? f : x)) ?? fs)}
          onExecutar={(g) => void executar(fluxo, g)}
          onParar={() => {
            cancelar.current = true;
          }}
          onExcluir={() => void excluir(fluxo)}
        />
      ) : (
        <ListaFluxos fluxos={fluxos} rodando={rodando} onAbrir={setAberto} onNovo={() => setNovo(true)} onModelo={(m) => void criar(m, m.nome)} />
      )}
      <NovoFluxo aberto={novo} onFechar={() => setNovo(false)} onCriar={criar} />
      {confirmacao}
    </div>
  );
}

const GRAFO_VAZIO_COM_INICIO: Grafo = { ...GRAFO_VAZIO, nos: [{ id: "inicio1", tipo: "gatilho.inicio", config: {}, x: 64, y: 160 }] };

function ListaFluxos({
  fluxos,
  rodando,
  onAbrir,
  onNovo,
  onModelo,
}: {
  fluxos: FluxoAutomacao[] | null;
  rodando: number | null;
  onAbrir: (id: number) => void;
  onNovo: () => void;
  onModelo: (m: (typeof MODELOS_FLUXO)[number]) => void;
}) {
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Monte automações ligando blocos: buscar na Centi, ler protocolos, comparar, repetir até o fim e apontar erros.</p>
        <Button size="sm" icon={<IconPlus className="size-4" />} onClick={onNovo}>
          Novo fluxo
        </Button>
      </div>
      {!fluxos ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : !fluxos.length ? (
        <div className={`${CARTAO} flex flex-col items-center gap-3 py-10 text-center`}>
          <IconFluxo className="size-8 text-accent" aria-hidden="true" />
          <p className="text-sm text-muted">Nenhum fluxo ainda. Comece de um modelo pronto ou do zero.</p>
          <Button size="sm" onClick={onNovo}>
            Criar o primeiro fluxo
          </Button>
        </div>
      ) : (
        <div className="grid gap-[var(--gap-block)] [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
          {fluxos.map((f) => {
            const u = f.ultimaExecucao as { estado?: string; apontados?: number; erro?: string } | null;
            return (
              <button key={f.id} type="button" onClick={() => onAbrir(f.id)} className={`${CARTAO} flex min-h-[9rem] flex-col gap-2 text-left transition-shadow hover:shadow-soft`}>
                <div className="flex items-center gap-2">
                  <IconFluxo className="size-5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-text">{f.nome}</span>
                  {rodando === f.id ? <Badge tone="blue">Executando</Badge> : f.ativo ? <Badge tone="emerald">Agendado</Badge> : <Badge tone="slate">Manual</Badge>}
                </div>
                {f.descricao && <p className="line-clamp-2 text-xs text-muted">{f.descricao}</p>}
                <p className="mt-auto text-xs text-muted">
                  {f.grafo.nos.length} nó(s) · {rotuloFrequencia(f.frequencia)}
                  {f.ativo && f.proximaEm ? ` · próxima ${dataHoraBR(f.proximaEm)}` : ""}
                </p>
                {u?.estado && (
                  <p className={`text-xs ${u.estado === "concluido" && !u.apontados ? "text-[var(--ok)]" : "text-[var(--warn)]"}`}>
                    Última: {u.estado === "concluido" ? "concluída" : u.estado}
                    {u.apontados ? ` · ${u.apontados} erro(s) apontado(s)` : ""}
                    {f.ultimaEm ? ` · ${dataHoraBR(f.ultimaEm)}` : ""}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
      {fluxos && (
        <section className="space-y-2" aria-label="Modelos prontos">
          <h3 className="text-sm font-semibold text-text">Modelos prontos</h3>
          <div className="grid gap-[var(--gap-block)] [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
            {MODELOS_FLUXO.map((m) => {
              const criado = fluxos.find((f) => f.nome === m.nome);
              return (
                <div key={m.id} className={`${CARTAO} flex min-h-[9rem] flex-col gap-2 border-dashed`}>
                  <div className="flex items-center gap-2">
                    <IconFluxo className="size-5 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1 font-semibold text-text">{m.nome}</span>
                  </div>
                  <p className="line-clamp-3 text-xs text-muted">{m.descricao}</p>
                  <p className="text-xs text-muted">
                    {m.grafo.nos.length} nó(s) · {m.frequencia ? rotuloFrequencia(m.frequencia) : "Manual"}
                  </p>
                  <div className="mt-auto">
                    {criado ? (
                      <Button size="sm" variant="ghost" onClick={() => onAbrir(criado.id)}>
                        Já criado — abrir
                      </Button>
                    ) : (
                      <Button size="sm" icon={<IconPlus className="size-4" />} onClick={() => onModelo(m)}>
                        Usar este modelo
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function NovoFluxo({ aberto, onFechar, onCriar }: { aberto: boolean; onFechar: () => void; onCriar: (m: (typeof MODELOS_FLUXO)[number] | null, nome: string) => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [modelo, setModelo] = useState<string>("");
  const [criando, setCriando] = useState(false);
  const m = MODELOS_FLUXO.find((x) => x.id === modelo) ?? null;
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      titulo="Novo fluxo"
      rodape={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            size="sm"
            loading={criando}
            disabled={!(nome.trim() || m)}
            onClick={async () => {
              setCriando(true);
              await onCriar(m, nome.trim() || m?.nome || "Fluxo");
              setCriando(false);
              setNome("");
              setModelo("");
            }}
          >
            Criar
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <TextField label="Nome" value={nome} maxLength={80} placeholder={m?.nome ?? "Ex.: Conferir execução dos DFDs"} onChange={(e) => setNome(e.target.value)} />
        <p className="text-sm font-medium text-text">Começar de</p>
        <div className="grid gap-2">
          {[{ id: "", nome: "Em branco", descricao: "Só o Início — monte do zero." }, ...MODELOS_FLUXO].map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setModelo(x.id)}
              className={`rounded-card border p-3 text-left ${modelo === x.id ? "border-accent bg-[var(--accent-soft)]" : "border-border"}`}
            >
              <span className="block text-sm font-semibold text-text">{x.nome}</span>
              <span className="block text-xs text-muted">{x.descricao}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function EditorFluxo({
  fluxo,
  rodando,
  outroRodando,
  passos,
  resultado,
  onVoltar,
  onSalvo,
  onExecutar,
  onParar,
  onExcluir,
}: {
  fluxo: FluxoAutomacao;
  rodando: boolean;
  outroRodando: boolean;
  passos: Record<string, PassoExec>;
  resultado: ResultadoExec | null;
  onVoltar: () => void;
  onSalvo: (f: FluxoAutomacao) => void;
  onExecutar: (g: Grafo) => void;
  onParar: () => void;
  onExcluir: () => void;
}) {
  const [grafo, setGrafo] = useState<Grafo>(fluxo.grafo);
  const [nome, setNome] = useState(fluxo.nome);
  const [freq, setFreq] = useState<Frequencia>(fluxo.frequencia);
  const [ativo, setAtivo] = useState(fluxo.ativo);
  const [sel, setSel] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>({ x: 40, y: 20, z: 0.9 });
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [painel, setPainel] = useState<"no" | "relatorio">("no");
  const sujo =
    JSON.stringify(grafo) !== JSON.stringify(fluxo.grafo) || nome.trim() !== fluxo.nome || JSON.stringify(freq) !== JSON.stringify(fluxo.frequencia) || ativo !== fluxo.ativo;
  const problemas = useMemo(() => validarGrafo(grafo, REGISTRO_NOS), [grafo]);
  const erros = problemas.filter((p) => p.nivel === "erro");
  const ref = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState(560);
  useEffect(() => {
    const calc = () => {
      const t = ref.current?.getBoundingClientRect().top ?? 0;
      setAltura(Math.max(420, window.innerHeight - t - 24));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  useEffect(() => {
    if (resultado?.apontados.length || resultado?.estado === "falhou") setPainel("relatorio");
    if (resultado?.noErro) setSel(resultado.noErro);
  }, [resultado]);
  // Avisa ao sair com alteração não salva.
  useEffect(() => {
    if (!sujo) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [sujo]);

  const adicionar = (tipo: string, x?: number, y?: number) => {
    const def = REGISTRO_NOS.get(tipo);
    if (!def) return;
    if (def.unico && grafo.nos.some((n) => n.tipo === tipo)) return toast.warning(`Só pode haver um “${def.rotulo}”.`);
    const id = novoIdNo(grafo, tipo);
    const cx = x ?? Math.round((-vista.x + 320) / vista.z / 16) * 16;
    const cy = y ?? Math.round((-vista.y + altura / 2 - 40) / vista.z / 16) * 16;
    const n: NoFluxo = { id, tipo, config: Object.fromEntries(def.campos.filter((c) => c.padrao !== undefined).map((c) => [c.chave, c.padrao])), x: cx, y: cy };
    // Liga sozinho ao nó marcado (a 1ª saída → a 1ª entrada), como o "+" do N8N.
    const anterior = sel ? grafo.nos.find((m) => m.id === sel) : null;
    const dAnt = anterior ? REGISTRO_NOS.get(anterior.tipo) : null;
    const liga = anterior && dAnt?.saidas.length && def.entradas.length ? [{ de: anterior.id, saida: dAnt.saidas[0], para: id, entrada: def.entradas[0] }] : [];
    if (anterior && x == null) {
      n.x = anterior.x + LARGURA_NO + 64;
      n.y = anterior.y;
    }
    setGrafo({ ...grafo, nos: [...grafo.nos, n], conexoes: [...grafo.conexoes, ...liga] });
    setSel(id);
    setPainel("no");
  };

  async function salvar() {
    setSalvando(true);
    const r = await api<{ fluxo?: FluxoAutomacao }>(`/api/admin/automacao/fluxos/${fluxo.id}`, {
      method: "PATCH",
      body: { nome: nome.trim() || fluxo.nome, grafo, frequencia: freq, ativo },
    });
    setSalvando(false);
    if (!r.ok || !r.fluxo) return toast.error(r.error ?? "Não consegui salvar.");
    onSalvo({ ...r.fluxo, grafo: lerGrafo(r.fluxo.grafo), frequencia: lerFrequencia(r.fluxo.frequencia) });
    setGrafo(lerGrafo(r.fluxo.grafo));
    toast.success("Fluxo salvo.");
  }

  // Os dados buscados pelos nós ANTES do marcado (o seletor de campos do painel).
  const caminhos = useMemo(() => {
    if (!sel) return [];
    const antes = new Set<string>();
    const fila = [sel];
    while (fila.length) {
      const id = fila.shift() as string;
      for (const c of grafo.conexoes) if (c.para === id && !antes.has(c.de)) {
        antes.add(c.de);
        fila.push(c.de);
      }
    }
    const itens: Item[] = [];
    for (const id of antes) for (const l of Object.values(passos[id]?.amostra ?? {})) itens.push(...l.slice(0, 5));
    return caminhosDosItens(itens, 120);
  }, [sel, grafo.conexoes, passos]);

  const noSel = grafo.nos.find((n) => n.id === sel) ?? null;
  const enquadrar = () => {
    if (!grafo.nos.length) return setVista({ x: 40, y: 20, z: 0.9 });
    const xs = grafo.nos.map((n) => n.x);
    const ys = grafo.nos.map((n) => n.y);
    const w = Math.max(...xs) - Math.min(...xs) + LARGURA_NO + 80;
    const h = Math.max(...ys) - Math.min(...ys) + 200;
    const larg = ref.current?.clientWidth ?? 800;
    const z = Math.min(1.2, Math.max(0.3, Math.min(larg / w, altura / h)));
    setVista({ z, x: -Math.min(...xs) * z + 40, y: -Math.min(...ys) * z + 40 });
  };
  const filtradas = NOS_POR_CATEGORIA.map((c) => ({
    ...c,
    nos: c.nos.filter((n) => !busca.trim() || `${n.rotulo} ${n.descricao}`.toLowerCase().includes(busca.trim().toLowerCase())),
  })).filter((c) => c.nos.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="icon" aria-label="Voltar aos fluxos" title="Voltar aos fluxos" onClick={onVoltar}>
          <IconChevronLeft className="size-4" />
        </Button>
        <input
          aria-label="Nome do fluxo"
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
          className="min-w-0 flex-1 rounded-control bg-transparent px-2 py-1 text-base font-semibold text-text outline-none hover:bg-[var(--accent-soft)] focus:bg-surface focus:shadow-ring"
        />
        <SelectField
          compacto
          label="Frequência"
          value={freq.tipo}
          onChange={(e) => setFreq(lerFrequencia({ ...freq, tipo: e.target.value }))}
        >
          <option value="manual">Manual</option>
          <option value="intervalo">A cada N minutos</option>
          <option value="diario">Diário</option>
          <option value="semanal">Semanal</option>
          <option value="mensal">Mensal</option>
        </SelectField>
        <EditorFrequencia freq={freq} onFreq={setFreq} />
        {freq.tipo !== "manual" && <Switch checked={ativo} onChange={setAtivo} label="Agendar" dica="Roda sozinho na hora marcada (com esta tela aberta e a extensão pronta)" />}
        {erros.length > 0 && (
          <span title={erros.map((p) => p.texto).join("\n")}>
            <Badge tone="red">{erros.length} problema(s)</Badge>
          </span>
        )}
        <Button size="sm" variant="ghost" icon={<IconSave className="size-4" />} disabled={!sujo || rodando} loading={salvando} onClick={() => void salvar()}>
          Salvar
        </Button>
        {rodando ? (
          <Button size="sm" variant="danger" icon={<IconParar className="size-4" />} onClick={onParar}>
            Parar
          </Button>
        ) : (
          <Button
            size="sm"
            icon={<IconPlay className="size-4" />}
            disabled={outroRodando || erros.length > 0}
            title={erros.length ? erros[0].texto : outroRodando ? "Outro fluxo está rodando" : "Executar agora (sem precisar salvar)"}
            onClick={() => onExecutar(grafo)}
          >
            Executar
          </Button>
        )}
        <Button size="sm" variant="icon" aria-label="Excluir o fluxo" title="Excluir o fluxo" disabled={rodando} onClick={onExcluir}>
          <IconTrash className="size-4" />
        </Button>
      </div>
      {freq.tipo !== "manual" && (
        <p className="text-xs text-muted">
          {rotuloFrequencia(freq)} · {ativo ? `próxima: ${(() => {
            const p = proximaExecucao(freq, new Date());
            return p ? dataHoraBR(p) : "—";
          })()}` : "agendamento desligado"} · roda com esta tela aberta e a extensão pronta.
        </p>
      )}
      <div ref={ref} className="grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)_20rem]" style={{ minHeight: altura }}>
        <aside className={`${CARTAO} flex min-h-0 flex-col gap-2 overflow-hidden lg:h-[var(--h)]`} style={{ "--h": `${altura}px` } as React.CSSProperties}>
          <SearchField compacto placeholder="Buscar bloco" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar bloco" />
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {filtradas.map((c) => (
              <div key={c.valor}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{c.rotulo}</p>
                <div className="space-y-1">
                  {c.nos.map((n) => (
                    <button
                      key={n.tipo}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-fluxo-no", n.tipo);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => adicionar(n.tipo)}
                      title={`${n.descricao} — toque para acrescentar (ligado ao nó marcado) ou arraste para o quadro`}
                      className="flex min-h-11 w-full items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-[var(--accent-soft)] lg:min-h-0"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-white" style={{ background: c.cor }}>
                        <IconeNo nome={n.icone} className="size-3.5" />
                      </span>
                      <span className="min-w-0 truncate text-[13px] text-text">{n.rotulo}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
        <CanvasFluxo
          grafo={grafo}
          registro={REGISTRO_NOS}
          selecionado={sel}
          onSelecionar={(id) => {
            setSel(id);
            if (id) setPainel("no");
          }}
          onMudar={setGrafo}
          passos={passos}
          somenteLeitura={rodando}
          onSoltarTipo={(t, x, y) => adicionar(t, x, y)}
          vista={vista}
          onVista={setVista}
          altura={altura}
          extra={
            <div className="absolute bottom-3 left-3 flex gap-1 rounded-control border border-border bg-surface p-1 shadow-soft">
              <Button size="xs" variant="icon" aria-label="Afastar" onClick={() => setVista((v) => ({ ...v, z: Math.max(0.3, v.z / 1.2) }))}>
                <IconMinus className="size-4" />
              </Button>
              <Button size="xs" variant="icon" aria-label="Aproximar" onClick={() => setVista((v) => ({ ...v, z: Math.min(1.8, v.z * 1.2) }))}>
                <IconPlus className="size-4" />
              </Button>
              <Button size="xs" variant="icon" aria-label="Enquadrar tudo" title="Enquadrar tudo" onClick={enquadrar}>
                <IconEnquadrar className="size-4" />
              </Button>
            </div>
          }
        />
        <aside className={`${CARTAO} flex min-h-[20rem] flex-col gap-3 overflow-hidden lg:h-[var(--h)]`} style={{ "--h": `${altura}px` } as React.CSSProperties}>
          {resultado && (
            <div className="flex gap-1">
              <Button size="xs" variant={painel === "no" ? "primary" : "ghost"} onClick={() => setPainel("no")}>
                Nó
              </Button>
              <Button size="xs" variant={painel === "relatorio" ? "primary" : "ghost"} onClick={() => setPainel("relatorio")}>
                Relatório{resultado.apontados.length ? ` (${resultado.apontados.length})` : ""}
              </Button>
            </div>
          )}
          {painel === "relatorio" && resultado ? (
            <RelatorioExecucao resultado={resultado} onIr={(id) => {
              setSel(id);
              setPainel("no");
            }} />
          ) : noSel ? (
            <PainelNo
              key={noSel.id}
              no={noSel}
              def={REGISTRO_NOS.get(noSel.tipo)}
              passo={passos[noSel.id]}
              caminhos={caminhos}
              somenteLeitura={rodando}
              onMudar={(n) => setGrafo((g) => ({ ...g, nos: g.nos.map((x) => (x.id === n.id ? n : x)) }))}
              onExcluir={() => {
                setGrafo((g) => ({ ...g, nos: g.nos.filter((x) => x.id !== noSel.id), conexoes: g.conexoes.filter((c) => c.de !== noSel.id && c.para !== noSel.id) }));
                setSel(null);
              }}
            />
          ) : (
            <div className="space-y-3 text-sm text-muted">
              <p className="font-semibold text-text">Como montar</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Toque num bloco à esquerda: ele entra ligado ao nó marcado.</li>
                <li>Arraste de uma saída (●) até uma entrada para ligar; toque na linha e Delete para desligar.</li>
                <li>Laço: ligue o fim do corpo à entrada “Volta” — repete até acabar.</li>
                <li>Toda caixa tem a saída vermelha “erro”: ligue-a a “Apontar erros” para seguir mesmo com falha.</li>
                <li>Nos campos, use {"{{campo}}"} para pegar um dado do item.</li>
              </ul>
              {problemas.length > 0 && (
                <Callout kind={erros.length ? "danger" : "warn"}>
<strong className="block">{"Antes de executar"}</strong>
                  <ul className="list-disc pl-4">
                    {problemas.slice(0, 8).map((p, i) => (
                      <li key={i}>{p.texto}</li>
                    ))}
                  </ul>
                </Callout>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function EditorFrequencia({ freq, onFreq }: { freq: Frequencia; onFreq: (f: Frequencia) => void }) {
  if (freq.tipo === "manual") return null;
  if (freq.tipo === "intervalo")
    return (
      <SelectField compacto label="A cada" value={String(freq.minutos)} onChange={(e) => onFreq({ tipo: "intervalo", minutos: Number(e.target.value) })}>
        {[5, 10, 15, 30, 60, 120, 240, 360, 720, 1440].map((m) => (
          <option key={m} value={m}>
            {m < 60 ? `${m} min` : `${m / 60} h`}
          </option>
        ))}
      </SelectField>
    );
  const hora = (
    <input
      type="time"
      aria-label="Hora"
      value={freq.hora}
      onChange={(e) => onFreq(lerFrequencia({ ...freq, hora: e.target.value }))}
      className="h-11 rounded-control border border-border bg-surface px-2 text-sm text-text lg:h-[var(--h-control-sm)]"
    />
  );
  if (freq.tipo === "diario")
    return (
      <>
        {hora}
        <Switch checked={!!freq.diasUteis} onChange={(v) => onFreq({ ...freq, diasUteis: v || undefined })} label="Só dias úteis" />
      </>
    );
  if (freq.tipo === "mensal")
    return (
      <>
        <SelectField compacto label="Dia" value={String(freq.dia)} onChange={(e) => onFreq({ ...freq, dia: Number(e.target.value) })}>
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </SelectField>
        {hora}
      </>
    );
  const dias = ["D", "S", "T", "Q", "Q", "S", "S"];
  return (
    <>
      <fieldset className="flex gap-1" aria-label="Dias da semana">
        {dias.map((d, i) => {
          const on = freq.dias.includes(i);
          return (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              onClick={() => onFreq(lerFrequencia({ ...freq, dias: on ? freq.dias.filter((x) => x !== i) : [...freq.dias, i] }))}
              className={`size-11 rounded-full text-xs font-semibold lg:size-8 ${on ? "bg-accent text-white" : "border border-border text-muted"}`}
            >
              {d}
            </button>
          );
        })}
      </fieldset>
      {hora}
    </>
  );
}

function RelatorioExecucao({ resultado: r, onIr }: { resultado: ResultadoExec; onIr: (no: string) => void }) {
  const ps = Object.values(r.passos);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      <Callout kind={r.estado === "concluido" ? (r.apontados.length ? "warn" : "ok") : r.estado === "cancelado" ? "warn" : "danger"}>
<strong className="block">{r.estado === "concluido" ? "Concluído" : r.estado === "cancelado" ? "Interrompido" : "Falhou"}</strong>
        {r.erro ?? `${ps.filter((p) => p.estado === "ok").length} nó(s) executado(s) · ${r.apontados.length} erro(s) apontado(s)`}
        {r.noErro && (
          <Button size="xs" variant="ghost" onClick={() => onIr(r.noErro as string)}>
            Ver o nó
          </Button>
        )}
      </Callout>
      {r.apontados.length > 0 && (
        <ul className="space-y-1">
          {r.apontados.slice(0, 300).map((a, i) => (
            <li
              key={i}
              className={`rounded-control border-l-4 bg-[var(--accent-soft)] px-2 py-1 text-xs text-text ${a.nivel === "atencao" ? "border-[var(--warn)]" : "border-[var(--danger)]"}`}
            >
              {String(a.mensagem ?? "")}
            </li>
          ))}
          {r.apontados.length > 300 && <li className="text-xs text-muted">e mais {r.apontados.length - 300}…</li>}
        </ul>
      )}
    </div>
  );
}
