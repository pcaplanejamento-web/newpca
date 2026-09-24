import { Button } from "@/components/Button";
import { IconInbox } from "@/components/icons";
import { ConsultaPca } from "@/components/ConsultaPca";
import { PainelPca } from "@/components/PainelPca";
import { PcaSeletor } from "@/components/PcaSeletor";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UnitFilter } from "@/components/UnitFilter";
import { getAparencia } from "@/lib/aparencia";
import { num } from "@/lib/format";
import { dashboardDoPca, getPcaEspaco, listarPcasPublicados } from "@/lib/pca-espaco";
import type { Aparencia } from "@/lib/theme";

export const dynamic = "force-dynamic";

/** Cabeçalho público — nome/subtítulo/favicon definidos pelo ADM (fallback padrão). */
function Topo({ identidade }: { identidade?: Aparencia["identidade"] }) {
  const nome = identidade?.nome?.trim() || "Plataforma PCA";
  const subtitulo = identidade?.subtitulo?.trim() || "Prefeitura de Rio Verde · GO";
  const favicon = identidade?.favicon?.trim();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur-md">
      <div className="flex h-[var(--h-header)] items-center gap-3 px-[var(--pad-canvas)]">
        <div className="flex items-center gap-2.5">
          {favicon ? (
            // biome-ignore lint/performance/noImgElement: favicon é data-URL base64 definida pelo ADM; next/image não otimiza data-URL.
            <img src={favicon} alt="" className="h-9 w-9 shrink-0 rounded-[10px] object-cover" />
          ) : (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-text text-[13px] font-black text-surface">
              RV
            </div>
          )}
          <div className="leading-tight">
            <div className="text-[14px] font-semibold text-text">{nome}</div>
            <div className="text-[11px] text-muted">{subtitulo}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button href="/login">Entrar</Button>
        </div>
      </div>
    </header>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ unidade?: string; pca?: string }>;
}) {
  const sp = await searchParams;
  const [publicados, aparencia] = await Promise.all([listarPcasPublicados(), getAparencia()]);
  const identidade = aparencia.identidade;

  // PCA escolhido no dropdown (só os PUBLICADOS); padrão = o ativo, senão o mais recente.
  const pedido = sp.pca ? Number.parseInt(sp.pca, 10) : Number.NaN;
  const escolhido = publicados.find((p) => p.id === pedido) ?? publicados[0];
  const pca = escolhido ? await getPcaEspaco(escolhido.id) : null;
  const unidadePedida = sp.unidade ? Number.parseInt(sp.unidade, 10) : Number.NaN;
  // O MESMO Dashboard do painel (tudo o que foi incorporado).
  const dados = pca ? await dashboardDoPca(pca, Number.isFinite(unidadePedida) ? unidadePedida : undefined) : null;

  if (!pca || !dados || dados.resumo.count === 0) {
    return (
      <div className="min-h-dvh bg-bg text-text">
        <Topo identidade={identidade} />
        <main className="p-[var(--pad-canvas)]">
          {publicados.length > 1 && pca && (
            <div className="mb-[var(--gap-block)] flex justify-end">
              <div className="w-full sm:w-72">
                <PcaSeletor pcas={publicados} current={pca.id} />
              </div>
            </div>
          )}
          <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-card border border-dashed border-border-2 bg-surface px-6 py-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-card bg-surface-2 text-faint">
              <IconInbox className="h-8 w-8" />
            </div>
            <p className="mt-5 text-base font-bold text-text">Dados do PCA em breve</p>
            <p className="mt-2 text-sm text-muted">
              A equipe ainda não publicou {pca ? `os dados do ${pca.nome}` : "o Plano de Contratações Anual"}.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg text-text">
      <Topo identidade={identidade} />
      <main className="space-y-[var(--gap-block)] p-[var(--pad-canvas)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold text-text">{pca.nome}</h1>
          <div className="flex flex-col gap-2 sm:flex-row">
            {publicados.length > 1 && (
              <div className="w-full sm:w-64">
                <PcaSeletor pcas={publicados} current={pca.id} />
              </div>
            )}
            {dados.unidades.length > 1 && (
              <div className="w-full sm:w-80">
                <UnitFilter unidades={dados.unidades} current={dados.unidadeId} />
              </div>
            )}
          </div>
        </div>
        <PainelPca
          dados={dados}
          unidadeFiltrada={dados.unidadeId != null}
          hintItens={pca.fonte === "protocolo" ? `${num(dados.protocolos)} protocolo(s) · ${num(dados.dfds)} DFDs` : undefined}
          consulta={
            // A MESMA consulta do painel (Protocolos · DFDs · Itens + banners discretos, dados públicos higienizados).
            pca.fonte === "protocolo" ? (
              <ConsultaPca pcaId={pca.id} protocolos={dados.protocolosLista} dfds={dados.dfdsLista} itens={dados.itens} showUnidade={dados.unidadeId == null} />
            ) : undefined
          }
        />
      </main>
    </div>
  );
}
