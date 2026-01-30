import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  Firestore
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  Auth
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyCJAKHoGBFJYkggIFrqKPeKbK2ocolYdXY",
  authDomain: "test1-f741b.firebaseapp.com",
  projectId: "test1-f741b",
  storageBucket: "test1-f741b.firebasestorage.app",
  messagingSenderId: "691613899403",
  appId: "1:691613899403:web:dc7b8202c5d3a13f3a528e",
  measurementId: "G-GTPMXKTH99"
};

const DEFAULT_TRIP_ID = 'trip_2025_nordic_master';

/* ========= mock db（保留你的原設計） ========= */
const mockDb = {
  data: {} as Record<string, any>,
  listeners: [] as Array<{ field: string; callback: (data: any) => void }>,
  save(field: string, value: any) {
    this.data[field] = value;
    this.listeners.forEach(l => {
      if (l.field === field) l.callback(value);
    });
  }
};

let db: Firestore | null = null;
let auth: Auth | null = null;
let useFirebase = false;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  useFirebase = true;
} catch (e) {
  console.error("Firebase init failed", e);
}

export const dbService = {
  initAuth: async () => {
    if (!useFirebase || !auth) return null;
    return new Promise(resolve => {
      onAuthStateChanged(auth!, user => {
        if (!user) signInAnonymously(auth!).catch(console.error);
        resolve(user);
      });
    });
  },

  subscribeField(field: string, callback: (data: any) => void) {
    if (useFirebase && db) {
      const tripRef = doc(db, 'trips', DEFAULT_TRIP_ID);
      return onSnapshot(tripRef, snap => {
        callback(snap.exists() ? snap.data()?.[field] : undefined);
      });
    } else {
      callback(mockDb.data[field]);
      const listener = { field, callback };
      mockDb.listeners.push(listener);
      return () => {
        mockDb.listeners = mockDb.listeners.filter(l => l !== listener);
      };
    }
  },



async updateField(field: string, value: any) {
  mockDb.save(field, value);

  if (useFirebase && db) {
    const tripRef = doc(db, 'trips', DEFAULT_TRIP_ID);
    try {
      await setDoc(
        tripRef,
        { [field]: value },
        { merge: true } // 🔥 關鍵
      );
    } catch (e) {
      console.error(`Firebase write error (${field})`, e);
    }
  }
}
};
