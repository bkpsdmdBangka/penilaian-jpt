# Prompt: Aplikasi Penilaian Makalah Berbasis Token (Firebase)

## Konteks
Buatkan aplikasi web untuk **Panitia Seleksi Terbuka Jabatan Pimpinan Tinggi Pratama** guna merekap penilaian makalah dari beberapa penilai/juri terhadap beberapa kandidat. Setiap penilai mengisi form penilaian menggunakan **token unik** (tanpa login), dan admin memantau hasil lewat dashboard.

Gunakan **Firebase** (Firestore, Hosting, Authentication) sebagai backend. Frontend bebas (boleh React/Vite atau HTML+JS vanilla), yang penting ringan dan mudah di-deploy ke Firebase Hosting.

## Referensi Formulir Penilaian (blangko asli)
Setiap kandidat dinilai berdasarkan 8 indikator. Tiap indikator hanya boleh diberi salah satu dari 3 nilai berikut:
- **Sangat memadai = 5**
- **Memadai = 4**
- **Kurang memadai = 2**

Daftar 8 indikator:
1. Proporsi Halaman
2. Penggunaan Referensi dan Peraturan Perundang-undangan
3. Cakupan Strategi / Rencana Aksi
4. Proporsi Data yang digunakan
5. Usul Kelayakan Rekomendasi
6. Penyelesaian Makalah
7. Kelayakan Teknis Tulisan
8. Ketajaman Isi Makalah dan Kekuatan Argumentasi

**Rumus nilai akhir per penilai per kandidat:**
```
Jumlah = total 8 indikator (maksimum 40)
Nilai Makalah (bobot 20%) = (Jumlah / 40) x 100 x 20%
```
Nilai akhir kandidat = **rata-rata** "Nilai Makalah (20%)" dari seluruh penilai yang menilainya.

## Fitur yang dibutuhkan

### A. Halaman Penilai (`/nilai?token=XXXXX`)
- Tidak perlu login. Baca parameter `token` dari URL.
- Validasi token ke Firestore (koleksi `penilai`). Jika token tidak ditemukan → tampilkan pesan "Token tidak valid".
- Jika valid, tampilkan:
  - Nama penilai (untuk konfirmasi identitas)
  - Daftar kandidat yang wajib dinilai oleh penilai tsb (field `assignedKandidat` di dokumen `penilai/{token}`)
  - Untuk setiap kandidat, tampilkan **link/tombol untuk membuka makalah kandidat** (`linkMakalahDrive`) sebelum form penilaian:
    - Tampilkan sebagai tombol "Lihat Makalah (PDF)" yang membuka `linkMakalahDrive` di tab baru (`target="_blank"`), DAN
    - Jika format link Google Drive-nya berupa `.../file/d/{FILE_ID}/view`, tampilkan juga **preview embed PDF** langsung di halaman menggunakan iframe pratinjau Drive: `https://drive.google.com/file/d/{FILE_ID}/preview` (ekstrak `FILE_ID` dari `linkMakalahDrive` di sisi client).
    - Jika link tidak sesuai pola tsb (atau kosong), cukup tampilkan tombol buka link biasa, jangan gagalkan halaman.
    - Ingatkan di README bahwa file Drive tsb harus di-share dengan akses **"Anyone with the link – Viewer"** agar bisa dibuka/preview oleh penilai tanpa perlu login Google.
  - Untuk kandidat yang **belum** dinilai: tampilkan form 8 indikator, masing-masing berupa radio button/select dengan 3 opsi (Sangat memadai/Memadai/Kurang memadai) yang bernilai 5/4/2.
  - Untuk kandidat yang **sudah** dinilai: tampilkan status "Sudah dinilai" (read-only), tidak bisa diedit ulang (cegah double submit).
- Saat submit:
  - Hitung `jumlah` dan `nilai20persen` di sisi client, simpan ke koleksi `penilaian`.
  - Update `penilai/{token}.sudahMenilai.{kandidatId} = true`.
  - Tampilkan konfirmasi sukses.

### B. Dashboard Admin (`/admin`)
- Login pakai Firebase Authentication (Email/Password).
- Setelah login, tampilkan:
  - Tabel semua kandidat dengan kolom: Nama, Jumlah Penilai yang sudah menilai, Rata-rata Nilai Makalah (20%).
  - Detail per kandidat: rincian nilai dari tiap penilai (bisa expand/klik).
  - Tombol **export ke CSV/Excel** dari rekap tersebut.
- Halaman **Kelola Penilai & Token**:
  - Form tambah penilai baru: input nama penilai + pilih kandidat yang jadi tanggung jawabnya → sistem generate token acak (misal 6-8 karakter alfanumerik unik) dan simpan ke Firestore.
  - Tabel daftar penilai beserta token dan link siap-kirim (`https://<domain>/nilai?token=...`), lengkap tombol "copy link".
  - Tombol tambah/kelola daftar kandidat (nama, NIP, unit kerja).

