# Protocolos

Os protocolos (o "processo" que empacota vários DFDs) vivem na **Mesa** (`/painel/mesa`, aba de módulo `dfd`), na
visão **Protocolos** — no mesmo espaço das visões **DFDs** e **Itens**. Não existe mais tela própria de protocolos: a
antiga página `/painel/protocolos` (a planilha "Distribuição de Protocolos" com edição inline) e o antigo Dashboard de
protocolos (`/painel`) foram **removidos**; `/painel` agora leva direto à Mesa (ou ao 1º módulo que o grupo ativo pode
ver; sem nenhum, ao Perfil).

## Na Mesa
- **Importar / criar:** botão "Importar" da visão Protocolos → soltar o PDF do protocolo (capa + DFDs, lido no
  navegador) **ou** criar o protocolo manualmente. A análise confere cada DFD pelas regras do ADM antes de protocolar.
- **Tabela de protocolos:** Estado (agregado: capa + DFDs + itens) · Situação · Responsável · Distribuição · Data ·
  Nº processo · Id · Assunto · Unidade · DFDs · Itens · Valor — filtros conectados em todas as colunas, seleção com
  somatório e edição em massa (barra fixa no rodapé do display).
- **Gestão:** Situação = as cadastradas pelo ADM (Configurações → Situações: nome + cor + ordem); Responsável = uma
  pessoa do grupo ativo (o padrão de quem protocola é escolhido no Perfil → Protocolação); Distribuição = quem
  protocolou.
- **Banner do protocolo:** clicar numa linha abre o protocolo gravado (capa, DFDs, reenvio com comparação, histórico).
- **PCA:** da Mesa, "Enviar ao PCA" leva os protocolos para a Mesa daquele PCA, onde são incorporados.

## Modelo de dados
- `dfd_protocolos` (migração `0016` em diante) + `dfds.protocolo_id` — ver [CLAUDE.md](../CLAUDE.md) ("Protocolo →
  DFDs" e "Gestão do protocolo").
- **Legado (dormente):** as tabelas `protocolos` e `protocolo_opcoes` (migração `0006`, do antigo módulo) continuam no
  banco com os dados preservados, mas sem código — fora do `schema.ts` e sem migração de DROP; aparecem como "legado"
  na tela Armazenamento (ADM). O histórico dessas alterações segue legível na Auditoria ("Protocolo (legado)").
- **Permissões antigas** que liberavam as abas `dashboard`/`protocolos` continuam válidas: essas chaves são ignoradas
  na leitura (`abasConhecidas`) e o ADM salva a permissão normalmente.

## Referências
- Regras de engenharia e detalhes: [CLAUDE.md](../CLAUDE.md).
- Histórico de entregas: [ROADMAP.md](./ROADMAP.md) ("Tudo na Mesa").
