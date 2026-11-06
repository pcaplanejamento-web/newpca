/**
 * PESQUISA DA TELA PÚBLICA (puro, testado) — o que a página pública MOSTRA vira linhas pesquisáveis (`LinhaIndice`, a
 * MESMA ordem da pesquisa do sistema: `pontuar`). Só entra o que o servidor mandou (`DadosPesquisaPublica`
 * — montado por `pesquisaPublica`, `pesquisa-publica.ts`, só com as abas que o ADM publicou e os textos já mascarados).
 * Os links são os da própria página (`/?pca=…&aba=…&abrir=tipo:id`). Aqui tudo é procurado SEM acento nem caixa, em
 * QUALQUER coluna (o número também no texto — "350" acha o valor R$ 350,00): o texto de cada linha é normalizado UMA vez.
 */

import { brl, dataBR, num } from "./format.ts";
import { type LinhaIndice, pontuar, termosPesquisa } from "./pesquisa-core.ts";
import { ROTULO_VISTA_PUBLICA, type VistaPublica } from "./publico-core.ts";
import type { ItemRow } from "./queries.ts";

export type DfdPublicoPesquisa = {
  id: number;
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  sigla: string | null;
  protocoloNumero: string | null;
  itens: number;
  valor: number;
  objeto?: string | null;
  setor?: string | null;
  orgao?: string | null;
};
export type ProtocoloPublicoPesquisa = {
  id: number;
  numero: string;
  assunto: string | null;
  sigla: string | null;
  dfds: number;
  itens: number;
  valor: number;
  idExterno?: string | null;
  interessado?: string | null;
  observacao?: string | null;
};
export type OrcamentoPublicoPesquisa = { chave: string; sigla: string; nome: string; orgaoSigla: string | null; orcamento: number; planejado: number };

/** O que a rota pública entrega (`GET /api/pca/[id]/consulta/pesquisa`). */
export type DadosPesquisaPublica = {
  pca: { id: number; nome: string; ano: number | null };
  vistas: VistaPublica[];
  pcas: { id: number; nome: string; ano: number | null }[];
  unidades: { id: number; codigo: string; municipio: string }[];
  itens: ItemRow[];
  dfds: DfdPublicoPesquisa[];
  protocolos: ProtocoloPublicoPesquisa[];
  documentos: { id: number; nome: string; paginas: number }[];
  orcamento: OrcamentoPublicoPesquisa[];
};

/** Os tipos, na ordem dos grupos do banner. */
export const TIPOS_PUBLICOS = ["aba", "item", "dfd", "protocolo", "documento", "orcamento", "unidade", "pca"] as const;
export type TipoPublico = (typeof TIPOS_PUBLICOS)[number];

export const TITULO_PUBLICO: Record<TipoPublico, string> = {
  aba: "Abas",
  item: "Itens",
  dfd: "DFDs",
  protocolo: "Protocolos",
  documento: "Documentos",
  orcamento: "Orçamento",
  unidade: "Unidades",
  pca: "PCAs",
};

/** Os prefixos ("item:" ou "i:") que restringem a um tipo — Tab completa. */
export const DICAS_PUBLICAS: { prefixo: string; curto: string; tipo: TipoPublico; texto: string }[] = [
  { prefixo: "item:", curto: "i:", tipo: "item", texto: "Itens do PCA (todas as colunas)" },
  { prefixo: "dfd:", curto: "d:", tipo: "dfd", texto: "DFDs" },
  { prefixo: "protocolo:", curto: "p:", tipo: "protocolo", texto: "Protocolos" },
  { prefixo: "documento:", curto: "doc:", tipo: "documento", texto: "Documentos" },
  { prefixo: "orcamento:", curto: "o:", tipo: "orcamento", texto: "Orçamento por unidade" },
  { prefixo: "unidade:", curto: "u:", tipo: "unidade", texto: "Unidades" },
  { prefixo: "aba:", curto: "a:", tipo: "aba", texto: "Abas da página" },
  { prefixo: "pca:", curto: "pc:", tipo: "pca", texto: "PCAs publicados" },
];

