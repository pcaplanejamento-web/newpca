import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { documentoPartes, documentos, usuarios } from "@/db/schema";
import { getDb } from "./db";
import { documentoVisivel, gravarPcasDocumento, lerPcasDocumento, type PcasDocumento } from "./documentos-core";

/** Um documento na lista (SEM o conteúdo — o PDF só é lido ao ver/baixar). */
export type DocumentoResumo = {
  id: number;
  nome: string;
  nomeArquivo: string;
  tamanho: number;
  tamanhoOriginal: number;
  paginas: number;
  compactado: boolean;
  criadoEm: string | null;
  autor: string | null;
  /** O link do Google quando o documento fica no Drive (nada guardado aqui). */
  link: string | null;
  /** Os PCAs em que o documento aparece. */
  pcas: PcasDocumento;
};

/**
 * Os documentos que a pessoa vê (`permitidos` = os PCAs do grupo ativo — `pcasDoAcesso`; null = sem restrição); com `pcaId`,
 * só os vinculados àquele PCA (direto ou "todos").
 */
export async function listarDocumentos(permitidos: Set<number> | null, pcaId?: number): Promise<DocumentoResumo[]> {
  const linhas = await getDb()
    .select({
      id: documentos.id,
      nome: documentos.nome,
      nomeArquivo: documentos.nomeArquivo,
      tamanho: documentos.tamanho,
      tamanhoOriginal: documentos.tamanhoOriginal,
      paginas: documentos.paginas,
      compactado: documentos.compactado,
      criadoEm: documentos.criadoEm,
      autor: usuarios.nome,
      link: documentos.urlExterna,
      pcas: documentos.pcas,
    })
    .from(documentos)
    .leftJoin(usuarios, eq(usuarios.id, documentos.criadoPor))
    .where(
      and(
        eq(documentos.completo, true),
        pcaId == null
          ? undefined
          : sql`(${documentos.pcas} = 'todos' OR (json_valid(${documentos.pcas}) AND EXISTS (SELECT 1 FROM json_each(${documentos.pcas}) WHERE value = ${pcaId})))`,
      ),
    )
    .orderBy(desc(documentos.id));
  return linhas.map((l) => ({ ...l, pcas: lerPcasDocumento(l.pcas) })).filter((d) => documentoVisivel(d.pcas, permitidos));
}

export async function definirPcasDocumento(id: number, p: PcasDocumento) {
  await getDb().update(documentos).set({ pcas: gravarPcasDocumento(p) }).where(eq(documentos.id, id));
}

export async function getDocumento(id: number) {
  const [d] = await getDb().select().from(documentos).where(eq(documentos.id, id)).limit(1);
  return d ?? null;
}

export async function criarDocumento(dados: {
  nome: string;
  nomeArquivo: string;
  tamanho: number;
  tamanhoOriginal: number;
  paginas: number;
  compactado: boolean;
  partes: number;
  criadoPor: number;
}): Promise<number> {
  const db = getDb();
  // Envios da mesma pessoa que ficaram pela metade há mais de 1 h saem (as partes vão em cascata).
  await db
    .delete(documentos)
    .where(and(eq(documentos.criadoPor, dados.criadoPor), eq(documentos.completo, false), lt(documentos.criadoEm, sql`datetime('now', '-1 hour')`)));
  const [r] = await db
    .insert(documentos)
    .values({ ...dados, conteudo: "", completo: false })
    .returning({ id: documentos.id });
  return r.id;
}

/** Grava uma parte (repetir a mesma ordem substitui) e diz se o documento ficou completo — todas as partes, com o total certo. */
export async function gravarParte(id: number, ordem: number, dados: Uint8Array, partes: number, tamanho: number): Promise<boolean> {
  const db = getDb();
  const buf = Buffer.from(dados);
  await db
    .insert(documentoPartes)
    .values({ documentoId: id, ordem, dados: buf })
    .onConflictDoUpdate({ target: [documentoPartes.documentoId, documentoPartes.ordem], set: { dados: buf } });
  const [c] = await db
    .select({ n: sql<number>`count(*)`, bytes: sql<number>`coalesce(sum(length(${documentoPartes.dados})), 0)` })
    .from(documentoPartes)
    .where(eq(documentoPartes.documentoId, id));
  if (c.n !== partes || c.bytes !== tamanho) return false;
  await db.update(documentos).set({ completo: true }).where(eq(documentos.id, id));
  return true;
}

/** Os bytes do PDF: as partes em ordem, ou o base64 dos documentos antigos. */
export async function bytesDoDocumento(d: { id: number; partes: number; conteudo: string }): Promise<Uint8Array<ArrayBuffer>> {
  if (d.partes === 0) return Uint8Array.from(atob(d.conteudo), (c) => c.charCodeAt(0));
  const linhas = await getDb()
    .select({ dados: documentoPartes.dados })
    .from(documentoPartes)
    .where(eq(documentoPartes.documentoId, d.id))
    .orderBy(asc(documentoPartes.ordem));
  return new Uint8Array(Buffer.concat(linhas.map((l) => l.dados)));
}

/** Um documento que fica NO DRIVE: só o link + os dados lidos agora (o PDF é buscado no Google a cada abertura). */
export async function criarDocumentoLink(dados: { nome: string; url: string; tamanho: number; paginas: number; criadoPor: number }): Promise<number> {
  const [r] = await getDb()
    .insert(documentos)
    .values({
      nome: dados.nome,
      nomeArquivo: `${dados.nome}.pdf`,
      tamanho: dados.tamanho,
      tamanhoOriginal: dados.tamanho,
      paginas: dados.paginas,
      compactado: false,
      conteudo: "",
      partes: 0,
      completo: true,
      urlExterna: dados.url,
      criadoPor: dados.criadoPor,
    })
    .returning({ id: documentos.id });
  return r.id;
}

export async function renomearDocumento(id: number, nome: string) {
  await getDb().update(documentos).set({ nome }).where(eq(documentos.id, id));
}

export async function excluirDocumento(id: number) {
  await getDb().delete(documentos).where(eq(documentos.id, id));
}
