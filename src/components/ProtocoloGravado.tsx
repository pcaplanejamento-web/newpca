"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { classificarAssunto, opcoesAssunto, type RegrasAvaliacao } from "@/lib/avaliacao-core";
import { avaliarLinhaDfd, conferirAssinaturaDfd, estadoDeMensagens, type LinhaAvaliada, mensagensDoDfd } from "@/lib/conferencia-dfd";
import type { DfdDetalhe } from "@/lib/dfd";
import { type CapaEditavel, detalheParaParseado, diffCapaGravada, diffDfdGravado } from "@/lib/dfd-edicao";
import {
  type AcaoMassa,
  aplicarMassaDfd,
  conciliacaoCapa,
  editarItemDfd,
  faltasCirurgicasDfd,
  gruposAssinatura,
  linhasRelatorioProtocolo,
  removerItemDfd,
  STATUS_MENSAGEM_COR,
} from "@/lib/dfd-tratamento";
import { dataBR, num } from "@/lib/format";
import { type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import type { ProtocoloDetalhe } from "@/lib/protocolo";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import type { UnidadeConferencia } from "@/lib/reparticoes";
import { BarraEdicaoMassa } from "./BarraEdicaoMassa";
import { BarraSelecao, ResumoSelecao } from "./BarraSelecao";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { DfdConferir, type PainelDfd } from "./DfdConferir";
import { DfdPainelDireito, RodapePainelItem, tituloPainelDfd } from "./DfdPainelDireito";
import { DfdRodape } from "./DfdRodape";
import { DfdCabecalho } from "./DfdView";
import { TextField } from "./Field";
import { IconAlert, IconClock, IconRefresh, IconSpinner, IconUpload } from "./icons";
import type { ConteudoBanner } from "./DfdGravado";
import type { ModalPainel } from "./Modal";
import type { PcaOpcao } from "./PcaPicker";
import type { LinhaDfd } from "./PlanilhaDfds";
import { Progress } from "./Progress";
import { type BaseReenvio, ProtocoloUploadForm } from "./ProtocoloUploadForm";
import { type CapaValores, ProtocoloCabecalho, ProtocoloView } from "./ProtocoloView";
import { RelatorioErros } from "./RelatorioErros";
import { useConformidade } from "./useConformidade";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  orgaoId?: number | null;
  orgaoProprio?: boolean | null;
  setorRequisitante?: string | null;
  numeroInteressado?: string | null;
  oculto?: boolean | null;
  responsaveis: Responsaveis;
};
type Orgao = { id: number; sigla: string; nome: string; orgaoEntidade: string | null; assinaturaUnica?: boolean | null };
/** Rascunho preservado de um DFD que FALHOU ao salvar (recarrega o resto e mantém a edição dele). */
type Preservar = { dfds: Map<number, { d: DfdParseado; rep: number | null; itens: boolean }>; capa: CapaEditavel | null };

const capaDe = (p: ProtocoloDetalhe): CapaEditavel => ({
  reparticaoId: p.reparticaoId,
  interessado: p.interessado,
  documento: p.documento,
  assunto: p.assunto,
  observacao: p.observacao,
  valorCapa: p.valorCapa,
  localReparticao: p.localReparticao,
});
const ERRO_EXTRA = new Set(["dfd.orgao", "dfd.orgaoUnidadeDivergente"]);

/**
 * PROTOCOLO GRAVADO como HOOK de banners — os MESMOS componentes e a MESMA conferência da análise
 * (protocolação): corpo `ProtocoloView` (mini banners, conciliação da capa com "Substituir pela
 * somatória", capa com cadeado por campo, planilha de DFDs com seleção), barra de SELEÇÃO + edição em
 * massa, DFD ao lado (`DfdConferir` + `DfdRodape`) e o painel da direita (mensagens/item/histórico),
 * relatório de erros. A ÚNICA diferença: a planilha é UMA tabela só (`unica`). As edições ficam num
 * RASCUNHO até "Salvar alterações" (só o que mudou vai ao banco — `diffCapaGravada`/`diffDfdGravado`).
 * Devolve os PAINÉIS para a pilha de banners da Mesa (`BannersMesa`). `empilhado`: o protocolo entrou
 * à DIREITA de um DFD ("Ver protocolo") — clicar numa linha troca o DFD da pilha (sem DFD ao lado).
 */
