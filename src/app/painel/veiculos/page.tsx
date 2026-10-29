import { PermissaoExportar } from "@/components/ExportarTabelas";
import { VeiculosView } from "@/components/frota/VeiculosView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";
import { carregarEdicoes } from "@/lib/edicoes-tabela";
import { dadosDaPaginaFrota } from "@/lib/frota";

export const dynamic = "force-dynamic";

// VEÍCULOS — o cadastro da frota (as placas entram pelas transações da Vólus), no escopo da pessoa.
export default async function Pagina() {
  const r = await acessoPagina("veiculos");
  if (r.bloqueio) return r.bloqueio;
  const [d, edicoes] = await Promise.all([dadosDaPaginaFrota(), carregarEdicoes(r.acesso.u.id, "frotas:")]);
  return (
    <PermissaoExportar permitido={r.pode.exportar}>
      <VeiculosView
        key={chaveEscopoEmpenhos(d.escopo)}
        anoInicial={d.anos[0] ?? null}
        versao={d.versao}
        contratos={d.contratos}
        alertas={d.alertas}
        edicoes={edicoes}
        podePublicar={r.pode.configurar}
        importacao={{ meta: d.meta, admin: r.acesso.u.admin, ativos: r.acesso.u.admin ? d.ativos : [] }}
        pode={{ manipular: r.pode.manipular, importar: r.pode.importar, configurar: r.pode.configurar, exportar: r.pode.exportar }}
      />
    </PermissaoExportar>
  );
}
