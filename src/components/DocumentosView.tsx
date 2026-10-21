"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { nomeDoDocumento, OPCOES_COMPACTACAO, tamanhoBase64 } from "@/lib/compactar-pdf-core";
import type { DocumentoResumo } from "@/lib/documentos";
import { dataBR, formatBytes, num } from "@/lib/format";
import type { PodeTela } from "@/lib/papeis-core";
import { predicadoBusca } from "@/lib/tabela-filtros";
import { Ajuda } from "./Ajuda";
import { AvisoFlutuante } from "./AvisoFlutuante";
import { Button } from "./Button";
import { gradienteDe, MenuCard } from "./CatalogoCards";
import { COLUNAS_ESPACOS } from "./CartaoEspacoEsqueleto";
import { useConfirmacao } from "./Confirmacao";
import { Dropzone } from "./Dropzone";
import { SearchField, SelectField, TextField } from "./Field";
import { IconDocumentos, IconDownload, IconEye, IconPencil, IconTrash, IconUpload } from "./icons";
import { Modal } from "./Modal";
import { Progress } from "./Progress";
import { CapaQuadro, CartaoEspaco } from "./QuadroCard";
import { Skeleton } from "./Skeleton";

/** A cor da capa dos documentos (o vermelho do PDF). */
const COR_DOCUMENTO = "#DC2626";
const urlArquivo = (id: number, baixar = false) => `/api/documentos/${id}/arquivo${baixar ? "?baixar=1" : ""}`;

/** O CARD de um documento — o `CartaoEspaco` do sistema: capa com o ícone, o nome, páginas · tamanho · data e o menu "…". */
export function DocumentoCard({
  doc: d,
  onVer,
  onBaixar,
  onRenomear,
  onExcluir,
}: {
  doc: DocumentoResumo;
  onVer: () => void;
  onBaixar?: () => void;
  onRenomear?: () => void;
  onExcluir?: () => void;
}) {
  const acoes = [
    { rotulo: "Visualizar", icone: <IconEye className="h-4 w-4 text-muted" />, onClick: onVer },
    onBaixar && { rotulo: "Baixar", icone: <IconDownload className="h-4 w-4 text-muted" />, onClick: onBaixar },
    onRenomear && { rotulo: "Renomear", icone: <IconPencil className="h-4 w-4 text-muted" />, onClick: onRenomear },
    onExcluir && { rotulo: "Excluir", icone: <IconTrash className="h-4 w-4" />, perigo: true, onClick: onExcluir },
  ].filter((a): a is NonNullable<typeof a> => !!a);
  return (
    <CartaoEspaco
      onClick={onVer}
      ariaLabel={`Visualizar ${d.nome}`}
      capa={
        <CapaQuadro quadro={{ cor: COR_DOCUMENTO, fundoUrl: null, fundoAjuste: null, fundoGradiente: gradienteDe(COR_DOCUMENTO) }}>
          <span aria-hidden className="absolute inset-0 grid place-items-center text-white/85">
            <IconDocumentos className="h-10 w-10" />
          </span>
          {d.compactado && (
            <span className="absolute bottom-1.5 left-1.5 inline-flex items-center rounded-full bg-[var(--scrim)] px-2 py-0.5 text-[11px] font-semibold text-white">
              Compactado de {formatBytes(d.tamanhoOriginal)}
            </span>
          )}
        </CapaQuadro>
      }
      sobretitulo={d.autor ? `PDF · ${d.autor}` : "PDF"}
      nome={d.nome}
      metricas={[
        { rotulo: "Páginas", valor: num(d.paginas) },
        { rotulo: "Tamanho", valor: formatBytes(d.tamanho) },
        { rotulo: "Enviado", valor: d.criadoEm ? dataBR(d.criadoEm) : "—", cor: "var(--text-2)" },
      ]}
      canto={
        <div className="absolute top-3 right-3 rounded-control bg-surface/90 shadow-ring backdrop-blur-sm lg:top-3.5 lg:right-3.5">
          <MenuCard nome={d.nome} acoes={acoes} />
        </div>
      }
    />
  );
}