export function useProtocoloGravado({
  protocoloId,
  dfdInicial = null,
  onFechar,
  empilhado = null,
  podeEditar,
  reparticoes,
  reparticaoAtivaId,
  regras,
  orgaos,
  onAlterado,
  sinal = 0,
  pcas = [],
  dfdsExistentes = [],
}: {
  /** Protocolo a abrir (`null` = fechado). */
  protocoloId: number | null;
  /** Abre já com este DFD ao lado. */
  dfdInicial?: number | null;
  /** X / Fechar do banner do protocolo (a pilha decide o que fecha). */
  onFechar: () => void;
  /** Entrou à direita de um DFD: a linha ativa é o DFD da pilha e clicar numa linha o troca. */
  empilhado?: { dfdAtivo: number | null; onVerDfd: (dfdId: number) => void } | null;
  podeEditar: boolean;
  reparticoes: Rep[];
  reparticaoAtivaId: number | null;
  regras: RegrasAvaliacao;
  orgaos: Orgao[];
  /** Algo foi gravado — o host recarrega as listas. */
  onAlterado: () => void;
  /** Recarga EXTERNA (outro banner gravou): recarrega do banco se não houver rascunho. */
  sinal?: number;
  /** PCAs cadastrados (o REENVIO usa o mesmo seletor de PCA da protocolação). */
  pcas?: PcaOpcao[];
  /** DFDs já cadastrados na Mesa (o REENVIO classifica os que viriam de OUTRO protocolo). */
  dfdsExistentes?: { numero: string; protocoloNumero: string | null; valorTotal?: number | null; totalItens?: number | null }[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [proto, setProto] = useState<ProtocoloDetalhe | null>(null);
  const [orig, setOrig] = useState<Map<number, DfdDetalhe>>(new Map());
  const [ordem, setOrdem] = useState<number[]>([]);
  const [dfds, setDfds] = useState<Map<number, DfdParseado>>(new Map());
  const [repIds, setRepIds] = useState<Map<number, number | null>>(new Map());
  const [unidadesExtra, setUnidadesExtra] = useState<UnidadeConferencia[]>([]);
  const [capa, setCapa] = useState<CapaEditavel | null>(null);
  const [editados, setEditados] = useState<Set<number>>(new Set());
  const [itensEditados, setItensEditados] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [painel, setPainel] = useState<PainelDfd | null>(null);
  const [ancoraAlvo, setAncoraAlvo] = useState<{ ancora: string; cor: string; nonce: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; label: string } | null>(null);
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [incluirAtencao, setIncluirAtencao] = useState(true);
  // Versão dos dados carregados: remonta o corpo/DFD após recarregar (os cadeados voltam a travar).
  const [versao, setVersao] = useState(0);
  // REENVIO do PDF (sobrescrever): contador que abre o lançador do `ProtocoloUploadForm` em modo reenvio.
  const [reenviar, setReenviar] = useState(0);

  // Nº da requisição de carga — só a MAIS RECENTE aplica o resultado (abrir A, fechar e abrir B: uma
  // resposta atrasada de A nunca aparece no banner de B).
  const cargaRef = useRef(0);
  async function carregar(id: number, abrir: number | null, preservar?: Preservar) {
    const minha = ++cargaRef.current;
    setErro(null);
    try {
      const r = await fetch(`/api/protocolo/${id}?completo=1`);
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        protocolo?: ProtocoloDetalhe;
        dfds?: DfdDetalhe[];
        unidades?: UnidadeConferencia[];
      };
      if (minha !== cargaRef.current) return;
      if (!r.ok || !j.ok || !j.protocolo) throw new Error(j.error ?? "Não foi possível abrir o protocolo.");
      const lista = j.dfds ?? [];
      const rascunhos = new Map(lista.map((d) => [d.id, detalheParaParseado(d)]));
      const reps = new Map(lista.map((d) => [d.id, d.reparticaoId]));
      const ed = new Set<number>();
      const edItens = new Set<number>();
      // Rascunhos que falharam ao salvar continuam editados (o resto vem fresco do banco).
      for (const [pid, v] of preservar?.dfds ?? []) {
        if (!rascunhos.has(pid)) continue;
        rascunhos.set(pid, v.d);
        reps.set(pid, v.rep);
        ed.add(pid);
        if (v.itens) edItens.add(pid);
      }
      setProto(j.protocolo);
      setCapa(preservar?.capa ?? capaDe(j.protocolo));
      setOrig(new Map(lista.map((d) => [d.id, d])));
      setOrdem(lista.map((d) => d.id));
      setDfds(rascunhos);
      setRepIds(reps);
      setUnidadesExtra(j.unidades ?? []);
      setEditados(ed);
      setItensEditados(edItens);
      setSel(new Set());
      setAbertoId(abrir != null && rascunhos.has(abrir) ? abrir : null);
      setPainel(null);
      setAncoraAlvo(null);
      setVersao((v) => v + 1);
    } catch (e) {
      if (minha === cargaRef.current) setErro(e instanceof Error ? e.message : "Não foi possível abrir o protocolo.");
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: recarrega só ao trocar o protocolo/DFD inicial pedido pelo host.
  useEffect(() => {
    // Zera TODO o estado do banner anterior (rascunho, seleção, painéis) — fechar descarta o rascunho
    // e o aviso de "alterações não salvas" não fica ligado depois de fechar.
    cargaRef.current++;
    setProto(null);
    setCapa(null);
    setOrig(new Map());
    setOrdem([]);
    setDfds(new Map());
    setRepIds(new Map());
    setEditados(new Set());
    setItensEditados(new Set());
    setSel(new Set());
    setAbertoId(null);
    setPainel(null);
    setErro(null);
    if (protocoloId != null) void carregar(protocoloId, dfdInicial);
  }, [protocoloId, dfdInicial]);

  const capaSuja = !!proto && !!capa && Object.keys(diffCapaGravada(capaDe(proto), capa)).length > 0;
  const sujo = capaSuja || editados.size > 0 || itensEditados.size > 0;
  // Recarga externa (outro banner da pilha gravou) — só sem rascunho (nunca perde edição).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só ao sinal.
  useEffect(() => {
    if (sinal > 0 && proto && !sujo && !salvando) void carregar(proto.id, abertoId);
  }, [sinal]);
  // Alterações não salvas: avisa antes de sair da página.
  useEffect(() => {
    if (!sujo) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sujo]);

  const categoria = classificarAssunto(capa?.assunto ?? proto?.assunto ?? null);
  const acessivel = (id: number | null) => id == null || reparticoes.some((r) => r.id === id);
  /** Unidade para a conferência: a da lista do usuário ou a REAL do DFD (vinda do servidor). */
  const repConf = (id: number | null): Rep | UnidadeConferencia | null =>
    id == null ? null : (reparticoes.find((r) => r.id === id) ?? unidadesExtra.find((u) => u.id === id) ?? null);
  const editavelDfd = (id: number) => podeEditar && acessivel(orig.get(id)?.reparticaoId ?? null);

  // Conferência por LINHA — a MESMA da análise (`avaliarLinhaDfd`), com cache por objeto de DFD.
  // biome-ignore lint/correctness/useExhaustiveDependencies: as dependências INVALIDAM o cache (regras/cadastros novos ⇒ reconferir tudo).
  const cache = useMemo(() => new WeakMap<DfdParseado, { k: string; r: LinhaAvaliada }>(), [regras, orgaos, reparticoes, unidadesExtra]);
  const avaliar = (id: number, d: DfdParseado): LinhaAvaliada => {
    const rid = repIds.get(id) ?? null;
    const editado = editados.has(id) || itensEditados.has(id);
    const anoPca = d.anoPca ?? proto?.anoPca ?? null;
    const k = `${rid}|${anoPca}|${categoria}|${editado}`;
    const c = cache.get(d);
    if (c && c.k === k) return c.r;
    const r = avaliarLinhaDfd(d, repConf(rid), { anoPca, regras, categoria, orgaos, editado });
    cache.set(d, { k, r });
    return r;
  };
  const avaliacoes = new Map<number, LinhaAvaliada>();
  const linhas: LinhaDfd[] = ordem.flatMap((id): LinhaDfd[] => {
    const d = dfds.get(id);
    if (!d) return [];
    const rid = repIds.get(id) ?? null;
    const r = avaliar(id, d);
    avaliacoes.set(id, r);
    const o = orig.get(id);
    return [
      {
        key: id,
        numero: d.numero,
        planejamento: d.planejamento,
        sigla: repConf(rid)?.codigo ?? (rid === o?.reparticaoId ? o?.reparticaoCodigo : null) ?? "—",
        tipo: tipoCurtoDfd(d.tipo),
        itens: d.itens.length,
        valor: d.valorTotal ?? 0,
        estado: r.estado,
        resumo: r.resumo,
        validacao: r.validacao,
        assinaturas: gruposAssinatura(d.assinaturas),
      },
    ];
  });
  const linhasSel = linhas.filter((l) => sel.has(l.key));
  const linhasErro = linhas.filter((l) => l.estado === "erro");
  const linhasAtencao = linhas.filter((l) => l.estado === "atencao");
  const somatorio = linhas.reduce((s, l) => s + (l.valor ?? 0), 0);
  const totalItens = linhas.reduce((s, l) => s + (l.itens ?? 0), 0);
  const conc = conciliacaoCapa({ valorCapa: capa?.valorCapa, somatorio, totalDfds: linhas.length }, regras, { categoria });

  // ---- DFD aberto ao lado (mesmo componente/rodapé/painel da análise).
  const dfdAberto = abertoId != null ? (dfds.get(abertoId) ?? null) : null;
  const repAbertoId = abertoId != null ? (repIds.get(abertoId) ?? null) : null;
  const editavelAberto = abertoId != null && editavelDfd(abertoId);
  const conformidade = useConformidade(dfdAberto?.itens, dfdAberto?.tipo ?? null);
  const anoAberto = dfdAberto ? (dfdAberto.anoPca ?? proto?.anoPca ?? null) : null;
  // No GRAVADO o ano do PCA é identificador (imutável, portão da protocolação) — fora das mensagens.
  const mensagensAberto = dfdAberto
    ? mensagensDoDfd(dfdAberto, repConf(repAbertoId), anoAberto, regras, categoria, orgaos, conformidade).filter((m) => m.chave !== "dfd.anoPca")
    : [];
  // DFD de unidade sem acesso: só-leitura, mas exibido/conferido com a unidade REAL (vinda do servidor).
  const reparticoesAberto: Rep[] = editavelAberto
    ? reparticoes
    : [...reparticoes, ...unidadesExtra.filter((u) => !reparticoes.some((r) => r.id === u.id))];

  const editarAberto = (fn: (d: DfdParseado) => DfdParseado, itens = false) => {
    if (abertoId == null) return;
    const id = abertoId;
    setDfds((m) => {
      const d = m.get(id);
      return d ? new Map(m).set(id, fn(d)) : m;
    });
    setEditados((s) => new Set(s).add(id));
    if (itens) setItensEditados((s) => new Set(s).add(id));
  };

  function abrirDfd(id: number) {
    setAbertoId(id);
    setPainel(null);
    setAncoraAlvo(null);
  }
  function fecharDfd() {
    setAbertoId(null);
    setPainel(null);
    setAncoraAlvo(null);
  }
  /** Pede confirmação para descartar o rascunho (`true` = pode seguir). */
  const podeDescartar = (msg: string) => !sujo || confirm(msg);
  function fechar() {
    if (salvando) return;
    if (!podeDescartar("Há alterações não salvas neste protocolo. Fechar e descartá-las?")) return;
    fecharDfd();
    onFechar();
  }
  function atualizar() {
    if (!proto) return;
    if (sujo && !confirm("Descartar as alterações não salvas e recarregar os dados do banco?")) return;
    void carregar(proto.id, abertoId);
  }

  /** Edição EM MASSA (mesma barra da análise) no RASCUNHO — só nos DFDs editáveis (unidade com acesso). */
  function aplicarMassa(acao: AcaoMassa) {
    const ids = [...sel].map(Number).filter(editavelDfd);
    if (acao.campo === "reparticao") {
      setRepIds((m) => {
        const n = new Map(m);
        for (const id of ids) n.set(id, acao.reparticaoId);
        return n;
      });
    } else {
      setDfds((m) => {
        const n = new Map(m);
        for (const id of ids) {
          const d = n.get(id);
          if (d) n.set(id, aplicarMassaDfd(d, acao));
        }
        return n;
      });
    }
    setEditados((s) => {
      const n = new Set(s);
      for (const id of ids) n.add(id);
      return n;
    });
    setErro(ids.length < sel.size ? `${sel.size - ids.length} DFD(s) de unidade sem acesso não foram alterados.` : null);
    setSel(new Set());
  }

  /** Grava SÓ o que mudou: a capa (PATCH do protocolo) e cada DFD editado (PATCH do DFD). */
  async function salvar() {
    if (!proto || !capa) return;
    setSalvando(true);
    setErro(null);
    const falhas: string[] = [];
    const preservar: Preservar = { dfds: new Map(), capa: null };
    const sujos = ordem.filter((id) => editados.has(id) || itensEditados.has(id));
    try {
      /** PATCH resiliente: rede fora / 5xx sem corpo viram FALHA daquele alvo (os demais seguem). */
      const enviar = async (url: string, body: unknown): Promise<string | null> => {
        try {
          const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          return r.ok && j.ok ? null : (j.error ?? `falha ao salvar (HTTP ${r.status})`);
        } catch {
          return "sem conexão com o servidor";
        }
      };
      const bodyCapa = diffCapaGravada(capaDe(proto), capa);
      if (Object.keys(bodyCapa).length > 0) {
        setProgresso({ feito: 0, total: sujos.length + 1, label: "capa do protocolo" });
        const falha = await enviar(`/api/protocolo/${proto.id}`, bodyCapa);
        if (falha) {
          falhas.push(`Capa: ${falha}`);
          preservar.capa = capa;
        }
      }
      for (let k = 0; k < sujos.length; k++) {
        const id = sujos[k];
        const o = orig.get(id);
        const d = dfds.get(id);
        if (!o || !d) continue;
        setProgresso({ feito: k, total: sujos.length, label: `DFD ${d.numero} (${k + 1}/${sujos.length})` });
        const body = diffDfdGravado(o, d, repIds.get(id) ?? null, itensEditados.has(id));
        if (Object.keys(body).length === 0) continue;
        const falha = await enviar(`/api/dfd/${id}`, body);
        if (falha) {
          falhas.push(`DFD ${d.numero}: ${falha}`);
          preservar.dfds.set(id, { d, rep: repIds.get(id) ?? null, itens: itensEditados.has(id) });
        }
      }
    } finally {
      setSalvando(false);
      setProgresso(null);
    }
    onAlterado();
    await carregar(proto.id, abertoId, preservar);
    if (falhas.length > 0) setErro(`Não foi possível salvar: ${falhas.join(" · ")}`);
  }

  // ---- Relatório (despacho) — mesmas pendências cirúrgicas da análise.
  const faltasDoDfd = (id: number): string[] => {
    const d = dfds.get(id);
    if (!d) return [];
    const rid = repIds.get(id) ?? null;
    const resAss = conferirAssinaturaDfd(d, repConf(rid));
    const cirurgicas = faltasCirurgicasDfd(
      { itens: d.itens, secoes: d.secoes, reparticaoId: rid, assinaturaMotivo: resAss.status === "erro" ? resAss.motivo : null, tipo: d.tipo, anoPca: d.anoPca },
      regras,
      { categoria },
    );
    const extras = (avaliacoes.get(id)?.mensagens ?? []).filter((m) => m.status === "erro" && ERRO_EXTRA.has(m.chave)).map((m) => m.texto);
    return [...extras, ...cirurgicas];
  };
  const temErro = linhasErro.length > 0 || conc.divergente;
  const temRelatorio = temErro || linhasAtencao.length > 0;
  const relatorioLinhas = proto
    ? linhasRelatorioProtocolo({
        numero: proto.numero,
        idExterno: proto.idExterno,
        interessado: capa?.interessado ?? null,
        assunto: capa?.assunto ?? null,
        capaMotivo: conc.motivo,
        dfds: [
          ...linhasErro.map((l) => ({ numero: l.numero, planejamento: l.planejamento, tipo: dfds.get(l.key)?.tipo ?? null, faltas: faltasDoDfd(l.key) })),
          ...(incluirAtencao
            ? linhasAtencao.map((l) => ({
                numero: l.numero,
                planejamento: l.planejamento,
                tipo: dfds.get(l.key)?.tipo ?? null,
                faltas: (avaliacoes.get(l.key)?.mensagens ?? []).filter((m) => m.status === "atencao").map((m) => m.texto),
              }))
            : []),
        ],
      })
    : [];

  const capaView: CapaValores | null =
    proto && capa
      ? {
          numero: proto.numero,
          idExterno: proto.idExterno,
          data: proto.data ?? "",
          documento: capa.documento ?? "",
          interessado: capa.interessado ?? "",
          assunto: capa.assunto ?? "",
          observacao: capa.observacao ?? "",
          valorCapa: capa.valorCapa,
          localReparticao: capa.localReparticao,
        }
      : null;
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0;
  const numeroAberto = dfdAberto?.numero ?? "";
  // Rodapé do DFD aberto = a MESMA régua do painel ao lado (mensagens completas, incl. catálogo).
  const estadoAberto =
    abertoId != null && dfdAberto
      ? estadoDeMensagens(mensagensAberto, { editado: editados.has(abertoId) || itensEditados.has(abertoId) })
      : null;

  const botaoAtualizar =
    proto && !salvando ? (
      <Button variant="icon" aria-label="Atualizar" title="Recarregar com os dados do banco" onClick={atualizar}>
        <IconRefresh className="h-5 w-5" />
      </Button>
    ) : undefined;

  /** Banner do PROTOCOLO (corpo único + seleção/edição em massa + relatório + salvar). */
  const principal: ConteudoBanner = {
    titulo: proto ? `Protocolo ${proto.numero}` : "Protocolo",
    cabecalho: proto ? <ProtocoloCabecalho numero={proto.numero} idExterno={proto.idExterno} assunto={capa?.assunto ?? proto.assunto} /> : undefined,
    acoesCabecalho: botaoAtualizar,
    rodape: (
      <div>
        {erro && (
          <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />} className="mb-3">
            {erro}
          </Callout>
        )}
        {sel.size > 0 && podeEditar && !salvando && (
          <BarraSelecao
            registros={linhasSel.map((l) => ({ key: l.key, rotulo: `DFD ${l.numero}` }))}
            onRemover={(k) => setSel((s) => new Set([...s].filter((x) => x !== k)))}
            onLimpar={() => setSel(new Set())}
            resumo={
              <ResumoSelecao
                qtd={linhasSel.length}
                singular="DFD"
                plural="DFDs"
                soma={linhasSel.reduce((t, l) => t + (l.valor ?? 0), 0)}
                extra={`${num(linhasSel.reduce((t, l) => t + (l.itens ?? 0), 0))} itens`}
              />
            }
          >
            <BarraEdicaoMassa reparticoes={reparticoes} anoPadrao={proto?.anoPca ?? null} regras={regras} onAplicar={aplicarMassa} />
          </BarraSelecao>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {salvando && progresso ? (
            <div className="min-w-[200px] flex-1">
              <Progress value={pct} label={`Salvando ${progresso.label}... ${pct}% — não feche esta janela`} />
            </div>
          ) : (
            <span className="text-[12px]" style={{ color: sujo ? "var(--accent)" : "var(--muted)" }}>
              {sujo
                ? "Alterações não salvas"
                : `${linhas.length} DFD(s) · ${linhasErro.length > 0 ? `${linhasErro.length} com erro` : linhasAtencao.length > 0 ? `${linhasAtencao.length} em atenção` : "tudo certo"}`}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {!salvando && temRelatorio && (
              <Button
                variant="secondary"
                onClick={() => setRelatorioAberto(true)}
                icon={<IconAlert className="h-4 w-4" style={{ color: temErro ? "var(--danger)" : "var(--warn)" }} />}
              >
                {temErro ? "Relatório de erro" : "Relatório de atenção"}
              </Button>
            )}
            {podeEditar && proto && !salvando && (
              <Button
                variant="secondary"
                onClick={() => setReenviar((n) => n + 1)}
                disabled={sujo}
                title={sujo ? "Salve ou descarte as alterações antes de reenviar" : "Reenviar o PDF corrigido deste protocolo: compara com o gravado e sobrescreve"}
                icon={<IconUpload className="h-4 w-4" />}
              >
                Reenviar protocolo
              </Button>
            )}
            <Button variant="secondary" onClick={fechar} disabled={salvando}>
              Fechar
            </Button>
            {podeEditar && (
              <Button onClick={salvar} loading={salvando} disabled={!sujo}>
                Salvar alterações
              </Button>
            )}
          </div>
        </div>
      </div>
    ),
    children:
      !proto || !capa || !capaView ? (
        erro ? null : (
          <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />}>
            Carregando o protocolo e seus DFDs…
          </Callout>
        )
      ) : (
        <ProtocoloView
          key={versao}
          capa={capaView}
          modoCapa={podeEditar && !salvando ? "cadeado" : "leitura"}
          assuntos={opcoesAssunto(regras, capa.assunto ?? "")}
          onCapaChange={(c, v) => {
            if (c === "numero" || c === "data") return; // identificadores: imutáveis
            const valor = v || null;
            setCapa((x) => (x ? ({ ...x, [c]: valor } as CapaEditavel) : x));
          }}
          onValorCapaChange={(v) => setCapa((x) => (x ? { ...x, valorCapa: v } : x))}
          unidade={{
            id: capa.reparticaoId,
            opcoes: reparticoes,
            onChange: podeEditar && !salvando ? (id) => setCapa((x) => (x ? { ...x, reparticaoId: id } : x)) : undefined,
            textoLeitura: proto.reparticaoCodigo ? `${proto.reparticaoCodigo}${proto.reparticaoNome ? ` · ${proto.reparticaoNome}` : ""}` : "Sem unidade",
          }}
          pca={<TextField label="PCA (ano)" value={proto.anoPca != null ? String(proto.anoPca) : "—"} disabled readOnly />}
          totais={{ dfds: linhas.length, itens: totalItens, somatorio }}
          conciliacao={conc}
          onSubstituir={podeEditar && !salvando ? () => setCapa((x) => (x ? { ...x, valorCapa: conc.somatorio } : x)) : undefined}
          linhas={linhas}
          unica
          selecionavel={podeEditar}
          selected={sel}
          onSelected={setSel}
          // Empilhado (entrou à direita de um DFD): a linha troca o DFD da pilha; senão abre o DFD ao lado.
          onVerDfd={empilhado ? empilhado.onVerDfd : abrirDfd}
          dfdAtivo={empilhado ? empilhado.dfdAtivo : abertoId}
          compacta={!!empilhado || abertoId != null}
          regras={regras}
          nota={proto.criadoEm ? <p className="text-[11px] text-faint">Protocolado em {dataBR(proto.criadoEm)}.</p> : undefined}
        />
      ),
  };

  /** DFD aberto AO LADO do protocolo (mesmo corpo/rodapé da análise). */
  const lateral: ModalPainel = {
    id: "proto-dfd",
    aberto: !empilhado && abertoId != null && !!dfdAberto,
    titulo: `DFD ${numeroAberto}`,
    cabecalho: dfdAberto ? <DfdCabecalho numero={dfdAberto.numero} tipo={dfdAberto.tipo} planejamento={dfdAberto.planejamento} /> : undefined,
    onClose: fecharDfd,
    rodape: dfdAberto ? (
      <DfdRodape
        estado={estadoAberto}
        regras={regras}
        mensagens={mensagensAberto}
        mensagensAbertas={painel?.tipo === "mensagens"}
        onToggleMensagens={() => setPainel((p) => (p?.tipo === "mensagens" ? null : { tipo: "mensagens" }))}
        onFechar={fecharDfd}
        bloqueado={salvando}
        acoes={
          <Button variant="secondary" onClick={() => setPainel((p) => (p?.tipo === "historico" ? null : { tipo: "historico" }))}>
            <IconClock className="h-4 w-4" /> Histórico
          </Button>
        }
      />
    ) : undefined,
    children: dfdAberto ? (
      <div key={`${abertoId}:${versao}`} className="animate-fade-in-up">
        <DfdConferir
          dfd={dfdAberto}
          reparticoes={reparticoesAberto}
          reparticaoAtivaId={reparticaoAtivaId}
          repId={repAbertoId}
          anoPca={anoAberto}
          autoMatch={false}
          readOnly={!editavelAberto || salvando}
          tabelaUnica
          categoria={categoria}
          regras={regras}
          orgaos={orgaos}
          conformidade={conformidade}
          ancoraAlvo={ancoraAlvo}
          itemAtivo={painel?.tipo === "item" ? painel.idx : null}
          onItemClick={(idx) => setPainel({ tipo: "item", idx })}
          onRepChange={(id) => {
            if (abertoId == null) return;
            const alvo = abertoId;
            setRepIds((m) => new Map(m).set(alvo, id));
            setEditados((s) => new Set(s).add(alvo));
          }}
          onSecoesChange={(secoes) => editarAberto((d) => ({ ...d, secoes }))}
          onRefsChange={(refs) => editarAberto((d) => ({ ...d, ...refs }))}
          onCamposChange={(campos) => editarAberto((d) => ({ ...d, ...campos }))}
          onTipoChange={(tipo) => editarAberto((d) => ({ ...d, tipo }))}
          onAssinaturasChange={(assinaturas) => editarAberto((d) => ({ ...d, assinaturas }))}
        />
      </div>
    ) : null,
  };

  /** Painel da DIREITA do DFD aberto (mensagens / item / histórico). */
  const lateral2: ModalPainel = {
    id: "proto-dfd-direito",
    aberto: !empilhado && abertoId != null && !!dfdAberto && painel != null,
    titulo: tituloPainelDfd(painel, dfdAberto, numeroAberto),
    onClose: () => setPainel(null),
    rodape: painel?.tipo === "item" ? <RodapePainelItem onVerDfd={() => setPainel(null)} /> : undefined,
    children: (
      <DfdPainelDireito
        painel={painel}
        dfd={dfdAberto}
        numero={numeroAberto}
        mensagens={mensagensAberto}
        onIrPara={(m) => setAncoraAlvo({ ancora: m.ancora, cor: STATUS_MENSAGEM_COR[m.status], nonce: Date.now() })}
        conformidade={conformidade}
        regras={regras}
        editavel={editavelAberto && !salvando}
        onEditarItem={(i, patch) => editarAberto((d) => editarItemDfd(d, i, patch), true)}
        onRemoverItem={(i) => {
          setPainel(null);
          editarAberto((d) => removerItemDfd(d, i), true);
        }}
        dfdId={abertoId}
      />
    ),
  };

  // Base do REENVIO: o protocolo gravado + os DFDs completos (estável entre renders — cache da comparação).
  const baseReenvio: BaseReenvio | null = useMemo(
    () => (proto ? { protocolo: proto, dfds: ordem.map((id) => orig.get(id)).filter((d): d is DfdDetalhe => !!d) } : null),
    [proto, orig, ordem],
  );

  /** Fora da pilha: o relatório (despacho) e o REENVIO do PDF são modais próprios. */
  const extra = (
    <>
      {podeEditar && baseReenvio && (
        <ProtocoloUploadForm
          reenvio={baseReenvio}
          iniciar={reenviar}
          onConcluido={() => {
            onAlterado();
            void carregar(baseReenvio.protocolo.id, null);
          }}
          reparticoes={reparticoes}
          reparticaoAtivaId={reparticaoAtivaId}
          dfdsExistentes={dfdsExistentes}
          pcas={pcas}
          regras={regras}
          orgaos={orgaos}
        />
      )}
      <RelatorioErros
      open={relatorioAberto}
      onClose={() => setRelatorioAberto(false)}
      titulo={`Relatório do protocolo ${proto?.numero ?? ""}`.trim()}
      linhas={relatorioLinhas}
      toggle={
        linhasAtencao.length > 0
          ? { label: `Incluir ${linhasAtencao.length} DFD(s) em atenção no relatório`, checked: incluirAtencao, onChange: setIncluirAtencao }
          : undefined
      }
      />
    </>
  );

  return {
    aberto: protocoloId != null,
    bloqueado: salvando,
    sujo,
    proto,
    principal,
    /** Painéis ao lado (DFD + direita) — só fora do modo empilhado e com DFDs. */
    paineis: empilhado || ordem.length === 0 ? [] : [lateral, lateral2],
    extra,
    fechar,
    podeDescartar,
  };
}
