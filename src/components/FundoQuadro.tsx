"use client";

import { useEffect, useState } from "react";
import { fundoUrlValida, urlFundoCss } from "@/lib/imagem-fundo-core";
import { chamarPadronizacao as chamar } from "@/lib/padronizacao-cliente";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { TextField } from "./Field";
import { IconImage, IconTrash } from "./icons";
import { toast } from "./Toast";

/** A imagem carregou? (`null` = ainda carregando; sem link = `false`). A moldura do quadro só a mostra depois. */
export function useImagemCarrega(url: string | null): boolean | null {
  const [ok, setOk] = useState<boolean | null>(url ? null : false);
  useEffect(() => {
    if (!url) return setOk(false);
    setOk(null);
    let vivo = true;
    const img = new Image();
    img.onload = () => vivo && setOk(true);
    img.onerror = () => vivo && setOk(false);
    img.referrerPolicy = "no-referrer";
    img.src = url;
    return () => {
      vivo = false;
    };
  }, [url]);
  return ok;
}

/**
 * IMAGEM DE FUNDO do quadro por LINK (Configuração; editores): cola-se o link de uma imagem OU de um pin do Pinterest — o
 * servidor tira a imagem da página. Nada é enviado nem guardado além do link: a imagem fica no site de origem (economiza
 * armazenamento). Prévia 16:9, Remover e o aviso quando o site não deixa a imagem aparecer.
 */
export function FundoQuadro({ quadroId, fundoUrl, podeEditar, onMudou }: { quadroId: number; fundoUrl: string | null; podeEditar: boolean; onMudou: () => void }) {
  const [link, setLink] = useState("");
  const [gravando, setGravando] = useState(false);
  const carrega = useImagemCarrega(fundoUrl);
  const valido = !!fundoUrlValida(link);

  const gravar = async (valor: string | null) => {
    if (gravando) return;
    setGravando(true);
    try {
      await chamar(`/api/tarefas/quadros/${quadroId}`, "PATCH", { fundoUrl: valor });
      toast.success(valor ? "Imagem de fundo aplicada." : "Imagem de fundo removida.");
      setLink("");
      onMudou();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="space-y-3">
      {fundoUrl ? (
        <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-card border border-border bg-surface-2">
          {carrega && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: urlFundoCss(fundoUrl) }} />}
          {carrega === null && <div className="absolute inset-0 grid place-items-center text-[12.5px] text-muted">Carregando a imagem…</div>}
        </div>
      ) : (
        <p className="text-[13px] text-muted">Sem imagem de fundo.</p>
      )}
      {fundoUrl && carrega === false && <Callout kind="warn">A imagem não carregou — o site de origem pode bloquear o uso em outros sites. Escolha outra.</Callout>}
      {podeEditar && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (valido) gravar(link.trim());
          }}
        >
          <div className="min-w-0 flex-1">
            <TextField
              label={fundoUrl ? "Trocar pelo link" : "Link da imagem ou do pin"}
              placeholder="https://br.pinterest.com/pin/… ou https://i.pinimg.com/…jpg"
              value={link}
              disabled={gravando}
              maxLength={1000}
              inputMode="url"
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={gravando} disabled={!valido} icon={<IconImage className="h-4 w-4" />}>
              Aplicar
            </Button>
            {fundoUrl && (
              <Button variant="ghost" disabled={gravando} icon={<IconTrash className="h-4 w-4" />} onClick={() => gravar(null)}>
                Remover
              </Button>
            )}
          </div>
        </form>
      )}
      <p className="text-[12px] text-muted">A imagem fica no site de origem — nada é enviado ao servidor, só o link é guardado.</p>
    </div>
  );
}
