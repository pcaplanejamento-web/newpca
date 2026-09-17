"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { classificarAssunto, nivelDe, type RegrasAvaliacao, regrasPadrao } from "@/lib/avaliacao-core";
import type { ConferenciaItem } from "@/lib/catalogo-conferencia";
import { conferirItensCliente } from "@/lib/catalogo-conferir-cliente";
import {
  avaliarDfd,
  type CampoTratavel,
  ESTADO_ROTULO,
  type EstadoDfd,
  estadoCor,
  estadoDfd,
  FALTA_REFERENCIA_RENOVACAO,
  faltasCirurgicasDfd,
  linhasRelatorioProtocolo,
  normalizarSecoesDfd,
  setTextoSecao,
  STATUS_MENSAGEM_COR,
  TRATAVEIS,
} from "@/lib/dfd-tratamento";
import { faltasObrigatorias } from "@/lib/dfd-validation";
import { brl, num } from "@/lib/format";
import { enviarDfdEmLotes } from "@/lib/importar-dfd";
import { MESES, type Prioridade, valoresBatem } from "@/lib/normalize";
import { type DfdParseado, tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import {
  indexarProtocoloPdf,
  parseDfdDoProtocolo,
  type PdfDoc,
  type ProtocoloIndex,
} from "@/lib/parse-protocolo-pdf";
import { casarReparticao, casarUnidadePorInteressado } from "@/lib/reparticao-match";
import {
  bloqueiaAssinatura,
  pdfExigeAssinatura,
  type Responsaveis,
  RESPONSAVEIS_VAZIO,
  validarAssinatura,
} from "@/lib/reparticao-responsaveis";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { buildPrevisao, DfdConferir, mensagensDoDfd, type PainelDfd } from "./DfdConferir";
import { DfdCabecalho } from "./DfdView";
import { Dropzone } from "./Dropzone";
import { Checkbox, TextField } from "./Field";
import { inputCls, labelCls } from "./formStyles";
import { IconAlert, IconCheck, IconClipboard, IconFile, IconSpinner, IconUpload } from "./icons";
import { ItemDetalhe } from "./ItemDetalhe";
import { BotaoVerMensagens, MensagensDfd } from "./MensagensDfd";
import { Modal } from "./Modal";
import { type PcaOpcao, PcaPicker } from "./PcaPicker";
import { type LinhaDfd, PlanilhaDfds } from "./PlanilhaDfds";
import { Progress } from "./Progress";
import { CapaCampos, ProtocoloCabecalho } from "./ProtocoloView";
import { RelatorioErros } from "./RelatorioErros";
import { Segmented } from "./Segmented";
import { StatMini } from "./StatMini";

type Rep = {
  id: number;
  codigo: string;
  nome: string;
  orgaoId?: number | null;
  setorRequisitante?: string | null;
  numeroInteressado?: string | null;
  responsaveis: Responsaveis;
};
type Orgao = { id: number; sigla: string; nome: string; orgaoEntidade: string | null };
type DfdExistente = { numero: string; protocoloNumero: string | null };
type Status = "idle" | "parsing" | "error";
type Extra = { idExterno: string | null; documento: string | null; localReparticao: string | null; valorCapa: number | null; nomeArquivo: string | null };
type Situacao = "novo" | "substitui" | "move";
type CampoBulk = "reparticao" | "prioridade" | "previsao" | "fundamentacao";

const EXTRA_VAZIO: Extra = { idExterno: null, documento: null, localReparticao: null, valorCapa: null, nomeArquivo: null };
const CAP_ANALISE = 300; // teto de DFDs analisados na abertura (escala): além disto, "pendente" até abrir/protocolar

export function ProtocoloUploadForm({
  reparticoes,
  reparticaoAtivaId = null,
  dfdsExistentes = [],
  pcas = [],
  regras = regrasPadrao(),
  orgaos = [],
}: {
  reparticoes: Rep[];
  reparticaoAtivaId?: number | null;
  dfdsExistentes?: DfdExistente[];
  pcas?: PcaOpcao[];
  regras?: RegrasAvaliacao;
  orgaos?: Orgao[];
}) {
  const router = useRouter();
  const docRef = useRef<PdfDoc | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [launcher, setLauncher] = useState(false); // banner lançador (soltar/escolher | criar manual)
  // Origem PDF → os dados da CAPA são IMUTÁVEIS (só leitura); no "criar manual" (sem
  // PDF) o usuário digita a capa que está criando.
  const [origemPdf, setOrigemPdf] = useState(false);
  const [relatorioAberto, setRelatorioAberto] = useState(false); // banner de relatório de erros
  const [incluirAtencao, setIncluirAtencao] = useState(true); // incluir DFD-R sem referência no relatório

  // Metadados do protocolo.
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [interessado, setInteressado] = useState("");
  const [assunto, setAssunto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [protoRepId, setProtoRepId] = useState<number | null>(null);
  const [extra, setExtra] = useState<Extra>(EXTRA_VAZIO);
  // PCA do protocolo (ano). Adivinhado pela descrição; o usuário confirma/escolhe. Os
  // DFDs herdam este ano ao protocolar. Obrigatório para protocolar.
  const [anoPca, setAnoPca] = useState<number | null>(null);
  const [anoPcaDetectado, setAnoPcaDetectado] = useState<number | null>(null);

  // Índice leve + repartição por DFD.
  const [index, setIndex] = useState<ProtocoloIndex | null>(null);
  const [dfdRepIds, setDfdRepIds] = useState<(number | null)[]>([]);
  const [autoRepIds, setAutoRepIds] = useState<(number | null)[]>([]);

  // Cache de parse/edição por DFD (idx) + estados.
  const [parsed, setParsed] = useState<Map<number, DfdParseado>>(new Map());
  const [autoMap, setAutoMap] = useState<Map<number, CampoTratavel[]>>(new Map());
  const [editados, setEditados] = useState<Set<number>>(new Set());
  // Motivo de falha na LEITURA de um DFD (ex.: tabela de itens incompleta no PDF) —
  // vira estado "erro" com a mensagem, em vez de ficar "pendente" sem explicação.
  const [errosParse, setErrosParse] = useState<Map<number, string>>(new Map());
  const [analisando, setAnalisando] = useState(false);

  // Split-view (DFD aberto) + seleção/edição em massa.
  const [abertoIdx, setAbertoIdx] = useState(-1);
  // Painel da DIREITA (lateral2) do DFD aberto: mensagens OU detalhe de um item + rolagem/destaque.
  const [painel, setPainel] = useState<PainelDfd | null>(null);
  const [ancoraAlvo, setAncoraAlvo] = useState<{ ancora: string; cor: string; nonce: number } | null>(null);
  const [carregandoIdx, setCarregandoIdx] = useState<number | null>(null);
  // Conformidade do DFD ABERTO com o catálogo (lazy — só o DFD aberto; a lista fica leve/escalável).
  const [conformidade, setConformidade] = useState<Map<string, ConferenciaItem>>();
  const [sel, setSel] = useState<Set<string | number>>(new Set()); // chaves = idx (number); tipo do DataTable
  const [bulkCampo, setBulkCampo] = useState<CampoBulk>("reparticao");
  const [bulkRep, setBulkRep] = useState<number | null>(null);
  const [bulkPrio, setBulkPrio] = useState<Prioridade | "">("");
  const [bulkMes, setBulkMes] = useState("");
  const [bulkAno, setBulkAno] = useState("");
  const [bulkAnual, setBulkAnual] = useState(false);
  const [bulkFund, setBulkFund] = useState("Lei 14.133/2021");

  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; label: string } | null>(null);
  const [relatorio, setRelatorio] = useState<{ numero: string; importados: number; bloqueados: { numero: string; motivo: string }[] } | null>(null);

  useEffect(() => () => void docRef.current?.destroy(), []);
  useEffect(() => {
    if (!importando) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [importando]);

  function limparDoc() {
    docRef.current?.destroy();
    docRef.current = null;
  }
  function resetCache() {
    setParsed(new Map());
    setAutoMap(new Map());
    setEditados(new Set());
    setErrosParse(new Map());
    setSel(new Set());
    setAbertoIdx(-1);
  }

  function abrirVazio() {
    limparDoc();
    resetCache();
    setOrigemPdf(false); // criação manual: capa editável
    setErro(null);
    setRelatorio(null);
    setNumero("");
    setData("");
    setInteressado("");
    setAssunto("");
    setObservacao("");
    setExtra(EXTRA_VAZIO);
    setAnoPca(null);
    setAnoPcaDetectado(null);
    setProtoRepId(reparticaoAtivaId);
    setIndex({ protocolo: { numero: null, idExterno: null, anoPca: null, data: null, interessado: null, documento: null, assunto: null, valorCapa: null, observacao: null, localReparticao: null, nomeArquivo: null }, dfds: [] });
    setDfdRepIds([]);
    setAutoRepIds([]);
    setAberto(true);
  }

  async function handleFile(file: File) {
    setErro(null);
    setRelatorio(null);
    if (!/\.pdf$/i.test(file.name)) {
      setStatus("error");
      setErro("Envie o protocolo em .pdf (o processo com os DFDs).");
      return;
    }
    setStatus("parsing");
    try {
      limparDoc();
      resetCache();
      const { index: idx, doc } = await indexarProtocoloPdf(file);
      const p = idx.protocolo;
      // Separa as vias / recusa documento errado: protocolo exige capa OU ≥2 DFDs.
      if (p.numero == null && idx.dfds.length <= 1) {
        setStatus("error");
        setErro(
          idx.dfds.length === 1
            ? "Isto parece um DFD avulso — importe pela aba DFDs."
            : "Não reconheci um protocolo (capa) nem DFDs neste PDF.",
        );
        await doc.destroy();
        return;
      }
      docRef.current = doc;
      const autos = idx.dfds.map((d) => casarReparticao(d, reparticoes));
      // Unidade do protocolo: pelo Interessado (número cadastrado → senão nome) → senão 1º DFD
      // casado → senão a ativa. O número do Interessado identifica a unidade (item 5).
      const repInteressado = casarUnidadePorInteressado(p.interessado, reparticoes);
      setNumero(p.numero ?? "");
      setData(p.data ?? "");
      setInteressado(p.interessado ?? "");
      setAssunto(p.assunto ?? "");
      setObservacao(p.observacao ?? "");
      setExtra({ idExterno: p.idExterno, documento: p.documento, localReparticao: p.localReparticao, valorCapa: p.valorCapa, nomeArquivo: p.nomeArquivo });
      // Adivinha o PCA pela capa; pré-seleciona só se o ano existir cadastrado.
      setAnoPcaDetectado(p.anoPca);
      setAnoPca(p.anoPca != null && pcas.some((x) => x.ano === p.anoPca) ? p.anoPca : null);
      setOrigemPdf(true); // capa lida do PDF: imutável (só leitura)
      setIndex(idx);
      setDfdRepIds(autos);
      setAutoRepIds(autos);
      setProtoRepId(repInteressado ?? autos.find((x) => x != null) ?? reparticaoAtivaId);
      setStatus("idle");
      setAberto(true);
      void analisarTodos(idx, doc); // parse + estados em background (até o teto)
    } catch (e) {
      setStatus("error");
      setErro(e instanceof Error ? e.message : "Falha ao ler o protocolo.");
      limparDoc();
    }
  }

  /** Parseia (background) os DFDs até o teto, atualizando os estados incrementalmente. */
  async function analisarTodos(idx0: ProtocoloIndex, doc: PdfDoc) {
    const nome = idx0.protocolo.nomeArquivo ?? "protocolo.pdf";
    const total = Math.min(idx0.dfds.length, CAP_ANALISE);
    if (total === 0) return;
    setAnalisando(true);
    for (let i = 0; i < total; i++) {
      try {
        const raw = await parseDfdDoProtocolo(doc, idx0.dfds[i], nome);
        const { dfd, auto } = normalizarSecoesDfd(raw, regras);
        setParsed((m) => new Map(m).set(i, dfd));
        if (auto.length) setAutoMap((m) => new Map(m).set(i, auto));
      } catch (e) {
        // Leitura falhou (ex.: item sem número no PDF → tabela incompleta). Guarda o
        // motivo → estado "erro" com a mensagem (não fica "pendente" sem explicação).
        setErrosParse((m) => new Map(m).set(i, e instanceof Error ? e.message : "Falha ao ler o DFD."));
      }
      if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0)); // cede o event loop
    }
    setAnalisando(false);
  }

  function fechar() {
    setAberto(false);
    setAbertoIdx(-1);
    limparDoc();
  }

  const nomeArq = extra.nomeArquivo ?? "protocolo.pdf";

  const classificar = (dfdNumero: string): Situacao => {
    const ex = dfdsExistentes.find((x) => x.numero.trim() === dfdNumero.trim());
    if (!ex) return "novo";
    if (ex.protocoloNumero && ex.protocoloNumero.trim() !== numero.trim()) return "move";
    return "substitui";
  };

  // Categoria do protocolo (classifica o assunto livre) → aplica as exceções por categoria.
  const categoria = classificarAssunto(assunto);

  /** Confere a assinatura do DFD contra o responsável da repartição escolhida. */
  const confereAssinatura = (idx: number, d: DfdParseado) =>
    validarAssinatura(d.assinaturas, reparticoes.find((r) => r.id === dfdRepIds[idx])?.responsaveis ?? RESPONSAVEIS_VAZIO, {
      exigeAssinatura: pdfExigeAssinatura(d.nomeArquivo),
    });

  const estado = (idx: number): EstadoDfd => {
    if (errosParse.has(idx)) return "erro"; // falha de leitura (ex.: tabela incompleta)
    const d = parsed.get(idx);
    if (!d) return "pendente";
    const nivelAss = nivelDe(regras, "dfd.assinatura", { dfdTipo: tipoCurtoDfd(d.tipo), categoria });
    // Assinatura não conferida — bloqueia só se `dfd.assinatura` for fundamental (regra 6).
    const assRes = confereAssinatura(idx, d);
    if (bloqueiaAssinatura(assRes, nivelAss)) return "erro";
    // Avaliação configurável: bloqueantes (fundamental) → erro; atenções (intermediário/
    // automático, incl. DFD-R sem referência e quantidade) → âmbar.
    const av = avaliarDfd({ ...d, reparticaoId: dfdRepIds[idx] }, regras, { categoria });
    if (av.bloqueantes.length > 0) return "erro";
    const assAtencao = assRes.status === "erro" && nivelAss === "intermediario";
    const atencao = av.atencoes.length > 0 || assAtencao;
    return estadoDfd(0, (autoMap.get(idx)?.length ?? 0) > 0, editados.has(idx), atencao);
  };

  function setRepDfd(idx: number, id: number | null) {
    setDfdRepIds((arr) => arr.map((x, i) => (i === idx ? id : x)));
    setEditados((s) => new Set(s).add(idx));
  }

  /** Garante o DFD parseado+normalizado no cache (uso: abrir/bulk). */
  async function garantirParse(idx: number): Promise<DfdParseado | null> {
    const doc = docRef.current;
    const di = index?.dfds[idx];
    if (!doc || !di) return null;
    const cached = parsed.get(idx);
    if (cached) return cached;
    const raw = await parseDfdDoProtocolo(doc, di, nomeArq);
    const { dfd, auto } = normalizarSecoesDfd(raw);
    setParsed((m) => new Map(m).set(idx, dfd));
    setAutoMap((m) => new Map(m).set(idx, auto));
    return dfd;
  }

  async function abrir(idx: number) {
    setErro(null);
    setCarregandoIdx(idx);
    setPainel(null); // abre só o DFD (sem mensagens/detalhe do DFD anterior)
    setAncoraAlvo(null);
    try {
      await garantirParse(idx);
      setAbertoIdx(idx);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler este DFD.");
    } finally {
      setCarregandoIdx(null);
    }
  }

  /** Fecha o DFD do lateral (e o painel da direita, se aberto). */
  function fecharDfdLateral() {
    setAbertoIdx(-1);
    setPainel(null);
    setAncoraAlvo(null);
  }
  /** Clique numa mensagem: rola/destaca a âncora no DFD (que segue ao lado) na cor do status. */
  function irParaMensagem(m: { ancora: string; status: "erro" | "atencao" | "acerto" }) {
    setAncoraAlvo({ ancora: m.ancora, cor: STATUS_MENSAGEM_COR[m.status], nonce: Date.now() });
  }

  const onSecoesAberto = (secoes: DfdParseado["secoes"]) => {
    setParsed((m) => {
      const d = m.get(abertoIdx);
      if (!d) return m;
      return new Map(m).set(abertoIdx, { ...d, secoes });
    });
    setEditados((s) => new Set(s).add(abertoIdx));
  };

  // Edição manual das referências de renovação (DFD-R) do DFD aberto no lateral.
  const onRefsAberto = (refs: { numeroContrato: string | null; numeroAta: string | null; numeroLicitacao: string | null }) => {
    setParsed((m) => {
      const d = m.get(abertoIdx);
      if (!d) return m;
      return new Map(m).set(abertoIdx, { ...d, ...refs });
    });
    setEditados((s) => new Set(s).add(abertoIdx));
  };

  async function aplicarBulk() {
    const idxs = [...sel].map(Number); // chaves são idx numéricos
    if (idxs.length === 0) return;
    if (bulkCampo === "reparticao") {
      setDfdRepIds((arr) => arr.map((x, i) => (sel.has(i) ? bulkRep : x)));
    } else {
      const cfg = bulkCampo === "prioridade" ? TRATAVEIS[0] : bulkCampo === "previsao" ? TRATAVEIS[1] : TRATAVEIS[2];
      const texto =
        bulkCampo === "prioridade" ? bulkPrio : bulkCampo === "previsao" ? buildPrevisao(bulkMes, bulkAno, bulkAnual) : bulkFund;
      if (!texto) return;
      for (const i of idxs) {
        const d = await garantirParse(i);
        if (!d) continue;
        setParsed((m) => new Map(m).set(i, { ...d, secoes: setTextoSecao(d.secoes, cfg, texto) }));
      }
    }
    setEditados((s) => {
      const n = new Set(s);
      for (const i of idxs) n.add(i);
      return n;
    });
    setSel(new Set());
  }

  async function protocolar() {
    if (!index) return;
    setImportando(true);
    setErro(null);
    setRelatorio(null);
    try {
      const res = await fetch("/api/protocolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "start-protocolo",
          protocolo: {
            numero,
            idExterno: extra.idExterno,
            anoPca,
            data: data || null,
            interessado: interessado || null,
            documento: extra.documento,
            assunto: assunto || null,
            observacao: observacao || null,
            valorCapa: extra.valorCapa,
            reparticaoId: protoRepId,
            localReparticao: extra.localReparticao,
            nomeArquivo: extra.nomeArquivo,
          },
        }),
      });
      const pj = (await res.json()) as { ok?: boolean; error?: string; protocoloId?: number };
      if (!res.ok || !pj.ok || !pj.protocoloId) throw new Error(pj.error ?? "Erro ao criar o protocolo.");
      const protocoloId = pj.protocoloId;

      const doc = docRef.current;
      const dfds = index.dfds;
      const bloqueados: { numero: string; motivo: string }[] = [];
      let importados = 0;
      for (let i = 0; i < dfds.length; i++) {
        const di = dfds[i];
        setProgresso({ feito: i, total: dfds.length, label: `DFD ${di.numero} (${i + 1}/${dfds.length})` });
        // Usa a cópia EDITADA do cache; senão parseia local (streaming, sem acumular).
        let full = parsed.get(i) ?? null;
        if (!full) {
          if (!doc) break;
          try {
            full = normalizarSecoesDfd(await parseDfdDoProtocolo(doc, di, nomeArq), regras).dfd;
          } catch (e) {
            bloqueados.push({ numero: di.numero, motivo: e instanceof Error ? e.message : "falha ao ler o DFD" });
            continue;
          }
        }
        const faltas = faltasObrigatorias(
          {
            reparticaoId: dfdRepIds[i],
            itens: full.itens,
            secoes: full.secoes,
            tipo: full.tipo,
            numeroContrato: full.numeroContrato,
            numeroAta: full.numeroAta,
            numeroLicitacao: full.numeroLicitacao,
          },
          regras,
          { categoria },
        );
        if (faltas.length > 0) {
          bloqueados.push({ numero: di.numero, motivo: faltas.join(", ") });
          continue;
        }
        // Confere a assinatura (mesma regra do servidor) — o nível `dfd.assinatura` decide.
        const resAss = confereAssinatura(i, full);
        if (bloqueiaAssinatura(resAss, nivelDe(regras, "dfd.assinatura", { dfdTipo: tipoCurtoDfd(full.tipo), categoria }))) {
          bloqueados.push({ numero: di.numero, motivo: resAss.status === "erro" ? resAss.motivo : "assinatura" });
          continue;
        }
        try {
          await enviarDfdEmLotes(
            {
              numero: full.numero,
              planejamento: full.planejamento,
              tipo: full.tipo,
              objeto: full.objeto,
              orgaoEntidade: full.orgaoEntidade,
              setorRequisitante: full.setorRequisitante,
              siglaSetor: full.siglaSetor,
              responsavel: full.responsavel,
              matricula: full.matricula,
              email: full.email,
              telefone: full.telefone,
              // Regra: todos os DFDs do protocolo herdam o ano do PCA do protocolo.
              anoPca,
              numeroContrato: full.numeroContrato,
              numeroAta: full.numeroAta,
              numeroLicitacao: full.numeroLicitacao,
              reparticaoId: dfdRepIds[i],
              protocoloId,
              valorEstimado: full.valorEstimado,
              valorTotal: full.valorTotal,
              nomeArquivo: full.nomeArquivo,
              secoes: full.secoes,
              assinaturas: full.assinaturas,
            },
            full.itens,
          );
          importados++;
        } catch (e) {
          bloqueados.push({ numero: di.numero, motivo: e instanceof Error ? e.message : "falha ao gravar" });
        }
        setProgresso({ feito: i + 1, total: dfds.length, label: `DFD ${di.numero} (${i + 1}/${dfds.length})` });
      }
      setRelatorio({ numero, importados, bloqueados });
      fechar();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao protocolar.");
    } finally {
      setImportando(false);
      setProgresso(null);
    }
  }

  const SITUACAO: Record<Situacao, string> = { novo: "Novo", substitui: "Substitui", move: "Move" };

  const compacta = abertoIdx >= 0; // DFD aberto ao lado → tabela estreita (rola no eixo x)
  // Acessores por linha (puxam do cache de parse + repartição atribuída).
  const repCod = (idx: number): string => {
    const id = dfdRepIds[idx];
    const c = id != null ? reparticoes.find((r) => r.id === id)?.codigo : null;
    return c ?? index?.dfds[idx].siglaSetor ?? "—";
  };
  const planNum = (idx: number): string => parsed.get(idx)?.planejamento ?? "";
  const qtdItens = (idx: number): number | null => parsed.get(idx)?.itens.length ?? null;
  const valorItens = (idx: number): number | null => {
    const d = parsed.get(idx);
    return d ? (d.valorTotal ?? d.valorEstimado ?? null) : null;
  };
  // Uma linha NORMALIZADA por DFD para a planilha única (`PlanilhaDfds`). O `key` é o
  // idx (chave da seleção/edição em massa). Estado/Situação/valores vêm do parse+validação.
  const linhasDfd: LinhaDfd[] = (index?.dfds ?? []).map((di, idx) => ({
    key: idx,
    numero: di.numero,
    planejamento: planNum(idx) || null,
    sigla: repCod(idx),
    auto: dfdRepIds[idx] != null && dfdRepIds[idx] === autoRepIds[idx],
    tipo: tipoCurtoDfd(parsed.get(idx)?.tipo),
    itens: qtdItens(idx),
    valor: valorItens(idx),
    estado: estado(idx),
    estadoMotivo: errosParse.get(idx) ?? null,
    situacao: SITUACAO[classificar(di.numero)],
  }));
  const linhasErro = linhasDfd.filter((l) => l.estado === "erro");
  const linhasAtencao = linhasDfd.filter((l) => l.estado === "atencao"); // DFD-R sem referência
  const semRep = (index?.dfds.length ?? 0) - dfdRepIds.filter((x) => x != null).length;
  // Bloqueia a protocolação enquanto houver DFD com erro (não permite protocolo com DFDs defeituosos).
  const dfdsComErro = linhasErro.length;
  const temDfds = (index?.dfds.length ?? 0) > 0;
  // Somatória dos valores dos DFDs (valor do DFD = soma dos seus itens). Só é completa
  // quando todos foram analisados e nenhum está com erro.
  const somatorioDfds = [...parsed.values()].reduce((s, d) => s + (d.valorTotal ?? d.valorEstimado ?? 0), 0);
  const itensDfds = [...parsed.values()].reduce((s, d) => s + d.itens.length, 0);
  const conciliavel = temDfds && !analisando && dfdsComErro === 0;
  // Regra 2 (configurável por `protocolo.valorCapa` + categoria): capa **zerada/nula** OU
  // **diferente** da somatória dos DFDs. "ignorar" desliga; "fundamental" trava; senão avisa.
  const nivelCapa = nivelDe(regras, "protocolo.valorCapa", { categoria });
  const capaZeradaOuNula = extra.valorCapa == null || extra.valorCapa <= 0;
  const capaMismatch =
    conciliavel && nivelCapa !== "ignorar" && (capaZeradaOuNula || !valoresBatem(extra.valorCapa, somatorioDfds));
  const capaBloqueia = capaMismatch && nivelCapa === "fundamental";
  // Portões do protocolo respeitando os níveis do ADM (número é sempre obrigatório).
  const repBloqueia = protoRepId == null && nivelDe(regras, "protocolo.reparticao", { categoria }) === "fundamental";
  const anoPcaBloqueia = anoPca == null && nivelDe(regras, "protocolo.anoPca", { categoria }) === "fundamental";
  const semErroBloqueia = dfdsComErro > 0 && nivelDe(regras, "protocolo.semDfdEmErro", { categoria }) === "fundamental";
  const bloqueadoPorRegra = repBloqueia || anoPcaBloqueia || semErroBloqueia || capaBloqueia;
  const podeProtocolar =
    numero.trim().length > 0 && !importando && !analisando && !bloqueadoPorRegra;
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0;
  const dfdAberto = abertoIdx >= 0 ? (parsed.get(abertoIdx) ?? null) : null;
  const repAberto = abertoIdx >= 0 ? (reparticoes.find((r) => r.id === dfdRepIds[abertoIdx]) ?? null) : null;
  // Mensagens (erro/atenção/acerto) do DFD aberto — botão + painel lateral (herda o anoPca do protocolo).
  const mensagensAberto = dfdAberto ? mensagensDoDfd(dfdAberto, repAberto, anoPca, regras, categoria, orgaos, conformidade) : [];

  // Confere o DFD ABERTO contra o catálogo (lazy — só ao abrir/trocar de DFD; itens estáveis
  // na edição de seções/refs). Fechar o lateral (dfdAberto = null) limpa o veredito.
  const itensAberto = dfdAberto?.itens;
  const tipoAberto = dfdAberto?.tipo ?? null;
  useEffect(() => {
    if (!itensAberto || itensAberto.length === 0) {
      setConformidade(undefined);
      return;
    }
    const ac = new AbortController();
    setConformidade(undefined);
    conferirItensCliente(itensAberto, tipoAberto, ac.signal).then((m) => {
      if (!ac.signal.aborted) setConformidade(m);
    });
    return () => ac.abort();
  }, [itensAberto, tipoAberto]);

  // Relatório de erros do protocolo em DESPACHO (copiável) — pendências CIRÚRGICAS por
  // DFD com erro + capa (aponta o que corrigir e onde).
  const faltasDoDfd = (idx: number): string[] => {
    const parseErr = errosParse.get(idx);
    if (parseErr) return [`Leitura incompleta da tabela de itens (${parseErr}). Reenviar o DFD com a tabela completa.`];
    const d = parsed.get(idx);
    if (!d) return ["DFD ainda em análise — reabrir para conferir."];
    const resAss = confereAssinatura(idx, d);
    return faltasCirurgicasDfd(
      {
        itens: d.itens,
        secoes: d.secoes,
        reparticaoId: dfdRepIds[idx],
        assinaturaMotivo: resAss.status === "erro" ? resAss.motivo : null,
        tipo: d.tipo,
      },
      regras,
      { categoria },
    );
  };
  const capaMotivo = capaMismatch
    ? capaZeradaOuNula
      ? `Valor da capa ausente/zerado — informar o valor da capa (usar "Substituir pela somatória": ${brl(somatorioDfds)}).`
      : `Valor da capa (${extra.valorCapa != null ? brl(extra.valorCapa) : "—"}) diferente da somatória dos DFDs (${brl(somatorioDfds)}) — corrigir a capa (usar "Substituir pela somatória").`
    : null;
  const temErroProto = dfdsComErro > 0 || capaMismatch;
  // O relatório (despacho) fica disponível quando há erro OU DFD-R em atenção (o usuário
  // escolhe incluir os de atenção). Só de atenção também gera um despacho.
  const temAtencao = linhasAtencao.length > 0;
  const temRelatorio = temErroProto || temAtencao;
  const dfdsRelatorio = [
    ...linhasErro.map((l) => ({
      numero: index?.dfds[l.key].numero ?? "?",
      tipo: parsed.get(l.key)?.tipo ?? null,
      faltas: faltasDoDfd(l.key),
    })),
    ...(incluirAtencao
      ? linhasAtencao.map((l) => ({
          numero: index?.dfds[l.key].numero ?? "?",
          tipo: parsed.get(l.key)?.tipo ?? null,
          faltas: [FALTA_REFERENCIA_RENOVACAO],
        }))
      : []),
  ];
  const relatorioLinhas = linhasRelatorioProtocolo({
    numero,
    idExterno: extra.idExterno,
    interessado: interessado || null,
    assunto: assunto || null,
    capaMotivo,
    dfds: dfdsRelatorio,
  });

  // Barra de edição em massa — FIXA no rodapé do banner, tamanho constante:
  // cima = controle do valor (altura fixa); baixo = seletor do campo + Aplicar + Limpar.
  const barraMassa = sel.size > 0 && !importando && (
    <div className="mb-3 rounded-card border border-border bg-surface-2 p-3">
      <div className="flex min-h-[42px] flex-wrap items-center gap-2">
        {bulkCampo === "reparticao" && (
          <select className={inputCls} style={{ width: "auto", minWidth: 200 }} value={bulkRep ?? ""} onChange={(e) => setBulkRep(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— Unidade —</option>
            {reparticoes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.codigo} · {r.nome}
              </option>
            ))}
          </select>
        )}
        {bulkCampo === "prioridade" && (
          <Segmented<Prioridade | "">
            value={bulkPrio}
            options={[
              { value: "ALTA", label: "Alta" },
              { value: "MÉDIA", label: "Média" },
              { value: "BAIXA", label: "Baixa" },
            ]}
            onChange={setBulkPrio}
          />
        )}
        {bulkCampo === "previsao" && (
          <>
            <select className={inputCls} style={{ width: "auto", flex: "0 1 140px" }} value={bulkMes} disabled={bulkAnual} onChange={(e) => setBulkMes(e.target.value)}>
              <option value="">— Mês —</option>
              {MESES.map((m) => (
                <option key={m} value={m}>
                  {m[0] + m.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <input className={inputCls} style={{ width: 84 }} inputMode="numeric" maxLength={4} placeholder="Ano" value={bulkAno} onChange={(e) => setBulkAno(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            <Checkbox label="Anual" checked={bulkAnual} onChange={(e) => setBulkAnual(e.target.checked)} />
          </>
        )}
        {bulkCampo === "fundamentacao" && (
          <div className="min-w-[220px] flex-1">
            <TextField aria-label="Fundamentação legal" value={bulkFund} onChange={(e) => setBulkFund(e.target.value)} />
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Segmented<CampoBulk>
          value={bulkCampo}
          options={[
            { value: "reparticao", label: "Repartição" },
            { value: "prioridade", label: "Prioridade" },
            { value: "previsao", label: "Previsão" },
            { value: "fundamentacao", label: "Fund. legal" },
          ]}
          onChange={setBulkCampo}
        />
        <Button onClick={aplicarBulk}>Aplicar</Button>
        <Button variant="ghost" onClick={() => setSel(new Set())}>
          Limpar
        </Button>
        <span className="ml-auto text-[11px] font-semibold uppercase text-muted">{sel.size} selecionado(s)</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Botão único de importação (à direita) — abre o lançador */}
      <div className="flex justify-end">
        <Button onClick={() => setLauncher(true)} icon={<IconUpload className="h-[18px] w-[18px]" />}>
          Importar protocolo
        </Button>
      </div>

      {erro && status === "error" && (
        <Callout kind="danger" icon={<IconAlert className="h-5 w-5" />} className="mt-4">
          <p className="font-semibold">Não foi possível ler o protocolo</p>
          <p className="opacity-90">{erro}</p>
        </Callout>
      )}
      {status === "parsing" && (
        <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />} className="mt-4">
          Lendo o protocolo e identificando os DFDs...
        </Callout>
      )}
      {relatorio && (
        <Callout kind={relatorio.bloqueados.length > 0 ? "warn" : "ok"} icon={<IconCheck className="h-5 w-5" />} className="mt-4">
          <p className="font-semibold">Protocolo {relatorio.numero} salvo!</p>
          <p className="opacity-90">
            {num(relatorio.importados)} DFD{relatorio.importados === 1 ? "" : "s"} protocolado
            {relatorio.importados === 1 ? "" : "s"}
            {relatorio.bloqueados.length > 0 ? ` · ${relatorio.bloqueados.length} bloqueado(s)` : ""}.
          </p>
          {relatorio.bloqueados.length > 0 && (
            <ul className="mt-1.5 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-[12px] opacity-90">
              {relatorio.bloqueados.map((b) => (
                <li key={b.numero}>
                  DFD {b.numero}: {b.motivo}
                </li>
              ))}
            </ul>
          )}
        </Callout>
      )}

      {/* Lançador de importação — banner dividido ao meio: soltar/escolher | criar manual */}
      <Modal open={launcher} onClose={() => setLauncher(false)} titulo="Importar protocolo" size="xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <Dropzone
            accept=".pdf"
            onFile={(f) => {
              setLauncher(false);
              handleFile(f);
            }}
            titulo="Soltar o protocolo (.pdf)"
            icon={<IconClipboard className="h-7 w-7" />}
            dica="O sistema identifica cada DFD, analisa e trata os campos."
          />
          <div className="flex flex-col items-center justify-center rounded-card border border-border bg-surface-2 p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-muted">
              <IconFile className="h-7 w-7" />
            </span>
            <h4 className="mt-4 text-sm font-bold text-text">Criar manualmente</h4>
            <p className="mt-1 text-xs text-muted">Sem PDF — você preenche os dados e adiciona/vincula DFDs depois.</p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => {
                setLauncher(false);
                abrirVazio();
              }}
            >
              Novo protocolo (sem PDF)
            </Button>
          </div>
        </div>
      </Modal>

      {/* Banner */}
      <Modal
        open={aberto}
        onClose={fechar}
        titulo={numero ? `Protocolo ${numero}` : "Novo protocolo"}
        cabecalho={<ProtocoloCabecalho numero={numero || "novo"} idExterno={extra.idExterno} assunto={assunto || null} />}
        size="lg"
        fecharNoBackdrop={false}
        bloqueado={importando}
        lateral={
          temDfds
            ? {
                aberto: abertoIdx >= 0,
                titulo: abertoIdx >= 0 ? `DFD ${index?.dfds[abertoIdx]?.numero ?? ""}` : "DFD",
                cabecalho:
                  abertoIdx >= 0 ? (
                    <DfdCabecalho
                      numero={index?.dfds[abertoIdx]?.numero ?? ""}
                      tipo={dfdAberto?.tipo ?? null}
                      planejamento={dfdAberto?.planejamento ?? null}
                    />
                  ) : undefined,
                onClose: fecharDfdLateral,
                rodape:
                  abertoIdx < 0 ? undefined : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {dfdAberto ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium"
                          style={{ color: estadoCor(estado(abertoIdx)) }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: estadoCor(estado(abertoIdx)) }} />
                          {ESTADO_ROTULO[estado(abertoIdx)]}
                        </span>
                      ) : (
                        <span />
                      )}
                      <div className="flex items-center gap-2">
                        {dfdAberto && (
                          <BotaoVerMensagens
                            mensagens={mensagensAberto}
                            aberto={painel?.tipo === "mensagens"}
                            onToggle={() => setPainel((p) => (p?.tipo === "mensagens" ? null : { tipo: "mensagens" }))}
                          />
                        )}
                        <Button variant="secondary" onClick={fecharDfdLateral} disabled={importando}>
                          Fechar
                        </Button>
                      </div>
                    </div>
                  ),
                children: (
                  <div key={abertoIdx} className="animate-fade-in-up">
                    {carregandoIdx === abertoIdx || !dfdAberto ? (
                      <Callout kind="info" icon={<IconSpinner className="h-5 w-5" />}>
                        Lendo o DFD...
                      </Callout>
                    ) : (
                      <DfdConferir
                        dfd={dfdAberto}
                        reparticoes={reparticoes}
                        reparticaoAtivaId={reparticaoAtivaId}
                        repId={dfdRepIds[abertoIdx] ?? null}
                        anoPca={anoPca}
                        autoMatch={dfdRepIds[abertoIdx] != null && dfdRepIds[abertoIdx] === autoRepIds[abertoIdx]}
                        autoCampos={autoMap.get(abertoIdx) ?? []}
                        regras={regras}
                        orgaos={orgaos}
                        conformidade={conformidade}
                        ancoraAlvo={ancoraAlvo}
                        itemAtivo={painel?.tipo === "item" ? painel.idx : null}
                        onItemClick={(idx) => setPainel({ tipo: "item", idx })}
                        onRepChange={(id) => setRepDfd(abertoIdx, id)}
                        onSecoesChange={onSecoesAberto}
                        onRefsChange={onRefsAberto}
                      />
                    )}
                  </div>
                ),
              }
            : undefined
        }
        lateral2={
          temDfds
            ? {
                aberto: abertoIdx >= 0 && painel != null,
                titulo:
                  painel?.tipo === "item"
                    ? `Item ${dfdAberto?.itens[painel.idx]?.item ?? painel.idx + 1} — DFD ${index?.dfds[abertoIdx]?.numero ?? ""}`
                    : `Mensagens — DFD ${index?.dfds[abertoIdx]?.numero ?? ""}`,
                onClose: () => setPainel(null),
                children:
                  painel?.tipo === "item" && dfdAberto?.itens[painel.idx] ? (
                    <ItemDetalhe
                      item={dfdAberto.itens[painel.idx]}
                      conformidade={conformidade}
                      regras={regras}
                      tipo={dfdAberto.tipo}
                    />
                  ) : (
                    <MensagensDfd
                      mensagens={mensagensAberto}
                      numero={index?.dfds[abertoIdx]?.numero ?? ""}
                      tipo={dfdAberto?.tipo}
                      onIrPara={irParaMensagem}
                    />
                  ),
              }
            : undefined
        }
        rodape={
          <div>
            {barraMassa}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {importando && progresso ? (
                <div className="min-w-[200px] flex-1">
                  <Progress value={pct} label={`Protocolando ${progresso.label}... ${pct}% — não feche esta janela`} />
                </div>
              ) : (
              <span
                className="text-[12px]"
                style={{ color: bloqueadoPorRegra ? "var(--danger)" : "var(--muted)" }}
              >
                {anoPcaBloqueia
                  ? "Defina o PCA do processo para protocolar"
                  : repBloqueia
                    ? "Defina a unidade do processo para protocolar"
                    : !temDfds
                      ? "Sem DFDs — cria só o protocolo."
                      : analisando
                        ? `Analisando ${index?.dfds.length} DFD(s)...`
                        : semErroBloqueia
                          ? `${dfdsComErro} DFD(s) com erro — trate antes de protocolar`
                          : capaBloqueia
                            ? "Valor da capa diverge da somatória — substitua para liberar"
                            : `${index?.dfds.length} DFD(s) · ${semRep} sem unidade · ${dfdsComErro > 0 ? `${dfdsComErro} com erro (não bloqueia)` : temAtencao ? `${linhasAtencao.length} em atenção` : "tudo certo"}`}
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {!importando && temRelatorio && (
                <Button
                  variant="secondary"
                  onClick={() => setRelatorioAberto(true)}
                  icon={<IconAlert className="h-4 w-4" style={{ color: temErroProto ? "var(--danger)" : "var(--warn)" }} />}
                >
                  {temErroProto ? "Relatório de erro" : "Relatório de atenção"}
                </Button>
              )}
              {!importando && (
                <Button variant="secondary" onClick={fechar}>
                  Cancelar
                </Button>
              )}
              <Button onClick={protocolar} loading={importando} disabled={!podeProtocolar} icon={<IconUpload className="h-[18px] w-[18px]" />}>
                Protocolar
              </Button>
              </div>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Head — mini banners (um por informação) + conferência do valor da capa */}
          {temDfds && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatMini label="Total de DFDs" value={num(index?.dfds.length ?? 0)} />
              <StatMini label="Total de itens" value={num(itensDfds)} hint={analisando ? "analisando…" : undefined} />
              <StatMini
                label="Somatória dos DFDs"
                value={brl(somatorioDfds)}
                tone={capaMismatch ? "warn" : "default"}
                hint={analisando ? "analisando…" : undefined}
                className="col-span-2 sm:col-span-1"
              />
            </div>
          )}
          {capaMismatch && (
            <Callout kind={capaBloqueia ? "danger" : "warn"} icon={<IconAlert className="h-5 w-5" />}>
              <p className="font-semibold">
                {capaZeradaOuNula
                  ? capaBloqueia
                    ? "O valor da capa está zerado — não é possível protocolar"
                    : "O valor da capa está zerado (atenção — não bloqueia)"
                  : capaBloqueia
                    ? "O valor da capa diverge da somatória dos DFDs"
                    : "O valor da capa diverge da somatória dos DFDs (atenção — não bloqueia)"}
              </p>
              <p className="mt-1 opacity-90">
                Valor da capa: {extra.valorCapa != null ? brl(extra.valorCapa) : "—"} · Somatória dos DFDs:{" "}
                {brl(somatorioDfds)}. Substitua o valor da capa pela somatória para conciliar.
              </p>
              <div className="mt-2">
                <Button variant="secondary" onClick={() => setExtra((x) => ({ ...x, valorCapa: somatorioDfds }))}>
                  Substituir pela somatória ({brl(somatorioDfds)})
                </Button>
              </div>
            </Callout>
          )}

          {/* Dados da capa — MESMA grade (`CapaCampos`) do protocolo gravado. Editável só
              na criação manual (sem PDF); do PDF é imutável. */}
          <section className="rounded-card border border-border bg-surface p-5 shadow-ring">
            <h3 className="mb-4 text-sm font-bold text-text">Dados do processo</h3>
            <CapaCampos
              numero={numero}
              idExterno={extra.idExterno}
              data={data}
              documento={extra.documento ?? ""}
              interessado={interessado}
              assunto={assunto}
              observacao={observacao}
              valorCapa={extra.valorCapa}
              localReparticao={extra.localReparticao}
              editavel={!origemPdf}
              onChange={(c, v) => {
                if (c === "numero") setNumero(v);
                else if (c === "data") setData(v);
                else if (c === "interessado") setInteressado(v);
                else if (c === "assunto") setAssunto(v);
                else if (c === "observacao") setObservacao(v);
                else setExtra((x) => ({ ...x, documento: v || null }));
              }}
            >
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="proto-rep">
                  Unidade do protocolo (pelo Interessado) <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <select id="proto-rep" className={inputCls} value={protoRepId ?? ""} onChange={(e) => setProtoRepId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Selecione a unidade —</option>
                  {reparticoes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.codigo} · {r.nome}
                    </option>
                  ))}
                </select>
              </div>
              {/* PCA do protocolo (obrigatório) — os DFDs herdam este ano ao protocolar. */}
              <div className="sm:col-span-2">
                <PcaPicker pcas={pcas} value={anoPca} detectado={anoPcaDetectado} onChange={setAnoPca} />
              </div>
            </CapaCampos>
          </section>

          {!temDfds ? (
            <Callout kind="info">
              Nenhum DFD detectado. O protocolo será criado vazio — adicione DFDs depois (aba DFDs) ou vincule
              existentes.
            </Callout>
          ) : (
            <section>
              {/* Planilha ÚNICA de DFDs (a mesma do protocolo gravado e da aba DFDs):
                  DFDs com erro em tabela separada; clique numa linha abre o DFD ao lado. */}
              <PlanilhaDfds
                linhas={linhasDfd}
                selecionavel
                selected={sel}
                onSelected={setSel}
                onRowClick={abrir}
                ativa={abertoIdx >= 0 ? abertoIdx : null}
                compacta={compacta}
              />
            </section>
          )}
        </div>
      </Modal>

      <RelatorioErros
        open={relatorioAberto}
        onClose={() => setRelatorioAberto(false)}
        titulo={`Relatório do protocolo ${numero || ""}`.trim()}
        linhas={relatorioLinhas}
        toggle={
          temAtencao
            ? {
                label: `Incluir ${linhasAtencao.length} DFD-R sem referência (atenção) no relatório`,
                checked: incluirAtencao,
                onChange: setIncluirAtencao,
              }
            : undefined
        }
      />
    </div>
  );
}
