import { exigirEditor } from "@/lib/api-auth";
import { detalheSeguro, registrarAuditoria } from "@/lib/auditoria";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { assuntoCadastrado, classificarAssunto, comportamentoNo, protocolarHabilitado } from "@/lib/avaliacao-core";
import { startProtocoloSchema } from "@/lib/dfd-validation";
import { getGrupoAtivoId, getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { identidadeReenvio } from "@/lib/comparar-protocolo";
import { detalheEdicaoProtocolo, getProtocolo, getProtocoloPorIdExterno, getProtocoloPorNumero, iniciarProtocolo } from "@/lib/protocolo";
import { pcaDeProtocolos, respostaTravado, travaDeProtocolos } from "@/lib/trava-pca";
import { responsavelPadraoDe } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/**
 * `start-protocolo`: cria só o protocolo (capa) e devolve `protocoloId`. Os DFDs
 * são enviados DEPOIS, em streaming, DFD a DFD (`POST /api/dfd` com o `protocoloId`)
 * — para escalar a milhares de DFDs sem estourar CPU/memória/subrequests do Worker.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
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

  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (rid: number | null) => rid == null || lista.some((r) => r.id === rid);
  if (protocolo.reparticaoId != null && !acessivel(protocolo.reparticaoId)) {
    return erro("Unidade do protocolo inválida ou sem acesso.", 403);
  }
  // REENVIO: só sobrescreve o MESMO protocolo (nº e Id) e com acesso à unidade dele.
  let gravado: Awaited<ReturnType<typeof getProtocolo>> = null;
  if (reenvio) {
    gravado = await getProtocolo(reenvio.protocoloId);
    if (!gravado) return erro("Protocolo a sobrescrever não encontrado.", 404);
    if (!acessivel(gravado.reparticaoId)) return erro("Sem acesso a este protocolo.", 403);
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
  // Anti-sequestro por Id: protocolar sobrescreve o protocolo de MESMO `idExterno` — mas não
  // se ele estiver numa unidade INACESSÍVEL (não deixa sequestrar/apagar via re-import).
  const mesmoId = protocolo.idExterno ? await getProtocoloPorIdExterno(protocolo.idExterno) : null;
  if (mesmoId && mesmoId.numero !== protocolo.numero && !acessivel(mesmoId.reparticaoId)) {
    return erro("Já existe um protocolo com esse Id em outra unidade, sem acesso.", 403);
  }
  // TRAVA do PCA: um protocolo INCORPORADO (o reenviado, o de mesmo nº ou o de mesmo Id) não é sobrescrito.
  const travas = await travaDeProtocolos([gravado?.id, mesmoNumero?.id, mesmoId?.id]);
  const trava = [...travas.values()][0];
  if (trava) return respostaTravado(trava);
  // O de MESMO Id e nº DIFERENTE seria EXCLUÍDO para dar lugar ao novo — e protocolo em um PCA não é excluído (enviado:
  // devolva à Mesa principal antes; incorporado: a trava acima).
  if (mesmoId && mesmoId.numero !== protocolo.numero) {
    const noPca = (await pcaDeProtocolos([mesmoId.id])).get(mesmoId.id);
    if (noPca) return erro(`O protocolo ${mesmoId.numero} (mesmo Id) seria substituído, mas está no ${noPca.nome} — devolva-o à Mesa principal antes de importar de novo.`, 409);
  }

  // Responsável: o PADRÃO de quem protocola (Perfil → Protocolação), se ainda for do grupo — só preenche um protocolo ainda sem
  // responsável (a sobrescrita/reenvio mantém o já designado).
  const r = await iniciarProtocolo(protocolo, a.u.id, reenvio ? null : await responsavelPadraoDe(a.u.id, await getGrupoAtivoId(a.u)));
  // Histórico: no reenvio, as diferenças da CAPA (a mesma régua da comparação); os DFDs registram as suas.
  const detalhe = gravado ? await detalheSeguro(() => detalheEdicaoProtocolo(gravado, protocolo), null) : null;
  await registrarAuditoria({
    usuario: a.u,
    acao: reenvio ? "importar" : "protocolar",
    entidade: "protocolo",
    entidadeId: r.id,
    resumo: reenvio ? `Protocolo ${r.numero} REENVIADO (sobrescrito): ${reenvio.resumo}`.slice(0, 500) : `Protocolo ${r.numero} protocolado`,
    depois: reenvio ? null : { numero: r.numero, assunto: protocolo.assunto, reparticaoId: protocolo.reparticaoId, anoPca: protocolo.anoPca },
    protocoloId: r.id,
    origem: reenvio ? "reenvio" : "protocolacao",
    detalhe,
  });
  return ok({ protocoloId: r.id, numero: r.numero });
}
