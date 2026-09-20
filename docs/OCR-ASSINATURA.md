# OCR da assinatura Foxit/ICP-Brasil (Formato E)

Como funciona, como manter e como resolver problemas do OCR que lê a assinatura **Foxit/ICP-Brasil
achatada** (o "Formato E" da seção *Assinatura digital* do [`../CLAUDE.md`](../CLAUDE.md)).

## O problema
Alguns DFDs trazem a assinatura Foxit e-CPF/ICP-Brasil **achatada como imagem/vetor**: sem camada de
texto (`getTextContent`/`getOperatorList` não trazem o carimbo) e sem assinatura criptográfica (`/Sig`).
Nenhum parser de texto a lê → o DFD ficava "sem assinatura" e era bloqueado. A solução é **OCR** (ler os
pixels do carimbo).

## Como funciona (visão geral)
- **Só no navegador, lazy.** O motor de OCR (**tesseract.js**, WASM, idioma `por`) é importado
  **dinamicamente** e o worker só é criado quando um DFD fica **sem assinatura de texto** (A/B/Dropsigner/
  Adobe). Um import de DFDs já assinados em texto **não** carrega o OCR.
- **`src/lib/ocr-assinatura.ts`** (browser-only) faz 2 passes sobre a página rasterizada:
  1. OCR da página inteira com *bounding boxes* → **localiza** a caixa de detalhe do carimbo (palavras
     pequenas e horizontais com marcas "ICP-Brasil/Foxit/Data/…"). O **nome grande sobreposto** corrompe
     a leitura direta, por isso não se lê a página inteira.
  2. OCR do **recorte ampliado** da caixa de detalhe (estendido p/ cima e p/ a direita; nunca p/ a
     esquerda, onde fica o nome grande).
- **`assinaturasFoxitDeTexto`** (`src/lib/parse-dfd-pdf-core.ts`, **puro/testável**) faz o parse do texto do
  OCR: ancora na **DATA ISO** (`AAAA.MM.DD`, sai confiável) + MARCA "Foxit"/"digitalmente por", e extrai o
  nome do **`CN=NOME:CPF`** (o *subject* do e-CPF sai limpo mesmo com a sobreposição), com fallback p/
  "Assinado digitalmente por NOME:CPF". Distingue do Formato B (usa "em dd/mm/aaaa", sem data ISO) e do
  Adobe (usa "de forma digital"). Emite `fonte:"foxit"`.
- **Onde roda:** avulso em `parseDfdPdf` (inline, 1 DFD); no protocolo é **lazy** — `ocrFoxitEmPaginas` só
  ao **abrir** e ao **protocolar** um DFD sem assinatura (NUNCA na análise em background de até 300 DFDs, que
  travaria a UI). Ver `ProtocoloUploadForm.mesclarOcrSePreciso` (mescla no cache sem perder edições;
  `ocrTentadoRef` evita repetir). O worker é reutilizado e liberado com `encerrarOcr()`.
- **Best-effort:** qualquer erro (navegador sem SIMD, asset ausente, leitura ruim) → `[]` = o DFD segue
  "sem assinatura" (exatamente o comportamento anterior ao recurso). O OCR **nunca** quebra o import.
- **Conferência (`validarAssinatura`):** como o OCR é imperfeito, uma `foxit` que **não casa** um
  responsável é reconhecida **sem bloquear** (status `"ocr"`) — salvo se houver uma assinatura de leitura
  LIMPA (não-foxit) com nome que também falhou (essa bloqueia como sempre). Uma `foxit` que **casa** o
  responsável vira `ok` (igual aos demais formatos).

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
- Puros (`node:test`): `tests/parse-assinaturas-foxit.test.ts` (inclui o **texto REAL do OCR** com a 1ª
  linha corrompida) e os casos Formato E de `tests/validar-assinatura.test.ts`.
- A etapa imagem→texto não é unit-testável (precisa de canvas + WASM); foi validada por **harness** contra
  o `pd101820` real (DFD 140 → `BRUNO BOTELHO SALEH` + CPF + `06/07/2026 14:08:20`).

Respeitosamente.
