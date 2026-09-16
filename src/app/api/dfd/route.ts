import { exigirEditor } from "@/lib/api-auth";
import { getRegrasAvaliacao } from "@/lib/avaliacao";
import { nivelDe } from "@/lib/avaliacao-core";
import { appendDfdItens, getDfdReparticao, getReparticaoDfdNumero, upsertDfdCabecalho } from "@/lib/dfd";
import { dfdOpSchema, faltasObrigatorias } from "@/lib/dfd-validation";
import { getReparticaoContexto } from "@/lib/grupos";
import { erro, ok, parseCorpo } from "@/lib/http";
import { listarOrgaos } from "@/lib/orgaos";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { orgaoDivergeDaUnidade } from "@/lib/reparticao-match";
import { bloqueiaAssinatura, pdfExigeAssinatura, validarAssinatura } from "@/lib/reparticao-responsaveis";
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
  if (d.anoPca == null && nivelDe(regras, "dfd.anoPca", ctxAv) === "fundamental")
    return erro("Defina o PCA (ano) do DFD antes de importar.", 422);
  // Divergência órgão × unidade — portão à parte, só EXECUTA (e só bloqueia) quando o ADM
  // elevou o ponto a "fundamental" (padrão intermediário = atenção, não bloqueia → sem custo).
  if (nivelDe(regras, "dfd.orgaoUnidadeDivergente", ctxAv) === "fundamental" && d.reparticaoId != null) {
    const [orgaos, orgaoUnidade] = await Promise.all([listarOrgaos(), orgaoIdDaReparticao(d.reparticaoId)]);
    if (orgaoDivergeDaUnidade(d.orgaoEntidade, orgaoUnidade, orgaos))
      return erro("O Órgão/Entidade do DFD diverge do órgão da unidade cadastrada.", 422);
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
  if (res.status === "erro" && bloqueiaAssinatura(res, nivelDe(regras, "dfd.assinatura", ctxAv)))
    return erro(res.motivo, 422);

  const r = await upsertDfdCabecalho(d, a.u.id, d.rows);
  return ok({ dfdId: r.id, numero: r.numero });
}
