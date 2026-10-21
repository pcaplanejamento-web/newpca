/**
 * UNIÃO do PCA de lista pronta com os PROTOCOLOS incorporados a ele (puro, testado). O PCA de lista tem as DUAS bases — as
 * planilhas (importação) e a Mesa do PCA (protocolos) —, e o Dashboard/Orçamento somam as duas SEM contar o mesmo processo
 * duas vezes: **o protocolo vence** (é o lido do PDF assinado, conferido e auditado). Todo item de planilha cujo ID
 * PROTOCOLO é o "Id:" de um protocolo INCORPORADO a este PCA sai da soma (o processo inteiro vem do protocolo); os demais
 * ficam. Nada é gravado — a união é só na leitura, e nenhum item de protocolo é alterado.
 */

/** Só os dígitos do Id do protocolo (o "Id:" da capa) — a chave da união. */
export function chaveProtocoloExterno(v: string | number | null | undefined): string | null {
  const d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d || null;
}

export type ResultadoUniao<P, R> = {
  /** As linhas da planilha que FICAM (sem protocolo incorporado). */
  planilha: P[];
  /** As linhas dos protocolos (todas — nunca alteradas). */
  protocolo: R[];
  /** Quantas linhas da planilha o protocolo substituiu. */
  substituidos: number;
  /** Os Ids (dígitos) dos protocolos que substituíram linhas da planilha. */
  protocolosCasados: Set<string>;
};

/**
 * Une as linhas da planilha às dos protocolos incorporados. `idExternoDoItem` dá o Id do protocolo de cada linha da planilha;
 * `incorporados` = os Ids dos protocolos INCORPORADOS a este PCA.
 */
export function unirPlanilhaEProtocolos<P, R>(
  planilha: readonly P[],
  protocolo: readonly R[],
  idExternoDoItem: (p: P) => string | number | null | undefined,
  incorporados: Iterable<string | number | null | undefined>,
): ResultadoUniao<P, R> {
  const ids = new Set<string>();
  for (const i of incorporados) {
    const k = chaveProtocoloExterno(i);
    if (k) ids.add(k);
  }
  const ficam: P[] = [];
  const casados = new Set<string>();
  let substituidos = 0;
  for (const p of planilha) {
    const k = chaveProtocoloExterno(idExternoDoItem(p));
    if (k && ids.has(k)) {
      substituidos += 1;
      casados.add(k);
    } else ficam.push(p);
  }
  return { planilha: ficam, protocolo: [...protocolo], substituidos, protocolosCasados: casados };
}
