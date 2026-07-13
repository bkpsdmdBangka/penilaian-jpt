import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

// 8 indikator penilaian
const INDIKATOR = [
  'Proporsi Halaman',
  'Penggunaan Referensi dan Peraturan Perundang-undangan',
  'Cakupan Strategi / Rencana Aksi',
  'Proporsi Data yang digunakan',
  'Usul Kelayakan Rekomendasi',
  'Penyelesaian Makalah',
  'Kelayakan Teknis Tulisan',
  'Ketajaman Isi Makalah dan Kekuatan Argumentasi',
];

const NILAI_OPTIONS = [
  { value: 5, label: 'Sangat memadai', short: 'Sangat Memadai' },
  { value: 4, label: 'Memadai', short: 'Memadai' },
  { value: 2, label: 'Kurang memadai', short: 'Kurang Memadai' },
];

// Extract Google Drive FILE_ID from share URL
function extractDriveFileId(url) {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([^/]+)/);
  return match ? match[1] : null;
}

// PDF Preview component
function PdfPreview({ linkMakalahDrive, kandidatNama }) {
  const fileId = extractDriveFileId(linkMakalahDrive);
  const previewUrl = fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;

  if (!linkMakalahDrive) return null;

  return (
    <div className="pdf-preview-wrapper mb-4">
      <div className="pdf-preview-header">
        <span>📄 Makalah: <strong>{kandidatNama}</strong></span>
        <a
          href={linkMakalahDrive}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm"
        >
          🔗 Buka di Tab Baru
        </a>
      </div>
      {previewUrl ? (
        <iframe
          src={previewUrl}
          className="pdf-preview-iframe"
          title={`Makalah ${kandidatNama}`}
          allow="autoplay"
        />
      ) : (
        <div className="p-4 text-center text-muted" style={{ padding: '1.5rem' }}>
          <p style={{ marginBottom: '0.75rem' }}>
            ⚠️ Link tidak sesuai format Google Drive standar. Gunakan tombol di atas untuk membuka makalah.
          </p>
        </div>
      )}
    </div>
  );
}

