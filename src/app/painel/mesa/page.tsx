import { DfdsView } from "@/components/DfdsView";
import { MesaPca } from "@/components/MesaPca";
import { SeletorMesa } from "@/components/SeletorMesa";
import { acessoPagina } from "@/lib/acesso-pagina";
import type { PcaResumo } from "@/lib/dfd";
import { carregarMesa, carregarMesaDoPca } from "@/lib/mesa-dados";
import { getPcaEspaco } from "@/lib/pca-espaco";
import { lerVinculo } from "@/lib/tarefas-core";

export const dynamic = "force-dynamic";

// Tela "Mesa" (ex-"DFD"): mesa de trabalho única — Protocolos, DFDs e Itens vistos e abertos
// pelos mesmos banners padrão. Rota /painel/mesa (a antiga /painel/dfds redireciona). O carregamento
// é o MESMO da aba Mesa do PCA (`carregarMesa`). `?pca=<id>` mostra a MESA DAQUELE PCA (o seletor da barra — as mesas
// seguem independentes). `?abrir=protocolo:<id>|dfd:<id>` abre o banner direto (o link do vínculo de uma tarefa); o
// acesso é conferido pela rota do banner, como no clique.

/** As opções do seletor de Mesa: os PCAs de fonte Protocolos (os únicos com Mesa). */
const opcoesMesa = (pcas: PcaResumo[]) => pcas.filter((p) => p.fonte === "protocolo").map((p) => ({ id: p.id, nome: p.nome, ano: p.ano }));

export default async function MesaPage({ searchParams }: { searchParams: Promise<{ abrir?: string; pca?: string }> }) {
  const sp = await searchParams;
  // `?pca=<id>` = a MESA DAQUELE PCA (a mesma da aba do espaço), escolhida no seletor da barra; PCA inexistente ou de
  // lista = a Mesa do sistema. Cada uma com o seu portão: a Mesa do PCA exige VISUALIZAR o PCA; a do sistema, a Mesa.
  const idPca = Number(sp.pca);
  const pca = Number.isInteger(idPca) && idPca > 0 ? await getPcaEspaco(idPca) : null;
  if (pca && pca.fonte === "protocolo") {
    const rp = await acessoPagina("pca");
    if (rp.bloqueio) return rp.bloqueio;
    const mp = await carregarMesaDoPca(rp.acesso.u, pca);
    return (
      <MesaPca key={pca.id} {...mp} seletorMesa={<SeletorMesa pcas={opcoesMesa(mp.pcas)} atual={pca.id} sistema={mp.pode.sistema.visualizar} />} />
    );
  }
  const r = await acessoPagina("dfd");
  if (r.bloqueio) return r.bloqueio;
  const m = await carregarMesa(r.acesso.u);
  const alvo = lerVinculo(sp.abrir);
  const abrirInicial = alvo?.tipo === "protocolo" || alvo?.tipo === "dfd" ? { tipo: alvo.tipo, id: alvo.id } : null;
  return (
    <DfdsView
      key="sistema"
      // As Mesas dos PCAs só para quem visualiza o PCA (senão a opção levaria a "Acesso restrito").
      seletorMesa={<SeletorMesa pcas={m.pode.pca.visualizar ? opcoesMesa(m.pcas) : []} atual={null} />}
      pode={m.pode}
      dfds={m.dfds}
      protocolos={m.protocolos}
      reparticoes={m.reparticoes}
      reparticaoAtivaId={m.reparticaoAtivaId}
      pcas={m.pcas}
      regras={m.regras}
      orgaos={m.orgaos}
      pessoas={m.pessoas}
      outrasPessoas={m.outrasPessoas}
      situacoes={m.situacoes}
      usuarioId={m.usuarioId}
      filtroInicial={m.filtroInicial}
      pcaFiltro={m.pcaFiltro}
      edicoes={m.edicoes}
      abrirInicial={abrirInicial}
      dadosCompletos={m.dadosCompletos}
    />
  );
}
