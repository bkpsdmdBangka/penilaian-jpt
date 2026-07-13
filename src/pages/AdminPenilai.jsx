import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import AdminNavbar from '../components/AdminNavbar';

// Get app domain
const APP_DOMAIN = window.location.origin;

// Modal: Tambah Penilai Baru
function TambahPenilaiModal({ kandidatList, onClose, onSuccess }) {
  const [nama, setNama] = useState('');
  const [selectedKandidat, setSelectedKandidat] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const toggleKandidat = (id) => {
    setSelectedKandidat(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nama.trim()) { setError('Nama penilai wajib diisi.'); return; }
    if (selectedKandidat.length === 0) { setError('Pilih minimal 1 kandidat.'); return; }
    setSaving(true);
    setError('');
    try {
      const genFn = httpsCallable(functions, 'generatePenilaiToken');
      const res = await genFn({ namaPenilai: nama.trim(), assignedKandidat: selectedKandidat });
      setResult(res.data);
    } catch (err) {
      setError(err.message || 'Gagal membuat token.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (result) {
    const link = `${APP_DOMAIN}/nilai?token=${result.token}`;
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>✅ Token Berhasil Dibuat!</h2>
            <button className="modal-close" onClick={() => { onSuccess(); onClose(); }}>✕</button>
          </div>
          <div className="alert alert-success mb-4">
            <span className="alert-icon">🎉</span>
            Token untuk <strong>{nama}</strong> telah dibuat. Kirimkan link berikut kepada penilai.
          </div>
          <div className="form-group">
            <label className="form-label">Token</label>
            <div className="flex gap-2">
              <div className="token-display" style={{ flex: 1 }}>{result.token}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(result.token)} id="btn-copy-token">
                📋
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Link Penilaian (kirim ke penilai)</label>
            <div className="flex gap-2">
              <div className="link-display">{link}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(link)} id="btn-copy-link">
                📋
              </button>
            </div>
          </div>
          <button className="btn btn-primary btn-block" onClick={() => { onSuccess(); onClose(); }} id="btn-selesai-tambah-penilai">
            Selesai
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>➕ Tambah Penilai</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} id="form-tambah-penilai">
          <div className="form-group">
            <label className="form-label">Nama Penilai *</label>
            <input
              className="form-input"
              placeholder="Nama lengkap penilai/juri"
              value={nama}
              onChange={e => setNama(e.target.value)}
              required
              id="input-nama-penilai"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Kandidat yang Dinilai *</label>
            {kandidatList.length === 0 ? (
              <div className="alert alert-warning">
                <span className="alert-icon">⚠️</span>
                Belum ada kandidat. Tambahkan kandidat terlebih dahulu.
              </div>
            ) : (
              <div className="checkbox-grid">
                {kandidatList.map(k => (
                  <div key={k.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      id={`chk-${k.id}`}
                      checked={selectedKandidat.includes(k.id)}
                      onChange={() => toggleKandidat(k.id)}
                    />
                    <label htmlFor={`chk-${k.id}`}>{k.nama}</label>
                  </div>
                ))}
              </div>
            )}
            <div className="form-hint" style={{ marginTop: '0.5rem' }}>
              {selectedKandidat.length} kandidat dipilih
            </div>
          </div>
          {error && <div className="alert alert-error"><span className="alert-icon">⚠️</span>{error}</div>}
          <div className="flex gap-3" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving || kandidatList.length === 0} id="btn-generate-token">
              {saving ? <><div className="spinner spinner-sm" /> Membuat Token...</> : '🗝️ Generate Token'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPenilai({ user }) {
  const [penilaiList, setPenilaiList] = useState([]);
  const [kandidatList, setKandidatList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [copied, setCopied] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pSnap, kSnap] = await Promise.all([
        getDocs(collection(db, 'penilai')),
        getDocs(query(collection(db, 'kandidat'), orderBy('nama'))),
      ]);
      setPenilaiList(pSnap.docs.map(d => ({ token: d.id, ...d.data() })));
      setKandidatList(kSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (token, nama) => {
    if (!window.confirm(`Hapus penilai "${nama}" dan tokennya? Penilaian yang sudah masuk tidak akan terhapus.`)) return;
    setDeleting(token);
    try {
      await deleteDoc(doc(db, 'penilai', token));
      setPenilaiList(prev => prev.filter(p => p.token !== token));
    } finally {
      setDeleting(null);
    }
  };

  const handleCopyLink = (token) => {
    const link = `${APP_DOMAIN}/nilai?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const kandidatMap = {};
  kandidatList.forEach(k => { kandidatMap[k.id] = k.nama; });

  return (
    <>
      <AdminNavbar user={user} />
      <div className="page-wrapper">
        <div className="container">
          <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1>Kelola Penilai & Token</h1>
              <p>Generate token unik untuk setiap penilai dan kirim link penilaian</p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
              id="btn-tambah-penilai"
            >
              ➕ Tambah Penilai
            </button>
          </div>

          <div className="alert alert-info mb-6" style={{ marginBottom: '1.5rem' }}>
            <span className="alert-icon">💡</span>
            <div>
              <strong>Cara penggunaan:</strong> Generate token untuk tiap penilai, lalu kirimkan link penilaian lewat WhatsApp/email. Penilai tidak perlu login — cukup buka link tersebut.
            </div>
          </div>

          {loading ? (
            <div className="loading-center">
              <div className="spinner" />
              <span>Memuat data penilai...</span>
            </div>
          ) : penilaiList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🗝️</div>
              <h3>Belum Ada Penilai</h3>
              <p>Klik "Tambah Penilai" untuk generate token pertama.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {penilaiList.map(p => {
                const link = `${APP_DOMAIN}/nilai?token=${p.token}`;
                const assignedNames = (p.assignedKandidat || []).map(id => kandidatMap[id] || id);
                const selesaiCount = Object.values(p.sudahMenilai || {}).filter(Boolean).length;
                const totalAssigned = (p.assignedKandidat || []).length;

                return (
                  <div key={p.token} className="card">
                    <div className="flex items-center gap-3" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <div style={{
                        width: '44px', height: '44px',
                        background: 'var(--gradient-primary)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.3rem', flexShrink: 0
                      }}>👨‍💼</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{p.namaPenilai}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {selesaiCount}/{totalAssigned} kandidat sudah dinilai
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {selesaiCount === totalAssigned && totalAssigned > 0
                          ? <span className="badge badge-success">✅ Selesai</span>
                          : <span className="badge badge-warning">⏳ Proses</span>
                        }
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(p.token, p.namaPenilai)}
                          disabled={deleting === p.token}
                          id={`btn-delete-penilai-${p.token}`}
                        >
                          {deleting === p.token ? <div className="spinner spinner-sm" /> : '🗑️'}
                        </button>
                      </div>
                    </div>

                    {/* Token & Link */}
                    <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>TOKEN</div>
                        <div className="token-display">{p.token}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>LINK PENILAIAN</div>
                        <div className="flex gap-2">
                          <div className="link-display" style={{ flex: 1 }}>{link}</div>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleCopyLink(p.token)}
                            id={`btn-copy-link-${p.token}`}
                          >
                            {copied === p.token ? '✅ Disalin!' : '📋 Copy'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Assigned kandidat */}
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                        KANDIDAT YANG DINILAI ({totalAssigned})
                      </div>
                      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                        {assignedNames.map((nama, i) => {
                          const kidId = p.assignedKandidat[i];
                          const sudah = p.sudahMenilai?.[kidId];
                          return (
                            <span key={i} className={`badge ${sudah ? 'badge-success' : 'badge-secondary'}`}>
                              {sudah ? '✅' : '⏳'} {nama}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <TambahPenilaiModal
          kandidatList={kandidatList}
          onClose={() => setShowModal(false)}
          onSuccess={loadData}
        />
      )}
    </>
  );
}
