"use client";

import { FalhaNaTela, useFalhaNaTela } from "@/components/FalhaNaTela";

// Error boundary global (App Router): captura os erros das páginas fora do painel e os do layout do painel. A MESMA
// tela de falha do painel (`FalhaNaTela`), na página inteira: diz o que aconteceu, informa o servidor e tenta sozinha uma
// vez. Renderiza dentro do layout raiz (tema/fonte já aplicados).
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <FalhaNaTela {...useFalhaNaTela(error, reset)} cheia inicio />;
}
