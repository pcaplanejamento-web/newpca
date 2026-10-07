import { escopoMesa, protocoloNasLinhas } from "@/lib/acesso-mesa";
import { exigirAcesso, recusa } from "@/lib/api-auth";
import { detalheSeguro, registrarAuditoria } from "@/lib/auditoria";
import { avisarProtocoloAtualizado } from "@/lib/avisos-mesa";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { assuntoCadastrado, classificarAssunto, comportamentoNo, protocolarHabilitado } from "@/lib/avaliacao-core";
import { startProtocoloSchema } from "@/lib/dfd-validation";
import { getGrupoAtivoId } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { padraoAoProtocolar } from "@/lib/mesa-visao-core";
import { identidadeReenvio } from "@/lib/comparar-protocolo";
import { telaDoRecurso } from "@/lib/papeis-core";
import { detalheEdicaoProtocolo, getProtocolo, getProtocoloPorNumero, iniciarProtocolo, protocolosDeMesmoId } from "@/lib/protocolo";
import { pcaDeProtocolos } from "@/lib/trava-pca";
import { responsavelPadraoDe } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/**
 * `start-protocolo`: cria só o protocolo (capa) e devolve `protocoloId`. Os DFDs
 * são enviados DEPOIS, em streaming, DFD a DFD (`POST /api/dfd` com o `protocoloId`)
 * — para escalar a milhares de DFDs sem estourar CPU/memória/subrequests do Worker.
 */
