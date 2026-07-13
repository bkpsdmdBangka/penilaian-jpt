# Penilaian Makalah JPT Pratama (Full CDN Edition)

Aplikasi web untuk penilaian makalah seleksi Jabatan Pimpinan Tinggi (JPT) Pratama.
Versi ini menggunakan **Vanilla HTML, CSS, JavaScript** dengan **Firebase SDK via CDN**.

Aplikasi ini dapat di-host secara gratis di **GitHub Pages** untuk frontend, sementara database, authentication, dan cloud functions tetap berada di Firebase.

## 🚀 Persiapan Deployment

### 1. Cloud Functions & Firestore (Firebase)

Meskipun frontend di-host di GitHub Pages, Anda tetap perlu mendeploy backend-nya ke Firebase.

Pastikan Node.js terinstall. Buka terminal di folder project ini:

```bash
# Masuk ke folder functions dan install dependensi
cd functions
npm install
cd ..

# Deploy Rules dan Cloud Functions
firebase deploy --only firestore:rules,functions
```

**Set Admin Pertama Kali:**
Setelah deploy berhasil, jalankan perintah ini (ganti email sesuai dengan akun yang Anda daftarkan di menu Authentication Firebase):

```bash
firebase functions:call setAdminClaim --data '{"email":"admin@example.com"}'
```

---

### 2. Frontend (GitHub Pages)

Tidak perlu proses *build*. Seluruh file HTML/CSS/JS bisa langsung jalan di browser.

1. Buka repositori project ini di GitHub.
2. Pergi ke **Settings** > **Pages** (di sidebar kiri).
3. Di bagian **Build and deployment**:
   - Source: `Deploy from a branch`
   - Branch: `main`, folder `/ (root)`
4. Klik **Save**.
5. Tunggu beberapa menit, URL aplikasi Anda akan muncul di bagian atas halaman (biasanya `https://<username>.github.io/<repo-name>`).

## 📁 Struktur File

- `index.html`: Redirect ke halaman penilai.
- `nilai.html`: Halaman penilai (diakses menggunakan query `?token=...`).
- `admin.html`: Login admin.
- `admin-dashboard.html`: Halaman rekapitulasi skor.
- `admin-kandidat.html`: CRUD data kandidat peserta JPT.
- `admin-penilai.html`: Generate token link untuk penilai.
- `css/style.css`: Styling sistem.
- `js/app.js`: Inisialisasi Firebase CDN dan export instances.
- `functions/`: Berisi logic backend `submitPenilaian` dan `generatePenilaiToken`.

## ⚠️ Perhatian
- Semua file makalah di Google Drive **WAJIB** diatur privasinya menjadi **"Anyone with the link - Viewer"** agar bisa dipreview oleh iframe.
- Fungsi `setAdminClaim` di `functions/index.js` sebaiknya dihapus setelah akun admin berhasil dibuat untuk alasan keamanan.
