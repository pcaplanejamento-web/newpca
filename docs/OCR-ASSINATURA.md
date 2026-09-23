# OCR de assinaturas achatadas (Dropsigner, Foxit/ICP-Brasil, Adobe)

Como funciona, como manter e como resolver problemas do OCR que lê assinaturas **achatadas** (sem camada de
texto) em qualquer página do DFD — ver a seção *Assinatura digital* do [`../CLAUDE.md`](../CLAUDE.md).

## O problema
Muitos DFDs trazem a assinatura **achatada como imagem/vetor** — **Dropsigner** (o caso mais comum),
**Foxit e-CPF/ICP-Brasil** (Formato E) e, em tese, **Adobe**: sem camada de texto (`getTextContent`/
`getOperatorList` não trazem o bloco) e sem assinatura criptográfica (`/Sig`). Nenhum parser de texto a lê → o
DFD ficava "sem assinatura" e era bloqueado (no `pd101820` real: 13 de 15 DFDs). A solução é **OCR** (ler os
pixels do carimbo), em **qualquer página** do DFD.

## Como funciona (visão geral)
- **Núcleo puro `src/lib/ocr-assinatura-core.ts`** (sem DOM/tesseract): toda a lógica — páginas, localização,
  recortes, parse, votação. O render e o OCR entram por um **`MotorOcr` injetado**, então a MESMA
  orquestração roda no navegador e no harness de validação (Node) contra o PDF real.
- **Adaptador de navegador `src/lib/ocr-assinatura.ts`:** implementa o `MotorOcr` com o pdf.js (render,
  imagens, camada de texto), o `<canvas>` do DOM e o **tesseract.js** (WASM, `por`), importado
  **dinamicamente**; o worker só nasce quando um DFD fica sem assinatura **nomeada** de texto (`precisaOcr`).
- **Estratégia (`lerAssinaturasPorOcr`):**
  1. **Ordem das páginas** (`prioridadePaginasOcr`): imagem fora do cabeçalho (logo do Dropsigner, rubrica)
     → rótulo de assinatura na camada de texto (SECRETÁRIO DEMANDANTE/AUTORIZAÇÃO/ORDENADOR) → última página
     → demais. Lê todas as prováveis; teto de 12 páginas por DFD.
  2. **Atalho pelas imagens** (`caixasImagensDaOpList` → `regioesDeImagens`): OCR só da região do carimbo;
     página inteira como fallback (carimbo puramente vetorial, ex.: Foxit).
  3. **Localização** (`localizarBlocosAssinatura`): palavras-âncora pequenas e horizontais ("Assinado",
     "eletronicamente", "CPF", "Data:", "ICP-Brasil", "Foxit", "CN="…) agrupadas por proximidade; recorte
     ampliado e **binarizado** (some a régua cinza da tabela e o nome grande claro sobreposto) lido em 2 modos.
  4. **Parse por linhas** (`assinaturasDeOcr`): Dropsigner (`dropsignerDeOcr`), Foxit
     (`assinaturasFoxitDeTexto`, ancorado na data ISO + `CN=`) e Adobe (`assinaturasAdobeDeTexto`). O nome é
     **corrigido pela camada de texto** (`corrigirNomePelaCamada`, distância de edição ≤ 12%); leituras da
     mesma assinatura são **agrupadas** (data/CPF por maioria).
  5. **Código Dropsigner:** a marca d'água vertical é lida em 4 variantes (1×/2×, com/sem binarização) e o
     código sai por **consenso** posição a posição (`votarCodigoDropsigner`), no alfabeto do Dropsigner (sem
     O/0/I/1). Sem consenso → sem código e sem link (**nunca um link errado**). Se a camada de texto já tinha
     o carimbo com o código, `mesclarAssinaturasOcr` herda o código **exato** dele.
- Toda assinatura lida por OCR sai com **`ocr:true`** (persistido no banco).
- **Onde roda:** avulso em `parseDfdPdf` (inline, 1 DFD); no protocolo, na **análise** — uma 2ª passada
  (depois do texto) lê em fila os DFDs que precisam, cada um "pendente" até a leitura, e prevê a unidade pelo
  assinante; abrir um DFD adianta a leitura dele (`mesclarOcrSePreciso`). As leituras são **serializadas**
  (o worker é único). `ocrTentadoRef` evita repetir; o worker é liberado com `encerrarOcr()`.
- **Sem duplicar:** leituras da mesma assinatura (mesma data/hora + CPF compatível) viram uma só, e o nome
  repetido na linha ("NOME NOME") é colapsado.
- **Validação:** assinatura lida por OCR que não confere com o responsável fica em ATENÇÃO até a equipe validar
  (bloco "Validação da assinatura" no DFD).
