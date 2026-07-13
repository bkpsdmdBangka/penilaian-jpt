import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import AdminNavbar from '../components/AdminNavbar';

// Export to CSV
function exportToCSV(kandidatList, penilaianList, penilaiList) {
  const penilaiMap = {};
  penilaiList.forEach(p => { penilaiMap[p.token] = p.namaPenilai; });

  const rows = [];
  rows.push(['Nama Kandidat', 'NIP', 'Unit Kerja', 'Nama Penilai', 'Jumlah Skor', 'Nilai Makalah (20%)', 'Tanggal Submit']);

  kandidatList.forEach(k => {
    const penilaians = penilaianList.filter(p => p.kandidatId === k.id);
    if (penilaians.length === 0) {
      rows.push([k.nama, k.nip || '', k.unitKerja || '', '-', '-', '-', '-']);
    } else {
      penilaians.forEach(p => {
        rows.push([
          k.nama,
          k.nip || '',
          k.unitKerja || '',
          penilaiMap[p.token] || p.token,
          p.jumlah,
          p.nilai20persen?.toFixed(2),
          p.submittedAt?.toDate?.()?.toLocaleString('id-ID') || '',
        ]);
      });
    }
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rekap-penilaian-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Detail penilaian per kandidat
function DetailModal({ kandidat, penilaianList, penilaiMap, onClose }) {
  const penilaians = penilaianList.filter(p => p.kandidatId === kandidat.id);
  const rataRata = penilaians.length > 0
    ? (penilaians.reduce((s, p) => s + (p.nilai20persen || 0), 0) / penilaians.length).toFixed(2)
    : '0.00';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📊 Detail Penilaian</h2>
          <button className="modal-close" onClick={onClose} id="btn-close-detail-modal">✕</button>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>{kandidat.nama}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {kandidat.nip && `NIP: ${kandidat.nip}`}
            {kandidat.unitKerja && ` | ${kandidat.unitKerja}`}
          </div>
          <div className="badge badge-primary" style={{ marginTop: '0.5rem' }}>
            Rata-rata Nilai (20%): <strong style={{ marginLeft: '0.25rem' }}>{rataRata}</strong>
          </div>
        </div>

        {penilaians.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <div className="empty-icon">📭</div>
            <p>Belum ada penilai yang menilai kandidat ini.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Penilai</th>
                  <th>Total Skor</th>
                  <th>Nilai (20%)</th>
                  <th>Submit</th>
                </tr>
              </thead>
              <tbody>
                {penilaians.map((p, i) => (
                  <tr key={p.id}>
                    <td>{penilaiMap[p.token] || p.token}</td>
                    <td><strong>{p.jumlah}</strong>/40</td>
                    <td><strong className="text-primary-color">{p.nilai20persen?.toFixed(2)}</strong></td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {p.submittedAt?.toDate?.()?.toLocaleString('id-ID') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard({ user }) {
  const [kandidatList, setKandidatList] = useState([]);
  const [penilaianList, setPenilaianList] = useState([]);
  const [penilaiList, setPenilaiList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKandidat, setSelectedKandidat] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [kSnap, pSnap, jSnap] = await Promise.all([
        getDocs(query(collection(db, 'kandidat'), orderBy('nama'))),
        getDocs(collection(db, 'penilaian')),
        getDocs(collection(db, 'penilai')),
      ]);

      setKandidatList(kSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPenilaianList(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPenilaiList(jSnap.docs.map(d => ({ token: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const penilaiMap = {};
  penilaiList.forEach(p => { penilaiMap[p.token] = p.namaPenilai; });

  // Compute stats
  const totalKandidat = kandidatList.length;
  const totalPenilaian = penilaianList.length;
  const totalPenilai = penilaiList.length;
  const totalSelesai = penilaiList.reduce((sum, p) => {
    return sum + Object.values(p.sudahMenilai || {}).filter(Boolean).length;
  }, 0);

  return (
    <>
      <AdminNavbar user={user} />
      <div className="page-wrapper">
        <div className="container">
          <div className="page-header">
            <h1>Dashboard Rekap Penilaian</h1>
            <p>Pantau progres dan hasil penilaian makalah seluruh kandidat</p>
          </div>

          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Kandidat</div>
              <div className="stat-value">{totalKandidat}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Penilai</div>
              <div className="stat-value">{totalPenilai}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Penilaian Masuk</div>
              <div className="stat-value">{totalPenilaian}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Tugas Selesai</div>
              <div className="stat-value">{totalSelesai}</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mb-6" style={{ marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-success"
              onClick={() => exportToCSV(kandidatList, penilaianList, penilaiList)}
              id="btn-export-csv"
            >
              📥 Export CSV
            </button>
            <button
              className="btn btn-secondary"
              onClick={loadData}
              id="btn-refresh-dashboard"
            >
              🔄 Refresh
            </button>
          </div>

          {/* Main table */}
          {loading ? (
            <div className="loading-center">
              <div className="spinner" />
              <span>Memuat data...</span>
            </div>
          ) : kandidatList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3>Belum Ada Kandidat</h3>
              <p>Tambahkan kandidat terlebih dahulu di halaman Kandidat.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nama Kandidat</th>
                    <th>NIP</th>
                    <th>Unit Kerja</th>
                    <th>Penilai Selesai</th>
                    <th>Rata-rata Nilai (20%)</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {kandidatList.map((k, i) => {
                    const penilaians = penilaianList.filter(p => p.kandidatId === k.id);
                    const jumlahPenilai = penilaians.length;
                    const rataRata = jumlahPenilai > 0
                      ? (penilaians.reduce((s, p) => s + (p.nilai20persen || 0), 0) / jumlahPenilai).toFixed(2)
                      : '—';

                    return (
                      <tr key={k.id}>
                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td><strong>{k.nama}</strong></td>
                        <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{k.nip || '—'}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{k.unitKerja || '—'}</td>
                        <td>
                          {jumlahPenilai > 0 ? (
                            <span className="badge badge-success">{jumlahPenilai} penilai</span>
                          ) : (
                            <span className="badge badge-secondary">Belum ada</span>
                          )}
                        </td>
                        <td>
                          <strong className={jumlahPenilai > 0 ? 'text-primary-color' : 'text-muted'}>
                            {rataRata}
                          </strong>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedKandidat(k)}
                            id={`btn-detail-${k.id}`}
                          >
                            🔍 Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedKandidat && (
        <DetailModal
          kandidat={selectedKandidat}
          penilaianList={penilaianList}
          penilaiMap={penilaiMap}
          onClose={() => setSelectedKandidat(null)}
        />
      )}
    </>
  );
}
