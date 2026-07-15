/**
 * js/cetak-word.js  (v2 — menggunakan docxtemplater untuk keandalan)
 *
 * Alur kerja:
 * 1. Load PizZip + docxtemplater dari CDN
 * 2. docxtemplater mengganti placeholder TEKS secara aman (menangani fragmentasi XML)
 * 3. Untuk {TABLE_PENILAIAN}: diganti sentinal → cari sentinal di XML → inject <w:tbl>
 * 4. Output uint8array → Blob → download
 *
 * Placeholder yang dikenali di template.docx:
 *   {JUDUL_PENILAIAN}      {NAMA_PESERTA}   {NIP_PESERTA}
 *   {UNIT_KERJA_PESERTA}   {TABLE_PENILAIAN} {NAMA_PANITIA_PENILAI}
 */

const TEMPLATE_URL = './template_dok_penilai/template.docx';

// Sentinel unik yang akan dipakai docxtemplater untuk TABLE_PENILAIAN,
// lalu kita ganti manual di XML setelah render
const TABLE_SENTINEL = 'XXTABLESENTINELXX';

const INDIKATOR_LABELS = [
  'Proporsi Halaman',
  'Penggunaan Referensi dan Peraturan Perundang-undangan',
  'Cakupan Strategi / Rencana Aksi',
  'Proporsi Data yang digunakan',
  'Usul Kelayakan Rekomendasi',
  'Penyelesaian Makalah',
  'Kelayakan Teknis Tulisan',
  'Ketajaman Isi Makalah dan Kekuatan Argumentasi',
];

// ── CDN loader ───────────────────────────────────────────────────────────────
let _pizzipPromise     = null;
let _docxtmpPromise    = null;

function _loadScript(src, globalKey) {
  if (window[globalKey]) return Promise.resolve(window[globalKey]);
  return new Promise((resolve, reject) => {
    const s   = document.createElement('script');
    s.src     = src;
    s.onload  = () => resolve(window[globalKey]);
    s.onerror = () => reject(new Error(`Gagal memuat ${src}`));
    document.head.appendChild(s);
  });
}

async function loadLibs() {
  if (!_pizzipPromise) {
    _pizzipPromise = _loadScript(
      'https://cdn.jsdelivr.net/npm/pizzip@3.1.4/dist/pizzip.js',
      'PizZip'
    );
  }
  if (!_docxtmpPromise) {
    _docxtmpPromise = _loadScript(
      'https://cdn.jsdelivr.net/npm/docxtemplater@3.48.0/build/docxtemplater.js',
      'docxtemplater'
    );
  }
  const [PizZip, Docxtemplater] = await Promise.all([_pizzipPromise, _docxtmpPromise]);
  return { PizZip, Docxtemplater };
}

// ── XML helper ───────────────────────────────────────────────────────────────
function xmlEsc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── OOXML table builder ──────────────────────────────────────────────────────
/**
 * Menghasilkan OOXML <w:tbl> yang sesuai dengan struktur
 * template_dok_penilai/table_penilaian_*.html
 *
 * Header 2-baris:
 *   Baris 1: NO (rowspan2) | INDIKATOR PENILAIAN (rowspan2) | NILAI (colspan3)
 *   Baris 2: -            | -                              | SM(5) | M(4) | KM(2)
 *
 * Kolom (total ~9000 twip = A4 margin normal):
 *   NO:560 | INDIKATOR:4480 | 3×VAL:1320
 *
 * Baris-5 (Usul Kelayakan) height 1700twip = ~3cm sesuai HTML height:120px
 */
