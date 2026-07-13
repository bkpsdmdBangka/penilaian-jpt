# Aplikasi Penilaian Makalah — JPT Pratama

Aplikasi web untuk rekap penilaian makalah seleksi **Jabatan Pimpinan Tinggi Pratama** berbasis token Firebase.

## Fitur

| Fitur | Keterangan |
|---|---|
| `/nilai?token=XXXXX` | Halaman penilaian tanpa login (token-based) |
| `/admin` | Login admin Firebase Auth |
| `/admin/dashboard` | Rekap nilai semua kandidat + export CSV |
| `/admin/kandidat` | CRUD kandidat + link makalah Google Drive |
| `/admin/penilai` | Generate token + kirim link ke penilai |

## Tech Stack

- **Frontend**: React + Vite (SPA)
- **Backend**: Firebase Firestore + Authentication + Cloud Functions v2 (Node 20)
- **Deploy**: Firebase Hosting

---

## Setup Awal

### 1. Prasyarat

```bash
npm install -g firebase-tools
firebase login
```

### 2. Install Dependencies

```bash
# Frontend
npm install

# Cloud Functions
cd functions
npm install
cd ..
```

### 3. Set Custom Claim Admin

Setelah deploy, Anda perlu memberi klaim `admin: true` ke akun admin.

**Cara termudah via Firebase Console:**
1. Buka [Firebase Console](https://console.firebase.google.com) → Authentication
2. Buat akun admin (Email/Password) jika belum ada
3. Deploy functions terlebih dahulu (langkah 4)
4. Panggil Cloud Function `setAdminClaim` dari Firebase Console atau Emulator:

```bash
# Menggunakan firebase-tools (setelah deploy)
firebase functions:call setAdminClaim --data '{"email":"admin@yourdomain.com"}'
```

> **Catatan**: Fungsi `setAdminClaim` di `functions/index.js` dapat dihapus setelah admin pertama berhasil diset, untuk keamanan.

### 4. Build & Deploy

```bash
# Build frontend
npm run build

# Deploy semuanya (Hosting + Functions + Firestore rules)
firebase deploy

# Atau deploy per komponen:
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

---

## Penggunaan

### Admin
1. Buka `https://<your-domain>/admin` dan login
2. Tambahkan kandidat di menu **Kandidat** beserta link makalah Google Drive
3. Tambahkan penilai di menu **Penilai** → sistem akan generate token unik
4. Salin link penilaian dan kirim ke masing-masing penilai (WhatsApp/email)
5. Pantau progres di **Dashboard** dan export ke CSV saat semua selesai

### Penilai
1. Buka link yang dikirim panitia (contoh: `https://<domain>/nilai?token=ABCD123`)
2. Baca makalah PDF yang tampil di halaman (atau buka di tab baru)
3. Isi penilaian 8 indikator untuk setiap kandidat
4. Klik **Simpan Penilaian** → penilaian tersimpan dan tidak bisa diubah

---

## Peraturan Google Drive

> ⚠️ **PENTING**: File makalah di Google Drive **HARUS** dibagikan dengan akses:
> **"Anyone with the link" → Viewer**
>
> Jika tidak, penilai tidak akan bisa membuka/preview makalah di halaman penilaian.

Cara share:
1. Buka file di Google Drive
2. Klik **Share** → **Change to anyone with the link**
3. Set role ke **Viewer**
4. Salin link dan tempel di form kandidat (admin)

---

## Struktur Firestore

```
kandidat/{kandidatId}
  - nama: string
  - nip: string
  - unitKerja: string
  - linkMakalahDrive: string

penilai/{token}          ← token = document ID (7 karakter alfanumerik)
  - namaPenilai: string
  - assignedKandidat: string[]
  - sudahMenilai: { [kandidatId]: boolean }

penilaian/{autoId}       ← 1 dokumen = 1 penilai × 1 kandidat
  - token: string
  - kandidatId: string
  - indikator: { i1..i8: 2|4|5 }
  - jumlah: number        ← dihitung server
  - nilai20persen: number ← dihitung server
  - submittedAt: timestamp
```

---

## Rumus Nilai

```
Jumlah        = i1 + i2 + ... + i8   (maks 40)
Nilai (20%)   = (Jumlah / 40) × 100 × 20%
Nilai Akhir   = rata-rata Nilai (20%) dari semua penilai
```

---

## Keamanan

- Token penilaian bersifat **one-time** per kandidat (tidak bisa submit ulang)
- Semua kalkulasi nilai dilakukan di **server (Cloud Function)**, bukan di browser
- Validasi nilai indikator dilakukan di server: hanya boleh 2, 4, atau 5
- Admin wajib memiliki custom claim `admin: true` untuk akses dashboard dan generate token
