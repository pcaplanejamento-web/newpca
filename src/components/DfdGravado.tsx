"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { classificarAssunto, type RegrasAvaliacao } from "@/lib/avaliacao-core";
import { estadoDeMensagens, mensagensDoDfd } from "@/lib/conferencia-dfd";
import type { DfdDetalhe } from "@/lib/dfd";
import { detalheParaParseado, diffDfdGravado } from "@/lib/dfd-edicao";
import { editarItemDfd, removerItemDfd, STATUS_MENSAGEM_COR } from "@/lib/dfd-tratamento";
import type { DfdParseado } from "@/lib/parse-dfd-comum";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import type { UnidadeConferencia } from "@/lib/reparticoes";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { DfdConferir, type PainelDfd } from "./DfdConferir";
import { DfdPainelDireito, RodapePainelItem, tituloPainelDfd } from "./DfdPainelDireito";
import { DfdRodape } from "./DfdRodape";
import { DfdCabecalho } from "./DfdView";
import { IconAlert, IconClock, IconLayers, IconRefresh, IconSpinner } from "./icons";
import { ItemDetalhe } from "./ItemDetalhe";
import type { ModalPainel } from "./Modal";
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
/** Referência de um item da visão "Itens" (nº do item no DFD + código). */
export type ItemRef = { item: number | null; codigo: string | null };
/** Conteúdo de um banner (o que a pilha de banners renderiza). */
export type ConteudoBanner = { titulo: string; cabecalho?: ReactNode; acoesCabecalho?: ReactNode; rodape?: ReactNode; children: ReactNode };

/** Índice do item (no DFD) que corresponde a uma linha da visão "Itens": pelo NÚMERO do item (único
 * no DFD), depois pelo código; senão o 1º. */
function indiceDoItem(itens: DfdParseado["itens"], alvo: ItemRef): number {
  if (alvo.item != null) {
    const i = itens.findIndex((it) => it.item === alvo.item);
    if (i >= 0) return i;
  }
  if (alvo.codigo) {
    const i = itens.findIndex((it) => it.codigo === alvo.codigo);
    if (i >= 0) return i;
  }
  return itens.length > 0 ? 0 : -1;
}

/**
 * DFD GRAVADO (listas DFDs/Itens da Mesa) como HOOK de banners — o MESMO corpo da análise
 * (`DfdConferir`: unidade/tipo, tratamento, seções com cadeado, itens com cadeado, validação da
 * assinatura), o MESMO rodapé (`DfdRodape`: estado + mensagens) e o MESMO painel da direita (mensagens/
 * item/histórico). Edita num RASCUNHO e "Salvar alterações" grava só o que mudou (`diffDfdGravado`);
 * DFD de unidade sem acesso fica só-leitura. Devolve os PAINÉIS (DFD, direita e o banner SÓ do item)
 * para a pilha de banners da Mesa (`BannersMesa`) empilhar.
 *
 * `modoItem` (aberto pela visão "Itens"): o item é um banner PRÓPRIO à esquerda do DFD — clicar numa
 * linha da tabela de itens troca o item desse banner (em vez de abrir o item à direita do DFD).
 */
