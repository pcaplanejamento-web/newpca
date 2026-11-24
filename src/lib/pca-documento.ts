import { and, desc, eq, gt, sql } from "drizzle-orm";
import { dfds, pcaDocumentoEmissoes, pcaDocumentos } from "@/db/schema";
import { sha256 } from "./conferencia-cache-core";
import { getDb } from "./db";
import { prioridadeDoDfd, textoSecao } from "./dfd-tratamento";
import { itensDoTexto, linhasParaTexto } from "./itens-dash-texto";
import { previsaoDoDfd } from "./pca-core";
import {
  CAMPOS_ITEM_DOCUMENTO,
  type ConfigDocumentoPca,
  type DfdDocumento,
  lerConfigDocumento,
  textoConfig,
  textoSelo,
  type Totais,
  totaisDocumento,
} from "./pca-documento-core";
import { chavePca, dashboardDoPca, type PcaEspaco } from "./pca-espaco";
import { mascararTexto } from "./pca-publico-core";
import { codigoDeBytes } from "./termo-uso-core";
import { memoPorVersao } from "./versao-dados";

/** A configuração do documento de um PCA (sem linha = o padrão — desligado). */
export async function getConfigDocumento(pcaId: number): Promise<ConfigDocumentoPca> {
  const [r] = await getDb().select({ config: pcaDocumentos.config }).from(pcaDocumentos).where(eq(pcaDocumentos.pcaId, pcaId)).limit(1);
  if (!r) return lerConfigDocumento(null);
  try {
    return lerConfigDocumento(JSON.parse(r.config));
  } catch {
    return lerConfigDocumento(null);
  }
}

/** Só o "ligado" (a tela pública decide se mostra o botão) — memorizado pela versão dos dados (gravar audita). */
export function documentoAtivo(pcaId: number): Promise<boolean> {
  return memoPorVersao(`docpca-ativo:${pcaId}`, async () => (await getConfigDocumento(pcaId)).ativo).catch(() => false);
}

export async function gravarConfigDocumento(pcaId: number, cfg: ConfigDocumentoPca, quem: string): Promise<ConfigDocumentoPca> {
  const limpo = lerConfigDocumento(cfg);
  const config = JSON.stringify(limpo);
  await getDb()
    .insert(pcaDocumentos)
    .values({ pcaId, config, atualizadoPorNome: quem })
    .onConflictDoUpdate({ target: pcaDocumentos.pcaId, set: { config, atualizadoPorNome: quem, atualizadoEm: sql`CURRENT_TIMESTAMP` } });
  return limpo;
}

/** Os DADOS do documento (o que vai ao navegador): os itens no texto compacto do Dashboard, os DFDs sem protocolo e sem
 * dados pessoais, os nomes das unidades, os totais e o HASH dos dados — montados UMA vez por versão dos dados. */
export type DadosDocumentoServidor = {
  itensTexto: string;
  dfds: DfdDocumento[];
  unidades: Record<string, string>;
  totais: Totais;
  dadosHash: string;
};

const MAX_JUSTIFICATIVA = 2000;
const MESES_CURTOS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function dadosDoDocumento(pca: PcaEspaco): Promise<DadosDocumentoServidor> {
  // NUNCA a prévia (os DFDs ainda não incorporados): o documento é só o que está NO PCA — a prévia do ADM e a emissão iguais.
  const semPrevia: PcaEspaco = { ...pca, mesaMarcados: false };
  return memoPorVersao(`docpca:${chavePca(semPrevia)}`, async () => {
    const dash = await dashboardDoPca(semPrevia);
    const ids = dash.dfdsLista.map((d) => d.id);
    // Objeto e seções dos DFDs VIGENTES (os do Dashboard) — os ids num parâmetro só.
    const extra = new Map<number, { objeto: string | null; secoes: string | null }>();
    if (ids.length) {
      const rows = await getDb()
        .select({ id: dfds.id, objeto: dfds.objeto, secoes: dfds.secoes })
        .from(dfds)
        .where(sql`${dfds.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`);
      for (const r of rows) extra.set(r.id, r);
    }
    const lista: DfdDocumento[] = dash.dfdsLista.map((d) => {
      const e = extra.get(d.id);
      let secoes: { numero: number; titulo: string; texto: string }[] = [];
      try {
        secoes = (e?.secoes ? (JSON.parse(e.secoes) as { titulo?: string; texto?: string }[]) : []).map((s) => ({ numero: 0, titulo: s.titulo ?? "", texto: s.texto ?? "" }));
      } catch {
        secoes = [];
      }
      const p = previsaoDoDfd(secoes, pca.ano);
      const just = textoSecao(secoes, "JUSTIFICATIVA").replace(/\s+/g, " ").trim();
      return {
        numero: d.numero,
        planejamento: d.planejamento,
        tipo: d.tipo,
        sigla: d.sigla,
        objeto: e?.objeto ? mascararTexto(e.objeto.replace(/\s+/g, " ").trim()) : null,
        justificativa: just ? mascararTexto(just.length > MAX_JUSTIFICATIVA ? `${just.slice(0, MAX_JUSTIFICATIVA - 1)}…` : just) : null,
        prioridade: prioridadeDoDfd(secoes),
        previsao: !p ? null : "anual" in p ? (p.periodo ?? "ANUAL").toUpperCase() : `${MESES_CURTOS[p.mes - 1]}/${p.ano}`,
        itens: d.itens,
        valor: d.valor,
      };
    });
    const itens = itensDoTexto(dash.itensTexto);
    const totais = totaisDocumento({ itens, dfds: lista });
    // Só os campos que o documento imprime (nada de protocolo nem de id interno — a resposta é PÚBLICA).
    const itensTexto = linhasParaTexto(itens, CAMPOS_ITEM_DOCUMENTO);
    const unidades = dash.nomesUnidades ?? {};
    return {
      itensTexto,
      dfds: lista,
      unidades,
      totais,
      dadosHash: await sha256(`${itensTexto}\n${JSON.stringify(lista)}\n${JSON.stringify(unidades)}`),
    };
  });
}