function buildTableOoxml(indikatorData, jumlah) {
  const W_NO  = 560;
  const W_IND = 4480;
  const W_VAL = 1320;

  // Borders setiap sel
  const BORDERS = `<w:tcBorders>
    <w:top    w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:left   w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:right  w:val="single" w:sz="4" w:space="0" w:color="000000"/>
  </w:tcBorders>`;

  const GREY = `<w:shd w:val="clear" w:color="auto" w:fill="D3D3D3"/>`;

  // ── Atom builders ──────────────────────────────────────────────────────────
  const tcPr = (w, extra = '') =>
    `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${BORDERS}${extra}</w:tcPr>`;

  const para = (runs, center = false) =>
    `<w:p>${center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ''}<w:r>${runs}</w:r></w:p>`;

  const boldRun = txt =>
    `<w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">${xmlEsc(txt)}</w:t>`;

  const normalRun = txt =>
    `<w:t xml:space="preserve">${xmlEsc(txt)}</w:t>`;

  const checkRun = (val, target) =>
    val === target
      ? `<w:rPr><w:b/></w:rPr><w:t>&#10003;</w:t>`
      : `<w:t xml:space="preserve"> </w:t>`;

  const emptyPara = () => `<w:p><w:pPr/></w:p>`;

  // ── Tabel properties ───────────────────────────────────────────────────────
  const tblPr = `<w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top    w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:left   w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:right  w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    </w:tblBorders>
  </w:tblPr>`;

  const tblGrid = `<w:tblGrid>
    <w:gridCol w:w="${W_NO}"/>
    <w:gridCol w:w="${W_IND}"/>
    <w:gridCol w:w="${W_VAL}"/>
    <w:gridCol w:w="${W_VAL}"/>
    <w:gridCol w:w="${W_VAL}"/>
  </w:tblGrid>`;

  // ── Header baris 1 ─────────────────────────────────────────────────────────
  // NO + INDIKATOR dengan vMerge restart; NILAI dengan gridSpan=3
  const hRow1 = `<w:tr>
    <w:trPr><w:tblHeader/></w:trPr>
    <w:tc>${tcPr(W_NO, `<w:vMerge w:val="restart"/>${GREY}`)}${para(boldRun('NO'), true)}</w:tc>
    <w:tc>${tcPr(W_IND, `<w:vMerge w:val="restart"/>${GREY}`)}${para(boldRun('INDIKATOR PENILAIAN'), true)}</w:tc>
    <w:tc>${tcPr(W_VAL * 3, `<w:gridSpan w:val="3"/>${GREY}`)}${para(boldRun('NILAI'), true)}</w:tc>
  </w:tr>`;

  // ── Header baris 2 ─────────────────────────────────────────────────────────
  // NO + INDIKATOR: vMerge (continuation); 3 sub-header nilai
  const hRow2 = `<w:tr>
    <w:trPr><w:tblHeader/></w:trPr>
    <w:tc>${tcPr(W_NO, `<w:vMerge/>${GREY}`)}${emptyPara()}</w:tc>
    <w:tc>${tcPr(W_IND, `<w:vMerge/>${GREY}`)}${emptyPara()}</w:tc>
    <w:tc>${tcPr(W_VAL, GREY)}${para(boldRun('Sangat Memadai (5)'), true)}</w:tc>
    <w:tc>${tcPr(W_VAL, GREY)}${para(boldRun('Memadai (4)'), true)}</w:tc>
    <w:tc>${tcPr(W_VAL, GREY)}${para(boldRun('Kurang Memadai (2)'), true)}</w:tc>
  </w:tr>`;

  // ── Baris data 1–8 ─────────────────────────────────────────────────────────
  // Baris ke-5 (Usul Kelayakan Rekomendasi) memiliki tinggi ekstra: 1700 twip
  let dataRows = '';
  INDIKATOR_LABELS.forEach((label, idx) => {
    const num  = idx + 1;
    const val  = parseInt(indikatorData[`i${num}`] ?? 0);
    const trPr = num === 5
      ? `<w:trPr><w:trHeight w:val="1700" w:hRule="atLeast"/></w:trPr>`
      : '';

    dataRows += `<w:tr>
      ${trPr}
      <w:tc>${tcPr(W_NO)}${para(normalRun(String(num)), true)}</w:tc>
      <w:tc>${tcPr(W_IND)}${para(normalRun(label))}</w:tc>
      <w:tc>${tcPr(W_VAL)}${para(checkRun(val, 5), true)}</w:tc>
      <w:tc>${tcPr(W_VAL)}${para(checkRun(val, 4), true)}</w:tc>
      <w:tc>${tcPr(W_VAL)}${para(checkRun(val, 2), true)}</w:tc>
    </w:tr>`;
  });

  // ── Baris JUMLAH ───────────────────────────────────────────────────────────
  // Kolom 1+2 digabung untuk label JUMLAH; kolom 3+4+5 digabung untuk nilai
  const jumlahRow = `<w:tr>
    <w:tc>${tcPr(W_NO + W_IND, '<w:gridSpan w:val="2"/>')}${para(boldRun('JUMLAH'), true)}</w:tc>
    <w:tc>${tcPr(W_VAL * 3, '<w:gridSpan w:val="3"/>')}${para(boldRun(String(jumlah ?? 0)))}</w:tc>
  </w:tr>`;

  return `<w:tbl>${tblPr}${tblGrid}${hRow1}${hRow2}${dataRows}${jumlahRow}</w:tbl>`;
}