export function useDfdGravado({
  dfdId,
  item = null,
  modoItem = false,
  onFechar,
  onVerProtocolo,
  podeEditar,
  reparticoes,
  reparticaoAtivaId,
  regras,
  orgaos,
  onAlterado,
  sinal = 0,
}: {
  /** DFD a abrir (`null` = fechado). */
  dfdId: number | null;
  /** (modo item) o item a mostrar no banner do item. */
  item?: ItemRef | null;
  modoItem?: boolean;
  /** X / Fechar do banner do DFD (a pilha decide o que fecha). */
  onFechar: () => void;
  /** "Ver protocolo" — a pilha empilha o protocolo à direita. Ausente = sem o botão. */
  onVerProtocolo?: (protocoloId: number) => void;
  podeEditar: boolean;
  reparticoes: Rep[];
  reparticaoAtivaId: number | null;
  regras: RegrasAvaliacao;
  orgaos: Orgao[];
  onAlterado: () => void;
  /** Recarga EXTERNA (outro banner gravou): recarrega do banco se não houver rascunho. */
  sinal?: number;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [orig, setOrig] = useState<DfdDetalhe | null>(null);
  const [dfd, setDfd] = useState<DfdParseado | null>(null);
  const [repId, setRepId] = useState<number | null>(null);
  const [unidade, setUnidade] = useState<UnidadeConferencia | null>(null);
  const [editado, setEditado] = useState(false);
  const [itensEditados, setItensEditados] = useState(false);
  const [painel, setPainel] = useState<PainelDfd | null>(null);
  const [itemIdx, setItemIdx] = useState<number | null>(null);
  const [ancoraAlvo, setAncoraAlvo] = useState<{ ancora: string; cor: string; nonce: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Versão dos dados carregados: remonta o corpo após recarregar (os cadeados voltam a travar).
  const [versao, setVersao] = useState(0);

  // Nº da requisição de carga — só a MAIS RECENTE aplica o resultado (resposta atrasada é ignorada).
  const cargaRef = useRef(0);
  async function carregar(id: number, alvo: ItemRef | null) {
    const minha = ++cargaRef.current;
    setErro(null);
    try {
      const r = await fetch(`/api/dfd/${id}`);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; dfd?: DfdDetalhe; unidade?: UnidadeConferencia | null };
      if (minha !== cargaRef.current) return;
      if (!r.ok || !j.ok || !j.dfd) throw new Error(j.error ?? "Não foi possível abrir o DFD.");
      const d = detalheParaParseado(j.dfd);
      setOrig(j.dfd);
      setDfd(d);
      setRepId(j.dfd.reparticaoId);
      setUnidade(j.unidade ?? null);
      setEditado(false);
      setItensEditados(false);
      setAncoraAlvo(null);
      setPainel(null);
      if (alvo) {
        const idx = indiceDoItem(d.itens, alvo);
        setItemIdx(idx >= 0 ? idx : null);
      }
      setVersao((v) => v + 1);
    } catch (e) {
      if (minha === cargaRef.current) setErro(e instanceof Error ? e.message : "Não foi possível abrir o DFD.");
    }
  }

  // O DFD que a pilha pede AGORA — a recarga pós-gravação só vale se ainda for o mesmo.
  const pedidoRef = useRef(dfdId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: recarrega só ao trocar o DFD/item pedido pela pilha.
  useEffect(() => {
    pedidoRef.current = dfdId;
    // Zera o banner anterior (rascunho/painéis): fechar descarta o rascunho e desliga o aviso de saída.
    cargaRef.current++;
    setOrig(null);
    setDfd(null);
    setEditado(false);
    setItensEditados(false);
    setPainel(null);
    setItemIdx(null);
    setAncoraAlvo(null);
    setErro(null);
    if (dfdId != null) void carregar(dfdId, modoItem ? item : null);
  }, [dfdId]);

  // Troca do item pedido (outra linha da visão "Itens" no mesmo DFD) — sem recarregar o DFD.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage ao alvo do item.
  useEffect(() => {
    if (!modoItem || !dfd || !item) return;
    const idx = indiceDoItem(dfd.itens, item);
    setItemIdx(idx >= 0 ? idx : null);
  }, [item?.item, item?.codigo]);

  const sujo = editado || itensEditados;
  /** Modo item: o item EXIBIDO (nº + código) — a recarga reencontra ELE (a posição pode ter mudado). */
  const alvoAtual = (): ItemRef | null =>
    modoItem && dfd && itemIdx != null ? { item: dfd.itens[itemIdx]?.item ?? null, codigo: dfd.itens[itemIdx]?.codigo ?? null } : null;
  // Recarga externa (outro banner da pilha gravou) — só sem rascunho (nunca perde edição).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só ao sinal.
  useEffect(() => {
    if (sinal > 0 && orig && !sujo && !salvando) void carregar(orig.id, alvoAtual());
  }, [sinal]);

  useEffect(() => {
    if (!sujo) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sujo]);

  // Unidade: a da lista do usuário (editável) ou a REAL do DFD (conferência correta, só-leitura).
  const acessivel = orig?.reparticaoId == null || reparticoes.some((r) => r.id === orig?.reparticaoId);
  const editavel = podeEditar && acessivel;
  const reps: Rep[] = editavel || !unidade || reparticoes.some((r) => r.id === unidade.id) ? reparticoes : [...reparticoes, unidade];
  const rep = repId != null ? (reps.find((r) => r.id === repId) ?? null) : null;
  const categoria = classificarAssunto(orig?.protocoloAssunto ?? null);
  // Ano do PCA: o do DFD; DFD antigo sem ele herda o do protocolo de origem (completa a previsão).
  const anoPca = dfd?.anoPca ?? orig?.protocoloAnoPca ?? null;
  const conformidade = useConformidade(dfd?.itens, dfd?.tipo ?? null);
  // No GRAVADO o ano do PCA é identificador (imutável, portão da protocolação) — fora das mensagens.
  const mensagens = dfd
    ? mensagensDoDfd(dfd, rep, anoPca, regras, categoria, orgaos, conformidade).filter((m) => m.chave !== "dfd.anoPca")
    : [];
  // Rodapé = a MESMA régua do painel de mensagens ao lado (e da célula Estado da lista).
  const estado = dfd ? estadoDeMensagens(mensagens, { editado: sujo }) : null;

  const editar = (fn: (d: DfdParseado) => DfdParseado, itens = false) => {
    setDfd((d) => (d ? fn(d) : d));
    setEditado(true);
    if (itens) setItensEditados(true);
  };
  /** Pede confirmação para descartar o rascunho (`true` = pode seguir). */
  const podeDescartar = (msg: string) => !sujo || confirm(msg);

  function fechar() {
    if (salvando) return;
    // No modo item o rascunho é o MESMO do banner do item (que segue aberto): tirar o DFD da pilha não
    // descarta nada — não pergunta.
    if (!modoItem && !podeDescartar("Há alterações não salvas neste DFD. Fechar e descartá-las?")) return;
    setPainel(null);
    onFechar();
  }
  function atualizar() {
    if (!orig) return;
    if (!podeDescartar("Descartar as alterações não salvas e recarregar os dados do banco?")) return;
    void carregar(orig.id, alvoAtual());
  }
  function verProtocolo() {
    if (!orig?.protocoloId || !onVerProtocolo) return;
    setPainel(null); // o protocolo entra no lugar do painel da direita
    onVerProtocolo(orig.protocoloId);
  }

  async function salvar() {
    if (!orig || !dfd) return;
    const body = diffDfdGravado(orig, dfd, repId, itensEditados);
    if (Object.keys(body).length === 0) {
      setEditado(false);
      setItensEditados(false);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/dfd/${orig.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? `Não foi possível salvar (HTTP ${r.status}).`);
      onAlterado();
      // Recarrega mantendo o item do banner do item — só se o banner ainda mostra ESTE DFD.
      if (pedidoRef.current === orig.id) await carregar(orig.id, alvoAtual());
    } catch (e) {
      // `fetch` sem rede lança TypeError ("Failed to fetch") — mensagem em pt-BR.
      setErro(e instanceof TypeError ? "Sem conexão com o servidor — tente novamente." : e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const numero = dfd?.numero ?? orig?.numero ?? "";
  const erroCallout = erro && (
    <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />} className="mb-3">
      {erro}
    </Callout>
  );
  const carregando = erro ? (
    <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
      {erro}
    </Callout>
  ) : (
    <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />}>
      Carregando o DFD…
    </Callout>
  );
  const botaoSalvar = editavel ? (
    <Button onClick={salvar} loading={salvando} disabled={!sujo}>
      Salvar alterações
    </Button>
  ) : undefined;
  const botaoAtualizar =
    orig && !salvando ? (
      <Button variant="icon" aria-label="Atualizar" title="Recarregar com os dados do banco" onClick={atualizar}>
        <IconRefresh className="h-5 w-5" />
      </Button>
    ) : undefined;
  const temProtocolo = orig?.protocoloId != null && !!onVerProtocolo;

  /** Banner do DFD (corpo da análise + rodapé com estado/mensagens/histórico/ver protocolo/salvar). */
  const dfdPainel: ConteudoBanner = {
    titulo: `DFD ${numero}`,
    cabecalho: dfd ? <DfdCabecalho numero={dfd.numero} tipo={dfd.tipo} planejamento={dfd.planejamento} /> : undefined,
    acoesCabecalho: botaoAtualizar,
    rodape: dfd ? (
      <div>
        {erroCallout}
        <DfdRodape
          estado={estado}
          regras={regras}
          mensagens={mensagens}
          mensagensAbertas={painel?.tipo === "mensagens"}
          onToggleMensagens={() => setPainel((p) => (p?.tipo === "mensagens" ? null : { tipo: "mensagens" }))}
          onFechar={fechar}
          bloqueado={salvando}
          acoes={
            <>
              <Button variant="secondary" onClick={() => setPainel((p) => (p?.tipo === "historico" ? null : { tipo: "historico" }))}>
                <IconClock className="h-4 w-4" /> Histórico
              </Button>
              {temProtocolo && (
                <Button variant="secondary" onClick={verProtocolo}>
                  <IconLayers className="h-4 w-4" /> Ver protocolo
                </Button>
              )}
            </>
          }
          principal={botaoSalvar}
        />
      </div>
    ) : undefined,
    children: !dfd ? (
      carregando
    ) : (
      <DfdConferir
        key={`${orig?.id}:${versao}`}
        dfd={dfd}
        reparticoes={reps}
        reparticaoAtivaId={reparticaoAtivaId}
        repId={repId}
        anoPca={anoPca}
        autoMatch={false}
        readOnly={!editavel || salvando}
        tabelaUnica
        categoria={categoria}
        regras={regras}
        orgaos={orgaos}
        conformidade={conformidade}
        ancoraAlvo={ancoraAlvo}
        // No modo item a linha marcada é a do banner do item (à esquerda); senão, a do painel da direita.
        itemAtivo={modoItem ? itemIdx : painel?.tipo === "item" ? painel.idx : null}
        onItemClick={(idx) => (modoItem ? setItemIdx(idx) : setPainel({ tipo: "item", idx }))}
        onRepChange={(id) => {
          setRepId(id);
          setEditado(true);
        }}
        onSecoesChange={(secoes) => editar((d) => ({ ...d, secoes }))}
        onRefsChange={(refs) => editar((d) => ({ ...d, ...refs }))}
        onCamposChange={(campos) => editar((d) => ({ ...d, ...campos }))}
        onTipoChange={(tipo) => editar((d) => ({ ...d, tipo }))}
        onAssinaturasChange={(assinaturas) => editar((d) => ({ ...d, assinaturas }))}
      />
    ),
  };

  /** Painel da DIREITA do DFD (mensagens / item / histórico). */
  const direito: ModalPainel = {
    id: "dfd-direito",
    aberto: !!dfd && painel != null,
    titulo: tituloPainelDfd(painel, dfd, numero),
    onClose: () => setPainel(null),
    rodape: painel?.tipo === "item" ? <RodapePainelItem onVerDfd={() => setPainel(null)} onVerProtocolo={temProtocolo ? verProtocolo : undefined} /> : undefined,
    children: (
      <DfdPainelDireito
        painel={painel}
        dfd={dfd}
        numero={numero}
        mensagens={mensagens}
        onIrPara={(m) => setAncoraAlvo({ ancora: m.ancora, cor: STATUS_MENSAGEM_COR[m.status], nonce: Date.now() })}
        conformidade={conformidade}
        regras={regras}
        editavel={editavel && !salvando}
        onEditarItem={(i, patch) => editar((d) => editarItemDfd(d, i, patch), true)}
        onRemoverItem={(i) => {
          setPainel(null);
          editar((d) => removerItemDfd(d, i), true);
        }}
        dfdId={orig?.id ?? null}
      />
    ),
  };

  /** Banner SÓ do ITEM (visão "Itens"): o mesmo `ItemDetalhe` (cadeado por campo) sobre o RASCUNHO do DFD. */
  function itemPainel(acoes: { onVerDfd?: () => void; onVerProtocolo?: () => void; onFechar: () => void }): ConteudoBanner {
    const it = dfd && itemIdx != null ? dfd.itens[itemIdx] : undefined;
    return {
      titulo: it ? `Item ${it.item ?? (itemIdx ?? 0) + 1} — DFD ${numero}` : `Item — DFD ${numero}`,
      acoesCabecalho: botaoAtualizar,
      rodape: dfd ? (
        <div>
          {erroCallout}
          <RodapePainelItem
            onVerDfd={acoes.onVerDfd}
            onVerProtocolo={temProtocolo ? acoes.onVerProtocolo : undefined}
            onFechar={acoes.onFechar}
            principal={botaoSalvar}
            bloqueado={salvando}
          />
        </div>
      ) : undefined,
      children: !dfd ? (
        carregando
      ) : it && itemIdx != null ? (
        <ItemDetalhe
          key={`${versao}:${itemIdx}`}
          item={it}
          conformidade={conformidade}
          regras={regras}
          tipo={dfd.tipo}
          editavel={editavel && !salvando}
          onChange={editavel && !salvando ? (patch) => editar((d) => editarItemDfd(d, itemIdx, patch), true) : undefined}
          onRemover={
            editavel && !salvando
              ? () => {
                  editar((d) => removerItemDfd(d, itemIdx), true);
                  setItemIdx(null);
                }
              : undefined
          }
        />
      ) : (
        <Callout kind="info" icon={<IconAlert className="h-5 w-5" />}>
          {sujo ? "O item foi removido do DFD (rascunho) — salve as alterações para gravar." : "Item não encontrado neste DFD."}
        </Callout>
      ),
    };
  }

  return {
    aberto: dfdId != null,
    carregado: !!dfd,
    bloqueado: salvando,
    sujo,
    orig,
    numero,
    dfdPainel,
    direito,
    itemPainel,
    fechar,
    /** Fecha o painel da direita (mensagens/item/histórico) — ex.: o protocolo entra no lugar dele. */
    fecharDireito: () => setPainel(null),
    podeDescartar,
  };
}
