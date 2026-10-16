import { PermissaoExportar } from "@/components/ExportarTabelas";
import { VerificacaoView } from "@/components/VerificacaoView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { contextoBanners } from "@/lib/mesa-dados";

export const dynamic = "force-dynamic";

// VERIFICAÇÃO: conferir um protocolo ou DFD sem gravar nada. Tela própria do grupo (as regras e unidades da Mesa); o
// relatório em PDF, a ação Exportar na Verificação.
export default async function VerificacaoPage() {
  const r = await acessoPagina("verificacao");
  if (r.bloqueio) return r.bloqueio;
  const c = await contextoBanners(r.acesso.u);
  return (
    <PermissaoExportar permitido={r.pode.exportar}>
      <VerificacaoView reparticoes={c.reparticoes} pcas={c.pcas} regras={c.regras} orgaos={c.orgaos} />
    </PermissaoExportar>
  );
}
