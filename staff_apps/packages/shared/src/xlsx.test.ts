import { crc32 as nodeCrc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildXlsx, columnLetter, crc32, safeSheetNames, toBase64, xmlEscape, zipStore } from './xlsx';

/** Zip'ni (store) o'qiydi: markaziy katalog bo'yicha fayl nomi -> matn, CRC/o'lchamlarni tekshiradi. */
function readZip(bytes: Uint8Array): Record<string, string> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  expect(eocd).toBeGreaterThanOrEqual(0);
  const count = dv.getUint16(eocd + 10, true);
  let at = dv.getUint32(eocd + 16, true);
  const out: Record<string, string> = {};
  for (let n = 0; n < count; n++) {
    expect(dv.getUint32(at, true)).toBe(0x02014b50);
    const crc = dv.getUint32(at + 16, true);
    const size = dv.getUint32(at + 24, true);
    const nameLen = dv.getUint16(at + 28, true);
    const localAt = dv.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    expect(dv.getUint32(localAt, true)).toBe(0x04034b50);
    const dataAt = localAt + 30 + dv.getUint16(localAt + 26, true) + dv.getUint16(localAt + 28, true);
    const data = bytes.subarray(dataAt, dataAt + size);
    expect(nodeCrc32(data)).toBe(crc); // CRC Node'ning o'zi bilan mos
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLen;
  }
  return out;
}

describe('xlsx yordamchilari', () => {
  it('crc32 Node zlib bilan bir xil (UTF-8 ham)', () => {
    const data = new TextEncoder().encode('Hisobot — Ofitsiant ёў');
    expect(crc32(data)).toBe(nodeCrc32(data));
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('columnLetter: A, Z, AA, AB', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('xmlEscape maxsus belgilarni qochiradi va boshqaruv belgilarini olib tashlaydi', () => {
    expect(xmlEscape('a<b>&"c"\u0001\u0008x')).toBe('a&lt;b&gt;&amp;&quot;c&quot;x');
  });

  it('safeSheetNames: taqiqlangan belgilar, uzunlik va takrorlar', () => {
    const [a, b, c, d] = safeSheetNames(['Savdo/2026:[1]', 'x'.repeat(40), 'Xulosa', 'xulosa']);
    expect(a).toBe('Savdo 2026 1');
    expect(b).toHaveLength(31);
    expect(c).toBe('Xulosa');
    expect(d).toBe('xulosa (2)');
    expect(safeSheetNames([''])[0]).toBe('Varaq1');
  });

  it('toBase64 Buffer bilan bir xil (har xil uzunlikda qoldiq)', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 100]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 255);
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });

  it('zipStore: fayllar o\'qiladi, nomi UTF-8', () => {
    const zip = zipStore([
      { name: 'a.txt', data: new TextEncoder().encode('salom') },
      { name: 'papka/ё.txt', data: new TextEncoder().encode('') },
    ]);
    expect(readZip(zip)).toEqual({ 'a.txt': 'salom', 'papka/ё.txt': '' });
  });
});

describe('buildXlsx', () => {
  const sheets = [
    {
      name: 'Xulosa',
      widths: [20, 12],
      freezeRows: 1,
      rows: [
        [{ v: 'Nom', s: 'header' as const }, { v: 'Summa', s: 'header' as const }],
        ['Osh <katta> & "qo\'shimcha"', { v: 125000.5, s: 'money' as const }],
        ['Bo\'sh', null],
        [],
        ['NaN', Number.NaN],
      ],
    },
    { name: 'Ikkinchi', rows: [['x', 1]] },
  ];

  it('to\'g\'ri OOXML qismlari bor va zip butun', () => {
    const files = readZip(buildXlsx(sheets, new Date(2026, 10, 21, 10, 30, 0)));
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    expect(files['xl/workbook.xml']).toContain('<sheet name="Xulosa" sheetId="1" r:id="rId1"/>');
    expect(files['xl/workbook.xml']).toContain('name="Ikkinchi"');
    expect(files['[Content_Types].xml']).toContain('/xl/worksheets/sheet2.xml');
    expect(files['xl/_rels/workbook.xml.rels']).toContain('Id="rId3"'); // styles = varaqlardan keyin
  });

  it('katak qiymatlari: matn qochirilgan, son xom, uslub, bo\'sh va NaN o\'tkazib yuboriladi', () => {
    const sheet = readZip(buildXlsx(sheets))['xl/worksheets/sheet1.xml']!;
    expect(sheet).toContain('<c r="A1" s="2" t="inlineStr"><is><t xml:space="preserve">Nom</t></is></c>');
    expect(sheet).toContain('Osh &lt;katta&gt; &amp; &quot;qo\'shimcha&quot;');
    expect(sheet).toContain('<c r="B2" s="3"><v>125000.5</v></c>');
    expect(sheet).not.toContain('r="B3"'); // null, uslubsiz - katak yo'q
    expect(sheet).not.toContain('<row r="4"'); // bo'sh qator yozilmaydi
    expect(sheet).not.toContain('NaN</v>');
    expect(sheet).toContain('<cols><col min="1" max="1" width="20" customWidth="1"/>');
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
  });

  it('varaqsiz xato beradi', () => {
    expect(() => buildXlsx([])).toThrow();
  });

  it('XLSX_OUT berilsa fayl yozadi (tashqi dasturda ochib tekshirish uchun)', () => {
    if (process.env.XLSX_OUT) writeFileSync(process.env.XLSX_OUT, buildXlsx(sheets));
  });
});
