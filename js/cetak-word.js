/**
 * js/cetak-word.js
 *
 * Alur kerja:
 * 1. Load PizZip + docxtemplater dari CDN
 * 2. Modifikasi template untuk mengubah {TABLE_PENILAIAN} menjadi {@TABLE_PENILAIAN}
 *    (tag @ memberitahu docxtemplater untuk menyisipkan raw XML secara aman)
 * 3. docxtemplater mengganti teks & menyisipkan tabel otomatis
 * 4. Output blob -> download
 */

const TEMPLATE_URL = './template_dok_penilai/template.docx';

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

function xmlEsc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── OOXML table builder ──────────────────────────────────────────────────────
function buildTableOoxml(indikatorData, jumlah) {
  const W_NO  = 560;
  const W_IND = 4480;
  const W_VAL = 1320;

  // w:color="000000" lebih aman dan pasti didukung semua versi Word
  const BORDERS = `<w:tcBorders>
    <w:top    w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:left   w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:right  w:val="single" w:sz="4" w:space="0" w:color="000000"/>
  </w:tcBorders>`;

  const GREY = `<w:shd w:val="clear" w:color="auto" w:fill="D3D3D3"/>`;

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
      ? `<w:rPr><w:b/></w:rPr><w:t>V</w:t>`
      : `<w:t xml:space="preserve"> </w:t>`;

  const emptyPara = () => `<w:p/>`;

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

  const hRow1 = `<w:tr>
    <w:trPr><w:tblHeader/></w:trPr>
    <w:tc>${tcPr(W_NO, `<w:vMerge w:val="restart"/>${GREY}`)}${para(boldRun('NO'), true)}</w:tc>
    <w:tc>${tcPr(W_IND, `<w:vMerge w:val="restart"/>${GREY}`)}${para(boldRun('INDIKATOR PENILAIAN'), true)}</w:tc>
    <w:tc>${tcPr(W_VAL * 3, `<w:gridSpan w:val="3"/>${GREY}`)}${para(boldRun('NILAI'), true)}</w:tc>
  </w:tr>`;

  const hRow2 = `<w:tr>
    <w:trPr><w:tblHeader/></w:trPr>
    <w:tc>${tcPr(W_NO, `<w:vMerge/>${GREY}`)}${emptyPara()}</w:tc>
    <w:tc>${tcPr(W_IND, `<w:vMerge/>${GREY}`)}${emptyPara()}</w:tc>
    <w:tc>${tcPr(W_VAL, GREY)}${para(boldRun('Sangat Memadai (5)'), true)}</w:tc>
    <w:tc>${tcPr(W_VAL, GREY)}${para(boldRun('Memadai (4)'), true)}</w:tc>
    <w:tc>${tcPr(W_VAL, GREY)}${para(boldRun('Kurang Memadai (2)'), true)}</w:tc>
  </w:tr>`;

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

  const jumlahRow = `<w:tr>
    <w:tc>${tcPr(W_NO + W_IND, '<w:gridSpan w:val="2"/>')}${para(boldRun('JUMLAH'), true)}</w:tc>
    <w:tc>${tcPr(W_VAL * 3, '<w:gridSpan w:val="3"/>')}${para(boldRun(String(jumlah ?? 0)))}</w:tc>
  </w:tr>`;

  return `<w:tbl>${tblPr}${tblGrid}${hRow1}${hRow2}${dataRows}${jumlahRow}</w:tbl>`;
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function generateWordDoc(params) {
  const { judulPenilaian, namaPeserta, nipPeserta, unitKerja,
          indikator, jumlah, namaPanitia, filename } = params;

  const { PizZip, Docxtemplater } = await loadLibs();

  const resp = await fetch(TEMPLATE_URL);
  if (!resp.ok) throw new Error(`Gagal memuat template.docx (HTTP ${resp.status})`);
  const buf = await resp.arrayBuffer();

  const zip = new PizZip(buf);

  const doc = new Docxtemplater(zip, {
    paragraphLoop : true,
    linebreaks    : true,
  });

  // Render semua variabel, TABLE_PENILAIAN akan dirender sebagai raw XML
  doc.render({
    JUDUL_PENILAIAN    : judulPenilaian,
    NAMA_PESERTA       : namaPeserta,
    NIP_PESERTA        : nipPeserta     || '-',
    UNIT_KERJA_PESERTA : unitKerja      || '-',
    NAMA_PANITIA_PENILAI: namaPanitia,
    TABLE_PENILAIAN    : buildTableOoxml(indikator, jumlah),
  });

  const outZip = doc.getZip();
  const blob = outZip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

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
