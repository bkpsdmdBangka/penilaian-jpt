import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCauSkZHItjoqinvtkBt77Nq-9BXjDXOKA",
  authDomain: "jptapp-672dd.firebaseapp.com",
  projectId: "jptapp-672dd",
  storageBucket: "jptapp-672dd.firebasestorage.app",
  messagingSenderId: "66625982057",
  appId: "1:66625982057:web:8b390c1164374225e89cf8"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

/**
 * Hitung base URL halaman (untuk membangun link penilai)
 * Contoh: https://user.github.io/PenilaianSekdaMakalah
 */
export function getBaseUrl() {
  const { origin, pathname } = window.location;
  // Hapus nama file terakhir dari path
  const base = pathname.replace(/\/[^/]*$/, '');
  return origin + base;
}
