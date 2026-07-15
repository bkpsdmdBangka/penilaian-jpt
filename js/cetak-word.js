/**
 * js/cetak-word.js
 * Utility untuk menghasilkan dokumen Word (.docx) dari template.docx
 * dengan metode penggantian placeholder {VARIABEL}
 *
 * Placeholder yang dikenali di template.docx:
 *   {JUDUL_PENILAIAN}     - judul lembar penilaian
 *   {NAMA_PESERTA}        - nama kandidat
 *   {NIP_PESERTA}         - NIP kandidat
 *   {UNIT_KERJA_PESERTA}  - unit kerja kandidat
 *   {TABLE_PENILAIAN}     - diganti dengan tabel OOXML 8 indikator
 *   {NAMA_PANITIA_PENILAI}- nama penilai / asesor
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

// ── PizZip lazy loader ──────────────────────────────────────────────────────
let _pizzipReady = null;
function loadPizZip() {
  if (window.PizZip) return Promise.resolve(window.PizZip);
  if (_pizzipReady) return _pizzipReady;
  _pizzipReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/pizzip@3.1.4/dist/pizzip.js';
    s.onload  = () => resolve(window.PizZip);
    s.onerror = () => reject(new Error('Gagal memuat PizZip dari CDN'));
    document.head.appendChild(s);
  });
  return _pizzipReady;
}

// ── XML helpers ─────────────────────────────────────────────────────────────
function xmlEsc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Word sering memecah {PLACEHOLDER} menjadi beberapa <w:r> (run) terpisah.
 * Fungsi ini menggabungkan run-run dalam satu paragraf jika hasil gabungan
 * teks mereka membentuk sebuah placeholder.
 */
function defragmentXml(xml) {
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, para => {
    // Kumpulkan semua teks dari <w:t> dalam paragraf ini
    const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let combined = '', m;
    while ((m = tRe.exec(para)) !== null) combined += m[1];

    // Jika gabungan teks mengandung placeholder, tapi belum ada dalam satu <w:t>
    if (
      /\{[A-Z_]+\}/.test(combined) &&
      !/<w:t[^>]*>[^<]*\{[A-Z_]+\}[^<]*<\/w:t>/.test(para)
    ) {
      const pPr  = para.match(/(<w:pPr>[\s\S]*?<\/w:pPr>)/)?.[1] ?? '';
      const rPr  = para.match(/(<w:rPr>[\s\S]*?<\/w:rPr>)/)?.[1] ?? '';
      const open = para.match(/^(<w:p\b[^>]*>)/)?.[1] ?? '<w:p>';
      return `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEsc(combined)}</w:t></w:r></w:p>`;
    }
    return para;
  });
}

// ── OOXML Table Builder ─────────────────────────────────────────────────────
/**
 * Menghasilkan OOXML <w:tbl> dengan struktur persis seperti
 * template_dok_penilai/table_penilaian_makalah.html (dan paparan.html):
 *
 *  Header baris-1: NO (rowspan 2) | INDIKATOR PENILAIAN (rowspan 2) | NILAI (colspan 3)
 *  Header baris-2:                                                    SM(5) | M(4) | KM(2)
 *  Baris 1–8:      nomor | indikator                                  √ di kolom sesuai nilai
 *  Baris JUMLAH:   (span 2) JUMLAH | (span 3) total jumlah
 *
 * Lebar kolom (TWIPs, total ≈ 9000 = lebar usable A4 margin normal):
 *   NO: 500 | INDIKATOR: 4500 | tiap kolom nilai: 1333
 */
