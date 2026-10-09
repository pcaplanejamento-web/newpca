// ZIP sem compressão (STORE — os PDFs já vêm comprimidos), núcleo PURO e testado: cada arquivo vira os PEDAÇOS do zip na
// hora (quem chama os guarda num Blob — o navegador os leva ao disco), sem segurar os PDFs na memória. Nomes em UTF-8
// (bit 11), "/" separa as pastas. Limite do formato sem ZIP64: 4 GB e 65.535 arquivos.

const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABELA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataDos(d: Date): [number, number] {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [hora, dia];
}

export class ZipArmazenar {
  private central: Uint8Array[] = [];
  private posicao = 0;
  private quantos = 0;
  private nomes = new Set<string>();
  private agora: Date;
  constructor(agora = new Date()) {
    this.agora = agora;
  }

  /** Acrescenta um arquivo; devolve os pedaços do zip a gravar (cabeçalho local + dados). Nome repetido ganha " (2)". */
  adicionar(caminho: string, dados: Uint8Array): Uint8Array[] {
    let nome = caminho;
    for (let i = 2; this.nomes.has(nome); i++) nome = caminho.replace(/(\.[^./]+)?$/, ` (${i})$1`);
    this.nomes.add(nome);
    const n = new TextEncoder().encode(nome);
    const crc = crc32(dados);
    const [hora, dia] = dataDos(this.agora);
    const local = new Uint8Array(30 + n.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, hora, true);
    l.setUint16(12, dia, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, dados.length, true);
    l.setUint32(22, dados.length, true);
    l.setUint16(26, n.length, true);
    local.set(n, 30);
    const c = new Uint8Array(46 + n.length);
    const v = new DataView(c.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(8, 0x0800, true);
    v.setUint16(12, hora, true);
    v.setUint16(14, dia, true);
    v.setUint32(16, crc, true);
    v.setUint32(20, dados.length, true);
    v.setUint32(24, dados.length, true);
    v.setUint16(28, n.length, true);
    v.setUint32(42, this.posicao, true);
    c.set(n, 46);
    this.central.push(c);
    this.posicao += local.length + dados.length;
    this.quantos++;
    return [local, dados];
  }

  /** O diretório central + o fim do zip (os últimos pedaços). */
  fechar(): Uint8Array[] {
    const tam = this.central.reduce((s, c) => s + c.length, 0);
    const fim = new Uint8Array(22);
    const f = new DataView(fim.buffer);
    f.setUint32(0, 0x06054b50, true);
    f.setUint16(8, this.quantos, true);
    f.setUint16(10, this.quantos, true);
    f.setUint32(12, tam, true);
    f.setUint32(16, this.posicao, true);
    return [...this.central, fim];
  }

  get vazio() {
    return this.quantos === 0;
  }
}
