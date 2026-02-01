
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc,
  getDoc,
  Firestore
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged, Auth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const IS_PLACEHOLDER_CONFIG = (config: any) => config.apiKey.includes("FakeKey") || config.projectId.includes("demo");

const firebaseConfig = {
  apiKey: "AIzaSyChx0Ro7ArYxM1CQcBf41mq63p4AEVWZC4",
  authDomain: "fi-travel.firebaseapp.com",
  projectId: "fi-travel",
  storageBucket: "fi-travel.firebasestorage.app",
  messagingSenderId: "158292900207",
  appId: "1:158292900207:web:40d53c028906d66b88109a",
  measurementId: "G-GC0JGS4LJB"
};

const DEFAULT_TRIP_ID = 'trip_2025_nordic_master';

// --- 改進的 Mock Logic：具備存儲功能的模擬雲端 ---
const mockDb = {
  data: {} as Record<string, any>, // 這裡儲存當前所有欄位的資料
  listeners: [] as Array<{field: string, callback: (data: any) => void}>,
  
  save: (field: string, value: any) => {
    mockDb.data[field] = value;
    window.dispatchEvent(new CustomEvent('nordic_data_update', { detail: { field, value } }));
  }
};

window.addEventListener('nordic_data_update', (e: any) => {
  const { field, value } = e.detail;
  mockDb.listeners.forEach(l => {
    if (l.field === field) l.callback(value);
  });
});

let db: Firestore | null = null;
let auth: Auth | null = null;
let useFirebase = false;

try {
  if (!IS_PLACEHOLDER_CONFIG(firebaseConfig)) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    useFirebase = true;
  }
} catch (e) {
  console.error("Firebase initialization failed", e);
}

export const dbService = {
  initAuth: async () => {
    if (!useFirebase || !auth) return Promise.resolve(null);
    return new Promise((resolve) => {
      onAuthStateChanged(auth!, (user) => {
        if (!user) {
          signInAnonymously(auth!).catch(e => console.error("Auth error", e));
        }
        resolve(user);
      });
    });
  },

  subscribeField: (field: string, callback: (data: any) => void) => {
    if (useFirebase && db) {
      const tripRef = doc(db, "trips", DEFAULT_TRIP_ID);
      return onSnapshot(tripRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          // 如果 Snapshot 存在但欄位不存在，傳回 undefined
          callback(data[field]);
        } else {
          callback(undefined);
        }
      });
    } else {
      // 立即回傳目前已有的模擬數據
      if (mockDb.data[field] !== undefined) {
        callback(mockDb.data[field]);
      }
      
      const listener = { field, callback };
      mockDb.listeners.push(listener);
      return () => {
        mockDb.listeners = mockDb.listeners.filter(l => l !== listener);
      };
    }
  },

  updateField: async (field: string, value: any) => {
    mockDb.save(field, value); // 更新本地模擬存儲
    if (useFirebase && db) {
      const tripRef = doc(db, "trips", DEFAULT_TRIP_ID);
      try {
        await setDoc(tripRef, { [field]: value }, { merge: true });
      } catch (e) {
        console.error(`Firebase write error for ${field}:`, e);
      }
    }
  }
};
