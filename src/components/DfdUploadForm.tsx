"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { classificarAssunto, importarDfdHabilitado, type RegrasAvaliacao, regrasPadrao, tipoPermitido } from "@/lib/avaliacao-core";
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
  unificarItensDfd,
} from "@/lib/dfd-tratamento";
import { num } from "@/lib/format";
import { buscarExistentes, enviarDfdEmLotes } from "@/lib/importar-dfd";
import { encerrarOcr } from "@/lib/ocr-assinatura";
import { type DfdParseado, parseDfd } from "@/lib/parse-dfd";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { parseDfdPdf } from "@/lib/parse-dfd-pdf";
import { preverUnidadeDoDfd } from "@/lib/reparticao-match";
import type { Responsaveis } from "@/lib/reparticao-responsaveis";
import { escolhasParaHistorico, marcarItensNovos, semMarcas } from "@/lib/sobrescrita-dfd";
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
 * que foi mantido. Dois modos: o botão "Importar DFD" da Mesa (no rodapé da tabela de DFDs — detecta o nº já
 * cadastrado) e o banner do DFD GRAVADO ("Sobrescrever DFD" — `sobrescrever`, só aceita o MESMO nº). O BOTÃO fica
 * sempre no host: cada clique novo incrementa `iniciar`, que abre o lançador.
 */
