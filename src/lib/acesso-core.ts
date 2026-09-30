/**
 * Os TEXTOS da tela de acesso (a vitrine ao lado do login e o aviso abaixo do formulário) — cadastráveis pelo ADM em
 * Configurações → Tela de acesso (blob `aparencia.acesso`, sem migração). Núcleo PURO: os padrões e a leitura tolerante.
 */

export type DestaqueAcesso = { titulo: string; texto: string };
export type TextosAcesso = {
  /** O rótulo pequeno acima da manchete. */
  rotulo: string;
  /** A manchete (quebra de linha com Enter). */
  titulo: string;
  descricao: string;
  /** Até 3 destaques (um sem título não aparece). */
  destaques: DestaqueAcesso[];
  /** O rodapé da vitrine. */
  rodape: string;
  /** O aviso abaixo do formulário (também no celular). */
  aviso: string;
};

export const MAX_DESTAQUES_ACESSO = 3;
export const LIMITES_ACESSO = { rotulo: 60, titulo: 90, descricao: 400, destaqueTitulo: 50, destaqueTexto: 140, rodape: 140, aviso: 200 } as const;

export const TEXTOS_ACESSO_PADRAO: TextosAcesso = {
  rotulo: "Plano de Contratações Anual",
  titulo: "Todo o planejamento.\nUma só visão.",
  descricao:
    "Das demandas de cada unidade ao PCA publicado: protocolos, DFDs, catálogo, orçamento e tarefas reunidos numa única plataforma, para a equipe de Planejamento decidir com dado conferido.",
  destaques: [
    { titulo: "Mesa de planejamento", texto: "Protocolos, DFDs e itens num só fluxo, com a conferência automática." },
    { titulo: "PCA e orçamento integrados", texto: "O plano de cada ano lado a lado com a dotação do orçamento." },
    { titulo: "Transparência e rastreabilidade", texto: "Histórico de cada alteração e o PCA publicado para consulta." },
  ],
  rodape: "Prefeitura Municipal de Rio Verde · Planejamento e Custos",
  aviso: "Acesso restrito aos servidores da Prefeitura de Rio Verde. Todo cadastro passa pela aprovação do administrador.",
};

const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : "");

/**
 * Os textos EFETIVOS: o que o ADM gravou, e o padrão onde ficou vazio (rótulo, manchete, descrição, rodapé e aviso). Os
 * destaques gravados valem como estão (o ADM pode tirar um deixando o título vazio); nunca gravados = os padrões.
 */
export function textosAcesso(gravado: unknown): TextosAcesso {
  const g = gravado && typeof gravado === "object" ? (gravado as Record<string, unknown>) : {};
  const L = LIMITES_ACESSO;
  const ou = (v: unknown, max: number, padrao: string) => texto(v, max) || padrao;
  const destaques = Array.isArray(g.destaques)
    ? g.destaques
        .slice(0, MAX_DESTAQUES_ACESSO)
        .map((d) => {
          const o = d && typeof d === "object" ? (d as Record<string, unknown>) : {};
          return { titulo: texto(o.titulo, L.destaqueTitulo), texto: texto(o.texto, L.destaqueTexto) };
        })
        .filter((d) => d.titulo)
    : TEXTOS_ACESSO_PADRAO.destaques;
  return {
    rotulo: ou(g.rotulo, L.rotulo, TEXTOS_ACESSO_PADRAO.rotulo),
    titulo: ou(g.titulo, L.titulo, TEXTOS_ACESSO_PADRAO.titulo),
    descricao: ou(g.descricao, L.descricao, TEXTOS_ACESSO_PADRAO.descricao),
    destaques,
    rodape: ou(g.rodape, L.rodape, TEXTOS_ACESSO_PADRAO.rodape),
    aviso: ou(g.aviso, L.aviso, TEXTOS_ACESSO_PADRAO.aviso),
  };
}
