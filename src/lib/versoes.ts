/**
 * VERSÕES do sistema — o registro de mudanças (changelog) é a FONTE ÚNICA da versão exibida no menu, da página de
 * Novidades e do aviso aos Administradores. Puro (sem DOM/banco) e testado.
 *
 * Como publicar uma versão nova: acrescente uma entrada NO TOPO de `VERSOES` (a versão maior que a anterior — semver:
 * MAIOR quando muda o jeito de trabalhar, MENOR para recurso novo, CORREÇÃO para ajuste), cada mudança com o `link` de
 * ONDE ela está, e ponha o mesmo número no `package.json`. O deploy faz o resto: o menu mostra o número e cada ADM
 * recebe UM aviso no sino com o que mudou (tocar abre as Novidades num banner flutuante — sem sair da tela).
 */

export type TipoMudanca = "novo" | "melhoria" | "correcao";

export const ROTULO_MUDANCA: Record<TipoMudanca, string> = { novo: "Novo", melhoria: "Melhoria", correcao: "Correção" };

export type Mudanca = {
  tipo: TipoMudanca;
  /** A área do sistema (o nome do menu). */
  area: string;
  texto: string;
  /** ONDE a mudança está — caminho interno (com a aba, quando houver). */
  link?: string;
};

export type Versao = {
  versao: string;
  /** AAAA-MM-DD (dia de Brasília). */
  data: string;
  titulo: string;
  mudancas: Mudanca[];
};