/** O link da própria página pública: o PCA, a aba (o Dashboard sem `aba`) e o que abrir nela. */
export function hrefPublico(pcaId: number, vista: VistaPublica, extra: Record<string, string | number> = {}): string {
  const q = new URLSearchParams({ pca: String(pcaId) });
  if (vista !== "dashboard") q.set("aba", vista);
  for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  return `/?${q.toString()}`;
}

const texto = (...v: (string | number | null | undefined)[]) => v.filter((x): x is string | number => x != null && x !== "").map(String);
/** O nº sem o ano ("144756/2026" → "144756"), para o termo numérico casar com o número inteiro. */
const semAno = (n: string | null | undefined) => (n ? n.replace(/\/\d{4}$/, "") : null);
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** A linha com UM texto de busca já normalizado (`campos[0]`) — rótulo, detalhe e todas as colunas. */
const linha = (id: number, rotulo: string, detalhe: string, href: string, campos: string[], numeros: string[]): LinhaIndice => ({
  id,
  rotulo,
  detalhe,
  href,
  campos: [semAcento([rotulo, detalhe, ...campos].join("\n"))],
  numeros,
});

/** Todo termo tem de aparecer (sem acento/caixa); o número casa nos campos de número ou no texto. */
export function casaPublico(q: string): (l: Pick<LinhaIndice, "campos" | "numeros">) => boolean {
  const termos = termosPesquisa(q).map(semAcento);
  return (l) => termos.every((t) => l.campos[0].includes(t) || (/^[\d./-]+$/.test(t) && l.numeros.some((n) => n.includes(t))));
}
const juntar = (...p: (string | null | undefined | false)[]) => p.filter(Boolean).join(" · ");

/** Todas as linhas pesquisáveis, por tipo (só os tipos com dados; as abas e os PCAs sempre). */
export function indicePublico(d: DadosPesquisaPublica): Map<TipoPublico, LinhaIndice[]> {
  const pca = d.pca.id;
  const tem = (v: VistaPublica) => d.vistas.includes(v);
  const m = new Map<TipoPublico, LinhaIndice[]>();
  m.set(
    "aba",
    d.vistas.map((v, i) => linha(i, ROTULO_VISTA_PUBLICA[v], d.pca.nome, hrefPublico(pca, v), [ROTULO_VISTA_PUBLICA[v], v], [])),
  );
  if (d.itens.length && tem("consulta"))
    m.set(
      "item",
      d.itens.map((r) => {
        const previsao = r.periodo ?? (r.mes && r.ano ? `${String(r.mes).padStart(2, "0")}/${r.ano}` : null);
        return linha(
          r.id,
          r.nomeProduto || `Item ${r.idProduto ?? r.id}`,
          juntar(r.sequencial != null && `Seq. ${r.sequencial}`, r.idProduto && `Código ${r.idProduto}`, r.dfdNumero && `DFD ${r.dfdNumero}`, r.codigo, brl(r.valorTotal ?? 0)),
          hrefPublico(pca, "consulta", { abrir: `item:${r.id}` }),
          texto(
            r.nomeProduto,
            r.idProduto,
            r.unidadeMedida,
            r.classificacao,
            r.tipoDfd,
            r.dominio,
            r.prioridade,
            r.codigo,
            r.municipio,
            r.protocoloNumero,
            r.dfdNumero,
            previsao,
            r.dataDesejada && dataBR(r.dataDesejada),
            r.quantidade != null ? num(r.quantidade) : null,
            r.valorReferencia != null ? brl(r.valorReferencia) : null,
            r.valorTotal != null ? brl(r.valorTotal) : null,
          ),
          texto(r.idProduto, r.sequencial, r.dfdNumero, r.protocoloNumero, semAno(r.protocoloNumero), r.itemNumero, r.quantidade),
        );
      }),
    );
  if (d.dfds.length && tem("consulta"))
    m.set(
      "dfd",
      d.dfds.map((x) =>
        linha(
          x.id,
          `DFD ${x.numero}${x.planejamento ? ` (Planej. ${x.planejamento})` : ""}`,
          juntar(x.objeto, x.sigla, x.protocoloNumero && `Protocolo ${x.protocoloNumero}`, brl(x.valor)),
          hrefPublico(pca, "consulta", { abrir: `dfd:${x.id}` }),
          texto(x.numero, x.planejamento, x.tipo, x.sigla, x.protocoloNumero, x.objeto, x.setor, x.orgao, brl(x.valor)),
          texto(x.numero, x.planejamento, x.protocoloNumero, semAno(x.protocoloNumero)),
        ),
      ),
    );
  if (d.protocolos.length && tem("consulta"))
    m.set(
      "protocolo",
      d.protocolos.map((p) =>
        linha(
          p.id,
          `Protocolo ${p.numero}`,
          juntar(p.assunto, p.sigla, `${num(p.dfds)} DFDs`, brl(p.valor)),
          hrefPublico(pca, "consulta", { abrir: `protocolo:${p.id}` }),
          texto(p.numero, p.assunto, p.sigla, p.idExterno, p.interessado, p.observacao, brl(p.valor)),
          texto(p.numero, semAno(p.numero), p.idExterno),
        ),
      ),
    );
  if (d.documentos.length && tem("documentos"))
    m.set(
      "documento",
      d.documentos.map((x) => linha(x.id, x.nome, `${num(x.paginas)} página${x.paginas === 1 ? "" : "s"}`, hrefPublico(pca, "documentos", { abrir: `documento:${x.id}` }), texto(x.nome), [])),
    );
  if (d.orcamento.length && tem("orcamento"))
    m.set(
      "orcamento",
      d.orcamento.map((o, i) =>
        linha(
          i,
          o.nome && o.nome !== o.sigla ? `${o.sigla} — ${o.nome}` : o.sigla,
          juntar(o.orgaoSigla, `Orçamento ${brl(o.orcamento)}`, `Planejado ${brl(o.planejado)}`),
          hrefPublico(pca, "orcamento", { abrir: `orcamento:${o.chave}` }),
          texto(o.sigla, o.nome, o.orgaoSigla),
          [],
        ),
      ),
    );
  if (d.unidades.length > 1)
    m.set(
      "unidade",
      d.unidades.map((u) => linha(u.id, u.codigo, u.municipio, hrefPublico(pca, "dashboard", { unidade: u.id }), texto(u.codigo, u.municipio), [])),
    );
  m.set(
    "pca",
    d.pcas.map((p) => linha(p.id, p.nome, p.id === pca ? "o aberto agora" : p.ano != null ? `PCA ${p.ano}` : "PCA", `/?pca=${p.id}`, texto(p.nome, p.ano), texto(p.ano))),
  );
  return m;
}

