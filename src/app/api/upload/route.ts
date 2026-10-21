import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { exigirAcesso, recusaPca } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { itens, pcaUploads, reparticoes, unidades } from "@/db/schema";
import { avisarAdmsPca } from "@/lib/avisos-mesa";
import { brl, num } from "@/lib/format";
import { comandoSobrescrever, comandosLimparVazias, comandoTotaisUnidades, consultaMaximoSequencial, consultaSequenciaisDeProtocolo } from "@/lib/pca-upload-sql";
import { atribuirSequenciais, repetidos, textoNumeros } from "@/lib/sequencial-pca-core";
import { idDoFiltro } from "@/lib/escopo-unidades-core";
import { unidadesDaSessao } from "@/lib/grupos";
import { normalizarLinha, type LinhaCrua } from "@/lib/normalize";
import { getPcaEspaco } from "@/lib/pca-espaco";
import { uploadSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// 5 linhas x 19 colunas = 95 parâmetros (< limite de 100 do D1 por statement). O cliente envia a planilha em lotes
// (200 linhas/requisição) — cada requisição faz ~40 statements num único db.batch().
const ROWS_PER_STMT = 5;

/**
 * Grava um lote numa planilha do PCA pela régua do SEQUENCIAL SAGRADO (`sequencial-pca-core`): o nº que chega sobrescreve
 * o item da planilha que já o tinha; sem nº, segue a sequência do PCA; o nº de um item de PROTOCOLO nunca é tomado (409).
 * Tudo num lote atômico — os gatilhos da `0117` recusam qualquer repetição que escapar.
 */
async function gravarLote(db: ReturnType<typeof getDb>, pcaId: number, unidadeId: number, rows: LinhaCrua[]): Promise<string | null> {
  const normed = rows.map(normalizarLinha);
  const informados = normed.map((r) => r.sequencial);
  const rep = repetidos(informados);
  if (rep.length) return `Sequencial repetido no lote: ${textoNumeros(rep)}.`;
  const dados = informados.filter((n): n is number => n != null);
  if (dados.length) {
    const deProtocolo = await consultaSequenciaisDeProtocolo(db, pcaId, dados);
    if (deProtocolo.length) return `O sequencial ${textoNumeros(deProtocolo.map((x) => x.sequencial))} já é de um item de protocolo deste PCA — o sequencial é único.`;
  }
  const [m] = await consultaMaximoSequencial(db, pcaId);
  const seqs = atribuirSequenciais(informados, m?.max ?? 0);
  const linhas = normed.map((r, i) => ({ unidadeId, pcaId, ...r, sequencial: seqs[i] }));
  const stmts: Comando[] = [];
  if (dados.length) stmts.push(comandoSobrescrever(db, pcaId, dados));
  for (let i = 0; i < linhas.length; i += ROWS_PER_STMT) stmts.push(db.insert(itens).values(linhas.slice(i, i + ROWS_PER_STMT)));
  stmts.push(comandoTotaisUnidades(db, pcaId), ...comandosLimparVazias(db, pcaId));
  await db.batch(stmts as [Comando, ...Comando[]]);
  return null;
}
// biome-ignore lint/suspicious/noExplicitAny: tipos encadeados do query-builder do Drizzle para db.batch() são inviáveis de anotar aqui.
type Comando = any;

export async function POST(req: Request) {
  const auth = await exigirAcesso("pca", "importar");
  if ("erro" in auth) return auth.erro;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return bad("Corpo da requisição não é um JSON válido.");
  }

  const parsed = uploadSchema.safeParse(json);
  if (!parsed.success) {
    return bad(parsed.error.issues[0]?.message ?? "Dados inválidos.", 422);
  }

  const db = getDb();

  try {
    if (parsed.data.mode === "fim") {
      const [up] = await db.select().from(pcaUploads).where(eq(pcaUploads.id, parsed.data.uploadId)).limit(1);
      if (!up) return bad("Upload não encontrado.", 404);
      const semPca = await recusaPca(up.pcaId);
      if (semPca) return semPca;
      const pca = await getPcaEspaco(up.pcaId);
      const [t] = await db
        .select({ n: sql<number>`COALESCE(SUM(${unidades.totalItens}), 0)`, v: sql<number>`COALESCE(SUM(${unidades.valorTotal}), 0)` })
        .from(unidades)
        .where(eq(unidades.uploadId, up.id));
      if (pca) await avisarAdmsPca(auth.u, pca, `Planilha importada: ${up.nomeArquivo ?? "sem nome"}`, `${num(t?.n ?? 0)} itens · ${brl(t?.v ?? 0)}`, "importacao");
      return NextResponse.json({ ok: true });
    }

    if (parsed.data.mode === "start") {
      const { pcaId, codigo, municipio, nomeArquivo, rows } = parsed.data;
      const pca = await getPcaEspaco(pcaId);
      if (!pca) return bad("PCA não encontrado.", 404);
      const semPca = await recusaPca(pcaId);
      if (semPca) return semPca;
      if (pca.fonte !== "lista") return bad("Este PCA é de protocolos — a planilha só entra num PCA de lista pronta.", 409);

      // O UPLOAD (um por arquivo): a 1ª unidade cria; as outras do mesmo arquivo chegam com o id dele.
      let uploadId = parsed.data.uploadId;
      if (uploadId) {
        const [up] = await db.select({ id: pcaUploads.id }).from(pcaUploads).where(and(eq(pcaUploads.id, uploadId), eq(pcaUploads.pcaId, pcaId))).limit(1);
        if (!up) return bad("Upload não encontrado neste PCA.", 404);
      } else {
        const [up] = await db.insert(pcaUploads).values({ pcaId, nomeArquivo: nomeArquivo ?? null, criadoPor: auth.u.id }).returning({ id: pcaUploads.id });
        uploadId = up.id;
      }

      // A planilha da unidade cadastrada de MESMA SIGLA (a consolidada traz a sigla em LOCAL) é dela; senão, a do cabeçalho.
      const [mesmaSigla] = await db
        .select({ id: reparticoes.id })
        .from(reparticoes)
        .where(and(sql`UPPER(TRIM(${reparticoes.codigo})) = ${codigo.trim().toUpperCase()}`, eq(reparticoes.oculto, false), sql`${reparticoes.codigo} <> 'GERAL'`))
        .limit(1);
      const ativa = idDoFiltro((await unidadesDaSessao(auth.u, undefined, "pca")).filtro);
      // Na "Geral" (a real ou a das minhas unidades) a planilha não fica numa unidade só.
      const repId = mesmaSigla?.id ?? (typeof ativa === "number" ? ativa : null);
      const [u] = await db
        .insert(unidades)
        .values({ codigo, pcaId, uploadId, reparticaoId: repId, municipio, nomeArquivo: nomeArquivo ?? null })
        .returning({ id: unidades.id });

      const falha = await gravarLote(db, pcaId, u.id, rows);
      if (falha) {
        await db.batch([...comandosLimparVazias(db, pcaId)]);
        return bad(falha, 409);
      }

      await registrarAuditoria({
        usuario: auth.u,
        acao: "importar",
        entidade: "planilha",
        entidadeId: u.id,
        resumo: `Planilha (PCA "${pca.nome}") importada — ${nomeArquivo ?? "arquivo"} · unidade ${codigo}`,
        depois: { pcaId, uploadId, codigo, municipio, reparticaoId: repId },
      });
      return NextResponse.json({ ok: true, uploadId, unidadeId: u.id, codigo, inserted: rows.length });
    }

    // mode === "append": acrescenta um lote à unidade já criada.
    const { unidadeId, rows } = parsed.data;
    const [existe] = await db.select({ id: unidades.id, pcaId: unidades.pcaId }).from(unidades).where(eq(unidades.id, unidadeId)).limit(1);
    if (!existe?.pcaId) return bad("Unidade não encontrada para acrescentar itens.", 404);
    const semPca = await recusaPca(existe.pcaId);
    if (semPca) return semPca;
    const falha = await gravarLote(db, existe.pcaId, unidadeId, rows);
    if (falha) return bad(falha, 409);
    return NextResponse.json({ ok: true, unidadeId, inserted: rows.length });
  } catch (err) {
    console.error("Falha ao importar PCA:", err);
    if (String(err).includes("sequencial_duplicado")) return bad("Sequencial repetido no PCA — o sequencial é único. Recarregue e tente de novo.", 409);
    return bad(
      "Erro ao gravar no banco. Tente novamente. (Detalhe no log do servidor.)",
      500,
    );
  }
}
