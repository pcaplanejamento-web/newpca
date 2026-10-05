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
  prioridadeDoDfd,
  removerItemDfd,
  unificarItensDfd,
} from "@/lib/dfd-tratamento";
import { dataBR } from "@/lib/format";
import { type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { type AlvoPendencia, pendenciaDaCapa, pendenciasDoDfd, type ProtocoloPendente } from "@/lib/pendencias-core";
import type { DfdSobrescrito, ProtocoloDetalhe } from "@/lib/protocolo";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import type { UnidadeConferencia } from "@/lib/reparticoes";
import { type AjusteRevisao, podeRevisarItens, resumoRevisao, resumoRevisaoLote, revisarCapa, revisarDfd } from "@/lib/revisao-dfd";
import { BarraEdicaoMassa } from "./BarraEdicaoMassa";
import { BarraSelecaoDfds } from "./BarraSelecao";
import { BotaoAcao } from "./BotaoAcao";
import { BotaoAtualizar, useGiro } from "./BotaoAtualizar";
import { type PodeMesa, podeNoRecurso } from "@/lib/papeis-core";
import { localDoProtocolo } from "@/lib/pca-core";
import { avisoIncorporado } from "@/lib/pca-numeracao-core";
import { Callout } from "./Callout";
import type { AncoraAlvo } from "./DestaqueAncora";
import { DfdConferir, type PainelDfd } from "./DfdConferir";
import { DfdPainelDireito, RodapePainelItem, tituloPainelDfd } from "./DfdPainelDireito";
import { DfdRodape } from "./DfdRodape";
import { DfdUploadForm } from "./DfdUploadForm";
import { DfdCabecalho } from "./DfdView";
import { TextField } from "./Field";
import { Historico, useHistorico } from "./Historico";
import { IconAlert, IconClock, IconSave, IconSpinner, IconUpload } from "./icons";
import { IndicadorPendencias } from "./IndicadorPendencias";
import type { ConteudoBanner } from "./DfdGravado";
import { Modal, type ModalPainel } from "./Modal";
import type { PcaOpcao } from "./PcaPicker";
import type { LinhaDfd } from "./PlanilhaDfds";
import { Progress } from "./Progress";
import { type BaseReenvio, ProtocoloUploadForm } from "./ProtocoloUploadForm";
import { type CapaValores, ProtocoloCabecalho, ProtocoloView } from "./ProtocoloView";
import { PainelPendencias } from "./PainelPendencias";
import { TarefasDoVinculo } from "./TarefasDoVinculo";
import { toast } from "./Toast";
import { useConformidade } from "./useConformidade";
import { ehDesktop } from "./espacamento";

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
 * relatório de erros e o HISTÓRICO do protocolo (modal: capa + DFDs + itens, agrupado por evento). A ÚNICA diferença: a planilha é UMA tabela só (`unica`). As edições ficam num
 * RASCUNHO até "Salvar alterações" (só o que mudou vai ao banco — `diffCapaGravada`/`diffDfdGravado`).
 * Devolve os PAINÉIS para a pilha de banners da Mesa (`BannersMesa`). `empilhado`: o protocolo entrou
 * à DIREITA de um DFD ("Ver protocolo") — clicar numa linha troca o DFD da pilha (sem DFD ao lado).
 */
export function useProtocoloGravado({
  protocoloId,
  dfdInicial = null,
  onFechar,
  empilhado = null,
  pode,
  reparticoes,
  reparticaoAtivaId,
  regras,
  orgaos,
  onAlterado,
  sinal = 0,
  pcas = [],
  onAbrirProtocolo,
}: {
  /** Protocolo a abrir (`null` = fechado). */
  protocoloId: number | null;
  /** Abre já com este DFD ao lado. */
  dfdInicial?: number | null;
  /** X / Fechar do banner do protocolo (a pilha decide o que fecha). */
  onFechar: () => void;
  /** Entrou à direita de um DFD: a linha ativa é o DFD da pilha e clicar numa linha o troca. */
  empilhado?: { dfdAtivo: number | null; onVerDfd: (dfdId: number) => void } | null;
  /** O que o PAPEL permite nas duas Mesas — o protocolo (e os DFDs dele) segue a Mesa em que está. */
  pode: PodeMesa;
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
  /** Abre OUTRO protocolo na pilha (o protocolo ATUAL de um DFD sobrescrito — o rastro cinza). */
  onAbrirProtocolo?: (protocoloId: number) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [proto, setProto] = useState<ProtocoloDetalhe | null>(null);
  // Protocolo INCORPORADO a um PCA: tudo se edita como num protocolo comum — o PCA acompanha (o aviso diz como).
  const avisoPca = proto && localDoProtocolo(proto) === "incorporado" ? avisoIncorporado(proto.pcaNome) : null;
  // O PAPEL na Mesa em que o protocolo está: editar = Manipular; reenviar o PDF e sobrescrever um DFD = Importar (o reenvio
  // que exclui os DFDs fora do PDF também pede Excluir).
  const podeProto = podeNoRecurso(pode, proto?.pcaId);
  const podeEditar = podeProto.manipular;
  const podeImportar = podeProto.importar;
  const [orig, setOrig] = useState<Map<number, DfdDetalhe>>(new Map());
  const [ordem, setOrdem] = useState<number[]>([]);
  const [dfds, setDfds] = useState<Map<number, DfdParseado>>(new Map());
  const [repIds, setRepIds] = useState<Map<number, number | null>>(new Map());
  const [unidadesExtra, setUnidadesExtra] = useState<UnidadeConferencia[]>([]);
  // RASTRO: DFDs deste processo SOBRESCRITOS por outro protocolo (cinza, com o protocolo atual de cada um).
  const [sobrescritos, setSobrescritos] = useState<DfdSobrescrito[]>([]);
  const [capa, setCapa] = useState<CapaEditavel | null>(null);
  const [editados, setEditados] = useState<Set<number>>(new Set());
  const [itensEditados, setItensEditados] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<Set<string | number>>(new Set());
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [painel, setPainel] = useState<PainelDfd | null>(null);
  const [ancoraAlvo, setAncoraAlvo] = useState<AncoraAlvo | null>(null);
  const [salvando, setSalvando] = useState(false);
  // SOBRESCRITA do DFD ao lado em andamento (lançador/leitura/escolha/gravação): o banner fica só-leitura.
  const [sobrescrevendoDfd, setSobrescrevendoDfd] = useState(false);
  const travado = salvando || sobrescrevendoDfd;
  /** Por que as ações estão travadas (a dica dos botões que ficam À VISTA, desabilitados — nunca somem). */
  const motivoTrava = salvando ? "Salvando as alterações…" : sobrescrevendoDfd ? "Sobrescrita do DFD em andamento — conclua ou cancele" : undefined;
  const [progresso, setProgresso] = useState<{ feito: number; total: number; label: string } | null>(null);
  // PENDÊNCIAS do protocolo (o banner único — capa + DFDs + itens) e o destaque da capa ao tocar nela.
  const [pendAbertas, setPendAbertas] = useState(false);
  const [destaqueCapa, setDestaqueCapa] = useState<AncoraAlvo | null>(null);
  // Versão dos dados carregados: remonta o corpo/DFD após recarregar (os cadeados voltam a travar).
  const [versao, setVersao] = useState(0);
  // REENVIO do PDF (sobrescrever): contador que abre o lançador do `ProtocoloUploadForm` em modo reenvio.
  const [reenviar, setReenviar] = useState(0);
  // SOBRESCREVER o DFD aberto ao lado com um arquivo novo (escolha por dado).
  const [sobrescreverDfd, setSobrescreverDfd] = useState(0);
  // HISTÓRICO conectado do protocolo (capa + DFDs + itens) — modal próprio, carregado só ao abrir.
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const historico = useHistorico(historicoAberto && proto ? `/api/protocolo/${proto.id}/historico` : null);

  // Nº da requisição de carga — só a MAIS RECENTE aplica o resultado (abrir A, fechar e abrir B: uma
  // resposta atrasada de A nunca aparece no banner de B).
  // Devolve o que aplicou (`null` = falhou ou foi superada) — o Atualizar revisa em cima disso.
  const cargaRef = useRef(0);
  async function carregar(
    id: number,
    abrir: number | null,
    preservar?: Preservar,
  ): Promise<{ protocolo: ProtocoloDetalhe; lista: DfdDetalhe[]; rascunhos: Map<number, DfdParseado> } | null> {
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
        sobrescritos?: DfdSobrescrito[];
      };
      if (minha !== cargaRef.current) return null;
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
      setSobrescritos(j.sobrescritos ?? []);
      setEditados(ed);
      setItensEditados(edItens);
      setSel(new Set());
      setAbertoId(abrir != null && rascunhos.has(abrir) ? abrir : null);
      setPainel(null);
      setAncoraAlvo(null);
      setVersao((v) => v + 1);
      return { protocolo: j.protocolo, lista, rascunhos };
    } catch (e) {
      if (minha === cargaRef.current) setErro(e instanceof Error ? e.message : "Não foi possível abrir o protocolo.");
      return null;
    }
  }

  // O protocolo que o host pede AGORA — a recarga pós-gravação só vale se ainda for o mesmo.
  const pedidoRef = useRef(protocoloId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: recarrega só ao trocar o protocolo/DFD inicial pedido pelo host.
  useEffect(() => {
    pedidoRef.current = protocoloId;
    // Zera TODO o estado do banner anterior (rascunho, seleção, painéis) — fechar descarta o rascunho
    // e o aviso de "alterações não salvas" não fica ligado depois de fechar.
    cargaRef.current++;
    setProto(null);
    setCapa(null);
    setOrig(new Map());
    setOrdem([]);
    setDfds(new Map());
    setRepIds(new Map());
    setSobrescritos([]);
    setEditados(new Set());
    setItensEditados(new Set());
    setSel(new Set());
    setAbertoId(null);
    setPainel(null);
    setErro(null);
    setHistoricoAberto(false);
    if (protocoloId != null) void carregar(protocoloId, dfdInicial);
  }, [protocoloId, dfdInicial]);

  const capaSuja = !!proto && !!capa && Object.keys(diffCapaGravada(capaDe(proto), capa)).length > 0;
  const sujo = capaSuja || editados.size > 0 || itensEditados.size > 0;
  // Recarga externa (outro banner da pilha gravou) — só sem rascunho (nunca perde edição).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só ao sinal.
  useEffect(() => {
    if (sinal > 0 && proto && !sujo && !travado) void carregar(proto.id, abertoId);
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
        prioridade: prioridadeDoDfd(d.secoes),
      },
    ];
  });
  const linhasSel = linhas.filter((l) => sel.has(l.key));
  const somatorio = linhas.reduce((s, l) => s + (l.valor ?? 0), 0);
  const totalItens = linhas.reduce((s, l) => s + (l.itens ?? 0), 0);
  // A capa foi emitida com os DFDs que o processo TINHA — os sobrescritos depois por outro protocolo (o rastro,
  // com o valor da época) seguem na conciliação.
  const valorSobrescritos = sobrescritos.reduce((s, x) => s + (x.valorTotal ?? 0), 0);
  const conc = conciliacaoCapa(
    { valorCapa: capa?.valorCapa, somatorio: somatorio + valorSobrescritos, totalDfds: linhas.length + sobrescritos.length },
    regras,
    { categoria },
  );

  // ---- DFD aberto ao lado (mesmo componente/rodapé/painel da análise).
  const dfdAberto = abertoId != null ? (dfds.get(abertoId) ?? null) : null;
  const repAbertoId = abertoId != null ? (repIds.get(abertoId) ?? null) : null;
  const editavelAberto = abertoId != null && editavelDfd(abertoId);
  // Sobrescrever o DFD aberto com o arquivo novo (Importar) — de unidade acessível.
  const sobrescreveAberto = podeImportar && abertoId != null && acessivel(orig.get(abertoId)?.reparticaoId ?? null);
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

  // Sobrescrita em andamento: o DFD aberto é a BASE dela — trocar/fechar o DFD desmontaria a sobrescrita no meio.
  function abrirDfd(id: number) {
    if (sobrescrevendoDfd) return;
    setAbertoId(id);
    setPainel(null);
    setAncoraAlvo(null);
  }
  function fecharDfd() {
    if (sobrescrevendoDfd) return;
    setAbertoId(null);
    setPainel(null);
    setAncoraAlvo(null);
  }
  /** Pede confirmação para descartar o rascunho (`true` = pode seguir). */
  const podeDescartar = (msg: string) => !sujo || confirm(msg);
  function fechar() {
    if (travado) return;
    if (!podeDescartar("Há alterações não salvas neste protocolo. Fechar e descartá-las?")) return;
    fecharDfd();
    onFechar();
  }
  /**
   * ATUALIZAR (o ícone gira): recarrega do banco e REVISA — a capa (`revisarCapa`) e cada DFD editável (`revisarDfd`:
   * texto em parágrafos, textos limpos, padronização do ADM, referências da renovação) — no RASCUNHO, para conferir e
   * gravar em "Salvar alterações". Protocolo incorporado a um PCA / DFD de unidade sem acesso: só recarrega.
   */
  const giro = useGiro();
  function atualizar() {
    if (!proto) return;
    if (sujo && !confirm("Descartar as alterações não salvas, recarregar do banco e revisar os dados?")) return;
    const id = proto.id;
    void giro.girar(async () => {
      const r = await carregar(id, abertoId);
      if (!r || pedidoRef.current !== id) return;
      const { protocolo, lista, rascunhos } = r;
      const podeTratar = podeNoRecurso(pode, protocolo.pcaId).manipular;
      const cat = classificarAssunto(protocolo.assunto);
      const revCapa = revisarCapa(capaDe(protocolo));
      const porDfd: AjusteRevisao[][] = [];
      const tratados = new Map<number, { d: DfdParseado; itens: boolean }>();
      for (const o of lista) {
        const d = rascunhos.get(o.id);
        if (!d) continue;
        const rev = revisarDfd(d, { regras, anoPca: d.anoPca ?? protocolo.anoPca ?? null, itens: podeRevisarItens(d, regras, cat) });
        if (rev.ajustes.length === 0) continue;
        porDfd.push(rev.ajustes);
        if (podeTratar && acessivel(o.reparticaoId)) tratados.set(o.id, { d: rev.dfd, itens: rev.itensAlterados });
      }
      const partes = [resumoRevisao(revCapa.ajustes), resumoRevisaoLote(porDfd)].filter(Boolean).join("; ");
      if (!partes) return void toast.success(`Protocolo ${protocolo.numero} atualizado — nada a tratar.`);
      if (!podeTratar || (tratados.size === 0 && revCapa.ajustes.length === 0))
        return void toast.warning(
          `Protocolo ${protocolo.numero} atualizado. Há dados a tratar (${partes}), mas ${podeTratar ? "os DFDs são de unidade sem acesso" : "ele está só-leitura"}.`,
          8000,
        );
      if (revCapa.ajustes.length > 0) setCapa(revCapa.capa);
      if (tratados.size > 0) {
        setDfds((m) => {
          const n = new Map(m);
          for (const [pid, t] of tratados) n.set(pid, t.d);
          return n;
        });
        setEditados(new Set(tratados.keys()));
        setItensEditados(new Set([...tratados].filter(([, t]) => t.itens).map(([pid]) => pid)));
      }
      const semAcesso = porDfd.length - tratados.size;
      toast.info(
        `Protocolo ${protocolo.numero} revisado: ${partes}.${semAcesso > 0 ? ` ${semAcesso} DFD(s) de unidade sem acesso ficaram como estão.` : ""} Confira e clique em "Salvar alterações".`,
        10000,
      );
    });
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
    if (pedidoRef.current !== proto.id) return; // o banner já mostra outro protocolo (ou fechou)
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
      { planejamento: d.planejamento, itens: d.itens, secoes: d.secoes, reparticaoId: rid, assinaturaMotivo: resAss.status === "erro" ? resAss.motivo : null, tipo: d.tipo, anoPca: d.anoPca },
      regras,
      { categoria },
    );
    const extras = (avaliacoes.get(id)?.mensagens ?? []).filter((m) => m.status === "erro" && ERRO_EXTRA.has(m.chave)).map((m) => m.texto);
    return [...extras, ...cirurgicas];
  };
  // A CONTAGEM do protocolo = a capa + a SOMA das pendências dos DFDs (as mesmas mensagens da célula Estado).
  const contagem = { erros: conc.divergente && conc.bloqueia ? 1 : 0, atencoes: conc.divergente && !conc.bloqueia ? 1 : 0 };
  for (const l of linhas) {
    if (l.estado !== "erro" && l.estado !== "atencao") continue;
    for (const m of l.key === abertoId ? mensagensAberto : (avaliacoes.get(l.key)?.mensagens ?? [])) {
      if (m.status === "erro") contagem.erros++;
      else if (m.status === "atencao") contagem.atencoes++;
    }
  }
  const temRelatorio = contagem.erros + contagem.atencoes > 0;
  // A árvore de PENDÊNCIAS (capa + a soma dos DFDs, cada DFD a soma dos itens) — montada só com o painel aberto. As
  // mensagens são as MESMAS da célula Estado (o DFD aberto, com o catálogo já conferido).
  const pendProto: ProtocoloPendente | null =
    pendAbertas && proto
      ? {
          numero: proto.numero,
          idExterno: proto.idExterno,
          interessado: capa?.interessado ?? null,
          assunto: capa?.assunto ?? null,
          capa: pendenciaDaCapa(conc, capa?.valorCapa),
          dfds: linhas
            .filter((l) => l.estado === "erro" || l.estado === "atencao")
            .flatMap((l) => {
              const d = dfds.get(l.key);
              if (!d) return [];
              const aberto = l.key === abertoId;
              return [
                pendenciasDoDfd(
                  { chave: l.key, numero: d.numero, planejamento: d.planejamento, tipo: d.tipo, secoes: d.secoes, itens: d.itens },
                  aberto ? mensagensAberto : (avaliacoes.get(l.key)?.mensagens ?? []),
                  aberto ? conformidade : undefined,
                  l.estado === "erro" ? faltasDoDfd(l.key) : undefined,
                ),
              ];
            }),
        }
      : null;
  /** Tocar numa pendência: a capa pulsa no protocolo; a de um DFD abre o DFD ao lado no lugar (o item com o campo). */
  function irParaPendencia(alvo: AlvoPendencia, cor: string) {
    const nonce = Date.now();
    if (!ehDesktop()) setPendAbertas(false); // no celular só um banner aparece: o destino vem à frente
    if (alvo.dfd == null) return setDestaqueCapa({ ancora: alvo.ancora, cor, nonce });
    const id = Number(alvo.dfd);
    if (empilhado) {
      setPendAbertas(false);
      return empilhado.onVerDfd(id);
    }
    if (sobrescrevendoDfd && id !== abertoId) return;
    setPendAbertas(false);
    setAbertoId(id);
    if (alvo.item != null) {
      setAncoraAlvo(null);
      setPainel({ tipo: "item", idx: alvo.item, destaque: { ancora: alvo.ancora, cor, nonce } });
    } else {
      setPainel({ tipo: "mensagens" });
      setAncoraAlvo({ ancora: alvo.ancora, cor, nonce });
    }
  }

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

  const botaoAtualizar = proto ? (
    <BotaoAtualizar
      ativo={giro.girando}
      rotulo="Atualizar e revisar"
      dica={motivoTrava ?? "Atualizar: recarrega do banco e revisa os dados (trata o que for possível)"}
      detalhe="Atualizando e revisando os dados…"
      onClick={atualizar}
      disabled={travado}
    />
  ) : undefined;

  /** Banner do PROTOCOLO (corpo único + seleção/edição em massa + relatório + salvar). */
  const principal: ConteudoBanner = {
    titulo: proto ? `Protocolo ${proto.numero}` : "Protocolo",
    cabecalho: proto ? <ProtocoloCabecalho numero={proto.numero} idExterno={proto.idExterno} assunto={capa?.assunto ?? proto.assunto} /> : undefined,
    acoesCabecalho: (
      <>
        {proto && <BotaoAcao rotulo="Histórico do protocolo" icon={<IconClock className="h-4 w-4" />} onClick={() => setHistoricoAberto(true)} />}
        {proto && <TarefasDoVinculo tipo="protocolo" id={proto.id} disabled={travado} dica={motivoTrava} />}
        {botaoAtualizar}
      </>
    ),
    rodape: (
      <div>
        {erro && (
          <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />} className="mb-3">
            {erro}
          </Callout>
        )}
        {sel.size > 0 && podeEditar && !travado && (
          <BarraSelecaoDfds
            dfds={linhasSel.map((l) => ({ key: l.key, numero: l.numero, planejamento: l.planejamento, valor: l.valor, itens: l.itens }))}
            onRemover={(k) => setSel((s) => new Set([...s].filter((x) => x !== k)))}
            onLimpar={() => setSel(new Set())}
          >
            <BarraEdicaoMassa reparticoes={reparticoes} anoPadrao={proto?.anoPca ?? null} regras={regras} onAplicar={aplicarMassa} />
          </BarraSelecaoDfds>
        )}
        <div className="flex flex-nowrap items-center gap-2">
          {salvando && progresso ? (
            <div className="min-w-0 flex-1">
              <Progress value={pct} label={`Salvando ${progresso.label}... ${pct}% — não feche esta janela`} />
            </div>
          ) : (
            <>
              <IndicadorPendencias
                erros={contagem.erros}
                atencoes={contagem.atencoes}
                alvo="ver as pendências do protocolo"
                aberto={pendAbertas}
                onClick={temRelatorio ? () => setPendAbertas((v) => !v) : undefined}
              />
              {sujo && <span className="hidden min-w-0 truncate text-[12px] text-accent md:inline">Alterações não salvas</span>}
            </>
          )}
          <div className="ml-auto flex flex-nowrap items-center gap-1.5">
            {podeImportar && proto && (
              <BotaoAcao
                variant="primary"
                rotulo="Reenviar protocolo"
                icon={<IconUpload className="h-4 w-4" />}
                onClick={() => setReenviar((n) => n + 1)}
                disabled={sujo || travado}
                dica={motivoTrava ?? (sujo ? "Salve ou descarte as alterações antes de reenviar" : "Reenviar protocolo: suba o PDF corrigido, compare com o gravado e sobrescreva")}
              />
            )}
            {podeEditar && (
              <BotaoAcao texto variant="primary" rotulo="Salvar alterações" icon={<IconSave className="h-4 w-4" />} onClick={salvar} loading={salvando} disabled={!sujo || sobrescrevendoDfd} />
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
          destaque={destaqueCapa}
          topo={avisoPca ? <Callout kind="info">{avisoPca}</Callout> : undefined}
          capa={capaView}
          modoCapa={podeEditar && !travado ? "cadeado" : "leitura"}
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
            onChange: podeEditar && !travado ? (id) => setCapa((x) => (x ? { ...x, reparticaoId: id } : x)) : undefined,
            textoLeitura: proto.reparticaoCodigo ? `${proto.reparticaoCodigo}${proto.reparticaoNome ? ` · ${proto.reparticaoNome}` : ""}` : "Sem unidade",
          }}
          pca={<TextField label="PCA (ano)" value={proto.anoPca != null ? String(proto.anoPca) : "—"} disabled readOnly />}
          totais={{ dfds: linhas.length, itens: totalItens, somatorio, sobrescritos: { qtd: sobrescritos.length, valor: valorSobrescritos } }}
          conciliacao={conc}
          onSubstituir={podeEditar && !travado ? () => setCapa((x) => (x ? { ...x, valorCapa: conc.somatorio } : x)) : undefined}
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
          sobrescritos={sobrescritos}
          onVerProtocolo={onAbrirProtocolo}
        />
      ),
  };

  /** DFD aberto AO LADO do protocolo (mesmo corpo/rodapé da análise). */
  const lateral: ModalPainel = {
    id: "proto-dfd",
    aberto: !empilhado && abertoId != null && !!dfdAberto,
    titulo: `DFD ${numeroAberto}`,
    cabecalho: dfdAberto ? <DfdCabecalho numero={dfdAberto.numero} tipo={dfdAberto.tipo} planejamento={dfdAberto.planejamento} /> : undefined,
    acoesCabecalho: dfdAberto ? (
      <>
        <BotaoAcao
          rotulo="Histórico"
          icon={<IconClock className="h-4 w-4" />}
          pressionado={painel?.tipo === "historico"}
          onClick={() => setPainel((p) => (p?.tipo === "historico" ? null : { tipo: "historico" }))}
        />
        {abertoId != null && <TarefasDoVinculo tipo="dfd" id={abertoId} disabled={travado} dica={motivoTrava} />}
      </>
    ) : undefined,
    onClose: fecharDfd,
    rodape: dfdAberto ? (
      <DfdRodape
        estado={estadoAberto}
        regras={regras}
        mensagens={mensagensAberto}
        mensagensAbertas={painel?.tipo === "mensagens"}
        onToggleMensagens={() => setPainel((p) => (p?.tipo === "mensagens" ? null : { tipo: "mensagens" }))}
        acoes={
          sobrescreveAberto ? (
            /* Subir o arquivo NOVO deste DFD e escolher, dado a dado, o que sobrescrever (continua neste protocolo). */
            <BotaoAcao
              variant="primary"
              rotulo="Sobrescrever DFD"
              icon={<IconUpload className="h-4 w-4" />}
              onClick={() => setSobrescreverDfd((n) => n + 1)}
              disabled={sujo || travado}
              dica={motivoTrava ?? (sujo ? "Salve ou descarte as alterações antes de sobrescrever" : "Sobrescrever DFD: suba o arquivo novo, compare com o gravado e escolha o que sobrescrever")}
            />
          ) : undefined
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
          readOnly={!editavelAberto || travado}
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
        onIrPara={(a) => setAncoraAlvo({ ...a, nonce: Date.now() })}
        conformidade={conformidade}
        regras={regras}
        editavel={editavelAberto && !travado}
        onEditarItem={(i, patch) => editarAberto((d) => editarItemDfd(d, i, patch), true)}
        onRemoverItem={(i) => {
          setPainel(null);
          editarAberto((d) => removerItemDfd(d, i), true);
        }}
        onUnificarItens={(k, outros) => editarAberto((d) => unificarItensDfd(d, k, outros), true)}
        onPainel={setPainel}
        categoria={categoria}
        dfdId={abertoId}
      />
    ),
  };

  /** As PENDÊNCIAS do protocolo — à direita (o mesmo banner do DFD e do item); tocar leva ao lugar. */
  const painelPendencias: ModalPainel = {
    id: "proto-pendencias",
    aberto: !empilhado && pendAbertas && !!pendProto,
    titulo: `Pendências — Protocolo ${proto?.numero ?? ""}`.trim(),
    onClose: () => setPendAbertas(false),
    children: pendProto ? <PainelPendencias pendencias={pendProto} escopo="protocolo" onIrPara={irParaPendencia} /> : null,
  };

  // Base do REENVIO: o protocolo gravado + os DFDs completos + o rastro dos sobrescritos (estável entre
  // renders — cache da comparação).
  const baseReenvio: BaseReenvio | null = useMemo(
    () =>
      proto
        ? { protocolo: proto, dfds: ordem.map((id) => orig.get(id)).filter((d): d is DfdDetalhe => !!d), sobrescritos, unidades: unidadesExtra }
        : null,
    [proto, orig, ordem, sobrescritos, unidadesExtra],
  );
  // O DFD aberto ao lado, como GRAVADO (a base da sobrescrita por arquivo novo).
  const gravadoAberto = abertoId != null ? (orig.get(abertoId) ?? null) : null;

  /** Fora da pilha: o relatório (despacho) e o REENVIO do PDF são modais próprios. */
  const extra = (
    <>
      {podeImportar && baseReenvio && (
        <ProtocoloUploadForm
          reenvio={baseReenvio}
          podeExcluir={podeProto.excluir}
          iniciar={reenviar}
          onConcluido={() => {
            onAlterado();
            void carregar(baseReenvio.protocolo.id, null);
          }}
          reparticoes={reparticoes}
          reparticaoAtivaId={reparticaoAtivaId}
          pcas={pcas}
          regras={regras}
          orgaos={orgaos}
        />
      )}
      {proto && gravadoAberto && sobrescreveAberto && (
        <DfdUploadForm
          iniciar={sobrescreverDfd}
          sobrescrever={{
            gravado: gravadoAberto,
            onConcluido: () => {
              onAlterado();
              if (pedidoRef.current === proto.id) void carregar(proto.id, abertoId);
            },
            onOcupado: setSobrescrevendoDfd,
          }}
          reparticoes={reparticoes}
          reparticaoAtivaId={reparticaoAtivaId}
          pcas={pcas}
          regras={regras}
          orgaos={orgaos}
        />
      )}
      <Modal
        open={historicoAberto && !!proto}
        onClose={() => setHistoricoAberto(false)}
        titulo={`Histórico — Protocolo ${proto?.numero ?? ""}`.trim()}
        size="lg"
      >
        <Historico
          entradas={historico.linhas ?? []}
          carregando={historico.linhas === null && !historico.erro}
          erro={historico.erro}
          escopo="protocolo"
          protocoloId={proto?.id ?? null}
          vazio="Nenhuma alteração registrada neste protocolo."
        />
      </Modal>
      {/* Empilhado (o protocolo à esquerda de um DFD da Mesa): as pendências num banner próprio. */}
      {empilhado && (
        <Modal open={pendAbertas && !!pendProto} onClose={() => setPendAbertas(false)} titulo={`Pendências — Protocolo ${proto?.numero ?? ""}`.trim()} size="lg">
          {pendProto && <PainelPendencias pendencias={pendProto} escopo="protocolo" onIrPara={irParaPendencia} />}
        </Modal>
      )}
    </>
  );

  return {
    aberto: protocoloId != null,
    /** A pilha não troca/fecha (gravando OU sobrescrevendo um DFD). */
    bloqueado: travado,
    /** Gravando de fato — só então o X/Esc do banner somem (na sobrescrita o modal dela fica por cima). */
    salvando,
    sujo,
    proto,
    principal,
    /** Painéis ao lado (DFD + direita) — só fora do modo empilhado; SEMPRE presentes (mesmo fechados, ou
     * sem DFDs/carregando), para a largura do banner não mudar quando os DFDs chegam. */
    paineis: empilhado ? [] : [lateral, lateral2, painelPendencias],
    extra,
    fechar,
    podeDescartar,
  };
}
