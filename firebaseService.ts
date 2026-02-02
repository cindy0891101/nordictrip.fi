
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc,
  updateDoc,
  deleteField,
  getDoc,
  Firestore
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged, Auth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const IS_PLACEHOLDER_CONFIG = (config: any) => config.apiKey.includes("FakeKey") || config.projectId.includes("demo");

const firebaseConfig = {
  apiKey: "AIzaSy" + "FakeKeyForDemoPurposeOnly", 
  authDomain: "nordictrip-demo.firebaseapp.com",
  projectId: "nordictrip-demo",
  storageBucket: "nordictrip-demo.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const DEFAULT_TRIP_ID = 'trip_2025_nordic_master';
const LOCAL_STORAGE_KEY = 'nordic_trip_mock_data';

// --- 改進的 Mock Logic：增加 LocalStorage 持久化 ---
const mockDb = {
  data: JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}') as Record<string, any>,
  listeners: [] as Array<{field: string, callback: (data: any) => void}>,
  
  save: (field: string, value: any) => {
    mockDb.data[field] = value;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mockDb.data));
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
          callback(data[field]);
        } else {
          callback(undefined);
        }
      });
    } else {
      // 模擬環境：初次訂閱時回傳已存儲的資料
      setTimeout(() => {
        if (mockDb.data[field] !== undefined) {
          callback(mockDb.data[field]);
        }
      }, 0);
      
      const listener = { field, callback };
      mockDb.listeners.push(listener);
      return () => {
        mockDb.listeners = mockDb.listeners.filter(l => l !== listener);
      };
    }
  },

  updateField: async (field: string, value: any) => {
    mockDb.save(field, value);
    if (useFirebase && db) {
      const tripRef = doc(db, "trips", DEFAULT_TRIP_ID);
      try {
        // 使用 updateDoc(ref, field, value) 語法，這會直接替換整個欄位的值（如整個 schedule 物件）
        // 而不是合併物件內部的 Key
        await updateDoc(tripRef, field, value);
      } catch (e: any) {
        if (e.code === 'not-found') {
          // 如果文件完全不存在，才使用 setDoc 建立
          await setDoc(tripRef, { [field]: value });
        } else {
          console.error(`Firebase write error for ${field}:`, e);
        }
      }
    }
  }
};
