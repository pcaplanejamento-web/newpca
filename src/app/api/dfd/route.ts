import { exigirEditor } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { comportamentoNo, importarDfdHabilitado, tipoPermitido } from "@/lib/avaliacao-core";
import { conferirItensNoCatalogo } from "@/lib/catalogo";
import { appendDfdItens, getDfdReparticao, getReparticaoDfdNumero, upsertDfdCabecalho } from "@/lib/dfd";
import { algumCatalogoFundamental, bloqueantesCatalogo } from "@/lib/dfd-tratamento";
import { dfdOpSchema, faltasObrigatorias } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { listarOrgaos } from "@/lib/orgaos";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { casarOrgao, orgaoDivergeDaUnidade } from "@/lib/reparticao-match";
import { bloqueiaAssinatura, carimbarValidacao, pdfExigeAssinatura, validarAssinatura } from "@/lib/reparticao-responsaveis";
import { carregarResponsaveis, orgaoIdDaReparticao } from "@/lib/reparticoes";

export const dynamic = "force-dynamic";

/**
 * Escrita de DFD em LOTES (cobre o DFD avulso e cada DFD do protocolo):
 * - `start-dfd`: cabeçalho + 1º lote → cria/zera o DFD (por `numero`), devolve `dfdId`.
 *   Garante a regra (defeituoso NUNCA grava) via `faltasObrigatorias`; exige que a
 *   unidade seja **acessível** e **anti-sequestro** por `numero`.
 * - `append-dfd-itens`: acrescenta lotes ao `dfdId` (idempotente no servidor). Exige
 *   que a unidade do DFD seja acessível ao editor.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(dfdOpSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;

  const { lista } = await getReparticaoContexto(a.u);
  const acessivel = (id: number | null | undefined) => id == null || lista.some((r) => r.id === id);

  if (d.mode === "append-dfd-itens") {
    const dfd = await getDfdReparticao(d.dfdId);
    if (!dfd) return erro("DFD não encontrado para acrescentar itens.", 404);
    if (!acessivel(dfd.reparticaoId)) return erro("Sem acesso à unidade deste DFD.", 403);
    if (!d.rows.every((r) => r.valorUnitario != null && r.valorUnitario > 0)) {
      return erro("Todos os itens precisam de valor unitário.", 422);
    }
    // Portão do catálogo nos LOTES seguintes (o `start-dfd` só viu os primeiros itens): só
    // consulta/bloqueia quando o ADM elevou algum ponto item.* a "fundamental".
    const regrasLote = await getRegrasAvaliacao();
    const ctxLote = { dfdTipo: tipoCurtoDfd(dfd.tipo) };
    if (algumCatalogoFundamental(regrasLote, ctxLote)) {
      const conf = await conferirItensNoCatalogo(
        d.rows.map((r) => ({ codigo: r.codigo ?? null, descricao: r.descricao ?? null, unidade: r.unidade ?? null })),
        ctxLote.dfdTipo,
      );
      const catBloq = bloqueantesCatalogo(d.rows, conf, regrasLote, ctxLote);
      if (catBloq.length > 0) return erro(`Itens fora de conformidade com o catálogo: ${catBloq.join(", ")}.`, 422);
    }
    const r = await appendDfdItens(d.dfdId, d.rows, d.desde);
    return ok({ inserted: r.inserted });
  }

  // start-dfd — regra CONFIGURÁVEL (mesma do cliente) sobre cabeçalho + 1º lote.
  // Níveis do ADM + exceções por TIPO de DFD (o `tipo` vem no corpo). A categoria do
  // protocolo é aplicada no cliente; o servidor mantém global + por-tipo como garantia.
  const regras = await getRegrasAvaliacao();
  const ctxAv = { dfdTipo: tipoCurtoDfd(d.tipo) };
  const faltas = faltasObrigatorias(
    {
      reparticaoId: d.reparticaoId,
      anoPca: d.anoPca,
      itens: d.rows,
      secoes: d.secoes,
      tipo: d.tipo,
      numeroContrato: d.numeroContrato,
      numeroAta: d.numeroAta,
      numeroLicitacao: d.numeroLicitacao,
    },
    regras,
  );
  if (faltas.length > 0) return erro(`Não é possível importar: falta ${faltas.join(", ")}.`, 422);
  // Portão do PCA (configurável): se `dfd.anoPca` for fundamental, todo DFD grava com o
  // ano do PCA (herdado do protocolo ou definido no avulso). Sem ele, não grava.
  if (d.anoPca == null && comportamentoNo(regras, "dfd.anoPca", ctxAv) === "bloqueia")
    return erro("Defina o PCA (ano) do DFD antes de importar.", 422);
  // Trava de protocolação do ADM: TIPO permitido (se exigido) vale p/ TODO DFD; e no AVULSO
  // (sem protocoloId) o botão Importar precisa estar habilitado. (No protocolo, o gate do botão é
  // o "Protocolar", conferido no POST /api/protocolo; a trava de assunto também é de lá.)
  if (regras.gate?.exigirTipo && !tipoPermitido(ctxAv.dfdTipo, regras))
    return erro(`Tipo de DFD não permitido para protocolar: ${ctxAv.dfdTipo ?? "sem tipo"} (Configurações → Protocolação).`, 422);
  if (d.protocoloId == null && !importarDfdHabilitado(regras))
    return erro("A importação de DFD avulso está desabilitada nas Configurações.", 422);
  // Órgão não identificado / divergência órgão × unidade — portões à parte, só EXECUTAM (e só
  // bloqueiam) quando o ADM pôs o ponto numa importância que "bloqueia" (padrão avisa = atenção, não
  // bloqueia → sem custo). Mesma régua da conferência do cliente (`mensagensDoDfd`).
  const orgaoBloqueia = comportamentoNo(regras, "dfd.orgao", ctxAv) === "bloqueia";
  const divergBloqueia = comportamentoNo(regras, "dfd.orgaoUnidadeDivergente", ctxAv) === "bloqueia" && d.reparticaoId != null;
  if (orgaoBloqueia || divergBloqueia) {
    const orgaos = await listarOrgaos();
    if (orgaoBloqueia && orgaos.length > 0 && casarOrgao(d.orgaoEntidade, orgaos) == null)
      return erro("O Órgão/Entidade do DFD não corresponde a nenhum órgão cadastrado.", 422);
    if (divergBloqueia && orgaoDivergeDaUnidade(d.orgaoEntidade, await orgaoIdDaReparticao(d.reparticaoId), orgaos))
      return erro("O Órgão/Entidade do DFD diverge do órgão da unidade cadastrada.", 422);
  }
  // Conformidade com o catálogo — portão à parte (lazy): só consulta e bloqueia quando o ADM
  // elevou algum ponto item.* a "fundamental" (padrão intermediário = atenção, não bloqueia).
  if (algumCatalogoFundamental(regras, ctxAv)) {
    const conf = await conferirItensNoCatalogo(
      d.rows.map((r) => ({ codigo: r.codigo ?? null, descricao: r.descricao ?? null, unidade: r.unidade ?? null })),
      ctxAv.dfdTipo,
    );
    const catBloq = bloqueantesCatalogo(d.rows, conf, regras, ctxAv);
    if (catBloq.length > 0) return erro(`Não é possível importar: ${catBloq.join(", ")}.`, 422);
  }
  if (!acessivel(d.reparticaoId)) return erro("Unidade inválida ou sem acesso.", 403);
  // Anti-sequestro: não sobrescrever/mover um DFD (mesmo `numero`) de uma unidade inacessível.
  const existente = await getReparticaoDfdNumero(d.numero);
  if (existente && !acessivel(existente.reparticaoId)) {
    return erro("Já existe um DFD com esse número em outra unidade, sem acesso.", 403);
  }
  // Conferência da ASSINATURA (garantia no servidor), respeitando o nível `dfd.assinatura`:
  // PDF sem assinatura, sem responsável cadastrado, ou assinante não autorizado → não grava.
  const res = validarAssinatura(d.assinaturas, await carregarResponsaveis(d.reparticaoId), {
    exigeAssinatura: pdfExigeAssinatura(d.nomeArquivo),
  });
  if (res.status === "erro" && bloqueiaAssinatura(res, comportamentoNo(regras, "dfd.assinatura", ctxAv)))
    return erro(res.motivo, 422);

  // Validação pela EQUIPE: quem/quando vêm da SESSÃO (nunca do cliente) — a MESMA validação já gravada
  // (sobrescrita/reenvio do DFD) mantém o carimbo original.
  const assinaturas = carimbarValidacao(d.assinaturas, existente?.assinaturas ?? [], a.u.nome, new Date().toISOString());
  const validadaEquipe = assinaturas.some((x) => x.validacao?.por === "equipe");
  const r = await upsertDfdCabecalho({ ...d, assinaturas }, a.u.id, d.rows);
  await registrarAuditoria({
    usuario: a.u,
    acao: "importar",
    entidade: "dfd",
    entidadeId: r.id,
    resumo: `DFD ${r.numero} importado — ${d.rows.length} ${d.rows.length === 1 ? "item" : "itens"}${validadaEquipe ? " · assinatura validada pela equipe" : ""}`,
    depois: { numero: r.numero, tipo: d.tipo, reparticaoId: d.reparticaoId, valorTotal: d.valorTotal, totalItens: d.totalItens },
  });
  return ok({ dfdId: r.id, numero: r.numero });
}
