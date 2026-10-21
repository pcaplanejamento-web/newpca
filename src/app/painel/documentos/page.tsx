import { DocumentosView } from "@/components/DocumentosView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { listarDocumentos } from "@/lib/documentos";

export const dynamic = "force-dynamic";

// DOCUMENTOS: os PDFs guardados no sistema (até 100 KB cada). A lista sem o conteúdo — o PDF só é lido ao ver/baixar.
export default async function DocumentosPage() {
  const r = await acessoPagina("documentos");
  if (r.bloqueio) return r.bloqueio;
  return <DocumentosView documentos={await listarDocumentos()} pode={r.pode} admin={r.acesso.u.admin} />;
}
