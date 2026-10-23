import { ABA_KEYS, ABAS, type AbaKey } from "./abas.ts";

/** O CATÁLOGO dos papéis (as ações, as telas e o que cada ação cobre) — separado do núcleo para os módulos de detalhes e
 * componentes o usarem sem ciclo de imports. `papeis-core.ts` o reexporta. */

export const MAX_NOME_PAPEL = 40;
export const MAX_DESCRICAO_PAPEL = 200;

export const ACOES_PAPEL = ["visualizar", "manipular", "importar", "exportar", "excluir", "configurar"] as const;
export type AcaoPapel = (typeof ACOES_PAPEL)[number];
export type Tela = AbaKey;

export const ROTULO_ACAO: Record<AcaoPapel, string> = {
  visualizar: "Visualizar",
  manipular: "Manipular",
  importar: "Importar",
  exportar: "Exportar",
  excluir: "Excluir",
  configurar: "Configurar",
};

/** Verbo da mensagem de recusa ("Seu papel não permite importar na Mesa."). */
export const VERBO_ACAO: Record<AcaoPapel, string> = {
  visualizar: "abrir",
  manipular: "editar",
  importar: "importar",
  exportar: "exportar",
  excluir: "excluir",
  configurar: "configurar",
};

/** O que cada ação significa, em geral (a descrição por tela fica no catálogo). */
export const DESCRICAO_ACAO: Record<AcaoPapel, string> = {
  visualizar: "Abrir a tela e consultar os dados. Sem ela a tela fica fechada, mesmo que o grupo a libere.",
  manipular: "Criar e editar o conteúdo da tela.",
  importar: "Trazer arquivos para a tela (e reenviar).",
  exportar: "Baixar os dados da tela (planilha, PDF, agenda).",
  excluir: "Apagar registros da tela.",
  configurar: "Alterar a configuração da tela e publicar o que vale para todos.",
};

type InfoTela = { na: string; a: string; acoes: Partial<Record<AcaoPapel, string>> };

/** Por tela: as ações que se aplicam e o que cada uma cobre ali. */
export const CATALOGO_PAPEIS: Record<Tela, InfoTela> = {
  dfd: {
    na: "na Mesa",
    a: "à Mesa",
    acoes: {
      visualizar: "Abrir a Mesa: protocolos, DFDs, itens, histórico e o Dashboard.",
      manipular:
        "Editar capa, DFDs e itens (tratamento, validar assinatura, Situação, Responsável, edição em massa), vincular ou mover DFD e enviar ao PCA.",
      importar: "Importar protocolo e DFD, reenviar protocolo e sobrescrever DFD.",
      exportar: "Baixar as tabelas da Mesa em .xlsx.",
      excluir: "Excluir protocolos (com os DFDs) e DFDs.",
      configurar: "Publicar edições das tabelas para todos.",
    },
  },
  pca: {
    na: "no PCA",
    a: "ao PCA",
    acoes: {
      visualizar: "Abrir os PCAs: Dashboard, Orçamento, a Mesa do PCA e a consulta do Preview.",
      manipular: "Trabalhar na Mesa do PCA: incorporar, devolver, enviar a este PCA e editar o que foi enviado.",
      importar: "Importar planilhas (PCA de lista).",
      exportar: "Baixar o comparativo em .xlsx.",
      excluir: "Excluir PCA e planilha e retirar itens do PCA.",
      configurar: "Criar PCA, alterar a Configuração (nome, ano, fonte, publicar, capa, visão, marcados) e publicar edições das tabelas.",
    },
  },
  catalogo: {
    na: "no Catálogo",
    a: "ao Catálogo",
    acoes: {
      visualizar: "Consultar catálogos, itens, medidas e classificações.",
      manipular: "Criar e editar catálogos e itens, os tipos de DFD e compartilhar itens.",
      importar: "Importar catálogo (.xlsx ou .pdf) e baixar o modelo.",
      exportar: "Baixar o catálogo em .xlsx ou PDF.",
      excluir: "Excluir catálogos e itens.",
      configurar: "Cadastrar medidas, sinônimos e classificações.",
    },
  },
  orcamento: {
    na: "no Orçamento",
    a: "ao Orçamento",
    acoes: {
      visualizar: "Consultar orçamentos, lançamentos, comparativo, vínculos e visões.",
      importar: "Importar o CUBO e reenviar a planilha.",
      exportar: "Baixar os lançamentos (.xlsx ou PDF) e o comparativo.",
      excluir: "Excluir orçamentos.",
      configurar: "Vínculos, visões, nome e ano do orçamento e publicar edições das tabelas.",
    },
  },
  tarefas: {
    na: "em Tarefas",
    a: "a Tarefas",
    acoes: {
      visualizar: "Abrir os quadros do grupo, as tarefas e o Dashboard.",
      manipular:
        "Criar, editar, mover, copiar, arquivar e concluir tarefas (também em massa); checklists, comentários, eventos, criar listas, ordenar cartões e pastas privadas.",
      importar: "Importar quadro do Trello (.json).",
      exportar: "Baixar a Lista em .xlsx.",
      excluir: "Excluir tarefas, listas, quadros e comentários de outras pessoas.",
      configurar:
        "Criar e configurar quadros (listas, etiquetas, equipes, campos, automações, fundo, privado, Trello, modelos) e pastas públicas.",
    },
  },
  calendario: {
    na: "no Calendário",
    a: "ao Calendário",
    acoes: {
      visualizar: "Abrir o Calendário e responder convites.",
      manipular: "Criar e editar tarefas e eventos pelo Calendário.",
      importar: "Assinar agendas externas.",
      exportar: "Baixar .ics, gerar o link de assinatura e imprimir.",
      excluir: "Excluir tarefas pelo Calendário.",
    },
  },
  verificacao: {
    na: "na Verificação",
    a: "à Verificação",
    acoes: {
      visualizar: "Abrir a Verificação e conferir um protocolo ou DFD (nada é gravado).",
      exportar: "Baixar o relatório das pendências em PDF.",
    },
  },
  documentos: {
    na: "em Documentos",
    a: "a Documentos",
    acoes: {
      visualizar: "Abrir Documentos e ver os PDFs guardados.",
      manipular: "Renomear documentos.",
      importar: "Subir PDFs (compactados até 100 KB).",
      exportar: "Baixar os PDFs.",
      excluir: "Excluir documentos.",
    },
  },
  empenhos: {
    na: "em Empenhos",
    a: "a Empenhos",
    acoes: {
      visualizar: "Abrir Empenhos e consultar os empenhos importados da Centi (só leitura).",
      exportar: "Baixar a tabela em XLSX e PDF.",
    },
  },
};

export const rotuloTela = (tela: Tela): string => ABAS.find((a) => a.key === tela)?.label ?? tela;
export const ehTela = (x: unknown): x is Tela => typeof x === "string" && (ABA_KEYS as readonly string[]).includes(x);
export const ehAcao = (x: unknown): x is AcaoPapel => typeof x === "string" && (ACOES_PAPEL as readonly string[]).includes(x);
