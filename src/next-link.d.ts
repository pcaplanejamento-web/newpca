// O `next/link` tipa o Link das páginas antigas; no App Router o build usa o `next/dist/client/app-dir/link`, que aceita
// `unstable_dynamicOnHover` (pede a página COMPLETA ao passar o mouse ou encostar o dedo — o clique reaproveita).
import "next/dist/client/link";

declare module "next/dist/client/link" {
  interface LinkProps {
    unstable_dynamicOnHover?: boolean;
  }
}
