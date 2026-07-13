const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

initializeApp();
const db = getFirestore();

// ─────────────────────────────────────────────────
// Karakter untuk token: alfanumerik kapital, tanpa 0/O/1/I/l
// ─────────────────────────────────────────────────
const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_LENGTH = 7;

function generateToken() {
  const crypto = require('crypto');
  let token = '';
  const bytes = crypto.randomBytes(TOKEN_LENGTH * 2);
  for (let i = 0; i < bytes.length && token.length < TOKEN_LENGTH; i++) {
    const idx = bytes[i] % TOKEN_CHARS.length;
    token += TOKEN_CHARS[idx];
  }
  return token;
}

// Nilai indikator yang valid
const VALID_SCORES = new Set([2, 4, 5]);
const INDIKATOR_KEYS = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8'];

// ─────────────────────────────────────────────────
// submitPenilaian (callable) — publik, tanpa auth
// ─────────────────────────────────────────────────
exports.submitPenilaian = onCall(
  { region: 'asia-southeast2', cors: true },
  async (request) => {
    const { token, kandidatId, indikator } = request.data;

    // 1. Validasi input dasar
    if (!token || typeof token !== 'string') {
      throw new HttpsError('invalid-argument', 'Token tidak valid.');
    }
    if (!kandidatId || typeof kandidatId !== 'string') {
      throw new HttpsError('invalid-argument', 'kandidatId tidak valid.');
    }
    if (!indikator || typeof indikator !== 'object') {
      throw new HttpsError('invalid-argument', 'Indikator tidak valid.');
    }

    // 2. Validasi semua 8 indikator ada dan nilainya {2,4,5}
    for (const key of INDIKATOR_KEYS) {
      const val = Number(indikator[key]);
      if (!VALID_SCORES.has(val)) {
        throw new HttpsError(
          'invalid-argument',
          `Nilai indikator ${key} tidak valid. Harus 2, 4, atau 5.`
        );
      }
    }

    const penilaiRef = db.collection('penilai').doc(token);

    try {
      // 3. Jalankan transaction: cek + simpan (atomic)
      await db.runTransaction(async (tx) => {
        const penilaiSnap = await tx.get(penilaiRef);

        // 4. Validasi token ada
        if (!penilaiSnap.exists) {
          throw new HttpsError('not-found', 'Token tidak ditemukan.');
        }

        const penilaiData = penilaiSnap.data();

        // 5. Validasi kandidat masuk dalam assignedKandidat
        const assigned = penilaiData.assignedKandidat || [];
        if (!assigned.includes(kandidatId)) {
          throw new HttpsError(
            'permission-denied',
            'Kandidat ini tidak termasuk dalam daftar penilaian Anda.'
          );
        }

        // 6. Cek sudah dinilai (anti-double-submit)
        if (penilaiData.sudahMenilai && penilaiData.sudahMenilai[kandidatId] === true) {
          throw new HttpsError(
            'already-exists',
            'Anda sudah menilai kandidat ini sebelumnya.'
          );
        }

        // 7. Hitung skor di server (jangan percaya klien)
        const jumlah = INDIKATOR_KEYS.reduce((s, k) => s + Number(indikator[k]), 0);
        const nilai20persen = (jumlah / 40) * 100 * 0.2;

        // 8. Simpan dokumen penilaian
        const penilaianRef = db.collection('penilaian').doc();
        tx.set(penilaianRef, {
          token,
          kandidatId,
          indikator: Object.fromEntries(
            INDIKATOR_KEYS.map(k => [k, Number(indikator[k])])
          ),
          jumlah,
          nilai20persen,
          submittedAt: FieldValue.serverTimestamp(),
        });

        // 9. Tandai sudah dinilai
        tx.update(penilaiRef, {
          [`sudahMenilai.${kandidatId}`]: true,
        });
      });

      return { success: true, message: 'Penilaian berhasil disimpan.' };
    } catch (err) {
      // Re-throw HttpsError apa adanya
      if (err instanceof HttpsError) throw err;
      console.error('submitPenilaian error:', err);
      throw new HttpsError('internal', 'Terjadi kesalahan internal. Silakan coba lagi.');
    }
  }
);

// ─────────────────────────────────────────────────
// generatePenilaiToken (callable) — admin only
// ─────────────────────────────────────────────────
exports.generatePenilaiToken = onCall(
  { region: 'asia-southeast2', cors: true },
  async (request) => {
    // 1. Cek auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Harus login sebagai admin.');
    }

    // 2. Cek custom claim admin
    const authClient = getAuth();
    const userRecord = await authClient.getUser(request.auth.uid);
    const claims = userRecord.customClaims || {};
    if (!claims.admin) {
      throw new HttpsError('permission-denied', 'Akses ditolak. Hanya admin yang dapat membuat token.');
    }

    const { namaPenilai, assignedKandidat } = request.data;

    // 3. Validasi input
    if (!namaPenilai || typeof namaPenilai !== 'string' || namaPenilai.trim() === '') {
      throw new HttpsError('invalid-argument', 'Nama penilai tidak boleh kosong.');
    }
    if (!Array.isArray(assignedKandidat) || assignedKandidat.length === 0) {
      throw new HttpsError('invalid-argument', 'Pilih minimal 1 kandidat.');
    }

    // 4. Generate token unik (coba hingga tidak collision)
    let token = '';
    let attempts = 0;
    while (attempts < 10) {
      const candidate = generateToken();
      const existing = await db.collection('penilai').doc(candidate).get();
      if (!existing.exists) {
        token = candidate;
        break;
      }
      attempts++;
    }

    if (!token) {
      throw new HttpsError('internal', 'Gagal generate token unik. Coba lagi.');
    }

    // 5. Simpan ke Firestore
    await db.collection('penilai').doc(token).set({
      namaPenilai: namaPenilai.trim(),
      assignedKandidat,
      sudahMenilai: {},
      createdAt: FieldValue.serverTimestamp(),
    });

    return { token, namaPenilai: namaPenilai.trim() };
  }
);

// ─────────────────────────────────────────────────
// setAdminClaim — HANYA untuk setup awal (bisa dihapus setelah digunakan)
// Panggil via: firebase functions:call setAdminClaim --data '{"email":"admin@example.com"}'
// ─────────────────────────────────────────────────
exports.setAdminClaim = onCall(
  { region: 'asia-southeast2', cors: true },
  async (request) => {
    // Hanya bisa dipanggil jika caller sudah admin, ATAU jika belum ada admin sama sekali
    if (request.auth) {
      const userRecord = await getAuth().getUser(request.auth.uid);
      if (!userRecord.customClaims?.admin) {
        throw new HttpsError('permission-denied', 'Hanya admin yang dapat mengatur klaim admin.');
      }
    }

    const { email } = request.data;
    if (!email) throw new HttpsError('invalid-argument', 'Email wajib diisi.');

    const authClient = getAuth();
    const user = await authClient.getUserByEmail(email);
    await authClient.setCustomUserClaims(user.uid, { admin: true });

    return { success: true, message: `Custom claim admin berhasil diset untuk ${email}` };
  }
);