// Form penilaian 1 kandidat
function FormPenilaian({ kandidat, token, onSuccess }) {
  const [indikator, setIndikator] = useState({
    i1: null, i2: null, i3: null, i4: null,
    i5: null, i6: null, i7: null, i8: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const jumlah = Object.values(indikator).reduce((s, v) => s + (v || 0), 0);
  const nilai20 = jumlah > 0 ? ((jumlah / 40) * 100 * 0.2).toFixed(2) : '0.00';
  const allFilled = Object.values(indikator).every(v => v !== null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allFilled) {
      setError('Harap isi semua 8 indikator sebelum menyimpan.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const submitFn = httpsCallable(functions, 'submitPenilaian');
      await submitFn({ token, kandidatId: kandidat.id, indikator });
      onSuccess(kandidat.id);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PdfPreview linkMakalahDrive={kandidat.linkMakalahDrive} kandidatNama={kandidat.nama} />

      {INDIKATOR.map((label, idx) => {
        const key = `i${idx + 1}`;
        return (
          <div key={key} className="indikator-row">
            <div className="indikator-label">
              <span className="indikator-num">{idx + 1}</span>
              {label}
            </div>
            <div className="radio-group">
              {NILAI_OPTIONS.map(opt => (
                <div key={opt.value} className={`radio-option score-${opt.value}`}>
                  <input
                    type="radio"
                    id={`${kandidat.id}-${key}-${opt.value}`}
                    name={`${kandidat.id}-${key}`}
                    value={opt.value}
                    checked={indikator[key] === opt.value}
                    onChange={() => setIndikator(prev => ({ ...prev, [key]: opt.value }))}
                  />
                  <label htmlFor={`${kandidat.id}-${key}-${opt.value}`}>
                    <span className="score-badge">{opt.value}</span>
                    {opt.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Score preview */}
      <div className="score-summary">
        <div className="score-item">
          <div className="label">Total Skor</div>
          <div className="value">{jumlah}<span style={{ fontSize: '0.9rem', opacity: 0.5 }}>/40</span></div>
        </div>
        <div className="score-item">
          <div className="label">Nilai Makalah (20%)</div>
          <div className="value">{nilai20}</div>
        </div>
        <div className="score-item">
          <div className="label">Indikator Terisi</div>
          <div className="value">{Object.values(indikator).filter(Boolean).length}<span style={{ fontSize: '0.9rem', opacity: 0.5 }}>/8</span></div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error mt-3">
          <span className="alert-icon">⚠️</span>
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary btn-lg btn-block mt-4"
        disabled={submitting || !allFilled}
        id={`submit-penilaian-${kandidat.id}`}
      >
        {submitting ? (
          <><div className="spinner spinner-sm" /> Menyimpan...</>
        ) : (
          <>💾 Simpan Penilaian {kandidat.nama}</>
        )}
      </button>
    </form>
  );
}

// Kandidat card (dinilai / belum)
function KandidatCard({ kandidat, token, sudahDinilai, onSuccess }) {
  const [expanded, setExpanded] = useState(!sudahDinilai);

  return (
    <div className="kandidat-section animate-slide-up">
      <div className="kandidat-header" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <div className="kandidat-avatar">👤</div>
        <div className="kandidat-info" style={{ flex: 1 }}>
          <h3>{kandidat.nama}</h3>
          <p>NIP: {kandidat.nip || '—'} &nbsp;|&nbsp; {kandidat.unitKerja || '—'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {sudahDinilai ? (
            <span className="badge badge-success">✅ Sudah Dinilai</span>
          ) : (
            <span className="badge badge-warning">⏳ Belum Dinilai</span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="kandidat-body">
          {sudahDinilai ? (
            <div className="alert alert-success">
              <span className="alert-icon">✅</span>
              <div>
                <strong>Penilaian telah tersimpan.</strong>
                <p style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
                  Anda tidak dapat mengubah penilaian yang sudah dikirim.
                </p>
              </div>
            </div>
          ) : (
            <FormPenilaian
              kandidat={kandidat}
              token={token}
              onSuccess={onSuccess}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Main page
export default function NilaiPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('loading'); // loading | invalid | valid | error
  const [penilaiData, setPenilaiData] = useState(null);
  const [kandidatList, setKandidatList] = useState([]);
  const [sudahMenilai, setSudahMenilai] = useState({});

  const loadData = useCallback(async () => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    try {
      // Validate token
      const penilaiRef = doc(db, 'penilai', token);
      const penilaiSnap = await getDoc(penilaiRef);

      if (!penilaiSnap.exists()) {
        setStatus('invalid');
        return;
      }

      const penilaiDoc = penilaiSnap.data();
      setPenilaiData(penilaiDoc);
      setSudahMenilai(penilaiDoc.sudahMenilai || {});

      // Fetch assigned kandidat
      const assigned = penilaiDoc.assignedKandidat || [];
      if (assigned.length === 0) {
        setKandidatList([]);
        setStatus('valid');
        return;
      }

      // Fetch each kandidat
      const kandidatDocs = await Promise.all(
        assigned.map(id => getDoc(doc(db, 'kandidat', id)))
      );

      const list = kandidatDocs
        .filter(s => s.exists())
        .map(s => ({ id: s.id, ...s.data() }));

      setKandidatList(list);
      setStatus('valid');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSuccess = (kandidatId) => {
    setSudahMenilai(prev => ({ ...prev, [kandidatId]: true }));
  };

  const totalAssigned = kandidatList.length;
  const totalSelesai = Object.values(sudahMenilai).filter(Boolean).length;

  // ── RENDER STATES ──

  if (status === 'loading') {
    return (
      <div className="loading-center" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <span>Memvalidasi token...</span>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔒</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--danger)' }}>
            Token Tidak Valid
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Token yang Anda gunakan tidak ditemukan atau sudah tidak aktif.<br />
            Hubungi panitia untuk mendapatkan link penilaian yang valid.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="loading-center" style={{ minHeight: '100vh' }}>
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <h2>Terjadi Kesalahan</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Gagal memuat data. Periksa koneksi internet Anda.</p>
        <button className="btn btn-secondary" onClick={loadData}>Coba Lagi</button>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <div className="container" style={{ maxWidth: '760px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            width: '72px', height: '72px',
            background: 'var(--gradient-primary)',
            borderRadius: 'var(--radius-xl)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem', margin: '0 auto 1rem',
            boxShadow: '0 8px 32px rgba(59,130,246,0.3)'
          }}>
            📋
          </div>
          <h1 style={{
            fontSize: 'clamp(1.3rem, 3vw, 1.75rem)',
            fontWeight: 800,
            background: 'var(--gradient-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '0.5rem'
          }}>
            Form Penilaian Makalah
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Seleksi Terbuka Jabatan Pimpinan Tinggi Pratama
          </p>
        </div>

        {/* Penilai info card */}
        <div className="card mb-6" style={{ marginBottom: '2rem' }}>
          <div className="flex items-center gap-3">
            <div style={{
              width: '48px', height: '48px',
              background: 'rgba(59,130,246,0.15)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem', flexShrink: 0
            }}>
              👨‍💼
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                Selamat datang, Penilai:
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{penilaiData?.namaPenilai}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Progress</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: totalSelesai === totalAssigned && totalAssigned > 0 ? '#34d399' : 'var(--primary-light)' }}>
                {totalSelesai}/{totalAssigned}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>selesai</div>
            </div>
          </div>

          {/* Progress bar */}
          {totalAssigned > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ height: '6px', background: 'var(--glass-border)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${(totalSelesai / totalAssigned) * 100}%`,
                  background: 'var(--gradient-primary)',
                  borderRadius: '999px',
                  transition: 'width 0.5s ease'
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Selesai semua */}
        {totalAssigned > 0 && totalSelesai === totalAssigned && (
          <div className="alert alert-success mb-4" style={{ marginBottom: '2rem' }}>
            <span className="alert-icon">🎉</span>
            <div>
              <strong>Semua penilaian selesai!</strong>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Terima kasih, seluruh kandidat telah Anda nilai. Hasil rekap tersedia di dashboard admin.
              </p>
            </div>
          </div>
        )}

        {/* Kandidat list */}
        {kandidatList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>Tidak Ada Kandidat</h3>
            <p>Belum ada kandidat yang ditugaskan untuk Anda nilai.</p>
          </div>
        ) : (
          kandidatList.map(kandidat => (
            <KandidatCard
              key={kandidat.id}
              kandidat={kandidat}
              token={token}
              sudahDinilai={!!sudahMenilai[kandidat.id]}
              onSuccess={handleSuccess}
            />
          ))
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Panitia Seleksi Terbuka JPT Pratama &copy; {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
