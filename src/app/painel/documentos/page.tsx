import { DocumentosView } from "@/components/DocumentosView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { listarDocumentos } from "@/lib/documentos";
import { pcasDosDocumentos } from "@/lib/documentos-pagina";

export const dynamic = "force-dynamic";

// DOCUMENTOS: os PDFs guardados no sistema. A lista sem o conteúdo — o PDF só é lido ao ver/baixar. O grupo ativo decide
// os PCAs (o documento só de PCAs de fora do grupo some).
export default async function DocumentosPage() {
  const r = await acessoPagina("documentos");
  if (r.bloqueio) return r.bloqueio;
  const { permitidos, pcas, podeTodosPcas } = await pcasDosDocumentos(r.acesso);
  return <DocumentosView documentos={await listarDocumentos(permitidos)} pode={r.pode} admin={r.acesso.u.admin} pcas={pcas} podeTodosPcas={podeTodosPcas} />;
}
