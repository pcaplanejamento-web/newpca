"use client";

import { useState } from "react";
import type { EstadoAparelhos } from "@/lib/aparelhos";
import { AvisoTermoPendente, BannerTermo, type DadosAceiteTermo } from "./AceiteTermo";
import { BannerAparelho } from "./NomearAparelho";

/**
 * As PENDÊNCIAS do acesso no painel (Termo de Uso + aparelhos), em BANNERS FLUTUANTES: o aparelho sem nome vem primeiro
 * (sem fechar); depois o termo vencido (sem fechar); na carência, o aviso no topo abre o banner do aceite.
 */
export function PendenciasAcesso({
  aparelho,
  termo,
  bloqueado,
  nome,
}: {
  aparelho: EstadoAparelhos | null;
  termo: DadosAceiteTermo | null;
  bloqueado: boolean;
  nome: string;
}) {
  const [aberto, setAberto] = useState(false);
  if (aparelho) return <BannerAparelho estado={aparelho} nome={nome} />;
  if (!termo) return null;
  if (bloqueado) return <BannerTermo dados={termo} bloqueado aberto onFechar={() => {}} />;
  return (
    <>
      <AvisoTermoPendente prazo={termo.prazo} onAbrir={() => setAberto(true)} />
      <BannerTermo dados={termo} bloqueado={false} aberto={aberto} onFechar={() => setAberto(false)} />
    </>
  );
}
