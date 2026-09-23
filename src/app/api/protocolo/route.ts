import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { assuntoCadastrado, classificarAssunto, comportamentoNo, protocolarHabilitado } from "@/lib/avaliacao-core";
import { startProtocoloSchema } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { identidadeReenvio } from "@/lib/comparar-protocolo";
import { getProtocolo, getProtocoloPorIdExterno, iniciarProtocolo } from "@/lib/protocolo";

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
  const { protocolo, reenvio } = p.data;

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
  if (reenvio) {
    const gravado = await getProtocolo(reenvio.protocoloId);
    if (!gravado) return erro("Protocolo a sobrescrever não encontrado.", 404);
    if (!acessivel(gravado.reparticaoId)) return erro("Sem acesso a este protocolo.", 403);
    const motivo = identidadeReenvio(gravado, { numero: protocolo.numero, idExterno: protocolo.idExterno ?? null });
    if (motivo) return erro(motivo, 422);
  }
  // Anti-sequestro por Id: protocolar sobrescreve o protocolo de MESMO `idExterno` — mas não
  // se ele estiver numa unidade INACESSÍVEL (não deixa sequestrar/apagar via re-import).
  if (protocolo.idExterno) {
    const existente = await getProtocoloPorIdExterno(protocolo.idExterno);
    if (existente && existente.numero !== protocolo.numero && !acessivel(existente.reparticaoId)) {
      return erro("Já existe um protocolo com esse Id em outra unidade, sem acesso.", 403);
    }
  }

  const r = await iniciarProtocolo(protocolo, a.u.id);
  await registrarAuditoria({
    usuario: a.u,
    acao: reenvio ? "importar" : "protocolar",
    entidade: "protocolo",
    entidadeId: r.id,
    resumo: reenvio ? `Protocolo ${r.numero} REENVIADO (sobrescrito): ${reenvio.resumo}`.slice(0, 500) : `Protocolo ${r.numero} protocolado`,
    depois: { numero: r.numero, assunto: protocolo.assunto, reparticaoId: protocolo.reparticaoId, anoPca: protocolo.anoPca },
  });
  return ok({ protocoloId: r.id, numero: r.numero });
}
