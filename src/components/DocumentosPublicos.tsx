"use client";

import { useState } from "react";
import type { DocumentoResumo } from "@/lib/documentos";
import { COLUNAS_ESPACOS } from "./CartaoEspacoEsqueleto";
import { DocumentoCard, VisualizadorPdf } from "./DocumentosView";

/** A aba DOCUMENTOS da tela pública: os documentos do PCA SÓ PARA VER (sem baixar, renomear, vincular nem excluir). O PDF
 *  vem da rota pública do PCA, que confere de novo a aba publicada, o PCA e o vínculo do documento. */
export function DocumentosPublicos({ pcaId, documentos }: { pcaId: number; documentos: DocumentoResumo[] }) {
  const [aberto, setAberto] = useState<DocumentoResumo | null>(null);
  if (documentos.length === 0) return <p className="rounded-card border border-border bg-surface p-10 text-center text-sm text-muted">Nenhum documento publicado neste PCA.</p>;
  return (
    <>
      <div className={`grid gap-[var(--gap-block)] ${COLUNAS_ESPACOS}`}>
        {documentos.map((d) => (
          <DocumentoCard key={d.id} doc={d} onVer={() => setAberto(d)} />
        ))}
      </div>
      {aberto && <VisualizadorPdf doc={aberto} url={`/api/pca/${pcaId}/consulta/documento/${aberto.id}`} onFechar={() => setAberto(null)} />}
    </>
  );
}