/** O VISUALIZADOR: as páginas do PDF desenhadas pelo pdf.js (o mesmo leitor da importação) — funciona no celular. */
function VisualizadorPdf({ doc, onBaixar, onFechar }: { doc: DocumentoResumo; onBaixar?: () => void; onFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(urlArquivo(doc.id));
        if (!r.ok) throw new Error();
        const arquivo = new File([await r.blob()], doc.nomeArquivo, { type: "application/pdf" });
        const { abrirPdf } = await import("@/lib/parse-dfd-pdf");
        const pdf = await abrirPdf(arquivo);
        try {
          const largura = Math.min(ref.current?.clientWidth ?? 800, 900);
          for (let p = 1; p <= pdf.numPages && vivo; p++) {
            const primeira = await pdf.renderPagina(p, 1);
            const escala = (largura / primeira.width) * Math.min(window.devicePixelRatio || 1, 2);
            const canvas = await pdf.renderPagina(p, escala);
            canvas.className = "mx-auto block h-auto w-full max-w-[900px] rounded-lg bg-white shadow-ring";
            canvas.setAttribute("aria-label", `Página ${p}`);
            if (vivo) ref.current?.appendChild(canvas);
            if (p === 1 && vivo) setEstado("pronto");
          }
        } finally {
          await pdf.destroy();
        }
      } catch {
        if (vivo) setEstado("erro");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [doc.id, doc.nomeArquivo]);
  return (
    <Modal
      open
      onClose={onFechar}
      titulo={doc.nome}
      size="full"
      acoesCabecalho={onBaixar && <Button variant="icon" size="sm" aria-label="Baixar" title="Baixar" icon={<IconDownload className="h-4 w-4" />} onClick={onBaixar} />}
    >
      {estado === "carregando" && <Skeleton className="mx-auto aspect-[1/1.41] w-full max-w-[900px] rounded-lg" />}
      {estado === "erro" && <p className="p-10 text-center text-sm text-muted">Não consegui abrir este documento.</p>}
      <div ref={ref} className="space-y-[var(--gap-block)]" />
    </Modal>
  );
}

/**
 * A tela DOCUMENTOS: subir PDFs (cada um compactado no navegador até 100 KB — `compactarPdf`), um card por documento,
 * visualizar e baixar. O que o papel não permite some (subir = Importar, baixar = Exportar, renomear = Manipular,
 * excluir = Excluir).
 */
const CHAVE_COMPACTACAO = "documentos:compactacao";