export function DfdUploadForm({
  reparticoes,
  reparticaoAtivaId = null,
  pcas = [],
  regras = regrasPadrao(),
  orgaos = [],
  iniciar = 0,
  sobrescrever = null,
}: {
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
  pcas?: PcaOpcao[];
  regras?: RegrasAvaliacao;
  orgaos?: Orgao[];
  /** Contador do BOTÃO do host ("Importar DFD" no rodapé da tabela da Mesa; "Sobrescrever DFD" no banner):
   * cada valor NOVO abre o lançador. */
  iniciar?: number;
  /** Banner do DFD GRAVADO: sobrescrever ESTE DFD com um arquivo novo (o MESMO nº). `onConcluido` = o banner
   * recarrega; `onOcupado` = a sobrescrita está em andamento (lançador/leitura/escolha/gravação) — o banner fica
   * só-leitura até terminar. Sem ele: a importação avulsa da Mesa. */
  sobrescrever?: { gravado: DfdDetalhe; onConcluido: () => void; onOcupado?: (ocupado: boolean) => void } | null;
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

  // O botão do HOST abre o lançador — só um clique NOVO abre (o contador vive no host e sobrevive a este form
  // remontar), e nunca no meio de uma importação/sobrescrita (lendo/conferindo/gravando).
  const iniciarVisto = useRef(iniciar);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só ao contador do host.
  useEffect(() => {
    if (iniciar <= 0 || iniciar === iniciarVisto.current) return;
    iniciarVisto.current = iniciar;
    if (status === "parsing" || status === "ready" || status === "sending") return;
    setErro(null);
    setStatus("idle");
    setResultado(null);
    setLauncher(true);
  }, [iniciar]);
  // Sobrescrita em ANDAMENTO (do lançador até gravar/cancelar) → o banner do DFD fica só-leitura.
  const ocupado = launcher || status === "parsing" || status === "ready" || status === "sending";
  const onOcupado = sobrescrever?.onOcupado;
  useEffect(() => {
    onOcupado?.(ocupado);
  }, [ocupado, onOcupado]);
  useEffect(() => () => onOcupado?.(false), [onOcupado]);
  // Só a leitura MAIS RECENTE vale (um arquivo novo solto no meio de outra leitura descarta a anterior).
  const leituraRef = useRef(0);

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
    const minha = ++leituraRef.current;
    const atual = () => minha === leituraRef.current;
    setErro(null);
    setResultado(null);
    setPainel(null); // nada do DFD anterior (ex.: "Diferenças") sobra no painel da direita
    setAncoraAlvo(null);
    const ehPdf = /\.pdf$/i.test(file.name);
    if (!ehPdf && !/\.xlsx?$/i.test(file.name)) {
      setStatus("error");
      setErro("Envie o DFD em .xlsx ou .pdf (emitido pelo sistema).");
      return;
    }
    setStatus("parsing");
    try {
      const parsed = ehPdf ? await parseDfdPdf(file) : await parseDfd(file);
      if (!atual()) return;
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
        if (!atual()) return;
        if (ex && !ex.acessivel) {
          setStatus("error");
          setErro(`Já existe o DFD ${parsed.numero} numa unidade sem acesso para você — ele não pode ser sobrescrito daqui.`);
          return;
        }
        if (ex?.acessivel) {
          const r = await fetch(`/api/dfd/${ex.id}`);
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; dfd?: DfdDetalhe };
          if (!atual()) return;
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
      if (!atual()) return;
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Falha ao ler o DFD.");
    } finally {
      // Formato E: libera o worker do OCR usado no parse do PDF — só a leitura vigente (outra pode estar usando).
      if (atual()) void encerrarOcr();
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
          `${base.protocoloNumero ? `O DFD continua no protocolo ${base.protocoloNumero}; o` : "O"} histórico registra a sobrescrita.`,
      )
    )
      return;
    setStatus("sending");
    setErro(null);
    setProgresso(0);
    try {
      const final = semMarcas(preview); // a marca de origem dos itens é só da tela
      const historico = base && resumo ? escolhasParaHistorico(resumo) : null; // o que foi mantido/editado
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
          ...(historico ? { escolhas: historico } : {}),
        },
        final.itens,
        (enviados, total) => setProgresso(Math.round((enviados / total) * 100)),
        { existia: !!base },
      );
      setResultado({
        numero: final.numero,
        itens: final.itens.length,
        repNome: reparticoes.find((r) => r.id === repId)?.nome ?? null,
        // A sobrescrita que MANTÉM a unidade do DFD não "sumiu da lista" — o aviso é só para a unidade trocada.
        foraDoHead: repId != null && reparticaoAtivaId != null && repId !== reparticaoAtivaId && repId !== (base?.reparticaoId ?? null),
        sobrescrito: !!base,
      });
      setPainel(null);
      setAncoraAlvo(null);
      setStatus("done");
      if (sobrescrever) sobrescrever.onConcluido();
      router.refresh();
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Erro ao importar o DFD.");
    }
  }

  /** Fechar a conferência: na SOBRESCRITA com escolhas feitas (mantidos/editados), confirma antes de descartar. */
  function fecharConferencia() {
    const r = sob?.resumo;
    if (base && r && (r.mantidos.length > 0 || r.editados.length > 0) && !confirm("Descartar as escolhas e edições desta sobrescrita?")) return;
    reset();
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

  // Categoria do protocolo em que o DFD fica (exceções do ADM): avulso NOVO = nenhuma; a SOBRESCRITA mantém o DFD no
  // protocolo dele → a categoria dele (a MESMA régua do servidor). Exceções por TIPO do DFD valem pelo `tipo`.
  const categoria = classificarAssunto(base?.protocoloAssunto ?? null);
  const ctxAv = { dfdTipo: preview ? tipoCurtoDfd(preview.tipo) : null, categoria };
  const repSel = preview ? (reparticoes.find((r) => r.id === repId) ?? null) : null;
  // Mensagens (erro/atenção/acerto) — FONTE ÚNICA: o botão/painel e o bloqueio do "Importar" saem daqui
  // (inclui ano do PCA, assinatura, órgão e catálogo, cada um no nível do ADM).
  const mensagens = preview ? mensagensDoDfd(preview, repSel, anoPca, regras, categoria, orgaos, conformidade) : [];
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

  // Nada no fluxo da página: lançador, conferência e avisos são modais/avisos flutuantes (o botão fica no host).
  return (
    <>
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
              ? `Só o MESMO DFD (nº ${sobrescrever.gravado.numero}). Você compara com o gravado e escolhe, dado a dado, o que sobrescrever${sobrescrever.gravado.protocoloNumero ? ` — o DFD continua no protocolo ${sobrescrever.gravado.protocoloNumero}` : ""}.`
              : "Lido no navegador e mostrado num banner para conferência — só grava ao confirmar. Se o nº já existe, você escolhe, dado a dado, o que sobrescrever."
          }
        />
      </Modal>

      {/* Feedback da importação — AVISO FLUTUANTE (canto inferior): não deforma a tabela nem o rodapé dela. */}
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
        onClose={fecharConferencia}
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
                    onUnificarItens={(k, outros) => setPreview((p) => (p ? unificarItensDfd(p, k, outros) : p))}
                    onPainel={setPainel}
                    categoria={categoria}
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
              onFechar={fecharConferencia}
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
          <div className="space-y-[var(--gap-block)]">
            {/* PCA do DFD (obrigatório) — adivinhado pela descrição, confirmável. Na sobrescrita de um DFD de
                protocolo, o ano é o do processo (identificador — só leitura). */}
            <section className="rounded-card border border-border bg-surface p-[var(--pad-card)] shadow-ring">
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
              categoria={categoria}
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
    </>
  );
}