export async function POST(req: Request) {
  const a = await exigirAcesso(["dfd", "pca"], "importar");
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(startProtocoloSchema, req);
  if ("resp" in p) return p.resp;
  const { reenvio } = p.data;
  let protocolo = p.data.protocolo;

  // Regra CONFIGURÁVEL (por categoria do assunto): se `protocolo.anoPca` for
  // fundamental, não protocola sem o PCA definido (o ano é herdado pelos DFDs).
  const regras = await getRegrasAvaliacao();
  const categoria = classificarAssunto(protocolo.assunto);
  if (protocolo.anoPca == null && comportamentoNo(regras, "protocolo.anoPca", { categoria }) === "bloqueia")
    return erro("Defina o PCA do protocolo antes de protocolar.", 422);
  // Trava de protocolação do ADM (Configurações → Protocolação): botão desligado OU assunto não
  // cadastrado barra o protocolo INTEIRO. (A trava por TIPO é conferida em cada DFD no POST /api/dfd.)
  if (!protocolarHabilitado(regras)) return erro("A protocolação está desabilitada nas Configurações.", 422);
  if (regras.gate?.exigirAssunto && !assuntoCadastrado(protocolo.assunto, regras))
    return erro("Assunto do protocolo não cadastrado nas Configurações (Protocolação).", 422);

  const esc = await escopoMesa();
  if (!esc) return erro("Faça login.", 401);
  const { acessivel } = esc;
  if (protocolo.reparticaoId != null && !acessivel(protocolo.reparticaoId)) {
    return erro("Unidade do protocolo inválida ou sem acesso.", 403);
  }
  // REENVIO: só sobrescreve o MESMO protocolo (nº e Id) e com acesso à unidade dele.
  let gravado: Awaited<ReturnType<typeof getProtocolo>> = null;
  if (reenvio) {
    gravado = await getProtocolo(reenvio.protocoloId);
    if (!gravado) return erro("Protocolo a sobrescrever não encontrado.", 404);
    if (!acessivel(gravado.reparticaoId) || !protocoloNasLinhas(esc, gravado.id)) return erro("Sem acesso a este protocolo.", 403);
    const motivo = identidadeReenvio(gravado, { numero: protocolo.numero, idExterno: protocolo.idExterno ?? null });
    if (motivo) return erro(motivo, 422);
    // Sobrescreve o MESMO registro: o nº exatamente como gravado (a identidade ignora espaços) e o Id
    // gravado quando o PDF não traz (nunca apaga o Id).
    protocolo = { ...protocolo, numero: gravado.numero, idExterno: protocolo.idExterno || gravado.idExterno };
  }
  // Anti-sequestro por Nº: protocolar SOBRESCREVE a capa do protocolo de MESMO número — nunca a de um
  // protocolo de unidade INACESSÍVEL (não reescreve/move o processo de outra unidade).
  const mesmoNumero = await getProtocoloPorNumero(protocolo.numero);
  if (mesmoNumero && !acessivel(mesmoNumero.reparticaoId)) {
    return erro("Já existe um protocolo com esse número em outra unidade, sem acesso.", 403);
  }
  // … nem o de um protocolo FORA das linhas da pessoa ("só os meus": nem Responsável nem quem protocolou).
  if (mesmoNumero && !protocoloNasLinhas(esc, mesmoNumero.id)) {
    return erro("Já existe um protocolo com esse número — fale com o Responsável por ele.", 403);
  }
  // O PAPEL importa na Mesa em que o protocolo FICA: o reenviado (ou o de mesmo nº, cuja capa é sobrescrita) segue onde
  // está — num PCA, a Mesa do PCA; o protocolo novo entra na Mesa do sistema.
  const negado = recusa(a.acesso, telaDoRecurso((gravado ?? mesmoNumero)?.pcaId), "importar");
  if (negado) return negado;
  // Anti-sequestro por Id: protocolar sobrescreve o protocolo de MESMO `idExterno` — mas não se ele estiver numa unidade
  // INACESSÍVEL ou fora das linhas da pessoa (não deixa sequestrar/apagar via re-import). TODOS os de mesmo Id e nº
  // diferente (o legado pode ter mais de um) — a MESMA lista que o `iniciarProtocolo` funde.
  const mesmosId = protocolo.idExterno ? await protocolosDeMesmoId(protocolo.idExterno, protocolo.numero) : [];
  for (const m of mesmosId) {
    if (!acessivel(m.reparticaoId)) return erro("Já existe um protocolo com esse Id em outra unidade, sem acesso.", 403);
    if (!protocoloNasLinhas(esc, m.id)) return erro("Já existe um protocolo com esse Id — fale com o Responsável por ele.", 403);
  }
  // O de MESMO Id e nº DIFERENTE é o mesmo processo RENUMERADO: o MESMO registro (segue no PCA em que está). Com o nº novo
  // já em outro protocolo (ou mais de um de mesmo Id), é uma FUSÃO: os DFDs dos demais passam ao que fica e eles saem —
  // nenhum dos envolvidos pode estar em um PCA (os DFDs movidos ficariam fora da sincronia do PCA): devolva-o antes.
  const renumerado = mesmosId[0] ?? null;
  const fica = mesmoNumero ? { id: mesmoNumero.id, numero: protocolo.numero } : renumerado;
  const saem = mesmosId.filter((m) => m.id !== fica?.id);
  if (fica && saem.length > 0) {
    const noPca = await pcaDeProtocolos([fica.id, ...saem.map((m) => m.id)]);
    const preso = [fica, ...saem].find((m) => noPca.has(m.id));
    if (preso)
      return erro(
        `O protocolo ${preso.numero} (o mesmo processo, de mesmo Id) está no ${noPca.get(preso.id)?.nome} — devolva-o à Mesa principal antes de importar de novo.`,
        409,
      );
  }

  // Responsável: o PADRÃO de quem protocola (Perfil → Protocolação), se ainda for do grupo e o NÍVEL do papel permitir
  // ("só assume para si" = só a própria pessoa; "não altera" = ninguém) — só preenche um protocolo ainda sem responsável
  // (a sobrescrita/reenvio mantém o já designado).
  const padrao = reenvio ? null : padraoAoProtocolar(esc.vis, a.u.id, await responsavelPadraoDe(a.u.id, await getGrupoAtivoId(a.u)));
  const r = await iniciarProtocolo(protocolo, a.u.id, padrao);
  // Histórico: no reenvio, as diferenças da CAPA (a mesma régua da comparação); os DFDs registram as suas.
  const detalhe = gravado ? await detalheSeguro(() => detalheEdicaoProtocolo(gravado, protocolo), null) : null;
  await registrarAuditoria({
    usuario: a.u,
    acao: reenvio ? "importar" : "protocolar",
    entidade: "protocolo",
    entidadeId: r.id,
    resumo: reenvio
      ? `Protocolo ${r.numero} REENVIADO (sobrescrito): ${reenvio.resumo}`.slice(0, 500)
      : `Protocolo ${r.numero} protocolado${p.data.origem === "automacao" ? " pela automação" : ""}${renumerado ? ` (mesmo Id do ${renumerado.numero} — renumerado)` : ""}`,
    depois: reenvio ? null : { numero: r.numero, assunto: protocolo.assunto, reparticaoId: protocolo.reparticaoId, anoPca: protocolo.anoPca },
    protocoloId: r.id,
    origem: reenvio ? "reenvio" : (p.data.origem ?? "protocolacao"),
    detalhe,
  });
  // REENVIADO: o responsável do protocolo sabe (o próprio autor do reenvio, não).
  if (reenvio && gravado) await avisarProtocoloAtualizado(a.u, [{ responsavelId: gravado.responsavelId, protocolo: { id: r.id, numero: r.numero, assunto: protocolo.assunto, pcaId: gravado.pcaId }, oQue: "reenviado" }]);
  return ok({ protocoloId: r.id, numero: r.numero });
}