/** Mais recente PRIMEIRO. */
export const VERSOES: readonly Versao[] = [
  {
    versao: "1.6.0",
    data: "2026-10-06",
    titulo: "Quem do grupo está online",
    mudancas: [
      { tipo: "novo", area: "Configurações", texto: "Presença ao vivo: o ADM liga a exibição de quem do grupo está online, os ausentes e a opção de aparecer invisível.", link: "/painel/configuracoes?aba=presenca" },
      { tipo: "novo", area: "Cabeçalho", texto: "As fotos de quem do grupo ativo está com o sistema aberto, ao vivo (verde = online, âmbar = ausente); tocar abre a lista." },
      { tipo: "novo", area: "Perfil", texto: "Aparecer como invisível: você continua vendo quem está online, sem aparecer para os outros.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.5.0",
    data: "2026-10-06",
    titulo: "Saúde dos dados e acessibilidade",
    mudancas: [
      {
        tipo: "novo",
        area: "Armazenamento",
        texto: "Saúde dos dados: a integridade dos totais (DFD × itens, abas da Mesa, numeração do PCA, rastro) e os dados a tratar (capa × somatória, itens sem valor unitário, gravação incompleta, DFD sem planejamento), com o protocolo de cada um — tocar abre na Mesa.",
        link: "/painel/armazenamento",
      },
      { tipo: "melhoria", area: "Sistema", texto: "Acessibilidade: Esc fecha o menu no celular, a data da assinatura validada pela equipe tem rótulo próprio e os leitores de tela ignoram os fundos decorativos." },
    ],
  },
  {
    versao: "1.4.4",
    data: "2026-10-06",
    titulo: "Atualização de segurança e publicação em fila",
    mudancas: [
      { tipo: "correcao", area: "Sistema", texto: "Next.js 16.3.8 (corrige um alerta crítico de segurança) e ferramentas de publicação atualizadas: nenhum alerta crítico ou alto nas dependências." },
      { tipo: "melhoria", area: "Sistema", texto: "Publicação em fila: uma atualização nova espera a anterior terminar, em vez de interrompê-la no meio." },
    ],
  },
  {
    versao: "1.4.3",
    data: "2026-10-06",
    titulo: "Dashboard do PCA com todos os itens",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "A Consulta de Itens do Dashboard mostra todos os itens do PCA, sem o limite de 5.000 linhas.", link: "/painel/pca" },
      {
        tipo: "novo",
        area: "PCA",
        texto: "Nova visão \"Fora da soma\": os DFDs que ficaram fora pela regra do nº de planejamento (repetido, alteração ou exclusão), com o motivo e o DFD que prevaleceu.",
        link: "/painel/pca",
      },
    ],
  },
  {
    versao: "1.4.2",
    data: "2026-10-05",
    titulo: "Vínculos da unidade sem repetição",
    mudancas: [
      { tipo: "correcao", area: "PCA", texto: "No banner dos vínculos da unidade, cada unidade do orçamento aparece uma vez só; as ações sem vínculo ficam no selo dela.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.4.1",
    data: "2026-10-05",
    titulo: "Valores dos DFDs com a precisão da Centi",
    mudancas: [
      { tipo: "correcao", area: "Mesa", texto: "O valor do DFD guarda as 4 casas dos preços da Centi: as abas Protocolos, DFDs e Itens mostram sempre o mesmo centavo.", link: "/painel/mesa" },
      { tipo: "correcao", area: "Mesa", texto: "A capa do protocolo é conferida com a somatória exata: diferença menor que 1 centavo (arredondamento da Centi) não aponta mais divergência.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.4.0",
    data: "2026-10-05",
    titulo: "Sino: ver é ler, fixar não lidas e Novidades flutuantes",
    mudancas: [
      { tipo: "melhoria", area: "Sino", texto: "Ver o aviso no sino já o marca como visualizado — sem precisar abrir." },
      { tipo: "melhoria", area: "Sino", texto: "Novo marcador de visualizada: vazio enquanto não vista, colorido com ✓ depois." },
      { tipo: "novo", area: "Sino", texto: "Marcar como não visualizada FIXA o aviso: ver de novo não o marca; o toque no marcador solta." },
      { tipo: "melhoria", area: "Novidades", texto: "Abrem num banner flutuante ao lado do sino (ou pela versão no menu), sem sair da tela." },
      { tipo: "correcao", area: "Mesa", texto: "Totais auditados: valor do protocolo = soma dos DFDs = soma dos itens; gravação incompleta aponta erro.", link: "/painel/mesa" },
    ],
  },
  {
    versao: "1.3.2",
    data: "2026-10-05",
    titulo: "Vínculo do orçamento mais simples",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "O editor do vínculo mostra só o que importa: as ações com a caixa, o total e as ações futuras numa linha; as de outros vínculos resumidas.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.3.1",
    data: "2026-10-05",
    titulo: "Vínculos do orçamento do PCA mais legíveis",
    mudancas: [
      { tipo: "melhoria", area: "PCA", texto: "Com o mouse em “N sem vínculo”, a lista das ações sem vínculo organizada por unidade do orçamento, com os valores.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "No vínculo, as unidades ficam separadas da seleção das ações; as marcadas em destaque e as de outros vínculos à parte.", link: "/painel/pca" },
      { tipo: "melhoria", area: "PCA", texto: "PDF dos vínculos com o total no topo e duas tabelas (vinculadas e sem vínculo) com a linha de total.", link: "/painel/pca" },
    ],
  },
  {
    versao: "1.3.0",
    data: "2026-10-05",
    titulo: "Versão do sistema e Novidades",
    mudancas: [
      { tipo: "novo", area: "Menu", texto: "O número da versão do sistema aparece no fim do menu lateral; tocar abre as Novidades." },
      { tipo: "novo", area: "Novidades", texto: "O histórico de versões: o que mudou em cada uma e o botão para ir até onde mudou." },
      { tipo: "novo", area: "Notificações", texto: "Os administradores recebem no sino cada versão nova, com o que mudou.", link: "/painel/configuracoes?aba=notificacoes" },
    ],
  },
  {
    versao: "1.2.0",
    data: "2026-10-05",
    titulo: "Configurações reorganizadas",
    mudancas: [
      { tipo: "melhoria", area: "Configurações", texto: "Abas num cartão fixo à esquerda, com ícone e dica; o conteúdo ao lado, sem rolar a página.", link: "/painel/configuracoes" },
      { tipo: "melhoria", area: "Configurações", texto: "A aba aberta fica no endereço da página — recarregar volta nela.", link: "/painel/configuracoes?aba=identidade" },
      { tipo: "melhoria", area: "Configurações", texto: "Excluir um PCA pede a confirmação do próprio sistema.", link: "/painel/configuracoes?aba=pcas" },
    ],
  },
  {
    versao: "1.1.0",
    data: "2026-10-04",
    titulo: "Notificações profissionais",
    mudancas: [
      { tipo: "novo", area: "Notificações", texto: "Controle central dos avisos (sino, e-mail e o que cada pessoa pode desligar), limpeza automática e comunicados.", link: "/painel/configuracoes?aba=notificacoes" },
      { tipo: "novo", area: "Sino", texto: "Avisos em tempo real, agrupados por dia, com adiar, silenciar, limpar e desfazer." },
      { tipo: "novo", area: "Perfil", texto: "Cada pessoa escolhe os avisos do sino, o e-mail imediato ou o resumo diário e o horário de silêncio.", link: "/painel/perfil" },
    ],
  },
  {
    versao: "1.0.0",
    data: "2026-10-01",
    titulo: "Primeira versão numerada",
    mudancas: [{ tipo: "novo", area: "Sistema", texto: "Mesa, PCA, Catálogo, Orçamento, Tarefas, Calendário e Automação em produção." }],
  },
];

export const VERSAO_ATUAL = VERSOES[0].versao;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
export const versaoValida = (v: string) => SEMVER.test(v);

/** Negativo = `a` mais antiga. */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Só caminho interno (nunca outro site). */
export const linkInterno = (l: string) => l.startsWith("/") && !l.startsWith("//") && !/[\s\\]/.test(l);

export const versaoPorNumero = (v: string | null | undefined): Versao | undefined => VERSOES.find((x) => x.versao === v);

/** "05/10/2026". */
export const dataVersao = (d: string) => {
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
};

const MAX_LINHAS_AVISO = 4;

/** O texto do aviso: o que mudou, uma linha por mudança (até 4 + "e mais N"). */
export function textoMudancas(v: Versao): string {
  const linhas = v.mudancas.slice(0, MAX_LINHAS_AVISO).map((m) => `• ${m.area}: ${m.texto}`);
  const resto = v.mudancas.length - MAX_LINHAS_AVISO;
  if (resto > 0) linhas.push(`e mais ${resto} ${resto === 1 ? "mudança" : "mudanças"}`);
  return linhas.join("\n");
}

/** O aviso no sino de cada Administrador: UM por versão (a `chave`), com o que mudou. Sem link: o sino abre as Novidades
 * daquela versão num banner flutuante (de lá, cada mudança leva ao lugar dela). */
export const avisoNovaVersao = (usuarioId: number, v: Versao = VERSOES[0]) => ({
  usuarioId,
  tipo: "versao" as const,
  titulo: `Nova versão ${v.versao} — ${v.titulo}`,
  texto: textoMudancas(v),
  link: null,
  chave: `versao-sistema:${v.versao}`,
});

/** A versão de um aviso "versao" (pelo título que `avisoNovaVersao` escreve); desconhecida = a atual. */
export function versaoDoAviso(titulo: string): string {
  const v = /vers[aã]o (\d+\.\d+\.\d+)/i.exec(titulo)?.[1];
  return v && versaoPorNumero(v) ? v : VERSAO_ATUAL;
}

/** Os problemas do registro (o teste exige nenhum): ordem, números, datas, links e mudanças. */
export function problemasDasVersoes(lista: readonly Versao[] = VERSOES): string[] {
  const p: string[] = [];
  lista.forEach((v, i) => {
    if (!versaoValida(v.versao)) p.push(`${v.versao}: número fora do padrão X.Y.Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data)) p.push(`${v.versao}: data fora do padrão AAAA-MM-DD`);
    if (!v.titulo.trim()) p.push(`${v.versao}: sem título`);
    if (v.mudancas.length === 0) p.push(`${v.versao}: sem mudanças`);
    for (const m of v.mudancas) if (m.link && !linkInterno(m.link)) p.push(`${v.versao}: link externo ou inválido (${m.link})`);
    const ant = lista[i + 1];
    if (ant && compararVersoes(v.versao, ant.versao) <= 0) p.push(`${v.versao}: não é maior que ${ant.versao}`);
    if (ant && v.data < ant.data) p.push(`${v.versao}: data anterior à da ${ant.versao}`);
  });
  return p;
}
