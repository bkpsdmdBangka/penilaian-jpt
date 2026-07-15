/**
 * js/cetak-word.js (Opsi B: Menggunakan Native Table Loop docxtemplater)
 *
 * Alur kerja:
 * 1. Load PizZip + docxtemplater dari CDN
 * 2. docxtemplater akan mencari tag {#indikators} di dalam tabel Word
 *    dan me-loop baris tersebut secara otomatis.
 * 3. Output blob -> download
 */

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

// ── Main export ──────────────────────────────────────────────────────────────
export async function generateWordDoc(params) {
  const { judulPenilaian, namaPeserta, nipPeserta, unitKerja,
          indikator, jumlah, namaPanitia, filename, templateFile } = params;

  const { PizZip, Docxtemplater } = await loadLibs();

  const templateUrl = `./template_dok_penilai/${templateFile || 'template_makalah.docx'}`;
  const resp = await fetch(templateUrl);
  if (!resp.ok) throw new Error(`Gagal memuat ${templateUrl} (HTTP ${resp.status})`);
  const buf = await resp.arrayBuffer();

  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop : true,
    linebreaks    : true,
  });

  // ── Siapkan Array untuk Looping Tabel di Word ──────────────────────────────
  const indikatorArray = INDIKATOR_LABELS.map((label, idx) => {
    const num = idx + 1;
    const val = parseInt(indikator[`i${num}`] ?? 0);
    
    return {
      no: num,
      label: label,
      val5: val === 5 ? 'V' : '',
      val4: val === 4 ? 'V' : '',
      val2: val === 2 ? 'V' : ''
    };
  });

  // ── Render dokumen ─────────────────────────────────────────────────────────
  doc.render({
    JUDUL_PENILAIAN    : judulPenilaian,
    NAMA_PESERTA       : namaPeserta,
    NIP_PESERTA        : nipPeserta     || '-',
    UNIT_KERJA_PESERTA : unitKerja      || '-',
    NAMA_PANITIA_PENILAI: namaPanitia,
    
    // Variabel array untuk me-loop baris tabel
    indikators         : indikatorArray,
    
    // Total jumlah
    jumlah             : jumlah ?? 0
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