/** A janela em que a mesma origem recebe a MESMA emissão de volta (cliques repetidos, nova tentativa). */
const REUSO_EMISSAO_MS = 10 * 60 * 1000;

export type EmissaoRegistrada = { codigo: string; emitidoEm: string; selo: string; dadosHash: string };

/** REGISTRA uma emissão (o código de verificação, os números e o selo) — chamada pela rota pública depois das travas. */
export async function registrarEmissao(pca: PcaEspaco, cfg: ConfigDocumentoPca, dados: DadosDocumentoServidor, ip: string): Promise<EmissaoRegistrada> {
  const configHash = await sha256(textoConfig(cfg));
  // O IP só como HASH (contar emissões por origem sem guardar o dado pessoal).
  const ipHash = (await sha256(`docpca:${ip}`)).slice(0, 16);
  // A MESMA origem pedindo o MESMO documento (mesmos dados e configuração) há pouco = a MESMA emissão (sem linha nova).
  const desde = new Date(Date.now() - REUSO_EMISSAO_MS).toISOString();
  const [ja] = await getDb()
    .select({ codigo: pcaDocumentoEmissoes.codigo, emitidoEm: pcaDocumentoEmissoes.emitidoEm, selo: pcaDocumentoEmissoes.selo })
    .from(pcaDocumentoEmissoes)
    .where(
      and(
        eq(pcaDocumentoEmissoes.pcaId, pca.id),
        eq(pcaDocumentoEmissoes.ipHash, ipHash),
        eq(pcaDocumentoEmissoes.dadosHash, dados.dadosHash),
        eq(pcaDocumentoEmissoes.configHash, configHash),
        gt(pcaDocumentoEmissoes.emitidoEm, desde),
      ),
    )
    .orderBy(desc(pcaDocumentoEmissoes.id))
    .limit(1);
  if (ja) return { ...ja, dadosHash: dados.dadosHash };
  const codigo = codigoDeBytes(crypto.getRandomValues(new Uint8Array(16)));
  const emitidoEm = new Date().toISOString();
  const t = dados.totais;
  const selo = await sha256(textoSelo({ codigo, pcaId: pca.id, emitidoEm, itens: t.itens, valor: t.valor, dfds: t.dfds, dadosHash: dados.dadosHash, configHash }));
  await getDb()
    .insert(pcaDocumentoEmissoes)
    .values({
      codigo,
      pcaId: pca.id,
      emitidoEm,
      itens: t.itens,
      valor: t.valor,
      dfds: t.dfds,
      dadosHash: dados.dadosHash,
      configHash,
      selo,
      ipHash,
    });
  return { codigo, emitidoEm, selo, dadosHash: dados.dadosHash };
}

export type EmissaoDocumento = typeof pcaDocumentoEmissoes.$inferSelect;

export async function emissaoPorCodigo(codigo: string): Promise<EmissaoDocumento | null> {
  const [r] = await getDb().select().from(pcaDocumentoEmissoes).where(eq(pcaDocumentoEmissoes.codigo, codigo)).limit(1);
  return r ?? null;
}

/** O selo gravado confere com os números da emissão? (`false` = o registro foi alterado no banco). */
export async function seloConfere(e: EmissaoDocumento): Promise<boolean> {
  const selo = await sha256(textoSelo({ codigo: e.codigo, pcaId: e.pcaId, emitidoEm: e.emitidoEm, itens: e.itens, valor: e.valor, dfds: e.dfds, dadosHash: e.dadosHash, configHash: e.configHash }));
  return selo === e.selo;
}

/** As últimas emissões de um PCA (o ADM) + o total. */
export async function listarEmissoes(pcaId: number, limite = 100) {
  const db = getDb();
  const [lista, [n]] = await Promise.all([
    db
      .select({ codigo: pcaDocumentoEmissoes.codigo, emitidoEm: pcaDocumentoEmissoes.emitidoEm, itens: pcaDocumentoEmissoes.itens, valor: pcaDocumentoEmissoes.valor, dfds: pcaDocumentoEmissoes.dfds, ipHash: pcaDocumentoEmissoes.ipHash })
      .from(pcaDocumentoEmissoes)
      .where(eq(pcaDocumentoEmissoes.pcaId, pcaId))
      .orderBy(desc(pcaDocumentoEmissoes.id))
      .limit(limite),
    db.select({ n: sql<number>`COUNT(*)` }).from(pcaDocumentoEmissoes).where(eq(pcaDocumentoEmissoes.pcaId, pcaId)),
  ]);
  return { lista, total: Number(n?.n ?? 0) };
}
