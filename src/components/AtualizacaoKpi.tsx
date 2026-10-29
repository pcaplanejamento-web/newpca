"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { haQuanto } from "@/lib/acessos-core";
import { NOME_IMPORTACAO, type TipoImportacao } from "@/lib/empenho-cards-core";
import { dataHoraBR } from "@/lib/format";
import { consultarUltimaImportacao } from "@/lib/importacoes-ao-vivo-store";
import { BotaoAtualizar } from "./BotaoAtualizar";
import { useConfirmacao } from "./Confirmacao";
import { IconClock } from "./icons";
import { useImportacoesLocais } from "./ImportacoesAoVivo";
import { toast } from "./Toast";

/**
 * A ATUALIZAÇÃO NO CANTO DAS KPIs — o MESMO par em toda tela de dados importados (Execução: empenhos, liquidações,
 * pagamentos; Frotas: a Vólus): há quanto tempo os dados foram atualizados (`AtualizadoHa`) e, para o ADM, "Importar agora"
 * (`ImportarAgora`), postos no `KpiStat` por `canto`/`acaoCanto`.
 */

/** O que a tela sabe da importação de um tipo: a última concluída, quantas lendo agora e o intervalo mínimo. */
export type MetaImportacao = {
  tipo: TipoImportacao;
  /** Quantos cards o tipo tem (Centi); 0 = nada a importar (o canto some). Ausente = não se aplica (a Frota). */
  cards?: number;
  atualizado: string | null;
  lendo: number;
  /** O INTERVALO MÍNIMO entre atualizações: antes de `ate`, o botão fica travado com o texto. */
  intervalo?: { ate: string; texto: string } | null;
};

type Confirmar = ReturnType<typeof useConfirmacao>["confirmar"];

/**
 * IMPORTAR AGORA (só o ADM), no canto do indicador: o andamento aparece no painel do canto inferior direito e segue ao sair
 * da tela. Travado com uma importação do MESMO tipo lendo (no servidor ou nesta aba) ou dentro do intervalo mínimo — o
 * toque mostra o motivo. `executar` confirma, importa e avisa o desfecho; no fim, a página é relida.
 */
export function ImportarAgora({ meta, executar }: { meta?: MetaImportacao; executar: (confirmar: Confirmar) => Promise<void> }) {
  const router = useRouter();
  const { confirmar, confirmacao } = useConfirmacao();
  const locais = useImportacoesLocais();
  const [rodando, setRodando] = useState(false);
  // O fim do intervalo mínimo destrava o botão sozinho (sem esperar a tela recarregar).
  const [, setFimIntervalo] = useState(0);
  const ateIntervalo = meta?.intervalo ? Date.parse(meta.intervalo.ate) : 0;
  useEffect(() => {
    const falta = ateIntervalo - Date.now();
    if (!(falta > 0)) return;
    const t = setTimeout(() => setFimIntervalo(Date.now()), falta + 500);
    return () => clearTimeout(t);
  }, [ateIntervalo]);
  if (!meta || meta.cards === 0) return null;
  const tipo = meta.tipo;
  const nome = NOME_IMPORTACAO[tipo].titulo;
  const lendo = meta.lendo > 0 || locais.some((i) => i.estado === "rodando" && i.tipo === tipo);
  const intervalo = meta.intervalo && ateIntervalo > Date.now() ? meta.intervalo.texto : null;
  const aviso = lendo ? `Há uma importação de ${nome.toLowerCase()} em andamento — o andamento está no canto inferior direito.` : (intervalo ?? undefined);
  async function importar() {
    if (rodando) return;
    setRodando(true);
    try {
      await executar(confirmar);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setRodando(false);
    }
  }
  return (
    <>
      <BotaoAtualizar
        discreto
        ativo={rodando}
        aviso={aviso}
        rotulo={`Importar agora os dados atualizados de ${nome.toLowerCase()}`}
        dica={`Importar agora: ${nome.toLowerCase()}`}
        detalhe={`Importando ${nome.toLowerCase()} — veja o andamento no canto inferior direito`}
        onClick={() => void importar()}
      />
      {confirmacao}
    </>
  );
}

/**
 * DISCRETO, no canto do indicador: há quanto tempo o tipo foi atualizado (a última importação concluída); com uma
 * importação lendo agora, o ponto que pulsa. O relógio anda a cada 30 s. O ADM toca e a ÚLTIMA importação abre no painel do
 * canto inferior direito.
 */
export function AtualizadoHa({ meta, admin }: { meta?: MetaImportacao; admin: boolean }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!meta || meta.cards === 0) return null;
  const lendo = meta.lendo > 0;
  const quando = meta.atualizado ? haQuanto(meta.atualizado, agora) : "sem importação";
  const dica = `${meta.atualizado ? `Última importação concluída: ${dataHoraBR(meta.atualizado)}` : "Nenhuma importação concluída"}${lendo ? " · importando agora" : ""}`;
  const conteudo = (
    <>
      {lendo ? <span aria-hidden className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent motion-reduce:animate-none" /> : <IconClock aria-hidden className="h-3 w-3" />}
      <span className="sr-only">Atualizado </span>
      {quando}
    </>
  );
  const classe = "inline-flex items-center gap-1 text-[11px] leading-none text-faint tabular-nums";
  if (admin)
    return (
      <button
        type="button"
        onClick={() => consultarUltimaImportacao(meta.tipo)}
        title={`${dica} — ver a última importação`}
        className={`${classe} relative h-7 rounded-control px-1 transition-colors after:absolute after:-inset-2 hover:bg-surface-2 hover:text-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:h-6 lg:after:hidden pointer-coarse:after:block`}
      >
        {conteudo}
        <span className="sr-only"> — ver a última importação</span>
      </button>
    );
  return (
    <span className={classe} title={dica}>
      {conteudo}
    </span>
  );
}
