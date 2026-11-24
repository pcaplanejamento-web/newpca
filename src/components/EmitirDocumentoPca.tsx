"use client";

import { useEffect, useRef, useState } from "react";
import { comoBlob, baixarNoNavegador } from "@/lib/arquivo-navegador";
import { brl, dataHoraBR, num } from "@/lib/format";
import { nomeArquivoDocumento } from "@/lib/pca-documento-core";
import type { PacoteDocumento } from "@/lib/pca-documento-pdf";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type ConfigCaptcha, useCaptcha } from "./CodigoEmail";
import { IconDocumentos, IconDownload } from "./icons";
import { LinkExterno } from "./LinkExterno";
import { Modal } from "./Modal";
import { Progress } from "./Progress";

type Etapa = "registrando" | "montando" | "desenhando" | "salvando";
type Estado =
  | { fase: "inicio"; erro?: string }
  | { fase: "gerando"; etapa: Etapa; feito: number; total: number }
  | { fase: "pronto"; bytes: Uint8Array; nome: string; codigo: string; url: string; emitidoEm: string; itens: number; valor: number; paginas: number };

/** A fração (0–100) e o texto de cada etapa — o andamento REAL (o desenho conta página a página). */
function andamento(e: Extract<Estado, { fase: "gerando" }>): { pct: number; texto: string } {
  if (e.etapa === "registrando") return { pct: 3, texto: "Registrando a emissão e buscando os dados publicados…" };
  if (e.etapa === "montando") return { pct: 12, texto: "Montando as páginas do documento…" };
  if (e.etapa === "salvando") return { pct: 97, texto: "Salvando o arquivo…" };
  const f = e.total ? e.feito / e.total : 0;
  return { pct: 15 + f * 80, texto: `Desenhando a página ${num(e.feito)} de ${num(e.total)}…` };
}

/**
 * EMITIR O DOCUMENTO OFICIAL DO PCA (tela pública): a verificação anti-robô → `POST /api/pca/[id]/documento` (o servidor
 * registra a emissão — código + selo — e entrega a configuração do ADM e os dados publicados) → o PDF montado NO
 * NAVEGADOR com o andamento real (página a página) e o cancelamento. Pronto: baixar de novo e o link de verificação.
 */
export function EmitirDocumentoPca({ pcaId, pcaNome, turnstile, open, onClose }: { pcaId: number; pcaNome: string; turnstile: ConfigCaptcha; open: boolean; onClose: () => void }) {
  const [estado, setEstado] = useState<Estado>({ fase: "inicio" });
  const captcha = useCaptcha(turnstile);
  const abortar = useRef<AbortController | null>(null);
  // Fechar/desmontar no meio PARA a geração (nada fica rodando escondido).
  useEffect(() => () => abortar.current?.abort(), []);

  const gerar = async () => {
    if (!captcha.token) return;
    const ctl = new AbortController();
    abortar.current = ctl;
    let paginas = 0;
    setEstado({ fase: "gerando", etapa: "registrando", feito: 0, total: 1 });
    try {
      const res = await fetch(`/api/pca/${pcaId}/documento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: captcha.token }),
        signal: ctl.signal,
      });
      const j = (await res.json().catch(() => ({}))) as Partial<PacoteDocumento> & { ok?: boolean; error?: string };
      if (!res.ok || !j.ok || !j.emissao || !j.config || !j.pca || !j.dados) throw new Error(j.error ?? "Não foi possível emitir o documento.");
      const pacote = j as PacoteDocumento;
      const { gerarPdfDocumentoPca } = await import("@/lib/pca-documento-pdf");
      const bytes = await gerarPdfDocumentoPca(pacote, {
        sinal: ctl.signal,
        onProgresso: (p) => {
          if (p.etapa === "desenhando") paginas = p.total;
          setEstado({ fase: "gerando", etapa: p.etapa, feito: p.feito, total: p.total });
        },
      });
      const nome = nomeArquivoDocumento(pacote);
      baixarNoNavegador(nome, comoBlob(bytes));
      const { itensDoTexto } = await import("@/lib/itens-dash-texto");
      const itens = itensDoTexto(pacote.dados.itensTexto);
      const e = pacote.emissao as NonNullable<PacoteDocumento["emissao"]>;
      setEstado({
        fase: "pronto",
        bytes,
        nome,
        codigo: e.codigo,
        url: e.url,
        emitidoEm: e.emitidoEm,
        itens: itens.length,
        valor: itens.reduce((s, i) => s + Number(i.valorTotal ?? 0), 0),
        paginas,
      });
    } catch (e) {
      const cancelado = (e as Error).name === "AbortError";
      setEstado({ fase: "inicio", erro: cancelado ? "Geração cancelada." : (e as Error).message });
    } finally {
      abortar.current = null;
      // O token anti-robô vale UMA vez: a próxima emissão verifica de novo.
      captcha.renovar();
    }
  };

  const fechar = () => {
    abortar.current?.abort();
    setEstado({ fase: "inicio" });
    onClose();
  };
  const gerando = estado.fase === "gerando";
  const a = gerando ? andamento(estado) : null;

  return (
    <Modal
      open={open}
      onClose={fechar}
      titulo="Plano de Contratações Anual — documento oficial"
      size="md"
      fecharNoBackdrop={!gerando}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {gerando ? (
            <Button variant="secondary" size="sm" onClick={() => abortar.current?.abort()}>
              Cancelar
            </Button>
          ) : estado.fase === "pronto" ? (
            <Button variant="primary" size="sm" icon={<IconDownload className="h-4 w-4" />} onClick={() => baixarNoNavegador(estado.nome, comoBlob(estado.bytes))}>
              Baixar de novo
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={<IconDocumentos className="h-4 w-4" />} disabled={!captcha.pronto} onClick={gerar}>
              Gerar o documento
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 text-[14px]">
        <p className="text-text-2">
          O documento do <strong className="text-text">{pcaNome}</strong> traz a apresentação, a base legal, os resumos, a relação dos DFDs e <strong className="text-text">todos os itens</strong>{" "}
          pelo número sequencial do PCA. Ele é montado no seu navegador e recebe um código de verificação.
        </p>
        {estado.fase === "inicio" && (
          <>
            {estado.erro && <Callout kind="warn">{estado.erro}</Callout>}
            <div className="flex justify-center">{captcha.widget}</div>
          </>
        )}
        {gerando && a && (
          <div className="space-y-2" aria-live="polite">
            <Progress value={a.pct} label={a.texto} />
            <p className="text-[12px] text-muted">Documentos grandes têm milhares de páginas — mantenha esta tela aberta até o download.</p>
          </div>
        )}
        {estado.fase === "pronto" && (
          <div className="space-y-3">
            <Callout kind="ok">Documento gerado e baixado ({num(estado.paginas)} páginas).</Callout>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-muted">Emitido em</dt>
              <dd className="text-text">{dataHoraBR(estado.emitidoEm)} (Brasília)</dd>
              <dt className="text-muted">Itens · valor</dt>
              <dd className="tabular-nums text-text">
                {num(estado.itens)} · {brl(estado.valor)}
              </dd>
              <dt className="text-muted">Código</dt>
              <dd className="break-all font-mono text-text">{estado.codigo}</dd>
            </dl>
            <LinkExterno href={estado.url} variante="texto" className="text-[13px] font-semibold">
              Conferir a autenticidade
            </LinkExterno>
          </div>
        )}
      </div>
    </Modal>
  );
}