// ── Main export ──────────────────────────────────────────────────────────────
/**
 * @param {Object} params
 * @param {string} params.judulPenilaian
 * @param {string} params.namaPeserta
 * @param {string} params.nipPeserta
 * @param {string} params.unitKerja
 * @param {Object} params.indikator        { i1..i8: nilai }
 * @param {number} params.jumlah
 * @param {string} params.namaPanitia
 * @param {string} [params.filename]
 */
export async function generateWordDoc(params) {
  const { judulPenilaian, namaPeserta, nipPeserta, unitKerja,
          indikator, jumlah, namaPanitia, filename } = params;

  // 1. Muat library
  const { PizZip, Docxtemplater } = await loadLibs();

  // 2. Ambil template.docx
  const resp = await fetch(TEMPLATE_URL);
  if (!resp.ok) throw new Error(`Gagal memuat template.docx (HTTP ${resp.status})`);
  const buf = await resp.arrayBuffer();

  // 3. Buka dengan PizZip
  const zip = new PizZip(buf);

  // 4. Gunakan docxtemplater untuk mengganti placeholder TEKS
  //    (docxtemplater menangani fragmentasi XML secara internal)
  //    TABLE_PENILAIAN → sentinal unik, akan diganti manual setelah render
  const doc = new Docxtemplater(zip, {
    paragraphLoop : true,
    linebreaks    : true,
    // nullGetter memastikan placeholder tak dikenal tidak menyebabkan error
    nullGetter    : (part) => {
      if (!part.module && part.value === 'TABLE_PENILAIAN') return TABLE_SENTINEL;
      return '';
    },
  });

  doc.render({
    JUDUL_PENILAIAN    : judulPenilaian,
    NAMA_PESERTA       : namaPeserta,
    NIP_PESERTA        : nipPeserta     || '-',
    UNIT_KERJA_PESERTA : unitKerja      || '-',
    NAMA_PANITIA_PENILAI: namaPanitia,
    TABLE_PENILAIAN    : TABLE_SENTINEL,  // docxtemplater tulis sentinal ke XML
  });

  // 5. Ambil ZIP hasil render dan inject tabel OOXML
  const outZip = doc.getZip();
  let xml = outZip.file('word/document.xml').asText();

  // Cari paragraf yang mengandung sentinal lalu ganti seluruh <w:p> dengan <w:tbl>
  const tableOoxml = buildTableOoxml(indikator, jumlah);
  const sentinelRe = new RegExp(
    `<w:p\\b[^>]*>[\\s\\S]*?${TABLE_SENTINEL}[\\s\\S]*?<\\/w:p>`
  );

  if (sentinelRe.test(xml)) {
    xml = xml.replace(sentinelRe, tableOoxml);
  } else {
    // Fallback: cari {TABLE_PENILAIAN} literal (jika docxtemplater tidak mengganti)
    const literalRe = /<w:p\b[^>]*>[\s\S]*?\{TABLE_PENILAIAN\}[\s\S]*?<\/w:p>/;
    xml = xml.replace(literalRe, tableOoxml);
  }

  outZip.file('word/document.xml', xml);

  // 6. Generate sebagai Uint8Array → Blob (lebih reliable dari type:'blob')
  const uint8 = outZip.generate({
    type        : 'uint8array',
    compression : 'DEFLATE',
  });

  const blob = new Blob([uint8], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  // 7. Download
  const safeFile = (filename || `penilaian-${namaPeserta}`)
    .replace(/[/\\?%*:|"<>]/g, '-').trim();
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = `${safeFile}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
