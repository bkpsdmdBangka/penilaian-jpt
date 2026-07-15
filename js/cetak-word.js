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
      val5: val === 5 ? '✓' : '',
      val4: val === 4 ? '✓' : '',
      val2: val === 2 ? '✓' : ''
    };
  });

  // ── Siapkan Flat Variables untuk Tabel Statis ──────────────────────────────
  const flatVars = {};
  for (let idx = 0; idx < 8; idx++) {
    const num = idx + 1;
    const val = parseInt(indikator[`i${num}`] ?? 0);
    flatVars[`i${num}_5`] = val === 5 ? '✓' : '';
    flatVars[`i${num}_4`] = val === 4 ? '✓' : '';
    flatVars[`i${num}_2`] = val === 2 ? '✓' : '';
  }

  // ── Variabel khusus Paparan (0-100) ────────────────────────────────────────
  let sumPaparan = 0;
  for (let idx = 0; idx < 7; idx++) {
    const num = idx + 1;
    if (`n${num}` in indikator) {
      const valP = parseInt(indikator[`n${num}`] ?? 0);
      flatVars[`n${num}`] = valP;
      sumPaparan += valP;
      
      let kat = 'Kurang';
      if (valP >= 81) kat = 'Sangat Baik';
      else if (valP >= 71) kat = 'Baik';
      else if (valP >= 60) kat = 'Cukup';
      
      flatVars[`k${num}`] = kat;
    } else {
      flatVars[`n${num}`] = '';
      flatVars[`k${num}`] = '';
    }
  }
  
  if ('n1' in indikator) {
    flatVars['rata'] = (sumPaparan / 7).toFixed(2);
  } else {
    flatVars['rata'] = '';
  }

  // ── Render dokumen ─────────────────────────────────────────────────────────
  doc.render({
    JUDUL_PENILAIAN    : judulPenilaian,
    NAMA_PESERTA       : namaPeserta,
    NIP_PESERTA        : nipPeserta     || '-',
    UNIT_KERJA_PESERTA : unitKerja      || '-',
    NAMA_PANITIA_PENILAI: namaPanitia,
    
    // Variabel array untuk me-loop baris tabel (Opsi Loop)
    indikators         : indikatorArray,
    
    // Variabel flat untuk baris statis (Opsi Statis/Paparan)
    ...flatVars,
    
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
