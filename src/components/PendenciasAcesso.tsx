"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EstadoAparelhos } from "@/lib/aparelhos";
import { BannerTermo, type DadosAceiteTermo } from "./AceiteTermo";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { IconRefresh } from "./icons";
import { Modal } from "./Modal";
import { BannerAparelho, BotaoSairAcesso } from "./NomearAparelho";

/**
 * A FALHA ao carregar uma pendência do acesso (o banner obrigatório não pôde ser montado): nunca uma tela em branco —
 * "Tentar de novo" pede o painel outra vez; "Sair" volta ao login.
 */
export function FalhaAcesso() {
  const router = useRouter();
  const [tentando, tentar] = useTransition();
  return (
    <Modal
      open
      onClose={() => {}}
      bloqueado
      size="md"
      titulo="Não foi possível concluir a entrada"
      rodape={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BotaoSairAcesso disabled={tentando} />
          <Button size="sm" variant="accent" loading={tentando} icon={<IconRefresh className="h-4 w-4" />} onClick={() => tentar(() => router.refresh())}>
            Tentar de novo
          </Button>
        </div>
      }
    >
      <Callout kind="warn">O sistema não conseguiu carregar a confirmação do aparelho ou o Termo de Uso. Tente de novo em instantes.</Callout>
    </Modal>
  );
}

/**
 * As PENDÊNCIAS do acesso no painel (Termo de Uso + aparelhos), em BANNERS FLUTUANTES e OBRIGATÓRIOS (sem fechar): o
 * aparelho sem nome vem primeiro; depois o termo pendente (já carregado junto — segue sem recarregar). O sistema só abre
 * depois dos dois. Bloqueado sem nada a mostrar (a leitura falhou) = `FalhaAcesso`.
 */
export function PendenciasAcesso({ bloqueio, aparelho, termo, nome }: { bloqueio: boolean; aparelho: EstadoAparelhos | null; termo: DadosAceiteTermo | null; nome: string }) {
  const [aparelhoFeito, setAparelhoFeito] = useState(false);
  if (!bloqueio) return null;
  if (aparelho && !aparelhoFeito) return <BannerAparelho estado={aparelho} nome={nome} onConcluido={termo ? () => setAparelhoFeito(true) : undefined} />;
  if (termo) return <BannerTermo dados={termo} />;
  return <FalhaAcesso />;
}
