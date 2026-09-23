"use client";

import { useEffect, useRef, useState } from "react";
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
import { Modal } from "./Modal";
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

/** Índice do item (no DFD) que corresponde a uma linha da visão "Itens": pelo NÚMERO do item (único
 * no DFD), depois pelo código; senão o 1º. */
function indiceDoItem(itens: DfdParseado["itens"], alvo: { item: number | null; codigo: string | null }): number {
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
 * Banner do DFD GRAVADO (aberto pelas listas DFDs/Itens da Mesa) — o MESMO corpo da análise
 * (`DfdConferir`: unidade/tipo, tratamento, seções com cadeado, itens com cadeado, validação da
 * assinatura), o MESMO rodapé (`DfdRodape`: estado + mensagens) e o MESMO painel da direita (mensagens/
 * item/histórico). A tabela de itens é ÚNICA (já protocolado). Edita num RASCUNHO e "Salvar alterações"
 * grava só o que mudou (`diffDfdGravado`). DFD de unidade sem acesso fica só-leitura.
 */
export function DfdGravado({
  dfdId,
  itemInicial = null,
  onClose,
  onVerProtocolo,
  podeEditar,
  reparticoes,
  reparticaoAtivaId,
  regras,
  orgaos,
  onAlterado,
}: {
  /** DFD a abrir (`null` = fechado). */
  dfdId: number | null;
  /** Abre já no detalhe deste item (linha clicada na visão "Itens"). */
  itemInicial?: { item: number | null; codigo: string | null } | null;
  onClose: () => void;
  /** Sobe para o protocolo de origem (abre o protocolo com este DFD ao lado). */
  onVerProtocolo: (protocoloId: number, dfdId: number) => void;
  podeEditar: boolean;
  reparticoes: Rep[];
  reparticaoAtivaId: number | null;
  regras: RegrasAvaliacao;
  orgaos: Orgao[];
  onAlterado: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [orig, setOrig] = useState<DfdDetalhe | null>(null);
  const [dfd, setDfd] = useState<DfdParseado | null>(null);
  const [repId, setRepId] = useState<number | null>(null);
  const [unidade, setUnidade] = useState<UnidadeConferencia | null>(null);
  const [editado, setEditado] = useState(false);
  const [itensEditados, setItensEditados] = useState(false);
  const [painel, setPainel] = useState<PainelDfd | null>(null);
  const [ancoraAlvo, setAncoraAlvo] = useState<{ ancora: string; cor: string; nonce: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Versão dos dados carregados: remonta o corpo após recarregar (os cadeados voltam a travar).
  const [versao, setVersao] = useState(0);

  // Nº da requisição de carga — só a MAIS RECENTE aplica o resultado (resposta atrasada é ignorada).
  const cargaRef = useRef(0);
  async function carregar(id: number, item: { item: number | null; codigo: string | null } | null) {
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
      const idx = item ? indiceDoItem(d.itens, item) : -1;
      setPainel(idx >= 0 ? { tipo: "item", idx } : null);
      setVersao((v) => v + 1);
    } catch (e) {
      if (minha === cargaRef.current) setErro(e instanceof Error ? e.message : "Não foi possível abrir o DFD.");
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: recarrega só ao trocar o DFD/item pedido pelo host.
  useEffect(() => {
    // Zera o banner anterior (rascunho/painéis): fechar descarta o rascunho e desliga o aviso de saída.
    cargaRef.current++;
    setOrig(null);
    setDfd(null);
    setEditado(false);
    setItensEditados(false);
    setPainel(null);
    setAncoraAlvo(null);
    setErro(null);
    if (dfdId != null) void carregar(dfdId, itemInicial);
  }, [dfdId, itemInicial]);

  const sujo = editado || itensEditados;
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

  function fechar() {
    if (salvando) return;
    if (sujo && !confirm("Há alterações não salvas neste DFD. Fechar e descartá-las?")) return;
    setPainel(null);
    onClose();
  }
  function atualizar() {
    if (!orig) return;
    if (sujo && !confirm("Descartar as alterações não salvas e recarregar os dados do banco?")) return;
    void carregar(orig.id, null);
  }
  function verProtocolo() {
    if (!orig?.protocoloId) return;
    if (sujo && !confirm("Há alterações não salvas neste DFD. Ir para o protocolo e descartá-las?")) return;
    onVerProtocolo(orig.protocoloId, orig.id);
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
      await carregar(orig.id, null);
    } catch (e) {
      // `fetch` sem rede lança TypeError ("Failed to fetch") — mensagem em pt-BR.
      setErro(e instanceof TypeError ? "Sem conexão com o servidor — tente novamente." : e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const numero = dfd?.numero ?? orig?.numero ?? "";
  return (
    <Modal
      open={dfdId != null}
      onClose={fechar}
      titulo={`DFD ${numero}`}
      cabecalho={dfd ? <DfdCabecalho numero={dfd.numero} tipo={dfd.tipo} planejamento={dfd.planejamento} /> : undefined}
      size="lg"
      fecharNoBackdrop={false}
      bloqueado={salvando}
      acoesCabecalho={
        orig && !salvando ? (
          <Button variant="icon" aria-label="Atualizar" title="Recarregar com os dados do banco" onClick={atualizar}>
            <IconRefresh className="h-5 w-5" />
          </Button>
        ) : undefined
      }
      rodape={
        dfd ? (
          <div>
            {erro && (
              <Callout kind="danger" icon={<IconAlert className="h-4 w-4" />} className="mb-3">
                {erro}
              </Callout>
            )}
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
                  {orig?.protocoloId != null && (
                    <Button variant="secondary" onClick={verProtocolo}>
                      <IconLayers className="h-4 w-4" /> Ver protocolo
                    </Button>
                  )}
                </>
              }
              principal={
                editavel ? (
                  <Button onClick={salvar} loading={salvando} disabled={!sujo}>
                    Salvar alterações
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : undefined
      }
      lateral={
        dfd
          ? {
              aberto: painel != null,
              titulo: tituloPainelDfd(painel, dfd, numero),
              onClose: () => setPainel(null),
              rodape:
                painel?.tipo === "item" ? (
                  <RodapePainelItem onVerDfd={() => setPainel(null)} onVerProtocolo={orig?.protocoloId != null ? verProtocolo : undefined} />
                ) : undefined,
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
            }
          : undefined
      }
    >
      {!dfd ? (
        erro ? (
          <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />}>
            {erro}
          </Callout>
        ) : (
          <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />}>
            Carregando o DFD…
          </Callout>
        )
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
          itemAtivo={painel?.tipo === "item" ? painel.idx : null}
          onItemClick={(idx) => setPainel({ tipo: "item", idx })}
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
      )}
    </Modal>
  );
}
