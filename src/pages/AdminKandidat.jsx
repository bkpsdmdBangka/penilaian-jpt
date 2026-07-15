import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import AdminNavbar from '../components/AdminNavbar';

const EMPTY_FORM = { nama: '', nip: '', unitKerja: '', linkMakalahDrive: '', linkPaparanDrive: '' };

function KandidatModal({ kandidat, onClose, onSave }) {
  const [form, setForm] = useState(kandidat || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');

  const isEdit = !!kandidat;

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === 'linkMakalahDrive') {
      if (value && !value.startsWith('https://drive.google.com/')) {
        setWarn('Peringatan: Link tidak dimulai dengan https://drive.google.com/');
      } else {
        setWarn('');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nama.trim()) { setError('Nama kandidat wajib diisi.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, nama: form.nama.trim() });
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? '✏️ Edit Kandidat' : '➕ Tambah Kandidat'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} id="form-kandidat">
          <div className="form-group">
            <label className="form-label">Nama Kandidat *</label>
            <input
              className="form-input"
              placeholder="Nama lengkap"
              value={form.nama}
              onChange={e => handleChange('nama', e.target.value)}
              required
              id="input-kandidat-nama"
            />
          </div>
          <div className="form-group">
            <label className="form-label">NIP</label>
            <input
              className="form-input"
              placeholder="19xxxxxxxxxxxxxx"
              value={form.nip}
              onChange={e => handleChange('nip', e.target.value)}
              id="input-kandidat-nip"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Unit Kerja / Instansi</label>
            <input
              className="form-input"
              placeholder="Dinas / Badan / Bagian"
              value={form.unitKerja}
              onChange={e => handleChange('unitKerja', e.target.value)}
              id="input-kandidat-unit"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Link Google Drive Makalah (PDF)</label>
            <input
              className="form-input"
              placeholder="https://drive.google.com/file/d/.../view"
              value={form.linkMakalahDrive}
              onChange={e => handleChange('linkMakalahDrive', e.target.value)}
              id="input-kandidat-link"
            />
            {warn && (
              <div className="form-hint" style={{ color: 'var(--warning)' }}>⚠️ {warn}</div>
            )}
            <div className="form-hint">
              Pastikan file Google Drive dibagikan dengan akses "Anyone with the link – Viewer"
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Link Google Drive Paparan (Opsional)</label>
            <input
              className="form-input"
              placeholder="https://drive.google.com/file/d/.../view"
              value={form.linkPaparanDrive}
              onChange={e => handleChange('linkPaparanDrive', e.target.value)}
              id="input-kandidat-link-paparan"
            />
          </div>
          {error && <div className="alert alert-error"><span className="alert-icon">⚠️</span>{error}</div>}
          <div className="flex gap-3" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving} id="btn-save-kandidat">
              {saving ? <><div className="spinner spinner-sm" /> Menyimpan...</> : '💾 Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminKandidat({ user }) {
  const [kandidatList, setKandidatList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | kandidat object
  const [deleting, setDeleting] = useState(null);

  const loadKandidat = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'kandidat'), orderBy('nama')));
      setKandidatList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKandidat(); }, [loadKandidat]);

  const handleSave = async (data) => {
    if (modal === 'add') {
      await addDoc(collection(db, 'kandidat'), { ...data, createdAt: serverTimestamp() });
    } else {
      const { id, ...rest } = data;
      await updateDoc(doc(db, 'kandidat', modal.id), rest);
    }
    await loadKandidat();
  };

  const handleDelete = async (k) => {
    if (!window.confirm(`Hapus kandidat "${k.nama}"? Ini tidak akan menghapus penilaian yang sudah masuk.`)) return;
    setDeleting(k.id);
    try {
      await deleteDoc(doc(db, 'kandidat', k.id));
      setKandidatList(prev => prev.filter(c => c.id !== k.id));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <AdminNavbar user={user} />
      <div className="page-wrapper">
        <div className="container">
          <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1>Kelola Kandidat</h1>
              <p>Tambah, edit, atau hapus data kandidat beserta link makalahnya</p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setModal('add')}
              id="btn-tambah-kandidat"
            >
              ➕ Tambah Kandidat
            </button>
          </div>

          {loading ? (
            <div className="loading-center">
              <div className="spinner" />
              <span>Memuat data kandidat...</span>
            </div>
          ) : kandidatList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">👤</div>
              <h3>Belum Ada Kandidat</h3>
              <p>Klik tombol "Tambah Kandidat" untuk mulai menambahkan data.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nama</th>
                    <th>NIP</th>
                    <th>Unit Kerja</th>
                    <th>Makalah</th>
                    <th>Paparan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {kandidatList.map((k, i) => (
                    <tr key={k.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td><strong>{k.nama}</strong></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {k.nip || '—'}
                      </td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{k.unitKerja || '—'}</td>
                      <td>
                        {k.linkMakalahDrive ? (
                          <a
                            href={k.linkMakalahDrive}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                          >
                            📄 Lihat
                          </a>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td>
                        {k.linkPaparanDrive ? (
                          <a
                            href={k.linkPaparanDrive}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                          >
                            🎤 Lihat
                          </a>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setModal(k)}
                            id={`btn-edit-kandidat-${k.id}`}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(k)}
                            disabled={deleting === k.id}
                            id={`btn-delete-kandidat-${k.id}`}
                          >
                            {deleting === k.id ? <div className="spinner spinner-sm" /> : '🗑️'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <KandidatModal
          kandidat={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
