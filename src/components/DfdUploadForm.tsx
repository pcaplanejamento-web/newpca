"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { importarDfdHabilitado, type RegrasAvaliacao, regrasPadrao, tipoPermitido } from "@/lib/avaliacao-core";
import { herdarTratamentos } from "@/lib/comparar-protocolo";
import { estadoDeMensagens, mensagensDoDfd } from "@/lib/conferencia-dfd";
import type { DfdDetalhe } from "@/lib/dfd";
import { detalheParaParseado } from "@/lib/dfd-edicao";
import {
  type CampoTratavel,
  editarItemDfd,
  normalizarSecoesDfd,
  removerItemDfd,
  STATUS_MENSAGEM_COR,
} from "@/lib/dfd-tratamento";
import { num } from "@/lib/format";
import { buscarExistentes, enviarDfdEmLotes } from "@/lib/importar-dfd";
import { encerrarOcr } from "@/lib/ocr-assinatura";
import { type DfdParseado, parseDfd } from "@/lib/parse-dfd";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { parseDfdPdf } from "@/lib/parse-dfd-pdf";
import { preverUnidadeDoDfd } from "@/lib/reparticao-match";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import { marcarItensNovos, semMarcas } from "@/lib/sobrescrita-dfd";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { DfdConferir, type PainelDfd } from "./DfdConferir";
import { DfdPainelDireito, RodapePainelItem, tituloPainelDfd } from "./DfdPainelDireito";
import { DfdRodape } from "./DfdRodape";
import { DfdCabecalho } from "./DfdView";
import { Dropzone } from "./Dropzone";
import { IconRefresh, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { type PcaOpcao, PcaPicker } from "./PcaPicker";
import { Progress } from "./Progress";
import { useConformidade } from "./useConformidade";
import { useSobrescrita } from "./useSobrescrita";

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

/**
 * IMPORTAÇÃO DE DFD (arquivo .pdf/.xlsx) — lê no navegador, mostra o DFD para conferir/editar
 * (`DfdConferir`) e só grava ao confirmar. Quando o nº JÁ EXISTE, vira a SOBRESCRITA com ESCOLHA POR DADO:
 * o painel "Diferenças" lista cada diferença entre o gravado e o arquivo novo com "Manter gravado | Usar
 * novo" (o DFD ao lado já mostra o resultado); o DFD continua no protocolo dele e o histórico registra o
 * que foi mantido. Dois modos: o botão "Importar DFD" da Mesa (detecta o nº já cadastrado) e o banner do
 * DFD GRAVADO ("Sobrescrever DFD" — `sobrescrever`, só aceita o MESMO nº).
 */
export function DfdUploadForm({
  reparticoes,
  reparticaoAtivaId = null,
  pcas = [],
  regras = regrasPadrao(),
  orgaos = [],
  sobrescrever = null,
}: {
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
  pcas?: PcaOpcao[];
  regras?: RegrasAvaliacao;
  orgaos?: Orgao[];
  /** Banner do DFD GRAVADO: sobrescrever ESTE DFD com um arquivo novo (o MESMO nº). `iniciar` abre o
   * lançador a cada clique novo; `onConcluido` = o banner recarrega. Sem ele: o botão "Importar DFD". */
  sobrescrever?: { gravado: DfdDetalhe; iniciar: number; onConcluido: () => void } | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<DfdParseado | null>(null);
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
    sobrescrito: boolean;
  } | null>(null);
  // SOBRESCRITA: o DFD GRAVADO (mesmo nº), o NOVO como veio do arquivo e o que foi herdado do gravado.
  const [base, setBase] = useState<DfdDetalhe | null>(null);
  const [arquivo, setArquivo] = useState<DfdParseado | null>(null);
  const [herdados, setHerdados] = useState<string[]>([]);

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

  // Banner do DFD gravado: o botão de lá abre o lançador — só um clique NOVO abre (o contador vive no banner).
  const iniciarVisto = useRef(sobrescrever?.iniciar ?? 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só ao contador do banner.
  useEffect(() => {
    if (!sobrescrever || sobrescrever.iniciar <= 0 || sobrescrever.iniciar === iniciarVisto.current) return;
    iniciarVisto.current = sobrescrever.iniciar;
    setErro(null);
    setStatus("idle");
    setResultado(null);
    setLauncher(true);
  }, [sobrescrever?.iniciar]);

  // Conformidade dos itens com o catálogo (veredito por código) — conferida no servidor (lazy).
  const conformidade = useConformidade(preview?.itens, preview?.tipo ?? null);

  // O GRAVADO na forma editável (estável — base da escolha).
  const gravadoP = useMemo(() => (base ? detalheParaParseado(base) : null), [base]);
  const rotuloUnidade = (id: number | null) => (id == null ? "—" : (reparticoes.find((r) => r.id === id)?.codigo ?? base?.reparticaoCodigo ?? `#${id}`));
  const sob = useSobrescrita({
    gravado: gravadoP,
    novo: arquivo,
    trabalho: preview,
    onTrabalho: (fn) => setPreview((p) => (p ? fn(p) : p)),
    bloqueado: status === "sending",
    unidade: base ? { gravado: base.reparticaoId, trabalho: repId, rotulo: rotuloUnidade } : undefined,
    anoPca: base ? { gravado: base.anoPca ?? base.protocoloAnoPca, trabalho: anoPca } : undefined,
  });

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
      // SOBRESCRITA pelo banner: só o MESMO DFD (mesmo nº) — outro número é outro DFD.
      if (sobrescrever && parsed.numero.trim() !== sobrescrever.gravado.numero.trim()) {
        setStatus("error");
        setErro(`O arquivo é do DFD ${parsed.numero || "(sem número)"}, não do DFD ${sobrescrever.gravado.numero} — a sobrescrita só aceita o MESMO DFD.`);
        return;
      }
      // Mesmo nº já cadastrado? (em qualquer unidade — a lista da Mesa é filtrada pela unidade do cabeçalho)
      let gravado: DfdDetalhe | null = sobrescrever?.gravado ?? null;
      if (!gravado) {
        const ex = (await buscarExistentes([parsed.numero])).get(parsed.numero.trim());
        if (ex && !ex.acessivel) {
          setStatus("error");
          setErro(`Já existe o DFD ${parsed.numero} numa unidade sem acesso para você — ele não pode ser sobrescrito daqui.`);
          return;
        }
        if (ex?.acessivel) {
          const r = await fetch(`/api/dfd/${ex.id}`);
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; dfd?: DfdDetalhe };
          if (!r.ok || !j.ok || !j.dfd) throw new Error(j.error ?? "Não foi possível carregar o DFD já cadastrado para comparar.");
          gravado = j.dfd;
        }
      }
      const anoRef = gravado ? (gravado.anoPca ?? gravado.protocoloAnoPca ?? parsed.anoPca) : parsed.anoPca;
      const { dfd: normalizado, auto } = normalizarSecoesDfd(parsed, regras, anoRef); // padroniza (níveis/palavras-chave do ADM)
      const matched = preverUnidadeDoDfd(normalizado, orgaos, reparticoes);
      setAutoCampos(auto);
      setAnoPcaDetectado(normalizado.anoPca);
      if (gravado) {
        // SOBRESCRITA: o que o arquivo NÃO traz e o gravado já tratou é HERDADO (nunca sobre um valor
        // válido do arquivo); a partir daí, cada diferença é uma ESCOLHA (começa tudo "novo").
        const h = herdarTratamentos(normalizado, gravado, anoRef);
        const novo = marcarItensNovos(h.dfd);
        setBase(gravado);
        setArquivo(novo);
        setHerdados(h.herdados);
        setPreview(novo);
        // A unidade e o PCA do gravado prevalecem (são do cadastro/processo, não do arquivo).
        setRepId(gravado.reparticaoId ?? matched);
        setAutoMatch(gravado.reparticaoId == null && matched != null);
        setAnoPca(anoRef != null && pcas.some((p) => p.ano === anoRef) ? anoRef : (gravado.anoPca ?? gravado.protocoloAnoPca ?? null));
        setPainel({ tipo: "diferencas" }); // abre com as ESCOLHAS à vista
      } else {
        setBase(null);
        setArquivo(null);
        setHerdados([]);
        setPreview(normalizado);
        setRepId(matched);
        setAutoMatch(matched != null);
        // Adivinha o PCA pela descrição; pré-seleciona só se o ano existir cadastrado.
        setAnoPca(normalizado.anoPca != null && pcas.some((p) => p.ano === normalizado.anoPca) ? normalizado.anoPca : null);
      }
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Falha ao ler o DFD.");
    } finally {
      void encerrarOcr(); // Formato E: libera o worker do OCR usado no parse do PDF (se houve)
    }
  }

  async function enviar() {
    if (!preview) return;
    const resumo = sob?.resumo ?? null;
    if (
      base &&
      !confirm(
        `Sobrescrever o DFD ${base.numero}${base.protocoloNumero ? ` (protocolo ${base.protocoloNumero})` : ""}?\n\n` +
          (resumo
            ? `${resumo.novos} dado(s) do arquivo novo · ${resumo.mantidos.length} mantido(s) do gravado · ${resumo.editados.length} editado(s).\n`
            : "") +
          "O DFD continua no protocolo dele e o histórico registra a sobrescrita.",
      )
    )
      return;
    setStatus("sending");
    setErro(null);
    setProgresso(0);
    try {
      const final = semMarcas(preview); // a marca de origem dos itens é só da tela
      // Grava em LOTES de itens (start-dfd + append) — escala a milhares de itens.
      await enviarDfdEmLotes(
        {
          numero: final.numero,
          planejamento: final.planejamento,
          tipo: final.tipo,
          objeto: final.objeto,
          orgaoEntidade: final.orgaoEntidade,
          setorRequisitante: final.setorRequisitante,
          siglaSetor: final.siglaSetor,
          responsavel: final.responsavel,
          matricula: final.matricula,
          email: final.email,
          telefone: final.telefone,
          anoPca,
          numeroContrato: final.numeroContrato,
          numeroAta: final.numeroAta,
          numeroLicitacao: final.numeroLicitacao,
          reparticaoId: repId,
          valorTotal: final.valorTotal,
          nomeArquivo: final.nomeArquivo,
          secoes: final.secoes,
          assinaturas: final.assinaturas,
          // Sem `protocoloId`: o DFD que já existe FICA no protocolo dele (o servidor mantém).
          origem: base ? "sobrescrita" : "avulso",
          ...(base && resumo ? { escolhas: { mantidos: resumo.mantidos, editados: resumo.editados } } : {}),
        },
        final.itens,
        (enviados, total) => setProgresso(Math.round((enviados / total) * 100)),
        { existia: !!base },
      );
      setResultado({
        numero: final.numero,
        itens: final.itens.length,
        repNome: reparticoes.find((r) => r.id === repId)?.nome ?? null,
        foraDoHead: repId != null && reparticaoAtivaId != null && repId !== reparticaoAtivaId,
        sobrescrito: !!base,
      });
      setStatus("done");
      if (sobrescrever) sobrescrever.onConcluido();
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
    setBase(null);
    setArquivo(null);
    setHerdados([]);
  }

  // Avulso: sem protocolo → categoria nula; exceções por TIPO do DFD valem pelo `tipo`.
  const ctxAv = { dfdTipo: preview ? tipoCurtoDfd(preview.tipo) : null };
  const repSel = preview ? (reparticoes.find((r) => r.id === repId) ?? null) : null;
  // Mensagens (erro/atenção/acerto) — FONTE ÚNICA: o botão/painel e o bloqueio do "Importar" saem daqui
  // (inclui ano do PCA, assinatura, órgão e catálogo, cada um no nível do ADM).
  const mensagens = preview ? mensagensDoDfd(preview, repSel, anoPca, regras, null, orgaos, conformidade) : [];
  const temErro = mensagens.some((m) => m.status === "erro");
  // Rodapé = a MESMA régua do painel e das tabelas (`estadoDeMensagens`).
  const estadoPrev = estadoDeMensagens(mensagens, { auto: autoCampos.length > 0 });
  // Trava de protocolação do ADM (Configurações → Avaliação → Protocolação): importação de DFD
  // avulso desligada (a sobrescrita de um DFD que está num protocolo o mantém lá — não é avulsa), ou tipo
  // não permitido (quando a trava de tipo está ligada). Servidor reconfere.
  const importDesligado = !importarDfdHabilitado(regras) && base?.protocoloId == null;
  const tipoNaoPermitido = !!regras.gate?.exigirTipo && !tipoPermitido(ctxAv.dfdTipo, regras);
  const bloqueado = temErro || importDesligado || tipoNaoPermitido;
  const modalAberto = !!preview && (status === "ready" || status === "sending");
  const totalDif = sob?.final.total ?? 0;

  return (
    <div className={sobrescrever ? "contents" : undefined}>
      {/* Botão único de importação (à direita) — abre o lançador. Na sobrescrita pelo banner, o botão fica lá. */}
      {!sobrescrever && (
        <div className="flex justify-end">
          <Button onClick={() => setLauncher(true)} icon={<IconUpload className="h-[18px] w-[18px]" />}>
            Importar DFD
          </Button>
        </div>
      )}

      {/* Lançador: soltar/escolher o DFD (.xlsx ou .pdf) */}
      <Modal
        open={launcher}
        onClose={() => setLauncher(false)}
        titulo={sobrescrever ? `Sobrescrever o DFD ${sobrescrever.gravado.numero}` : "Importar DFD"}
        size="lg"
      >
        <Dropzone
          accept=".xlsx,.xls,.pdf"
          onFile={(f) => {
            setLauncher(false);
            handleFile(f);
          }}
          titulo={sobrescrever ? "Soltar o arquivo novo do DFD (.pdf ou .xlsx)" : "Soltar o DFD (.xlsx ou .pdf)"}
          icon={sobrescrever ? <IconRefresh className="h-7 w-7" /> : <IconUpload className="h-7 w-7" />}
          dica={
            sobrescrever
              ? `Só o MESMO DFD (nº ${sobrescrever.gravado.numero}). Você compara com o gravado e escolhe, dado a dado, o que sobrescrever — o DFD continua no protocolo dele.`
              : "Lido no navegador e mostrado num banner para conferência — só grava ao confirmar. Se o nº já existe, você escolhe, dado a dado, o que sobrescrever."
          }
        />
      </Modal>

      {/* Feedback da importação — AVISO FLUTUANTE (canto inferior): não deforma a linha do "Importar". */}
      {erro && status === "error" && (
        <AvisoFlutuante kind="danger" titulo={sobrescrever ? "Não foi possível sobrescrever" : "Não foi possível importar"} onClose={reset}>
          {erro}
        </AvisoFlutuante>
      )}
      {status === "parsing" && <AvisoFlutuante kind="info" carregando titulo="Lendo o DFD…" />}
      {status === "done" && resultado && (
        <AvisoFlutuante
          kind={resultado.foraDoHead ? "warn" : "ok"}
          titulo={`DFD ${resultado.numero} ${resultado.sobrescrito ? "sobrescrito" : "importado"}!`}
          onClose={reset}
          duracao={resultado.foraDoHead ? undefined : 8000}
        >
          {num(resultado.itens)} itens{resultado.repNome ? ` · Unidade ${resultado.repNome}` : ""}.
          {resultado.foraDoHead && (
            <>
              {" "}
              Salvo numa unidade diferente da ativa no cabeçalho — selecione {resultado.repNome} (ou "Geral") no topo para vê-lo na
              lista.
            </>
          )}
        </AvisoFlutuante>
      )}

      {/* Banner flutuante: conferir o DFD completo e importar/sobrescrever (só grava ao confirmar).
          Cabeçalho e botões ficam FIXOS (via Modal); o corpo rola. */}
      <Modal
        open={modalAberto}
        onClose={() => reset()}
        titulo={base ? `Sobrescrever — DFD ${preview?.numero ?? ""}` : `Conferir e importar — DFD ${preview?.numero ?? ""}`}
        cabecalho={
          preview ? (
            <DfdCabecalho numero={preview.numero} tipo={preview.tipo} planejamento={preview.planejamento} sobrescrita={!!base} />
          ) : undefined
        }
        size="lg"
        fecharNoBackdrop={false}
        bloqueado={status === "sending"}
        lateral={
          preview
            ? {
                aberto: painel != null,
                titulo: tituloPainelDfd(painel, preview, preview.numero),
                onClose: () => setPainel(null),
                rodape: painel?.tipo === "item" ? <RodapePainelItem onVerDfd={() => setPainel(null)} /> : undefined,
                children: (
                  <DfdPainelDireito
                    painel={painel}
                    dfd={preview}
                    numero={preview.numero}
                    mensagens={mensagens}
                    onIrPara={(m) => setAncoraAlvo({ ancora: m.ancora, cor: STATUS_MENSAGEM_COR[m.status], nonce: Date.now() })}
                    conformidade={conformidade}
                    regras={regras}
                    editavel={status !== "sending"}
                    onEditarItem={(i, patch) => setPreview((p) => (p ? editarItemDfd(p, i, patch) : p))}
                    onRemoverItem={(i) => {
                      setPainel(null);
                      setPreview((p) => (p ? removerItemDfd(p, i) : p));
                    }}
                    comparacao={sob?.comparacao ?? null}
                    herdados={herdados}
                    escolha={sob?.escolha ?? null}
                  />
                ),
              }
            : undefined
        }
        rodape={
          !preview ? undefined : status === "sending" ? (
            <Progress value={progresso} label={`Enviando ${num(preview.itens.length)} itens... ${progresso}% — não feche esta janela`} />
          ) : (
            <DfdRodape
              estado={estadoPrev}
              regras={regras}
              mensagens={mensagens}
              mensagensAbertas={painel?.tipo === "mensagens"}
              onToggleMensagens={() => setPainel((p) => (p?.tipo === "mensagens" ? null : { tipo: "mensagens" }))}
              onFechar={reset}
              rotuloFechar="Cancelar"
              acoes={
                <>
                  {/* SOBRESCRITA: as diferenças com a ESCOLHA por dado (manter o gravado × usar o novo). */}
                  {base && (
                    <Button variant="secondary" onClick={() => setPainel((p) => (p?.tipo === "diferencas" ? null : { tipo: "diferencas" }))}>
                      Diferenças ({num(totalDif)})
                    </Button>
                  )}
                  {(importDesligado || tipoNaoPermitido) && (
                    <span className="text-[12px]" style={{ color: "var(--danger)" }}>
                      {importDesligado
                        ? "Importação de DFD avulso desabilitada nas Configurações"
                        : `Tipo ${ctxAv.dfdTipo ?? "sem tipo"} não permitido para protocolar`}
                    </span>
                  )}
                </>
              }
              principal={
                base ? (
                  <Button onClick={enviar} disabled={bloqueado} icon={<IconRefresh className="h-[18px] w-[18px]" />}>
                    Sobrescrever DFD
                  </Button>
                ) : (
                  <Button onClick={enviar} disabled={bloqueado} icon={<IconUpload className="h-[18px] w-[18px]" />}>
                    Importar DFD
                  </Button>
                )
              }
            />
          )
        }
      >
        {preview && (
          <div className="space-y-4">
            {/* PCA do DFD (obrigatório) — adivinhado pela descrição, confirmável. Na sobrescrita de um DFD de
                protocolo, o ano é o do processo (identificador — só leitura). */}
            <section className="rounded-card border border-border bg-surface p-4 shadow-ring">
              {base?.protocoloId != null && anoPca != null ? (
                <p className="text-[13px] text-text-2">
                  PCA <strong className="text-text">{anoPca}</strong> — o do protocolo {base.protocoloNumero ?? ""} (o DFD continua nele).
                </p>
              ) : (
                <PcaPicker pcas={pcas} value={anoPca} detectado={anoPcaDetectado} onChange={setAnoPca} />
              )}
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
              readOnly={status === "sending"}
              itemAtivo={painel?.tipo === "item" ? painel.idx : null}
              onItemClick={(idx) => setPainel({ tipo: "item", idx })}
              onRepChange={(id) => {
                setRepId(id);
                setAutoMatch(false);
              }}
              onSecoesChange={(secoes) => setPreview((p) => (p ? { ...p, secoes } : p))}
              onRefsChange={(refs) => setPreview((p) => (p ? { ...p, ...refs } : p))}
              onCamposChange={(campos) => setPreview((p) => (p ? { ...p, ...campos } : p))}
              onTipoChange={(tipo) => setPreview((p) => (p ? { ...p, tipo } : p))}
              onAssinaturasChange={(assinaturas) => setPreview((p) => (p ? { ...p, assinaturas } : p))}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