export function DocumentosView({ documentos, pode, admin = false }: { documentos: DocumentoResumo[]; pode: PodeTela; admin?: boolean }) {
  const router = useRouter();
  // A % de compactação do envio: só o ADM escolhe (lembrada neste aparelho); os demais, automático.
  const [compactacao, setCompactacao] = useState(0);
  useEffect(() => {
    if (!admin) return;
    try {
      const v = Number(localStorage.getItem(CHAVE_COMPACTACAO));
      if ((OPCOES_COMPACTACAO as readonly number[]).includes(v)) setCompactacao(v);
    } catch {}
  }, [admin]);
  function escolherCompactacao(v: number) {
    setCompactacao(v);
    try {
      localStorage.setItem(CHAVE_COMPACTACAO, String(v));
    } catch {}
  }
  const [busca, setBusca] = useState("");
  const [fila, setFila] = useState<{ nome: string; atual: number; total: number; texto: string } | null>(null);
  const [aviso, setAviso] = useState<{ kind: "ok" | "danger"; texto: string } | null>(null);
  const [vendo, setVendo] = useState<DocumentoResumo | null>(null);
  const [renomeando, setRenomeando] = useState<{ doc: DocumentoResumo; nome: string } | null>(null);
  const { confirmar, confirmacao } = useConfirmacao();

  const visiveis = useMemo(() => {
    const casa = predicadoBusca(busca);
    return casa ? documentos.filter((d) => casa([d.nome, d.nomeArquivo, d.autor])) : documentos;
  }, [documentos, busca]);

  async function enviar(files: File[]) {
    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (pdfs.length === 0) {
      setAviso({ kind: "danger", texto: "Envie arquivos .pdf." });
      return;
    }
    setAviso(null);
    const ok: string[] = [];
    const falhas: string[] = [];
    const { compactarPdf } = await import("@/lib/compactar-pdf");
    for (const [i, f] of pdfs.entries()) {
      const passo = (texto: string) => setFila({ nome: f.name, atual: i + 1, total: pdfs.length, texto });
      passo("Lendo o PDF…");
      try {
        const r = await compactarPdf(f, passo, admin ? compactacao : 0);
        passo("Gravando…");
        let bin = "";
        for (let k = 0; k < r.bytes.length; k += 0x8000) bin += String.fromCharCode(...r.bytes.subarray(k, k + 0x8000));
        const conteudo = btoa(bin);
        if (conteudo.length !== tamanhoBase64(r.bytes.length)) throw new Error("Falha ao preparar o envio.");
        const res = await fetch("/api/documentos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: nomeDoDocumento(f.name), nomeArquivo: f.name, paginas: r.paginas, tamanhoOriginal: r.original, compactado: r.compactado, conteudo }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao gravar.");
        ok.push(r.bytes.length < r.original ? `${f.name} (${formatBytes(r.original)} → ${formatBytes(r.bytes.length)})` : f.name);
      } catch (e) {
        falhas.push(`${f.name}: ${e instanceof Error ? e.message : "falha"}`);
      }
    }
    setFila(null);
    setAviso(falhas.length ? { kind: "danger", texto: `${ok.length ? `Guardados: ${ok.join(", ")}. ` : ""}Falhas — ${falhas.join(" · ")}` } : { kind: "ok", texto: `Guardado(s): ${ok.join(", ")}` });
    if (ok.length) router.refresh();
  }

  const baixar = (d: DocumentoResumo) => {
    const a = document.createElement("a");
    a.href = urlArquivo(d.id, true);
    a.download = d.nomeArquivo;
    a.click();
  };

  async function excluir(d: DocumentoResumo) {
    if (!(await confirmar({ titulo: `Excluir "${d.nome}"?`, texto: "O documento sai do sistema. Não pode ser desfeito.", confirmar: "Excluir", perigo: true }))) return;
    const r = await fetch(`/api/documentos/${d.id}`, { method: "DELETE" });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) setAviso({ kind: "danger", texto: j.error ?? "Não foi possível excluir." });
    router.refresh();
  }

  async function renomear(e: FormEvent) {
    e.preventDefault();
    if (!renomeando) return;
    const r = await fetch(`/api/documentos/${renomeando.doc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: renomeando.nome }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) {
      setAviso({ kind: "danger", texto: j.error ?? "Não foi possível renomear." });
      return;
    }
    setRenomeando(null);
    router.refresh();
  }

  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="linha-topico flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          <IconDocumentos className="h-5 w-5 text-accent" />
          Documentos
        </h1>
        <Ajuda titulo="Documentos">
          <p>Guarde PDFs no sistema para consultar depois. Cada documento vira um card: tocar abre o PDF; o menu "…" baixa, renomeia ou exclui.</p>
          <p>Todo documento fica com no máximo 100 KB. Se o PDF for maior, o sistema o compacta no próprio navegador antes de enviar — as páginas viram imagem e a qualidade baixa até caber.</p>
        </Ajuda>
        {documentos.length > 0 && (
          <div className="ml-auto w-full sm:w-72">
            <SearchField compacto value={busca} onChange={(e) => setBusca(e.target.value)} onClear={() => setBusca("")} placeholder="Pesquisar documentos…" aria-label="Pesquisar documentos" />
          </div>
        )}
      </div>

      {pode.importar &&
        (fila ? (
          <div className="rounded-card border-2 border-dashed border-accent/50 bg-accent-soft/40 p-[var(--pad-card)]">
            <Progress value={((fila.atual - 1) / fila.total) * 100} label={`${fila.nome} (${fila.atual} de ${fila.total}) — ${fila.texto}`} />
          </div>
        ) : (
          <div className="space-y-2">
            {admin && (
              <div className="w-full sm:w-72">
                <SelectField compacto label="Compactação" value={String(compactacao)} onChange={(e) => escolherCompactacao(Number(e.target.value))}>
                  {OPCOES_COMPACTACAO.map((p) => (
                    <option key={p} value={p}>
                      {p === 0 ? "Automática (só para caber em 100 KB)" : `${p}% menor que o original`}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}
            <Dropzone accept=".pdf,application/pdf" onFiles={enviar} icon={<IconUpload className="h-7 w-7" />} titulo="Arraste PDFs ou toque para escolher" dica="Cada documento é guardado com até 100 KB — os maiores são compactados" />
          </div>
        ))}

      {documentos.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-10 text-center text-sm text-muted">Nenhum documento guardado ainda.</p>
      ) : visiveis.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-[var(--pad-card)] text-center text-sm text-muted">Nenhum documento com "{busca}".</p>
      ) : (
        <div className={`grid ${COLUNAS_ESPACOS} gap-3`}>
          {visiveis.map((d) => (
            <DocumentoCard
              key={d.id}
              doc={d}
              onVer={() => setVendo(d)}
              onBaixar={pode.exportar ? () => baixar(d) : undefined}
              onRenomear={pode.manipular ? () => setRenomeando({ doc: d, nome: d.nome }) : undefined}
              onExcluir={pode.excluir ? () => excluir(d) : undefined}
            />
          ))}
        </div>
      )}

      {vendo && <VisualizadorPdf doc={vendo} onBaixar={pode.exportar ? () => baixar(vendo) : undefined} onFechar={() => setVendo(null)} />}

      {renomeando && (
        <Modal
          open
          onClose={() => setRenomeando(null)}
          titulo="Renomear documento"
          size="md"
          rodape={
            <div className="flex w-full justify-end gap-2">
              <Button variant="secondary" onClick={() => setRenomeando(null)}>
                Cancelar
              </Button>
              <Button type="submit" form="renomear-documento" disabled={!renomeando.nome.trim()}>
                Salvar
              </Button>
            </div>
          }
        >
          <form id="renomear-documento" onSubmit={renomear}>
            <TextField label="Nome" value={renomeando.nome} maxLength={120} autoFocus onChange={(e) => setRenomeando({ ...renomeando, nome: e.target.value })} />
          </form>
        </Modal>
      )}

      {aviso && (
        <AvisoFlutuante kind={aviso.kind} titulo={aviso.kind === "ok" ? "Documentos" : "Atenção"} onClose={() => setAviso(null)} duracao={aviso.kind === "ok" ? 6000 : undefined}>
          {aviso.texto}
        </AvisoFlutuante>
      )}
      {confirmacao}
    </div>
  );
}