- **Best-effort:** qualquer erro (navegador sem SIMD, asset ausente, leitura ruim) → `[]` = o DFD segue
  "sem assinatura" (exatamente o comportamento anterior). O OCR **nunca** quebra o import.
- **Conferência (`validarAssinatura`):** como o OCR é imperfeito, uma assinatura lida por OCR (`ocr:true`
  ou `foxit`) que **não casa** um responsável é reconhecida **sem bloquear** (status `"ocr"`) — salvo se
  houver uma assinatura de leitura LIMPA (texto) com nome que também falhou (essa bloqueia). Casou → `ok`.

## A assinatura não se confunde com o texto
Independente do OCR, a camada de texto do DFD é limpa por **`limparAssinaturasDoTexto`**
(`parse-dfd-pdf-core.ts`) antes de montar seções e itens: texto rotacionado (marca d'água), aparência Adobe
por geometria (inclusive **sobre o texto**) e segmentos de assinatura — sempre **por trecho**, nunca a linha
inteira, para não apagar o texto legítimo ao lado. Detalhes no `CLAUDE.md`.

## Assets self-hosted (`/public/tesseract`)
Servidos **first-party** (sem CDN externa — a rede da Prefeitura pode bloquear CDNs; e no Cloudflare são
**assets estáticos**, fora do bundle do Worker). São ~11 MB no total, carregados só quando o OCR roda:

| Arquivo | O que é | Origem (npm) |
|---|---|---|
| `worker.min.js` | worker do tesseract.js | `tesseract.js/dist/worker.min.js` |
| `tesseract-core-simd-lstm.wasm.js` | motor OCR (WASM SIMD, engine LSTM; wasm **embutido** em base64) | `tesseract.js-core/` |
| `lang/por.traineddata.gz` | modelo do português (standard 4.0.0) | `@tesseract.js-data/por/4.0.0/` |

O `ocr-assinatura.ts` aponta `workerPath`/`corePath`/`langPath` para esses caminhos e usa `gzip:true`.
Como o glue `.wasm.js` **embute** o WASM (base64), **não** é preciso hospedar o `.wasm` separado. Usa-se só
a variante **SIMD** (universal em navegadores de 2026); sem SIMD, o OCR degrada graciosamente (sem
assinatura).

### Como atualizar/regenerar os assets
Num diretório temporário (fora do repo), instale os pacotes e copie:
```bash
npm i tesseract.js@7 @tesseract.js-data/por
cp node_modules/tesseract.js/dist/worker.min.js                     <repo>/public/tesseract/
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js  <repo>/public/tesseract/
cp node_modules/@tesseract.js-data/por/4.0.0/por.traineddata.gz     <repo>/public/tesseract/lang/
```
Mantenha a versão dos assets **alinhada** com a do `tesseract.js` em `package.json` (hoje `^7`). Para mais
**precisão** (ao custo de +~6 MB e OCR mais lento), troque o `por.traineddata.gz` pelo de
`@tesseract.js-data/por/4.0.0_best_int/`.

## `next.config.ts`
O tesseract.js está em `transpilePackages` (como o `pdfjs-dist`) e o alias `canvas:false` cobre a dep nativa
opcional (no navegador rasterizamos num `<canvas>` do DOM). Ambos são importados **dinamicamente** → ficam
fora do bundle do Worker.

## Solução de problemas
- **OCR nunca acha assinatura em nenhum DFD:** confirme que `/tesseract/worker.min.js`,
  `/tesseract/tesseract-core-simd-lstm.wasm.js` e `/tesseract/lang/por.traineddata.gz` estão sendo servidos
  (200, não 404) e que o navegador suporta WebAssembly SIMD.
- **Erro ao inflar o idioma:** o `por.traineddata.gz` deve ser servido **como está** (sem o servidor
  re-comprimir). Se a hospedagem adicionar `Content-Encoding: gzip` por cima, use o `.traineddata`
  descompactado e `gzip:false` (arquivo ~2–3× maior).
- **Lento em protocolos grandes:** é esperado — o OCR só roda por DFD sem assinatura, ao abrir/protocolar.
  Não é executado na análise em background.

## Testes
- Puros (`node:test`): `tests/ocr-assinatura-core.test.ts` (textos **REAIS** do OCR do `pd101820`, consenso do
  código, agrupamento, localização, op list e a orquestração com um **motor falso**),
  `tests/parse-assinaturas-foxit.test.ts`, os casos OCR de `tests/validar-assinatura.test.ts` e os de
  `limparAssinaturasDoTexto` em `tests/parse-dfd-pdf.test.ts`.
- A etapa imagem→texto (canvas + WASM) foi validada por **harness** Node rodando o MESMO núcleo contra o
  `pd101820` real: 13/13 nomes, datas e CPFs corretos; códigos 8 corretos, 5 sem consenso, 0 errados.

Respeitosamente.