function buildTableOoxml(indikatorData, jumlah) {
  const W_NO  = 500;
  const W_IND = 4500;
  const W_VAL = 1333; // × 3 = 3999, total 9000 - 1 twip

  // Grey fill untuk header
  const HEADER_SHADE = `<w:shd w:val="clear" w:color="auto" w:fill="D3D3D3"/>`;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const tc = (w, content, extra = '') =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${extra}</w:tcPr>${content}</w:tc>`;

  const tcSpan = (w, span, content, extra = '') =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:gridSpan w:val="${span}"/>${extra}</w:tcPr>${content}</w:tc>`;

  const para = (runs, align = 'center') =>
    `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>${runs}</w:p>`;

  const emptyPara = () => `<w:p><w:pPr/></w:p>`;

  const boldRun = txt =>
    `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">${xmlEsc(txt)}</w:t></w:r>`;

  const normalRun = txt =>
    `<w:r><w:t xml:space="preserve">${xmlEsc(txt)}</w:t></w:r>`;

  const checkRun = (val, target) =>
    val === target
      ? `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>&#10003;</w:t></w:r>`
      : `<w:r><w:t xml:space="preserve"> </w:t></w:r>`;

  // ── Table properties ───────────────────────────────────────────────────────
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
    <w:tblLook w:val="0000"/>
  </w:tblPr>`;

  const tblGrid = `<w:tblGrid>
    <w:gridCol w:w="${W_NO}"/>
    <w:gridCol w:w="${W_IND}"/>
    <w:gridCol w:w="${W_VAL}"/>
    <w:gridCol w:w="${W_VAL}"/>
    <w:gridCol w:w="${W_VAL}"/>
  </w:tblGrid>`;

  // ── Header baris 1 ─────────────────────────────────────────────────────────
  const hRow1 = `<w:tr>
    <w:trPr><w:tblHeader/></w:trPr>
    ${tc(W_NO,          para(boldRun('NO')),                  `<w:vMerge w:val="restart"/>${HEADER_SHADE}`)}
    ${tc(W_IND,         para(boldRun('INDIKATOR PENILAIAN')), `<w:vMerge w:val="restart"/>${HEADER_SHADE}`)}
    ${tcSpan(W_VAL * 3, 3, para(boldRun('NILAI')),            HEADER_SHADE)}
  </w:tr>`;

  // ── Header baris 2 ─────────────────────────────────────────────────────────
  const hRow2 = `<w:tr>
    <w:trPr><w:tblHeader/></w:trPr>
    ${tc(W_NO,  emptyPara(), `<w:vMerge/>${HEADER_SHADE}`)}
    ${tc(W_IND, emptyPara(), `<w:vMerge/>${HEADER_SHADE}`)}
    ${tc(W_VAL, para(boldRun('Sangat Memadai (5)')), HEADER_SHADE)}
    ${tc(W_VAL, para(boldRun('Memadai (4)')),        HEADER_SHADE)}
    ${tc(W_VAL, para(boldRun('Kurang Memadai (2)')), HEADER_SHADE)}
  </w:tr>`;

  // ── Baris data indikator 1–8 ───────────────────────────────────────────────
  // Baris ke-5 (Usul Kelayakan Rekomendasi) memiliki tinggi ekstra,
  // sesuai template HTML: height:120px ≈ 1700 twips
  let dataRows = '';
  INDIKATOR_LABELS.forEach((label, idx) => {
    const num  = idx + 1;
    const val  = parseInt(indikatorData[`i${num}`] ?? 0);
    const trPr = num === 5
      ? `<w:trPr><w:trHeight w:val="1700" w:hRule="atLeast"/></w:trPr>`
      : '';

    dataRows += `<w:tr>
      ${trPr}
      ${tc(W_NO,  para(normalRun(String(num)), 'center'))}
      ${tc(W_IND, para(normalRun(label), 'left'))}
      ${tc(W_VAL, para(checkRun(val, 5), 'center'))}
      ${tc(W_VAL, para(checkRun(val, 4), 'center'))}
      ${tc(W_VAL, para(checkRun(val, 2), 'center'))}
    </w:tr>`;
  });

  // ── Baris JUMLAH ──────────────────────────────────────────────────────────
  const jumlahRow = `<w:tr>
    ${tcSpan(W_NO + W_IND, 2, para(boldRun('JUMLAH'), 'center'))}
    ${tcSpan(W_VAL * 3,    3, para(boldRun(String(jumlah)), 'left'))}
  </w:tr>`;

  return `<w:tbl>${tblPr}${tblGrid}${hRow1}${hRow2}${dataRows}${jumlahRow}</w:tbl>`;
}

// ── Main export ─────────────────────────────────────────────────────────────
/**
 * Menghasilkan file Word (.docx) dari template dan mengunduhnya.
 *
 * @param {Object} params
 * @param {string} params.judulPenilaian   - nilai {JUDUL_PENILAIAN}
 * @param {string} params.namaPeserta      - nilai {NAMA_PESERTA}
 * @param {string} params.nipPeserta       - nilai {NIP_PESERTA}
 * @param {string} params.unitKerja        - nilai {UNIT_KERJA_PESERTA}
 * @param {Object} params.indikator        - { i1..i8: nilai } untuk tabel
 * @param {number} params.jumlah           - total skor
 * @param {string} params.namaPanitia      - nilai {NAMA_PANITIA_PENILAI}
 * @param {string} [params.filename]       - nama file download (opsional)
 */
export async function generateWordDoc(params) {
  const {
    judulPenilaian,
    namaPeserta,
    nipPeserta,
    unitKerja,
    indikator,
    jumlah,
    namaPanitia,
    filename,
  } = params;

  // 1. Muat PizZip
  const PizZip = await loadPizZip();

  // 2. Ambil template.docx
  const resp = await fetch(TEMPLATE_URL);
  if (!resp.ok) throw new Error(`Gagal memuat template.docx (HTTP ${resp.status})`);
  const buf = await resp.arrayBuffer();

  // 3. Buka sebagai ZIP
  const zip = new PizZip(buf);

  // 4. Ambil XML dokumen utama
  let xml = zip.file('word/document.xml').asText();

  // 5. Perbaiki fragmentasi placeholder lintas run
  xml = defragmentXml(xml);

  // 6. Ganti placeholder teks sederhana
  const replacePH = (key, val) => {
    xml = xml.split(`{${key}}`).join(xmlEsc(val));
  };
  replacePH('JUDUL_PENILAIAN',    judulPenilaian);
  replacePH('NAMA_PESERTA',       namaPeserta);
  replacePH('NIP_PESERTA',        nipPeserta || '-');
  replacePH('UNIT_KERJA_PESERTA', unitKerja  || '-');
  replacePH('NAMA_PANITIA_PENILAI', namaPanitia);

  // 7. Ganti placeholder {TABLE_PENILAIAN}:
  //    Cari <w:p> yang mengandung placeholder tersebut, ganti seluruh
  //    paragraf dengan elemen <w:tbl> OOXML
  const tableOoxml = buildTableOoxml(indikator, jumlah);
  xml = xml.replace(
    /<w:p[ >][\s\S]*?\{TABLE_PENILAIAN\}[\s\S]*?<\/w:p>/,
    tableOoxml
  );

  // 8. Simpan XML yang sudah dimodifikasi
  zip.file('word/document.xml', xml);

  // 9. Hasilkan blob dan trigger download
  const blob = zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });

  const safeFilename = (filename || `penilaian-${namaPeserta}`).replace(/[^a-zA-Z0-9 _\-]/g, '');
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `${safeFilename}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
