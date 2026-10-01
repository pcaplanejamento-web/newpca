"use client";

import { FalhaNaTela, useFalhaNaTela } from "@/components/FalhaNaTela";

// Fronteira de erro do PAINEL: a falha de uma tela fica DENTRO do painel (o menu e o cabeçalho continuam). Diz o que
// aconteceu, informa o servidor (Logs do Worker) e tenta sozinha uma vez — `useFalhaNaTela`.
export default function FalhaNoPainel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <FalhaNaTela {...useFalhaNaTela(error, reset)} />;
}
