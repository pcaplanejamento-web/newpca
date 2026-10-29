import { PermissaoExportar } from "@/components/ExportarTabelas";
import { VeiculosView } from "@/components/frota/VeiculosView";
import { acessoPagina } from "@/lib/acesso-pagina";
import { chaveEscopoEmpenhos } from "@/lib/empenhos-tela-core";
import { dadosDaPaginaFrota } from "@/lib/frota";

export const dynamic = "force-dynamic";

// VEÍCULOS — o cadastro da frota (as placas entram pelas transações da Vólus), no escopo da pessoa.
export default async function Pagina() {
  const r = await acessoPagina("veiculos");
  if (r.bloqueio) return r.bloqueio;
  const d = await dadosDaPaginaFrota();
  return (
    <PermissaoExportar permitido={r.pode.exportar}>
      <VeiculosView
        key={chaveEscopoEmpenhos(d.escopo)}
        anoInicial={d.anos[0] ?? null}
        versao={d.versao}
        contratos={d.contratos}
        alertas={d.alertas}
        pode={{ manipular: r.pode.manipular, importar: r.pode.importar, configurar: r.pode.configurar, exportar: r.pode.exportar }}
      />
    </PermissaoExportar>
  );
}