export type GrupoPublico = { tipo: TipoPublico; total: number; linhas: LinhaIndice[] };

/** Procura o termo (2+ caracteres): por tipo, o total e as `limite` melhores (palavra exata › começa › contém). */
export function pesquisarPublico(indice: Map<TipoPublico, LinhaIndice[]>, termo: string, tipo: TipoPublico | null, limite: number): GrupoPublico[] {
  if (termo.trim().length < 2) return [];
  const casa = casaPublico(termo);
  const out: GrupoPublico[] = [];
  for (const t of TIPOS_PUBLICOS) {
    if (tipo && tipo !== t) continue;
    const achados = (indice.get(t) ?? []).filter(casa);
    if (!achados.length) continue;
    const linhas = achados
      // O rótulo pesa mais que o detalhe; no empate, o rótulo mais curto (o mais próximo do termo) vem antes.
      .map((l, i) => ({ l, i, p: pontuar(l.rotulo, termo) * 2 + pontuar(l.detalhe, termo) }))
      .sort((a, b) => b.p - a.p || a.l.rotulo.length - b.l.rotulo.length || a.i - b.i)
      .slice(0, limite)
      .map(({ l }) => l);
    out.push({ tipo: t, total: achados.length, linhas });
  }
  return out;
}

/** O valor do `?abrir=` → o tipo e o id (`orcamento` leva a chave da linha, texto). */
export function lerAbrirPublico(v: string): { tipo: "item" | "dfd" | "protocolo" | "documento"; id: number } | { tipo: "orcamento"; chave: string } | null {
  const [t, resto] = [v.slice(0, v.indexOf(":")), v.slice(v.indexOf(":") + 1)];
  if (v.indexOf(":") < 0 || !resto) return null;
  if (t === "orcamento") return { tipo: t, chave: resto };
  const id = Number(resto);
  if (!Number.isInteger(id)) return null;
  return t === "item" || t === "dfd" || t === "protocolo" || t === "documento" ? { tipo: t, id } : null;
}
