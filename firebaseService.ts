
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc,
  updateDoc,
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

// --- 純記憶體 Mock Logic：移除 localStorage ---
const mockDb = {
  data: {} as Record<string, any>,
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
          callback(data[field]);
        } else {
          callback(undefined);
        }
      });
    } else {
      // 記憶體模式：立即回傳
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
        // 使用物件對映格式確保穩定寫入
        await updateDoc(tripRef, { [field]: value });
      } catch (e: any) {
        if (e.code === 'not-found') {
          // 若文件不存在，使用 merge 模式建立，避免覆蓋其他功能已產生的欄位
          await setDoc(tripRef, { [field]: value }, { merge: true });
        } else {
          console.error(`Firebase write error for ${field}:`, e);
        }
      }
    }
  }
};
