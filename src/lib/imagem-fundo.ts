import { baixarSeguro } from "./busca-segura";
import { fundoUrlValida, imagemDaPagina, pareceImagem } from "./imagem-fundo-core";

export const MSG_SEM_IMAGEM = "Esse link não tem uma imagem — no Pinterest, abra o pin, toque na imagem e use “Copiar endereço da imagem”.";

/**
 * O link ESCOLHIDO → o link FINAL da imagem de fundo (só escopo de request): o de imagem vale como está; o de uma página
 * (um pin do Pinterest, `pin.it/…`) é lido pela busca segura e dá a imagem de capa. Lança `Error` com a mensagem.
 */
export async function resolverImagemFundo(bruta: string): Promise<string> {
  const url = fundoUrlValida(bruta);
  if (!url) throw new Error("Link inválido: use um endereço https:// público.");
  if (pareceImagem(url)) return url;
  const r = await baixarSeguro(url, { accept: "text/html, image/*;q=0.9, */*;q=0.1", maxBytes: 1_500_000, quem: "O site" });
  if (r.tipo.startsWith("image/")) return fundoUrlValida(r.url) ?? url;
  const img = imagemDaPagina(r.texto, r.url);
  if (!img) throw new Error(MSG_SEM_IMAGEM);
  return img;
}
