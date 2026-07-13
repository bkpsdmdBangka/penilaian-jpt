import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

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
export const functions = getFunctions(app, 'asia-southeast2');

export default app;
