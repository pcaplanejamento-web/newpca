"use client";

import { type MutableRefObject, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { chaveOrgaoCenti, type ProtocoloAutomacao } from "@/lib/automacao-centi-core";
import type { PedirExtensao } from "@/lib/arquivo-navegador";
import { dataHoraBR } from "@/lib/format";
import {
  ajudaVazia,
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
import { type CacheLeitura, chaveLeitura, emissaoDoServidor, lerDfdCentiPorCodigo, lerProtocoloPorCodigo } from "@/lib/fluxo-navegador";
import { type ContextoImportacao, importarProtocolo } from "@/lib/importar-protocolo-auto";
import { type FluxoFilho, NOS_POR_CATEGORIA, type ProgressoHost, REGISTRO_NOS } from "@/lib/fluxo-nos";
import { grafoDoModelo, MODELOS_FLUXO, type ModeloFluxo } from "@/lib/fluxo-modelos";
import type { FluxoAutomacao } from "@/lib/fluxos";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Callout } from "../Callout";
import { useConfirmacao } from "../Confirmacao";
import { SearchField, SelectField, TextField } from "../Field";
import { IconChevronLeft, IconClose, IconEnquadrar, IconFluxo, IconMinus, IconOrganizar, IconParar, IconPlay, IconPlus, IconSave, IconSettings, IconTrash, IconClipboard } from "../icons";
import { JanelaFlutuante } from "../JanelaFlutuante";
import { Modal } from "../Modal";
import { useNaTela, useTrabalhoSegundoPlano } from "../SegundoPlano";
import { Switch } from "../Switch";
import { toast } from "../Toast";
import { alturaNo, CanvasFluxo, LARGURA_NO, type Vista } from "./CanvasFluxo";
import { organizarGrafo } from "@/lib/fluxo-layout";
import { AjudaNo } from "./AjudaNo";
import { IconeNo } from "./IconeNo";
import { Ajuda } from "../Ajuda";
import { useAlturaTela } from "../AlturaCheia";
import { SkeletonCartao } from "../Skeleton";
import { CartaoFluxo, GRADE_CARTOES, LARGURA_CARTAO } from "./CartaoFluxo";
import { AjudaDoFluxo, ConfigFluxo } from "./ConfigFluxo";
import { PainelFluxo } from "./PainelFluxo";
import { PainelNo } from "./PainelNo";
import { type HostPainel, HostPainelCtx } from "./paineis";
import { ProtocoloUploadForm } from "../ProtocoloUploadForm";
import { CartaoPreso } from "../ArrastoCartoes";
import { tokenPx } from "../espacamento";
import { duracaoMotionMs } from "../Modal";
import { SombraGrade, useArrastoGrade } from "../PastasQuadros";
import type { GestaoAutomacao } from "../automacao/ProtocolosAutomacao";
import { type ContextoEmissor, executarDfds, type LinhaDfd, opcoesDoNo, type PastaDestino, planoDosItens, testarAnexo } from "@/lib/automacao-dfds-motor";

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
  emissor,
  atual,
  protocolos,
  gestao,
  importacao,
  onAbrirProtocolo,
  onRodando,
  novo: pedidoNovo,
  onEditor,
}: {
  pedir: Pedir;
  lote: MutableRefObject<string | null>;
  interrompido: MutableRefObject<boolean>;
  pronto: boolean;
  /** O emissor de DFDs (a configuração e o mapa órgão → entidade da Centi — os mesmos dos Ajustes). */
  emissor: ContextoEmissor;
  /** A entidade aberta na Centi agora. */
  atual: string | null;
  protocolos: ProtocoloAutomacao[];
  gestao: GestaoAutomacao;
  /** O contexto da importação na Mesa (unidades, órgãos, regras, PCAs) — "Importar protocolo" e a análise completa. */
  importacao: ContextoImportacao;
  onAbrirProtocolo: (id: number) => void;
  onRodando: (r: boolean) => void;
  /** Cada valor novo abre o "Novo fluxo" (o botão do cabeçalho da Automação). */
  novo: number;
  /** Avisa quando um fluxo está aberto (o cabeçalho esconde o "Novo fluxo"). */
  onEditor: (aberto: boolean) => void;
}) {
  const [fluxos, setFluxos] = useState<FluxoAutomacao[] | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const [rodando, setRodando] = useState<number | null>(null);
  const [passos, setPassos] = useState<Record<string, PassoExec>>({});
  const [resultado, setResultado] = useState<ResultadoExec | null>(null);
  const [novo, setNovo] = useState(false);
  const cancelar = useRef(false);
  /** O fluxo da última execução (os passos/resultado mostrados são dele) e o que está acontecendo agora. */
  const [exec, setExec] = useState<{ id: number; nome: string; total: number } | null>(null);
  const [agora, setAgora] = useState("");
  /** FILA: executar com outro fluxo rodando o põe aqui (roda em seguida, na ordem). */
  const fila = useRef<{ f: Pick<FluxoAutomacao, "id" | "nome">; grafo: Grafo }[]>([]);
  const [naFila, setNaFila] = useState(0);
  const rodandoRef = useRef<number | null>(null);
  useEffect(() => onRodando(rodando != null || naFila > 0), [rodando, naFila, onRodando]);
  // O andamento vai ao painel de SEGUNDO PLANO (minimizado fora desta tela; "Detalhes" volta ao fluxo).
  const emCurso = rodando != null;
  useTrabalhoSegundoPlano(
    exec
      ? {
          id: `fluxo-${exec.id}`,
          titulo: exec.nome,
          estado: emCurso ? "rodando" : (resultado?.estado ?? "concluido"),
          feito: Object.values(passos).filter((p) => p.estado === "ok").length,
          total: exec.total,
          texto: emCurso
            ? `${agora}${naFila ? `${agora ? " · " : ""}${naFila} na fila` : ""}`
            : resultado?.estado === "falhou"
              ? resultado.erro
              : resultado?.apontados.length
                ? `${resultado.apontados.length} erro(s) apontado(s)`
                : undefined,
          rota: "/painel/automacao",
          onAbrir: () => {
            setNovo(false);
            setAberto(exec.id);
          },
          onParar: () => {
            cancelar.current = true;
          },
        }
      : null,
  );
  useEffect(() => onEditor(aberto != null), [aberto, onEditor]);
  useEffect(() => {
    // O "+" do cabeçalho ALTERNA o painel (aberto, fecha).
    if (pedidoNovo > 0) {
      setAberto(null);
      setNovo((v) => !v);
    }
  }, [pedidoNovo]);

  const carregar = useCallback(async () => {
    const r = await api<{ fluxos?: FluxoAutomacao[]; ordem?: number[] }>("/api/admin/automacao/fluxos");
    if (r.ok && r.fluxos) setFluxos(naOrdem(r.fluxos, r.ordem ?? []));
    else if (!fluxos) setFluxos([]);
  }, [fluxos]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: carrega uma vez ao abrir
  useEffect(() => {
    void carregar();
  }, []);

  // O que o PAINEL mostra: a saída completa de cada nó, os itens processados AO VIVO, os DFDs do Baixar/anexar.
  const [saidas, setSaidas] = useState<Record<string, Item[]>>({});
  const [parciais, setParciais] = useState<Record<string, Item[]>>({});
  const [dfds, setDfds] = useState<LinhaDfd[] | null>(null);
  const [pasta, setPasta] = useState<PastaDestino | null>(null);
  const [podePasta, setPodePasta] = useState(false);
  useEffect(() => setPodePasta("showDirectoryPicker" in window), []);
  const pastaRef = useRef(pasta);
  pastaRef.current = pasta;
  const atualRef = useRef(atual);
  atualRef.current = atual;
  const arquivos = useRef(new Map<string, File>());
  const [analise, setAnalise] = useState<{ file: File; n: number } | null>(null);
  const [naCenti, setNaCenti] = useState<Map<number, number>>(new Map());
  const [reps, setReps] = useState<{ lista: string[] | null; buscando: boolean }>({ lista: null, buscando: false });
  const buscarReparticoes = useCallback(async () => {
    setReps((r) => ({ ...r, buscando: true }));
    const r = await pedir("reparticoesApi", null, 30_000);
    const lista = Array.isArray(r.departamentos) ? r.departamentos.filter((d): d is string => typeof d === "string" && !!d.trim()) : null;
    setReps({ lista: lista ?? null, buscando: false });
    if (!r.ok) toast.error(r.erro ?? "A extensão não respondeu.");
  }, [pedir]);
  // "Na Centi": quantos documentos o sistema registrou como anexados em cada protocolo.
  const carregarNaCenti = useCallback(async () => {
    const ids = protocolos.map((p) => p.id).slice(0, 2000);
    if (!ids.length) return;
    const j = await api<{ registros?: { protocoloId: number | null }[] }>(`/api/admin/automacao/registros?protocolos=${ids.join(",")}`);
    if (!j.ok) return;
    const m = new Map<number, number>();
    for (const x of j.registros ?? []) if (x.protocoloId != null) m.set(x.protocoloId, (m.get(x.protocoloId) ?? 0) + 1);
    setNaCenti(m);
  }, [protocolos]);
  useEffect(() => {
    void carregarNaCenti();
  }, [carregarNaCenti]);
  const emissao = useRef<ReturnType<typeof emissaoDoServidor> | null>(null);
  /** Os protocolos lidos na execução em curso (zerado a cada execução). */
  const leituras = useRef<CacheLeitura>(new Map());
  /** O resultado por protocolo do nó "Importar protocolo" (vai ao servidor → aviso no sino). */
  const relatorio = useRef<Item[]>([]);
  const { confirmar, confirmacao } = useConfirmacao();
  const host = useMemo(
    () => ({
      get mapaEntidades() {
        return { ...emissor.mapa(), ...emissor.cadastradas() };
      },
      chaveOrgao: chaveOrgaoCenti,
      protocolos: protocolos as unknown as Item[],
      lerProtocolo: async (it: Item) => {
        emissao.current ??= emissaoDoServidor();
        return lerProtocoloPorCodigo(pedir as unknown as PedirExtensao, await emissao.current, it, importacao.regras, leituras.current, arquivos.current);
      },
      // O "Baixar/anexar DFDs": o MESMO motor da emissão (entidade do órgão, conferência, destinos, anexo autorizado).
      baixarDfds: async (itens: Item[], config: Record<string, unknown>) => {
        const { saida, alvo, erroAlvo } = opcoesDoNo(config);
        if (erroAlvo) return { linhas: [], erro: erroAlvo };
        const plano = planoDosItens(itens, saida, protocolos);
        if (!plano.arquivos.length) return { linhas: plano.previa as unknown as Item[], erro: "Nenhum DFD com nº de planejamento para emitir." };
        if (saida.destino === "pasta" && saida.escolherPasta && podePasta && !pastaRef.current) return { linhas: [], erro: "Escolha a pasta de destino (na aba DFDs do painel)." };
        let linhas = plano.previa;
        const aplicar = (f: (l: LinhaDfd) => Partial<LinhaDfd> | null) => {
          linhas = linhas.map((l) => {
            const x = f(l);
            return x ? { ...l, ...x } : l;
          });
          setDfds(linhas);
        };
        setDfds(linhas);
        await executarDfds(plano.arquivos, saida, alvo, {
          ...emissor,
          lote,
          interrompido: () => interrompido.current || cancelar.current,
          atual: atualRef.current,
          confirmar: (texto) => confirmar({ titulo: "A Centi pede confirmação", texto, confirmar: "Confirmar e anexar" }),
          pasta: pastaRef.current,
          protocolos,
          marcar: (chave, l) => aplicar((x) => (x.chave === chave ? l : null)),
          marcarVarias: aplicar,
        });
        if (saida.destino !== "pasta") void carregarNaCenti();
        return { linhas: linhas as unknown as Item[] };
      },
      importarProtocolo: async (it: Item, apontamentos: string[]) => {
        const lido = leituras.current.get(chaveLeitura(it.protocolo ?? it.numero, it.ano));
        if (!lido) return { importado: false, motivo: "O protocolo não foi lido nesta execução (ligue o nó “Ler protocolo” antes)." };
        return importarProtocolo(lido, apontamentos, importacao);
      },
      lerDfdCenti: (plan: string, entidade?: string, pdf?: boolean) => lerDfdCentiPorCodigo(emissor, plan, entidade, pdf !== false),
      avisar: (t: string) => toast.info(t, 8000),
      relatorio: (l: Item[]) => {
        relatorio.current.push(...l);
      },
    }),
    [emissor, protocolos, pedir, importacao, podePasta, lote, interrompido, confirmar, carregarNaCenti],
  );

  /** Executa um fluxo (o grafo passado — o do editor, mesmo sem salvar) e grava o resumo. */
  const executar = useCallback(
    async (f: Pick<FluxoAutomacao, "id" | "nome">, grafo: Grafo, agendado = false): Promise<ResultadoExec | null> => {
      if (rodandoRef.current != null) {
        if (rodandoRef.current === f.id || fila.current.some((x) => x.f.id === f.id)) return null;
        fila.current.push({ f, grafo });
        setNaFila(fila.current.length);
        if (!agendado) toast.info(`${f.nome}: na fila — roda quando o fluxo atual terminar.`);
        return null;
      }
      if (!pronto) {
        if (!agendado) toast.warning("A extensão da Centi não está pronta (instale, abra a Centi e entre).");
        return null;
      }
      rodandoRef.current = f.id;
      setRodando(f.id);
      setExec({ id: f.id, nome: f.nome, total: grafo.nos.length });
      setAgora("");
      setPassos({});
      setResultado(null);
      setSaidas({});
      setParciais({});
      setDfds(null);
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
          {
            centi: (a, d, ms) => pedir(a, d, ms),
            api,
            cancelado: () => cancelar.current || interrompido.current,
            // Por execução: o cache compartilhado com os subfluxos, os fluxos salvos (lidos UMA vez) e a retomada deste fluxo.
            host: { ...host, __cache: new Map<string, unknown>(), carregarFluxo: carregadorDeFluxos(), progresso: progressoDe(f.id) },
            // A saída COMPLETA de cada nó (o corpo de um laço roda várias vezes: acumula) e os itens AO VIVO.
            aoConcluir: (no, ps) => {
              const its = Object.entries(ps).find(([k, v]) => k !== "__apontados" && k !== "__retorno" && k !== "erro" && v.length)?.[1] ?? [];
              setSaidas((m) => ({ ...m, [no]: [...(m[no] ?? []), ...its] }));
            },
            aoParcial: (no, its) => setParciais((m) => ({ ...m, [no]: [...(m[no] ?? []), ...its] })),
          },
          (p) => {
            setPassos((m) => ({ ...m, [p.no]: p }));
            if (p.aviso) setAgora(p.aviso);
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
        rodandoRef.current = null;
        setRodando(null);
        // O próximo da fila (no próximo tique — o estado desta execução já assentou).
        const prox = fila.current.shift();
        setNaFila(fila.current.length);
        if (prox) window.setTimeout(() => void executarRef.current(prox.f, prox.grafo), 0);
      }
    },
    [pronto, pedir, lote, interrompido, host],
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

  /** Regrava um fluxo salvo com o grafo e a descrição do modelo (o "Atualizar pelo modelo"). */
  async function regravar(f: FluxoAutomacao, grafo: Grafo, m: ModeloFluxo): Promise<boolean> {
    const r = await api<{ fluxo?: FluxoAutomacao }>(`/api/admin/automacao/fluxos/${f.id}`, { method: "PATCH", body: { grafo, descricao: m.descricao, ajuda: m.ajuda } });
    if (!r.ok || !r.fluxo) {
      toast.error(r.error ?? `Não consegui atualizar “${f.nome}”.`);
      return false;
    }
    const novo = { ...r.fluxo, grafo: lerGrafo(r.fluxo.grafo), frequencia: lerFrequencia(r.fluxo.frequencia) };
    setFluxos((fs) => fs?.map((x) => (x.id === novo.id ? novo : x)) ?? fs);
    return true;
  }

  async function criar(modelo: (typeof MODELOS_FLUXO)[number] | null, nome: string, opcoes?: { antesDe?: number | null; atualizar?: boolean }) {
    // Os modelos usados DENTRO deste: reaproveita o fluxo já criado (pelo nome do modelo) ou cria antes. Com `atualizar`,
    // o já criado é REGRAVADO com o modelo atual (o fluxo antigo passa a funcionar como o modelo de hoje).
    const criados = new Map<string, number>();
    for (const dep of modelo?.dependencias ?? []) {
      const md = MODELOS_FLUXO.find((x) => x.id === dep);
      if (!md) continue;
      const existe = (fluxos ?? []).find((f) => f.nome === md.nome);
      if (existe) {
        if (opcoes?.atualizar && !(await regravar(existe, organizarGrafo(grafoDoModelo(md, criados), REGISTRO_NOS), md))) return;
        criados.set(dep, existe.id);
        continue;
      }
      const rd = await api<{ fluxo?: FluxoAutomacao }>("/api/admin/automacao/fluxos", { method: "POST", body: { nome: md.nome, grafo: organizarGrafo(grafoDoModelo(md, criados), REGISTRO_NOS), descricao: md.descricao, ajuda: md.ajuda } });
      if (!rd.ok || !rd.fluxo) return toast.error(rd.error ?? `Não consegui criar “${md.nome}”.`);
      const novoDep = rd.fluxo;
      criados.set(dep, novoDep.id);
      setFluxos((fs) => [novoDep, ...(fs ?? [])]);
    }
    const existente = opcoes?.atualizar && modelo ? (fluxos ?? []).find((f) => f.nome === modelo.nome) : undefined;
    if (existente && modelo) {
      if (!(await regravar(existente, organizarGrafo(grafoDoModelo(modelo, criados), REGISTRO_NOS), modelo))) return;
      toast.success(`“${existente.nome}” atualizado pelo modelo.`);
      setNovo(false);
      setAberto(existente.id);
      return;
    }
    const r = await api<{ fluxo?: FluxoAutomacao }>("/api/admin/automacao/fluxos", { method: "POST", body: {
        nome,
        grafo: modelo ? organizarGrafo(grafoDoModelo(modelo, criados), REGISTRO_NOS) : GRAFO_VAZIO_COM_INICIO,
        descricao: modelo?.descricao,
        ajuda: modelo?.ajuda,
        ...(modelo?.frequencia ? { frequencia: modelo.frequencia, ativo: modelo.ativo === true } : {}),
      },
    });
    if (!r.ok || !r.fluxo) return toast.error(r.error ?? "Não consegui criar o fluxo.");
    const criado = r.fluxo;
    // Solto na lista (arrastado do painel): entra NAQUELE lugar e a lista segue à vista; senão, abre o fluxo.
    if (opcoes && "antesDe" in opcoes && opcoes.antesDe !== undefined) {
      setFluxos((fs) => {
        const lista = fs ?? [];
        const i = opcoes.antesDe == null ? lista.length : Math.max(0, lista.findIndex((f) => f.id === opcoes.antesDe));
        const nova = [...lista.slice(0, i), criado, ...lista.slice(i)];
        salvarOrdem(nova);
        return nova;
      });
      return toast.success(`“${criado.nome}” criado.`);
    }
    setFluxos((fs) => [criado, ...(fs ?? [])]);
    setNovo(false);
    setAberto(criado.id);
  }

  async function excluir(f: FluxoAutomacao) {
    if (!(await confirmar({ titulo: `Excluir o fluxo “${f.nome}”?`, texto: "Não dá para desfazer.", confirmar: "Excluir", perigo: true }))) return;
    const r = await api(`/api/admin/automacao/fluxos/${f.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error(r.error ?? "Não consegui excluir.");
    setFluxos((fs) => fs?.filter((x) => x.id !== f.id) ?? fs);
    setAberto(null);
  }

  const fluxo = fluxos?.find((f) => f.id === aberto) ?? null;
  // A ANÁLISE COMPLETA de um protocolo lido (a mesma da importação): o PDF da memória ou lido de novo.
  const abrirAnalise = useCallback(
    async (it: Item) => {
      const k = chaveLeitura(it.protocolo ?? it.numero, it.ano);
      if (!arquivos.current.get(k)) {
        emissao.current ??= emissaoDoServidor();
        try {
          await lerProtocoloPorCodigo(pedir as unknown as PedirExtensao, await emissao.current, it, importacao.regras, undefined, arquivos.current);
        } catch (e) {
          return toast.error(e instanceof Error ? e.message : "Não consegui emitir o protocolo.");
        }
      }
      const file = arquivos.current.get(k);
      if (file) setAnalise((a) => ({ file, n: (a?.n ?? 0) + 1 }));
    },
    [pedir, importacao.regras],
  );
  const recomecar = useCallback(async (no: string) => {
    if (aberto == null) return;
    await progressoDe(aberto).limpar(no);
    toast.info("A próxima execução recomeça do primeiro item.");
  }, [aberto]);
  const listaFluxos = useMemo(() => (fluxos ?? []).map((f) => ({ id: f.id, nome: f.nome })), [fluxos]);
  const hostPainel = useMemo<HostPainel>(
    () => ({
      protocolos,
      gestao,
      naCenti,
      abrirProtocolo: onAbrirProtocolo,
      saidas,
      parciais,
      dfds,
      pasta: {
        nome: pasta?.name ?? null,
        pode: podePasta,
        escolher: () =>
          void (window as unknown as { showDirectoryPicker: (o: object) => Promise<PastaDestino> })
            .showDirectoryPicker({ mode: "readwrite", startIn: "downloads" })
            .then(setPasta)
            .catch(() => undefined),
      },
      abrirAnalise: (it) => void abrirAnalise(it),
      rodando: rodando != null,
      reparticoes: { ...reps, buscar: () => void buscarReparticoes() },
      conferirAlvo: async (al) => {
        const r = (await pedir("protocolo", al, 60_000)) as { ok?: boolean; erro?: string; protocolo?: { numero: string; ano: string; assunto: string; descricao: string; documentos: number } };
        return r.ok && r.protocolo
          ? `${r.protocolo.numero}/${r.protocolo.ano} · ${r.protocolo.assunto || r.protocolo.descricao} · ${r.protocolo.documentos} documento(s)`
          : (r.erro ?? "Não consegui abrir o protocolo na Centi.");
      },
      testarAnexo: async (al, tipo) => {
        const r = await testarAnexo({ pedir: emissor.pedir, confirmar: (texto) => confirmar({ titulo: "A Centi pede confirmação", texto, confirmar: "Confirmar e anexar" }) }, al, tipo);
        return "ok" in r ? r.ok : r.erro;
      },
      fluxos: listaFluxos,
      fluxoAtual: aberto,
      recomecar,
    }),
    [listaFluxos, aberto, recomecar, protocolos, gestao, naCenti, onAbrirProtocolo, saidas, parciais, dfds, pasta, podePasta, abrirAnalise, rodando, reps, buscarReparticoes, pedir, emissor, confirmar],
  );
  return (
    <HostPainelCtx.Provider value={hostPainel}>
    <div className="min-w-0 lg:min-h-0">
      {fluxo ? (
        <EditorFluxo
          key={fluxo.id}
          fluxo={fluxo}
          rodando={rodando === fluxo.id}
          outroRodando={rodando != null && rodando !== fluxo.id}
          passos={exec?.id === fluxo.id ? passos : {}}
          resultado={exec?.id === fluxo.id ? resultado : null}
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
        <ListaFluxos
          fluxos={fluxos}
          rodando={rodando}
          novo={novo}
          onAbrir={(id) => {
            setNovo(false);
            setAberto(id);
          }}
          onNovo={() => setNovo(true)}
          onFecharNovo={() => setNovo(false)}
          onCriar={criar}
          onOrdem={(lista) => {
            setFluxos(lista);
            salvarOrdem(lista);
          }}
        />
      )}
      <ProtocoloUploadForm
        reparticoes={importacao.reparticoes as never}
        reparticaoAtivaId={null}
        pcas={importacao.pcas as never}
        regras={importacao.regras}
        orgaos={importacao.orgaos as never}
        arquivo={analise}
        onFechado={(erro) => {
          if (erro) toast.error(erro);
        }}
      />
      {confirmacao}
    </div>
    </HostPainelCtx.Provider>
  );
}

const GRAFO_VAZIO_COM_INICIO: Grafo = { ...GRAFO_VAZIO, nos: [{ id: "inicio1", tipo: "gatilho.inicio", config: {}, x: 64, y: 160 }] };

/** A ordem da PESSOA (arrastar e soltar); os que ela ainda não ordenou (novos) vêm primeiro. */
function naOrdem(fluxos: FluxoAutomacao[], ordem: number[]): FluxoAutomacao[] {
  const pos = new Map(ordem.map((id, i) => [id, i]));
  return [...fluxos.filter((f) => !pos.has(f.id)), ...fluxos.filter((f) => pos.has(f.id)).sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))];
}

/** Grava a ordem dos cartões (preferência da pessoa) — silencioso: a ordem na tela já mudou. */
function salvarOrdem(lista: FluxoAutomacao[]) {
  void api("/api/preferencias/tabela", { method: "PUT", body: { chave: "automacao:ordem-fluxos", valor: { ids: lista.map((f) => f.id).slice(0, 500) } } });
}

/**
 * As COLUNAS dos cartões: quantas cabem (cada uma ≥ `LARGURA_CARTAO`) e a largura EXATA de cada — a grade enche a
 * largura toda (sem sobra) e o painel "Novo fluxo" ocupa a ÚLTIMA coluna: o cartão nunca muda de tamanho ao abrir/fechar.
 */
function useColunas(ref: React.RefObject<HTMLDivElement | null>) {
  const [c, setC] = useState<{ n: number; largura: number; vao: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      const w = el.clientWidth;
      const vao = tokenPx("--gap-block", 12);
      const min = Number.parseFloat(LARGURA_CARTAO) * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const n = Math.max(1, Math.floor((w + vao) / (min + vao)));
      setC((v) => {
        const largura = (w - (n - 1) * vao) / n;
        return v && v.n === n && Math.abs(v.largura - largura) < 0.5 && v.vao === vao ? v : { n, largura, vao };
      });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return c;
}

/**
 * A reorganização SUAVE (FLIP): cada cartão que mudou de LUGAR NA GRADE desliza do lugar antigo ao novo. As posições são
 * as de LAYOUT (`offsetLeft/Top` — nunca o retângulo com a animação em curso) e a animação anterior é cancelada antes.
 */
function useDeslizar(ref: React.RefObject<HTMLDivElement | null>, versao: string) {
  const antes = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ms = duracaoMotionMs();
    const agora = new Map<string, { x: number; y: number }>();
    for (const i of el.querySelectorAll<HTMLElement>(":scope > [data-grade-item]")) {
      if (i.offsetParent === null) continue; // escondido (o que está sendo arrastado)
      const k = i.dataset.gradeItem ?? "";
      const pos = { x: i.offsetLeft, y: i.offsetTop };
      agora.set(k, pos);
      const v = antes.current.get(k);
      if (!v || ms <= 0 || (v.x === pos.x && v.y === pos.y)) continue;
      for (const an of i.getAnimations()) an.cancel();
      i.animate([{ transform: `translate(${v.x - pos.x}px, ${v.y - pos.y}px)` }, { transform: "none" }], { duration: ms, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    }
    antes.current = agora;
  }, [ref, versao]);
}

/** O cartão de um fluxo salvo: frequência, estado e os números (nós · última execução · erros). */
function cartaoDoFluxo(f: FluxoAutomacao, rodando: number | null) {
  const u = f.ultimaExecucao as { estado?: string; apontados?: number } | null;
  const ultima = !u?.estado ? "—" : u.estado === "concluido" ? "Concluída" : u.estado === "falhou" ? "Falhou" : u.estado === "cancelado" ? "Cancelada" : u.estado;
  return {
    titulo: f.nome,
    // Sem repetir: o sobretítulo diz QUANDO roda; o selo, só o estado especial (executando/agendado).
    sobretitulo: f.ativo ? `${rotuloFrequencia(f.frequencia)}${f.proximaEm ? ` · próxima ${dataHoraBR(f.proximaEm)}` : ""}` : "Manual",
    selo: rodando === f.id ? <Badge tone="blue">Executando</Badge> : f.ativo ? <Badge tone="emerald">Agendado</Badge> : undefined,
    metricas: [
      { rotulo: "Nós", valor: String(f.grafo.nos.length) },
      { rotulo: "Última", valor: ultima, cor: !u?.estado ? undefined : u.estado === "concluido" && !u.apontados ? "var(--ok)" : "var(--warn)" },
      { rotulo: "Erros", valor: u?.estado ? String(u.apontados ?? 0) : "—", cor: u?.apontados ? "var(--danger)" : undefined },
    ],
  };
}

function ListaFluxos({
  fluxos,
  rodando,
  novo,
  onAbrir,
  onNovo,
  onFecharNovo,
  onCriar,
  onOrdem,
}: {
  fluxos: FluxoAutomacao[] | null;
  rodando: number | null;
  novo: boolean;
  onAbrir: (id: number) => void;
  onNovo: () => void;
  onFecharNovo: () => void;
  onCriar: (m: (typeof MODELOS_FLUXO)[number] | null, nome: string, opcoes?: { antesDe?: number | null; atualizar?: boolean }) => Promise<void>;
  onOrdem: (lista: FluxoAutomacao[]) => void;
}) {
  const desktop = useDesktop();
  const area = useRef<HTMLDivElement>(null);
  const grade = useRef<HTMLDivElement>(null);
  const col = useColunas(area);
  // No desktop o painel ocupa a ÚLTIMA coluna (com 1 coluna só, ele vira a folha do celular).
  const lateral = desktop && !!col && col.n >= 2;
  const colunas = col ? (lateral && novo ? col.n - 1 : col.n) : 0;
  const lista = fluxos ?? [];
  const { arrasto, fantasma, iniciar, foiArrasto } = useArrastoGrade({
    raiz: grade,
    onSoltar: (chave, d) => {
      const antesDe = d.antesDe ? Number(d.antesDe.slice(2)) : null;
      // Um MODELO arrastado do painel: cria o fluxo ali (só se soltou sobre a lista).
      if (chave.startsWith("m:")) {
        const ponto = soltoEm.current;
        const r = grade.current?.getBoundingClientRect();
        if (!r || !ponto || ponto.x > r.right || ponto.x < r.left) return;
        const m = MODELOS_FLUXO.find((x) => x.id === chave.slice(2)) ?? null;
        return void onCriar(m, m?.nome ?? "Novo fluxo", { antesDe });
      }
      const id = Number(chave.slice(2));
      const sem = lista.filter((f) => f.id !== id);
      const f = lista.find((x) => x.id === id);
      if (!f) return;
      const i = antesDe != null ? sem.findIndex((x) => x.id === antesDe) : d.depoisDe ? sem.findIndex((x) => `f:${x.id}` === d.depoisDe) + 1 : sem.length;
      onOrdem([...sem.slice(0, Math.max(0, i)), f, ...sem.slice(Math.max(0, i))]);
    },
  });
  // Onde o ponteiro estava ao soltar (o modelo só vira fluxo se cair sobre a lista).
  const soltoEm = useRef<{ x: number; y: number } | null>(null);
  if (arrasto) soltoEm.current = { x: arrasto.x, y: arrasto.y };
  useDeslizar(grade, `${colunas}|${lista.map((f) => f.id).join(",")}|${arrasto?.destino.antesDe ?? ""}|${arrasto?.destino.depoisDe ?? ""}|${!!arrasto}`);

  const estiloGrade = col ? { gridTemplateColumns: `repeat(${colunas}, ${col.largura}px)`, gap: col.vao } : undefined;
  const sombra = arrasto && !arrasto.pousando ? <SombraGrade key="__sombra" altura={arrasto.altura} /> : null;
  const itens: ReactNode[] = [];
  for (const f of lista) {
    const chave = `f:${f.id}`;
    if (sombra && arrasto?.destino.antesDe === chave) itens.push(sombra);
    itens.push(
      <div
        key={chave}
        data-grade-item={chave}
        role="none"
        title={f.descricao ?? undefined}
        className={`${arrasto?.chave === chave ? "hidden" : ""} h-full touch-manipulation select-none [-webkit-touch-callout:none]`}
        onPointerDown={(e) => iniciar(e, chave)}
        onClickCapture={(e) => {
          if (foiArrasto()) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <CartaoFluxo {...cartaoDoFluxo(f, rodando)} onClick={() => onAbrir(f.id)} />
      </div>,
    );
  }
  if (sombra && !arrasto?.destino.antesDe) itens.push(sombra);
  // O cartão PRESO ao ponteiro: o próprio cartão (fluxo ou modelo), igual ao que está na grade.
  const fPreso = arrasto ? lista.find((f) => `f:${f.id}` === arrasto.chave) : undefined;
  const mPreso = arrasto && !fPreso ? [EM_BRANCO, ...MODELOS_FLUXO].find((m) => `m:${m.id}` === arrasto.chave) : undefined;
  const preso = fPreso ? cartaoDoFluxo(fPreso, rodando) : mPreso ? cartaoDoModelo(mPreso, lista) : null;

  const escolha = (
    <EscolherNovoFluxo
      fluxos={lista}
      onFechar={onFecharNovo}
      onCriar={onCriar}
      onAbrir={onAbrir}
      arrastar={lateral ? { iniciar, foiArrasto, chave: arrasto?.chave ?? null } : undefined}
      coluna={lateral}
    />
  );
  return (
    <div ref={area} className="flex items-start" style={{ gap: col?.vao }}>
      <div className="min-w-0 flex-1">
        {!fluxos || !col ? (
          <div className={GRADE_CARTOES} aria-busy="true">
            {[0, 1, 2].map((i) => (
              <SkeletonCartao key={i} linhas={3} />
            ))}
          </div>
        ) : !fluxos.length && !arrasto ? (
          <div ref={grade} className={`${CARTAO} flex flex-col items-center gap-3 py-10 text-center`}>
            <IconFluxo className="size-8 text-accent" aria-hidden="true" />
            <p className="text-sm text-muted">Nenhum fluxo ainda. Comece de um modelo pronto ou do zero.</p>
            <Button size="sm" onClick={onNovo}>
              Criar o primeiro fluxo
            </Button>
          </div>
        ) : (
          <div ref={grade} className="grid auto-rows-fr" style={estiloGrade}>
            {itens}
          </div>
        )}
      </div>
      {/* DESKTOP: o painel ocupa a ÚLTIMA coluna e ENTRA da direita; os cartões deslizam para o lugar novo. */}
      {lateral && novo && (
        <aside
          className="animate-aba-direita sticky top-[var(--pad-canvas)] flex max-h-[calc(100dvh-var(--h-header)-var(--pad-canvas)*2)] shrink-0 flex-col"
          style={{ width: col.largura }}
        >
          {escolha}
        </aside>
      )}
      {!lateral && (
        <Modal open={novo} onClose={onFecharNovo} titulo="Novo fluxo">
          {escolha}
        </Modal>
      )}
      {arrasto && preso && (
        <CartaoPreso arrasto={arrasto} fantasma={fantasma}>
          <CartaoFluxo {...preso} onClick={() => {}} />
        </CartaoPreso>
      )}
    </div>
  );
}

/** Desktop (≥ lg) — o mesmo corte das medidas do sistema. */
function useDesktop(): boolean {
  const [d, setD] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const on = () => setD(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return d;
}

/** O cartão de um MODELO (ou "Em branco") no painel "Novo fluxo" — o mesmo desenho dos fluxos salvos. */
function cartaoDoModelo(x: { id: string; nome: string; grafo?: Grafo; frequencia?: Frequencia }, fluxos: FluxoAutomacao[]) {
  return {
    titulo: x.nome,
    sobretitulo: x.id ? "Modelo pronto" : "Do zero",
    selo: x.id && fluxos.some((f) => f.nome === x.nome) ? <Badge tone="emerald">Já existe</Badge> : undefined,
    metricas: [
      { rotulo: "Nós", valor: String(x.grafo?.nos.length ?? 1) },
      { rotulo: "Frequência", valor: x.frequencia ? rotuloFrequencia(x.frequencia) : "Manual" },
      { rotulo: "Usa", valor: x.id ? String(MODELOS_FLUXO.find((m) => m.id === x.id)?.dependencias?.length ?? 0) : "—" },
    ],
  };
}

const EM_BRANCO: { id: string; nome: string; descricao: string; grafo?: Grafo; frequencia?: Frequencia } = { id: "", nome: "Em branco", descricao: "Só o Início — monte do zero." };

/** "Novo fluxo": o nome + "Em branco" e TODOS os modelos no MESMO cartão da lista (o já criado pode ser aberto). */
function EscolherNovoFluxo({
  fluxos,
  onFechar,
  onCriar,
  onAbrir,
  arrastar,
  coluna = false,
}: {
  fluxos: FluxoAutomacao[];
  onFechar: () => void;
  onCriar: (m: (typeof MODELOS_FLUXO)[number] | null, nome: string, opcoes?: { atualizar?: boolean }) => Promise<void>;
  onAbrir: (id: number) => void;
  /** No desktop, os MODELOS se arrastam até a lista (criam o fluxo ali). */
  arrastar?: { iniciar: (e: React.PointerEvent<HTMLElement>, chave: string) => void; foiArrasto: () => boolean; chave: string | null };
  /** No desktop (a última coluna da lista): os cartões soltos na coluna, na MESMA largura dos da lista; o topo e o rodapé em cartões próprios. */
  coluna?: boolean;
}) {
  const [nome, setNome] = useState("");
  const [modelo, setModelo] = useState<string>("");
  const [criando, setCriando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const m = MODELOS_FLUXO.find((x) => x.id === modelo) ?? null;
  const existente = m ? fluxos.find((f) => f.nome === m.nome) : undefined;
  const criar = async () => {
    setCriando(true);
    await onCriar(m, nome.trim() || m?.nome || "Fluxo");
    setCriando(false);
    setNome("");
    setModelo("");
  };
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${coluna ? "gap-[var(--gap-block)]" : ""}`}>
      <div className={`flex items-center gap-2 px-[var(--pad-card)] py-2.5 max-lg:hidden ${coluna ? `${CARTAO} !py-2.5` : "border-b border-border"}`}>
        <h3 className="min-w-0 flex-1 text-base font-bold text-text">Novo fluxo</h3>
        <Button variant="icon" aria-label="Fechar" onClick={onFechar}>
          <IconClose className="size-5" />
        </Button>
      </div>
      <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${coluna ? "rolagem-fina -mx-1 -my-1 py-1 pl-1 pr-2.5 -mr-2.5" : "p-[var(--pad-card)]"}`}>
        <div className={coluna ? `${CARTAO} space-y-3` : "space-y-3"}>
          <TextField label="Nome" value={nome} maxLength={80} placeholder={m?.nome ?? "Ex.: Conferir execução dos DFDs"} onChange={(e) => setNome(e.target.value)} />
          <p className="text-sm font-medium text-text">Começar de</p>
        </div>
        <div className={coluna ? "grid gap-[var(--gap-block)]" : GRADE_CARTOES}>
          {[EM_BRANCO, ...MODELOS_FLUXO].map((x) => (
            <div
              key={x.id || "branco"}
              role="none"
              title={x.descricao}
              className={`touch-manipulation select-none [-webkit-touch-callout:none] transition-opacity ${arrastar?.chave === `m:${x.id}` ? "opacity-40" : ""}`}
              onPointerDown={arrastar ? (e) => arrastar.iniciar(e, `m:${x.id}`) : undefined}
              onClickCapture={(e) => {
                if (arrastar?.foiArrasto()) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
            <CartaoFluxo {...cartaoDoModelo(x, fluxos)} marcado={modelo === x.id} onClick={() => setModelo(x.id)} />
            </div>
          ))}
        </div>
      </div>
      <div className={`flex flex-wrap justify-end gap-2 px-[var(--pad-card)] py-2.5 ${coluna ? `${CARTAO} !py-2.5` : "border-t border-border"}`}>
        {existente && (
          <Button size="sm" variant="secondary" onClick={() => onAbrir(existente.id)}>
            Abrir o existente
          </Button>
        )}
        {existente && m && (
          <Button
            size="sm"
            variant="secondary"
            loading={atualizando}
            title="Regrava o fluxo salvo (e os que ele usa) com o modelo de hoje — a frequência e o agendamento ficam"
            onClick={async () => {
              setAtualizando(true);
              await onCriar(m, m.nome, { atualizar: true });
              setAtualizando(false);
            }}
          >
            Atualizar pelo modelo
          </Button>
        )}
        <Button size="sm" loading={criando} disabled={!(nome.trim() || m)} onClick={() => void criar()}>
          {existente ? "Criar outro" : "Criar"}
        </Button>
      </div>
    </div>
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
  const [descricao, setDescricao] = useState(fluxo.descricao ?? "");
  // A ajuda: a do fluxo; sem ela, a do modelo de mesmo nome (o fluxo criado antes da ajuda existir).
  const ajudaBase = useMemo(
    () => (ajudaVazia(fluxo.ajuda) ? (MODELOS_FLUXO.find((m) => m.nome === fluxo.nome)?.ajuda ?? fluxo.ajuda) : fluxo.ajuda),
    [fluxo.ajuda, fluxo.nome],
  );
  const [ajuda, setAjuda] = useState(ajudaBase);
  const [configAberta, setConfigAberta] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>({ x: 40, y: 20, z: 0.9 });
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [relatorio, setRelatorio] = useState(false);
  /** O nó cuja configuração está aberta (janela flutuante sobre o diagrama) e onde ele está na tela. */
  const [config, setConfig] = useState<{ id: string; ancora: { x: number; y: number; w: number; h: number } } | null>(null);
  // A TELA INICIAL é o painel (entradas · etapas · análise); o diagrama só ao montar o fluxo.
  const [modo, setModo] = useState<"painel" | "diagrama">(fluxo.grafo.nos.length <= 1 ? "diagrama" : "painel");
  const sujo =
    JSON.stringify(grafo) !== JSON.stringify(fluxo.grafo) || nome.trim() !== fluxo.nome || JSON.stringify(freq) !== JSON.stringify(fluxo.frequencia) || ativo !== fluxo.ativo || descricao.trim() !== (fluxo.descricao ?? "") || JSON.stringify(ajuda) !== JSON.stringify(ajudaBase);
  const problemas = useMemo(() => validarGrafo(grafo, REGISTRO_NOS), [grafo]);
  const erros = problemas.filter((p) => p.nivel === "erro");
  const atencoes = problemas.filter((p) => p.nivel !== "erro");
  const ref = useRef<HTMLDivElement>(null);
  const altura = useAlturaTela(ref, 320) ?? 560;
  const naTela = useNaTela();
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando chega um resultado novo
  useEffect(() => {
    // Fora da tela (execução em segundo plano), o relatório não abre sozinho — o painel minimizado avisa o desfecho.
    if (!naTela) return;
    if (resultado?.apontados.length || resultado?.estado === "falhou") setRelatorio(true);
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
  };

  async function salvar() {
    setSalvando(true);
    const r = await api<{ fluxo?: FluxoAutomacao }>(`/api/admin/automacao/fluxos/${fluxo.id}`, {
      method: "PATCH",
      body: { nome: nome.trim() || fluxo.nome, descricao: descricao.trim() || null, ajuda, grafo, frequencia: freq, ativo },
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

  const noConfig = config ? (grafo.nos.find((n) => n.id === config.id) ?? null) : null;
  const enquadrar = (g: Grafo = grafo) => {
    if (!g.nos.length) return setVista({ x: 40, y: 20, z: 0.9 });
    const xs = g.nos.map((n) => n.x);
    const ys = g.nos.map((n) => n.y);
    const fundos = g.nos.map((n) => n.y + alturaNo(REGISTRO_NOS.get(n.tipo)));
    const w = Math.max(...xs) - Math.min(...xs) + LARGURA_NO + 80;
    const h = Math.max(...fundos) - Math.min(...ys) + 80;
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
        {erros.length > 0 && <Badge tone="red" title={erros.map((p) => p.texto).join("\n")}>{erros.length} problema(s)</Badge>}
        {/* As ATENÇÕES não impedem executar, mas ficam à vista (a lista inteira na dica). */}
        {atencoes.length > 0 && <Badge tone="amber" title={atencoes.map((p) => p.texto).join("\n")}>{atencoes.length} atenção(ões)</Badge>}
        <Button
          size="sm"
          variant="icon"
          aria-pressed={modo === "diagrama"}
          aria-label={modo === "painel" ? "Diagrama" : "Painel"}
          title={modo === "painel" ? "Ver o diagrama e montar o fluxo" : "Voltar ao painel do fluxo"}
          onClick={() => setModo(modo === "painel" ? "diagrama" : "painel")}
        >
          <IconFluxo className="size-4" />
        </Button>
        {resultado && (
          <Button size="sm" variant="icon" className="relative" aria-label="Relatório da última execução" title={`Relatório da última execução${resultado.apontados.length ? ` (${resultado.apontados.length})` : ""}`} onClick={() => setRelatorio(true)}>
            <IconClipboard className="size-4" />
            {resultado.apontados.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold leading-4 text-white">
                {resultado.apontados.length > 999 ? "999+" : resultado.apontados.length}
              </span>
            )}
          </Button>
        )}
        <Button size="sm" variant="icon" aria-label="Salvar" title={sujo ? "Salvar as alterações" : "Nada a salvar"} disabled={!sujo || rodando} loading={salvando} onClick={() => void salvar()}>
          <IconSave className="size-4" />
        </Button>
        {rodando ? (
          <Button size="sm" variant="icon" className="text-[var(--danger)]" aria-label="Parar" title="Parar a execução" onClick={onParar}>
            <IconParar className="size-4" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="icon"
            aria-label="Executar"
            disabled={erros.length > 0}
            title={erros.length ? erros[0].texto : outroRodando ? "Executar — outro fluxo está rodando, este entra na fila" : "Executar agora (sem precisar salvar)"}
            onClick={() => onExecutar(grafo)}
          >
            <IconPlay className="size-4" />
          </Button>
        )}
        <Button size="sm" variant="icon" aria-label="Configurações da automação" title="Configurações da automação (nome, frequência, ajuda)" onClick={() => setConfigAberta(true)}>
          <IconSettings className="size-4" />
        </Button>
        <Button size="sm" variant="icon" aria-label="Excluir o fluxo" title="Excluir o fluxo" disabled={rodando} onClick={onExcluir}>
          <IconTrash className="size-4" />
        </Button>
        <AjudaDoFluxo titulo={nome.trim() || fluxo.nome} ajuda={ajuda} />
        <ConfigFluxo
          open={configAberta}
          onClose={() => setConfigAberta(false)}
          nome={nome}
          descricao={descricao}
          ajuda={ajuda}
          onNome={setNome}
          onDescricao={setDescricao}
          onAjuda={setAjuda}
        >
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
        </ConfigFluxo>
      </div>
      {freq.tipo !== "manual" && (
        <p className="text-xs text-muted">
          {rotuloFrequencia(freq)} · {ativo ? `próxima: ${(() => {
            const p = proximaExecucao(freq, new Date());
            return p ? dataHoraBR(p) : "—";
          })()}` : "agendamento desligado"} · roda com esta tela aberta e a extensão pronta.
        </p>
      )}
      {modo === "painel" && (
        <PainelFluxo grafo={grafo} onGrafo={setGrafo} passos={passos} resultado={resultado} rodando={rodando} ultima={{ em: fluxo.ultimaEm, resumo: fluxo.ultimaExecucao }} />
      )}
      <div ref={ref} className={`${modo === "painel" ? "hidden" : "grid"} gap-3 lg:h-[var(--h)] lg:grid-cols-[14rem_minmax(0,1fr)]`} style={{ "--h": `${altura}px` } as React.CSSProperties}>
        <aside className={`${CARTAO} flex max-h-80 min-h-0 flex-col gap-2 overflow-hidden lg:max-h-none`}>
          <SearchField compacto placeholder="Buscar bloco" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar bloco" />
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {filtradas.map((c) => (
              <div key={c.valor}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{c.rotulo}</p>
                <div className="space-y-1">
                  {c.nos.map((n) => (
                    <div key={n.tipo} className="flex items-center gap-1">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-fluxo-no", n.tipo);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => adicionar(n.tipo)}
                      title={`${n.descricao} — toque para acrescentar (ligado ao nó marcado) ou arraste para o quadro`}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-[var(--accent-soft)] lg:min-h-0"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-white" style={{ background: c.cor }}>
                        <IconeNo nome={n.icone} className="size-3.5" />
                      </span>
                      <span className="min-w-0 truncate text-[13px] text-text">{n.rotulo}</span>
                    </button>
                    <AjudaNo def={n} />
                    </div>
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
            const el = id ? document.querySelector(`[data-no="${CSS.escape(id)}"]`) : null;
            const r = el?.getBoundingClientRect();
            setConfig(id && r ? { id, ancora: { x: r.x, y: r.y, w: r.width, h: r.height } } : null);
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
              <Button size="xs" variant="icon" aria-label="Enquadrar tudo" title="Enquadrar tudo" onClick={() => enquadrar()}>
                <IconEnquadrar className="size-4" />
              </Button>
              {!rodando && (
                <Button
                  size="xs"
                  variant="icon"
                  aria-label="Organizar o diagrama"
                  title="Organizar: colunas na ordem do fluxo, ligações retas"
                  onClick={() => {
                    const g = organizarGrafo(grafo, REGISTRO_NOS);
                    setGrafo(g);
                    enquadrar(g);
                  }}
                >
                  <IconOrganizar className="size-4" />
                </Button>
              )}
              <Ajuda botao titulo="Como montar">
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  <li>Toque num bloco à esquerda: ele entra ligado ao nó marcado (ou arraste até o quadro).</li>
                  <li>Arraste de uma saída (●) até uma entrada para ligar; toque na linha e Delete para desligar. As setas mostram a direção; cada ligação de um nó tem uma cor.</li>
                  <li>Arraste o trecho vertical de uma linha para ajustá-la; duplo clique volta ao automático.</li>
                  <li>“Organizar” põe os componentes em colunas na ordem do fluxo, com as ligações retas.</li>
                  <li>Laço: ligue o fim do corpo à entrada “Volta” — repete até acabar.</li>
                  <li>Toda caixa tem a saída vermelha “erro”: ligue-a a “Apontar erros” para seguir mesmo com falha.</li>
                  <li>Nos campos, use {"{{campo}}"} para pegar um dado do item.</li>
                  <li>“Executar fluxo” usa outro fluxo salvo como componente — para cada item, em paralelo e retomando de onde parou.</li>
                </ul>
              </Ajuda>
            </div>
          }
        />
      </div>
      <JanelaFlutuante aberta={!!noConfig} ancora={config?.ancora ?? null} titulo={noConfig?.nome || "Configurar o nó"} largura={380} onFechar={() => setConfig(null)}>
        {noConfig && (
          <div className="flex max-h-[min(70vh,36rem)] flex-col">
            <PainelNo
              key={noConfig.id}
              no={noConfig}
              def={REGISTRO_NOS.get(noConfig.tipo)}
              passo={passos[noConfig.id]}
              caminhos={caminhos}
              somenteLeitura={rodando}
              onMudar={(n) => setGrafo((g) => ({ ...g, nos: g.nos.map((x) => (x.id === n.id ? n : x)) }))}
              onExcluir={() => {
                setGrafo((g) => ({ ...g, nos: g.nos.filter((x) => x.id !== noConfig.id), conexoes: g.conexoes.filter((c) => c.de !== noConfig.id && c.para !== noConfig.id) }));
                setSel(null);
                setConfig(null);
              }}
            />
          </div>
        )}
      </JanelaFlutuante>
      <Modal open={relatorio && !!resultado} onClose={() => setRelatorio(false)} titulo="Relatório da execução" size="lg">
        {resultado && (
          <RelatorioExecucao
            resultado={resultado}
            onIr={(id) => {
              setRelatorio(false);
              setModo("diagrama");
              setSel(id);
            }}
          />
        )}
      </Modal>
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

/** Os fluxos usados como subfluxo, lidos do servidor UMA vez por execução (vale a versão salva naquele momento). */
function carregadorDeFluxos(): (id: number) => Promise<FluxoFilho> {
  const cache = new Map<number, Promise<FluxoFilho>>();
  return (id) => {
    let p = cache.get(id);
    if (!p) {
      p = api<{ fluxo?: FluxoAutomacao; error?: string }>(`/api/admin/automacao/fluxos/${id}`).then((r) => {
        if (!r.ok || !r.fluxo) throw new Error(r.error || `O fluxo ${id} não existe mais.`);
        return { id: r.fluxo.id, nome: r.fluxo.nome, grafo: r.fluxo.grafo };
      });
      p.catch(() => cache.delete(id));
      cache.set(id, p);
    }
    return p;
  };
}

/** A retomada dos nós "Executar fluxo" de um fluxo (no servidor — vale em outro computador). */
function progressoDe(fluxoId: number): ProgressoHost {
  const url = (no: string) => `/api/admin/automacao/fluxos/${fluxoId}/progresso?no=${encodeURIComponent(no)}`;
  return {
    ler: async (no) => {
      const r = await api<{ chaves?: string[]; error?: string }>(url(no));
      if (!r.ok) throw new Error(r.error || "Não consegui ler de onde o fluxo parou.");
      return r.chaves ?? [];
    },
    gravar: async (no, itens) => {
      for (let i = 0; i < itens.length; i += 200) {
        const r = await api(url(no), { method: "POST", body: { itens: itens.slice(i, i + 200) } });
        if (!r.ok) throw new Error(r.error || "Não consegui gravar o progresso.");
      }
    },
    limpar: async (no) => {
      const r = await api(url(no), { method: "DELETE" });
      if (!r.ok) throw new Error(r.error || "Não consegui recomeçar.");
    },
  };
}
