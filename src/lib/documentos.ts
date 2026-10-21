import { desc, eq } from "drizzle-orm";
import { documentos, usuarios } from "@/db/schema";
import { getDb } from "./db";

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
};

export async function listarDocumentos(): Promise<DocumentoResumo[]> {
  return getDb()
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
    })
    .from(documentos)
    .leftJoin(usuarios, eq(usuarios.id, documentos.criadoPor))
    .orderBy(desc(documentos.id));
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
  conteudo: string;
  criadoPor: number;
}): Promise<number> {
  const [r] = await getDb().insert(documentos).values(dados).returning({ id: documentos.id });
  return r.id;
}

export async function renomearDocumento(id: number, nome: string) {
  await getDb().update(documentos).set({ nome }).where(eq(documentos.id, id));
}

export async function excluirDocumento(id: number) {
  await getDb().delete(documentos).where(eq(documentos.id, id));
}