### C. Halaman Kelola Kandidat (`/admin/kandidat`)
- CRUD sederhana untuk koleksi `kandidat`: nama, NIP, unit kerja/instansi, dan **link Google Drive makalah (PDF)** (`linkMakalahDrive`).
- Validasi input sederhana: link harus diawali `https://drive.google.com/` (peringatkan admin jika tidak, tapi tetap boleh disimpan).

## Struktur Data Firestore

```
kandidat/{kandidatId}
  - nama: string
  - nip: string
  - unitKerja: string
  - linkMakalahDrive: string     // link Google Drive (file PDF makalah kandidat), format share link Google Drive

penilai/{token}                 // token = document ID, string acak unik
  - namaPenilai: string
  - assignedKandidat: array<string>          // list of kandidatId
  - sudahMenilai: map<kandidatId, boolean>

penilaian/{autoId}               // 1 dokumen = 1 penilai x 1 kandidat
  - token: string
  - kandidatId: string
  - indikator: { i1: number, i2: number, ..., i8: number }  // masing2 5/4/2
  - jumlah: number
  - nilai20persen: number
  - submittedAt: timestamp
```

## Firestore Security Rules (inti yang harus diimplementasikan)
- `penilai/{token}`:
  - **read**: publik boleh baca dokumen dengan ID = token yang mereka punya (tidak boleh list semua penilai).
  - **write**: hanya dari sisi admin (lewat Cloud Function atau dari akun admin yang login), bukan dari halaman penilai publik.
- `penilaian/{id}`:
  - **create**: publik boleh create HANYA jika `token` yang dikirim valid (ada di koleksi `penilai`) dan kandidat tsb belum ditandai `sudahMenilai=true` untuk token itu. Validasi ini idealnya lewat **Cloud Function (callable)**, bukan langsung write dari client, supaya lebih aman dan atomic (mencegah race condition submit ganda).
  - **read/update/delete**: hanya admin yang login (`request.auth != null` dan emailnya terdaftar sebagai admin, misal via custom claim `admin: true`).
- `kandidat/{id}`:
  - **read**: admin only (atau public read jika ingin nama kandidat muncul di form penilai — sesuaikan).
  - **write**: admin only.

> Catatan: Karena ada langkah "cek token valid + kandidat belum dinilai + tulis penilaian + update status" yang harus atomic, **gunakan Cloud Function (callable function `submitPenilaian`)** dari client, bukan direct Firestore write, untuk operasi submit penilaian. Ini mencegah penilai mengirim submission ganda meski mengklik submit berkali-kali atau membuka banyak tab.

## Generate Token
- Sediakan Cloud Function atau tombol di dashboard admin: `generatePenilaiToken(namaPenilai, assignedKandidat[])` yang membuat token acak (contoh: gunakan `crypto.randomBytes` atau `nanoid`, format 6-8 karakter alfanumerik kapital, hindari karakter ambigu seperti 0/O, 1/I/l), simpan ke `penilai/{token}`, dan kembalikan link siap kirim.

## Tumpukan Teknologi (Tech Stack) yang disarankan
- Firebase Firestore, Firebase Hosting, Firebase Authentication (Email/Password untuk admin), Cloud Functions (Node.js) untuk `submitPenilaian` dan `generatePenilaiToken`.
- Frontend: React + Vite (atau HTML/CSS/JS vanilla jika ingin lebih ringan), styling sederhana dan rapi (mobile-friendly karena penilai kemungkinan buka dari HP).
- Deployment akhir: `firebase deploy` (Hosting + Functions + Firestore rules).

## Deliverables yang diharapkan dari hasil coding
1. Struktur project siap `firebase init` (firestore.rules, firestore.indexes.json, functions/, public atau src/).
2. Halaman `/nilai`, `/admin` (login), `/admin/kandidat`, `/admin/penilai` sesuai fitur di atas.
3. Cloud Functions: `submitPenilaian`, `generatePenilaiToken`.
4. `firestore.rules` sesuai spesifikasi keamanan di atas.
5. README singkat: cara `firebase init`, cara set custom claim admin, cara deploy.

## Batasan / hal yang perlu dijaga
- Jangan izinkan penilai submit ulang untuk kandidat yang sama (idempotent).
- Nilai indikator wajib salah satu dari {5, 4, 2} — validasi di server (Cloud Function), jangan percaya validasi client saja.
- Semua perhitungan `jumlah` dan `nilai20persen` sebaiknya dihitung ulang di server (Cloud Function) sebelum disimpan, bukan hanya menerima angka kiriman dari client, untuk mencegah manipulasi nilai dari sisi browser.