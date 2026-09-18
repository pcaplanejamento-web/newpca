"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { nivelDe, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import { conferirItensCliente } from "@/lib/catalogo-conferir-cliente";
import { type CampoTratavel, editarItemDfd, normalizarSecoesDfd, STATUS_MENSAGEM_COR } from "@/lib/dfd-tratamento";
import { faltasObrigatorias } from "@/lib/dfd-validation";
import { num } from "@/lib/format";
import { enviarDfdEmLotes } from "@/lib/importar-dfd";
import { type DfdParseado, parseDfd } from "@/lib/parse-dfd";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { parseDfdPdf } from "@/lib/parse-dfd-pdf";
import { preverUnidadeDoDfd } from "@/lib/reparticao-match";
import {
  bloqueiaAssinatura,
  pdfExigeAssinatura,
  type Responsaveis,
  RESPONSAVEIS_VAZIO,
  validarAssinatura,
} from "@/lib/reparticao-responsaveis";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { DfdConferir, mensagensDoDfd, type PainelDfd } from "./DfdConferir";
import { DfdCabecalho } from "./DfdView";
import { Dropzone } from "./Dropzone";
import { IconAlert, IconCheck, IconSpinner, IconUpload } from "./icons";
import { ItemDetalhe } from "./ItemDetalhe";
import { BotaoVerMensagens, MensagensDfd } from "./MensagensDfd";
import { Modal } from "./Modal";
import { type PcaOpcao, PcaPicker } from "./PcaPicker";
import { Progress } from "./Progress";

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
type Status = "idle" | "parsing" | "ready" | "sending" | "done" | "error";

