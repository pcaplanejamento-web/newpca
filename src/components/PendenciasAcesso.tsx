"use client";

import type { EstadoAparelhos } from "@/lib/aparelhos";
import { BannerTermo, type DadosAceiteTermo } from "./AceiteTermo";
import { BannerAparelho } from "./NomearAparelho";

/**
 * As PENDÊNCIAS do acesso no painel (Termo de Uso + aparelhos), em BANNERS FLUTUANTES e OBRIGATÓRIOS (sem fechar): o
 * aparelho sem nome vem primeiro; depois o termo pendente. O sistema só abre depois dos dois.
 */
export function PendenciasAcesso({ aparelho, termo, nome }: { aparelho: EstadoAparelhos | null; termo: DadosAceiteTermo | null; nome: string }) {
  if (aparelho) return <BannerAparelho estado={aparelho} nome={nome} />;
  return termo ? <BannerTermo dados={termo} /> : null;
}
