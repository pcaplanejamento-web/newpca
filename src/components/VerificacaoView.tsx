"use client";

import { type ComponentProps, useState } from "react";
import { Ajuda } from "./Ajuda";
import { DfdUploadForm } from "./DfdUploadForm";
import { Dropzone } from "./Dropzone";
import { IconClipboard, IconFile, IconVerificacao } from "./icons";
import { ProtocoloUploadForm } from "./ProtocoloUploadForm";

type PropsProtocolo = ComponentProps<typeof ProtocoloUploadForm>;
type Arquivo = { file: File; n: number } | null;

/**
 * VERIFICAÇÃO — soltar um PROTOCOLO (.pdf) ou um DFD (.pdf/.xlsx) e ver TODOS os erros, sem gravar nada: a MESMA análise
 * da importação da Mesa (`ProtocoloUploadForm`/`DfdUploadForm` no modo `verificacao` — sem Protocolar/Importar e sem
 * comparar com o que já está cadastrado), com as pendências e o relatório (Despacho · WhatsApp · Lista · PDF) do
 * `PainelPendencias`. As regras do ADM (Avaliação) valem como na Mesa.
 */
export function VerificacaoView({
  reparticoes,
  pcas,
  regras,
  orgaos,
}: Pick<PropsProtocolo, "reparticoes" | "pcas" | "regras" | "orgaos">) {
  const [protocolo, setProtocolo] = useState<Arquivo>(null);
  const [dfd, setDfd] = useState<Arquivo>(null);
  const comum = { reparticoes, pcas, regras, orgaos };
  return (
    <div className="space-y-[var(--gap-block)]">
      <div className="linha-topico flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text">
          <IconVerificacao className="h-5 w-5 text-accent" />
          Verificação
        </h1>
        <Ajuda titulo="Verificação">
          <p>Solte um protocolo ou um DFD para ver todos os erros e atenções, como na importação da Mesa.</p>
          <p>Nada é gravado: a tela serve só para consulta. O arquivo é analisado como veio, sem comparar com o que já está cadastrado.</p>
          <p>
            No rodapé do banner, o indicador de pendências abre a lista completa: tocar numa pendência leva ao lugar dela, e
            "Copiar / PDF" monta o relatório (despacho, WhatsApp, lista ou PDF).
          </p>
        </Ajuda>
      </div>
      <div className="grid gap-[var(--gap-block)] sm:grid-cols-2">
        <Dropzone
          accept=".pdf"
          onFile={(file) => setProtocolo((a) => ({ file, n: (a?.n ?? 0) + 1 }))}
          titulo="Verificar protocolo (.pdf)"
          icon={<IconClipboard className="h-7 w-7" />}
          dica="Capa, cada DFD e os itens são conferidos pelas regras do sistema."
        />
        <Dropzone
          accept=".xlsx,.xls,.pdf"
          onFile={(file) => setDfd((a) => ({ file, n: (a?.n ?? 0) + 1 }))}
          titulo="Verificar DFD (.pdf ou .xlsx)"
          icon={<IconFile className="h-7 w-7" />}
          dica="Um DFD avulso: seções, itens, assinatura e catálogo."
        />
      </div>
      <ProtocoloUploadForm {...comum} verificacao arquivo={protocolo} />
      <DfdUploadForm {...comum} verificacao arquivoHost={dfd} />
    </div>
  );
}