export function DfdUploadForm({
  reparticoes,
  reparticaoAtivaId = null,
  pcas = [],
  regras = regrasPadrao(),
  orgaos = [],
}: {
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
  pcas?: PcaOpcao[];
  regras?: RegrasAvaliacao;
  orgaos?: Orgao[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<DfdParseado | null>(null);
  // Conformidade dos itens com o catálogo (veredito por código) — conferida no servidor.
  const [conformidade, setConformidade] = useState<Map<string, ConferenciaItem>>();
  const [repId, setRepId] = useState<number | null>(null);
  // PCA do DFD (ano). Adivinhado pela descrição; o usuário confirma/escolhe. Obrigatório.
  const [anoPca, setAnoPca] = useState<number | null>(null);
  const [anoPcaDetectado, setAnoPcaDetectado] = useState<number | null>(null);
  // Painel lateral da DIREITA: mensagens OU detalhe de um item (mestre-detalhe) + rolagem/destaque.
  const [painel, setPainel] = useState<PainelDfd | null>(null);
  const [ancoraAlvo, setAncoraAlvo] = useState<{ ancora: string; cor: string; nonce: number } | null>(null);
  const [autoMatch, setAutoMatch] = useState(false);
  const [autoCampos, setAutoCampos] = useState<CampoTratavel[]>([]);
  const [launcher, setLauncher] = useState(false); // banner lançador de importação
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<{
    numero: string;
    itens: number;
    repNome: string | null;
    foraDoHead: boolean;
  } | null>(null);

  // Enquanto grava (lotes), avisa antes de fechar/atualizar a aba.
  useEffect(() => {
    if (status !== "sending") return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [status]);

  // Confere os itens contra o catálogo quando o DFD é lido (os itens não mudam na edição,
  // então a referência de `preview.itens` é estável — só reconfere ao trocar de arquivo).
  const itensPreview = preview?.itens;
  const tipoPreview = preview?.tipo ?? null;
  useEffect(() => {
    if (!itensPreview || itensPreview.length === 0) {
      setConformidade(undefined);
      return;
    }
    const ac = new AbortController();
    setConformidade(undefined);
    conferirItensCliente(itensPreview, tipoPreview, ac.signal).then((m) => {
      if (!ac.signal.aborted) setConformidade(m);
    });
    return () => ac.abort();
  }, [itensPreview, tipoPreview]);

  async function handleFile(file: File) {
    setErro(null);
    setResultado(null);
    const ehPdf = /\.pdf$/i.test(file.name);
    if (!ehPdf && !/\.xlsx?$/i.test(file.name)) {
      setStatus("error");
      setErro("Envie o DFD em .xlsx ou .pdf (emitido pelo sistema).");
      return;
    }
    setStatus("parsing");
    try {
      const parsed = ehPdf ? await parseDfdPdf(file) : await parseDfd(file);
      const { dfd: d, auto } = normalizarSecoesDfd(parsed, regras); // padroniza (níveis/palavras-chave do ADM)
      const matched = preverUnidadeDoDfd(d, orgaos, reparticoes);
      setPreview(d);
      setAutoCampos(auto);
      setRepId(matched);
      setAutoMatch(matched != null);
      // Adivinha o PCA pela descrição; pré-seleciona só se o ano existir cadastrado.
      setAnoPcaDetectado(d.anoPca);
      setAnoPca(d.anoPca != null && pcas.some((p) => p.ano === d.anoPca) ? d.anoPca : null);
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Falha ao ler o DFD.");
    }
  }

  async function enviar() {
    if (!preview) return;
    setStatus("sending");
    setErro(null);
    setProgresso(0);
    try {
      // Grava em LOTES de itens (start-dfd + append) — escala a milhares de itens.
      await enviarDfdEmLotes(
        {
          numero: preview.numero,
          planejamento: preview.planejamento,
          tipo: preview.tipo,
          objeto: preview.objeto,
          orgaoEntidade: preview.orgaoEntidade,
          setorRequisitante: preview.setorRequisitante,
          siglaSetor: preview.siglaSetor,
          responsavel: preview.responsavel,
          matricula: preview.matricula,
          email: preview.email,
          telefone: preview.telefone,
          anoPca,
          numeroContrato: preview.numeroContrato,
          numeroAta: preview.numeroAta,
          numeroLicitacao: preview.numeroLicitacao,
          reparticaoId: repId,
          valorTotal: preview.valorTotal,
          nomeArquivo: preview.nomeArquivo,
          secoes: preview.secoes,
          assinaturas: preview.assinaturas,
        },
        preview.itens,
        (enviados, total) => setProgresso(Math.round((enviados / total) * 100)),
      );
      setResultado({
        numero: preview.numero,
        itens: preview.itens.length,
        repNome: reparticoes.find((r) => r.id === repId)?.nome ?? null,
        foraDoHead: repId != null && reparticaoAtivaId != null && repId !== reparticaoAtivaId,
      });
      setStatus("done");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Erro ao importar o DFD.");
    }
  }

  function reset() {
    setStatus("idle");
    setPreview(null);
    setErro(null);
    setRepId(null);
    setAnoPca(null);
    setAnoPcaDetectado(null);
    setPainel(null);
    setAncoraAlvo(null);
    setAutoMatch(false);
    setAutoCampos([]);
  }

  // Avulso: sem protocolo → categoria nula; exceções por TIPO do DFD valem pelo `tipo`.
  const ctxAv = { dfdTipo: preview ? tipoCurtoDfd(preview.tipo) : null };
  const faltas = preview
    ? faltasObrigatorias(
        {
          reparticaoId: repId,
          itens: preview.itens,
          secoes: preview.secoes,
          tipo: preview.tipo,
          numeroContrato: preview.numeroContrato,
          numeroAta: preview.numeroAta,
          numeroLicitacao: preview.numeroLicitacao,
        },
        regras,
        { conformidade },
      )
    : [];
  // Conferência da assinatura (mesma regra do servidor) — o nível `dfd.assinatura` decide.
  const repSel = preview ? (reparticoes.find((r) => r.id === repId) ?? null) : null;
  // Mensagens (erro/atenção/acerto) do DFD — para o botão e o painel lateral. Avulso: sem categoria.
  const mensagens = preview ? mensagensDoDfd(preview, repSel, anoPca, regras, null, orgaos, conformidade) : [];
  const assinaturaBloqueia = preview
    ? bloqueiaAssinatura(
        validarAssinatura(preview.assinaturas, repSel?.responsaveis ?? RESPONSAVEIS_VAZIO, {
          exigeAssinatura: pdfExigeAssinatura(preview.nomeArquivo),
        }),
        nivelDe(regras, "dfd.assinatura", ctxAv),
      )
    : false;
  // O PCA é obrigatório no envio do DFD avulso quando `dfd.anoPca` for fundamental.
  const anoPcaBloqueia = anoPca == null && nivelDe(regras, "dfd.anoPca", ctxAv) === "fundamental";
  const bloqueado = faltas.length > 0 || assinaturaBloqueia || anoPcaBloqueia;
  const modalAberto = !!preview && (status === "ready" || status === "sending");

  return (
    <div className="space-y-4">
      {/* Botão único de importação (à direita) — abre o lançador */}
      <div className="flex justify-end">
        <Button onClick={() => setLauncher(true)} icon={<IconUpload className="h-[18px] w-[18px]" />}>
          Importar DFD
        </Button>
      </div>

      {/* Lançador: soltar/escolher o DFD (.xlsx ou .pdf) */}
      <Modal open={launcher} onClose={() => setLauncher(false)} titulo="Importar DFD" size="lg">
        <Dropzone
          accept=".xlsx,.xls,.pdf"
          onFile={(f) => {
            setLauncher(false);
            handleFile(f);
          }}
          titulo="Soltar o DFD (.xlsx ou .pdf)"
          icon={<IconUpload className="h-7 w-7" />}
          dica="Lido no navegador e mostrado num banner para conferência — só grava ao confirmar. Reimportar o mesmo Número DFD substitui os itens."
        />
      </Modal>

      {erro && status === "error" && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />} className="mt-4">
          <p className="font-semibold">Não foi possível importar</p>
          <p className="opacity-90">{erro}</p>
        </Callout>
      )}

      {status === "parsing" && (
        <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />} className="mt-4">
          Lendo o DFD...
        </Callout>
      )}

      {/* Sucesso */}
      {status === "done" && resultado && (
        <div
          className="animate-fade-in-up mt-4 rounded-card border p-6"
          style={{
            borderColor: "color-mix(in srgb, var(--ok) 30%, transparent)",
            background: "color-mix(in srgb, var(--ok) 8%, var(--surface))",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full text-white"
              style={{ background: "var(--ok)" }}
            >
              <IconCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold" style={{ color: "var(--ok)" }}>
                DFD {resultado.numero} importado!
              </h3>
              <p className="text-sm text-muted">
                {num(resultado.itens)} itens{resultado.repNome ? ` · Unidade ${resultado.repNome}` : ""}
              </p>
            </div>
          </div>
          {resultado.foraDoHead && (
            <Callout kind="warn" icon={<IconAlert className="h-5 w-5" />} className="mt-4">
              Este DFD foi salvo na unidade <strong>{resultado.repNome}</strong>, diferente da ativa
              no cabeçalho. Selecione essa unidade (ou "Geral") no topo para vê-lo na lista.
            </Callout>
          )}
          <div className="mt-5">
            <Button variant="secondary" onClick={reset}>
              Importar outro DFD
            </Button>
          </div>
        </div>
      )}

      {/* Banner flutuante: conferir o DFD completo e importar (só grava ao confirmar).
          Cabeçalho e botões ficam FIXOS (via Modal); o corpo rola. */}
      <Modal
        open={modalAberto}
        onClose={() => reset()}
        titulo={`Conferir e importar — DFD ${preview?.numero ?? ""}`}
        cabecalho={
          preview ? (
            <DfdCabecalho numero={preview.numero} tipo={preview.tipo} planejamento={preview.planejamento} />
          ) : undefined
        }
        size="lg"
        fecharNoBackdrop={false}
        bloqueado={status === "sending"}
        lateral={
          preview
            ? {
                aberto: painel != null,
                titulo:
                  painel?.tipo === "item"
                    ? `Item ${preview.itens[painel.idx]?.item ?? painel.idx + 1} — DFD ${preview.numero}`
                    : `Mensagens — DFD ${preview.numero}`,
                onClose: () => setPainel(null),
                children:
                  painel?.tipo === "item" && preview.itens[painel.idx] ? (
                    <ItemDetalhe
                      key={painel.idx}
                      item={preview.itens[painel.idx]}
                      conformidade={conformidade}
                      regras={regras}
                      tipo={preview.tipo}
                      editavel
                      onChange={(patch) =>
                        setPreview((p) => (p ? editarItemDfd(p, (painel as { idx: number }).idx, patch) : p))
                      }
                    />
                  ) : (
                    <MensagensDfd
                      mensagens={mensagens}
                      numero={preview.numero}
                      tipo={preview.tipo}
                      onIrPara={(m) =>
                        setAncoraAlvo({ ancora: m.ancora, cor: STATUS_MENSAGEM_COR[m.status], nonce: Date.now() })
                      }
                    />
                  ),
              }
            : undefined
        }
        rodape={
          preview ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {status === "sending" ? (
                <div className="min-w-[180px] flex-1">
                  <Progress value={progresso} label={`Enviando ${num(preview?.itens.length ?? 0)} itens... ${progresso}% — não feche esta janela`} />
                </div>
              ) : (
                <BotaoVerMensagens
                  mensagens={mensagens}
                  aberto={painel?.tipo === "mensagens"}
                  onToggle={() => setPainel((p) => (p?.tipo === "mensagens" ? null : { tipo: "mensagens" }))}
                />
              )}
              <div className="flex gap-2">
                {status !== "sending" && (
                  <Button variant="secondary" onClick={() => reset()}>
                    Cancelar
                  </Button>
                )}
                <Button
                  onClick={enviar}
                  loading={status === "sending"}
                  disabled={bloqueado || status === "sending"}
                  icon={<IconUpload className="h-[18px] w-[18px]" />}
                >
                  Importar DFD
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {preview && (
          <div className="space-y-4">
            {/* PCA do DFD (obrigatório) — adivinhado pela descrição, confirmável. */}
            <section className="rounded-card border border-border bg-surface p-4 shadow-ring">
              <PcaPicker pcas={pcas} value={anoPca} detectado={anoPcaDetectado} onChange={setAnoPca} />
            </section>
            <DfdConferir
              dfd={preview}
              reparticoes={reparticoes}
              reparticaoAtivaId={reparticaoAtivaId}
              repId={repId}
              anoPca={anoPca}
              autoMatch={autoMatch}
              autoCampos={autoCampos}
              regras={regras}
              orgaos={orgaos}
              conformidade={conformidade}
              ancoraAlvo={ancoraAlvo}
              itemAtivo={painel?.tipo === "item" ? painel.idx : null}
              onItemClick={(idx) => setPainel({ tipo: "item", idx })}
              onRepChange={(id) => {
                setRepId(id);
                setAutoMatch(false);
              }}
              onSecoesChange={(secoes) => setPreview((p) => (p ? { ...p, secoes } : p))}
              onRefsChange={(refs) => setPreview((p) => (p ? { ...p, ...refs } : p))}
              onCamposChange={(campos) => setPreview((p) => (p ? { ...p, ...campos } : p))}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
