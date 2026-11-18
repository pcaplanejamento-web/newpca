// O REGISTRO DAS SEÇÕES 8–10 DO DFD na Centi (núcleo PURO, testado): equipe, secretário demandante e autorização vêm do
// registro `IdPlanejamentoAssinaturaDFD` do PRÓPRIO planejamento. A tela da Centi o lê do planejamento aberto
// (`restauth/load?entity=101045&key=<planejamento>` → `Entity.Fields["IdPlanejamentoAssinaturaDFD"]` = a referência
// {Fields: [{Key: "Id", Value: 114}, Display, Object]}) e o manda no "Processar" do Emitir DFD — a janela NÃO pede escolha.
// A automação faz IGUAL: lê esse campo do load do planejamento, sem dedução. Sem ele, o DFD não é emitido (nunca um id
// fixo nem vazio: o mesmo id em todos trazia as seções 8–10 de um só registro; o vazio, as seções 8 e 10 em branco).

/** As falhas que PARAM a execução inteira (as demais seriam iguais). */
export const PARA_TUDO = /interrompido|lote foi encerrado|recusou o Emitir DFD/i;

/** O campo do planejamento (e o parâmetro da emissão) com o registro das seções 8–10. */
export const CAMPO_ASSINATURA_DFD = "IdPlanejamentoAssinaturaDFD";

type Campo = { Key?: unknown; Value?: unknown };
const campos = (o: unknown): Campo[] => (o && typeof o === "object" && Array.isArray((o as { Fields?: unknown }).Fields) ? (o as { Fields: Campo[] }).Fields : []);
const idTexto = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? String(v) : typeof v === "string" && /^\d{1,12}$/.test(v.trim()) && Number(v) > 0 ? v.trim().replace(/^0+(?=\d)/, "") : null);

/** O id do registro das seções 8–10 no load do planejamento: o campo `IdPlanejamentoAssinaturaDFD` da `Entity` (a
 * referência {Fields: [{Key: "Id"}]} ou o próprio número). Sem ele, o erro — o DFD não é emitido. */
export function assinaturaDoLoad(j: unknown, plan: string): { id: string } | { erro: string } {
  const entidade = j && typeof j === "object" ? (j as { Entity?: unknown }).Entity : undefined;
  const v = campos(entidade).find((f) => f?.Key === CAMPO_ASSINATURA_DFD)?.Value;
  const id = idTexto(v) ?? idTexto(campos(v).find((f) => f?.Key === "Id")?.Value);
  if (id) return { id };
  return {
    erro: `A Centi não trouxe, no planejamento ${plan}, o registro das seções 8 a 10 do DFD (equipe, secretário demandante, autorização — campo ${CAMPO_ASSINATURA_DFD}) — o DFD é emitido sem elas e a conferência não as compara (Convergente*).`,
  };
}
