
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  setDoc,
  doc, 
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSy...", 
  authDomain: "nordictrip-demo.firebaseapp.com",
  projectId: "nordictrip-demo",
  storageBucket: "nordictrip-demo.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

let db: any;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase 初始化失敗，切換至離線模擬模式");
}

export const dbService = {
  /**
   * 通用獲取資料：優先從 localStorage 讀取以確保 UI 初始化不延遲
   */
  get: (key: string, defaultValue: any) => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
  },

  /**
   * 通用儲存資料：同時更新 localStorage (本地快取) 與 Firebase (雲端同步)
   */
  set: async (key: string, value: any) => {
    // 1. 本地更新
    localStorage.setItem(key, JSON.stringify(value));

    // 2. 雲端同步 (如果已初始化)
    if (db) {
      try {
        await setDoc(doc(db, "app_data", key), { 
          data: value,
          updatedAt: new Date().toISOString()
        });
      } catch (e) {
        console.error(`Firebase Sync Error for ${key}:`, e);
      }
    }
  },

  // 監聽特定資料變動（用於多端同步）
  subscribe: (key: string, callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, "app_data", key), (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.data().data;
        // 只有當雲端資料比本地新或不同時才回調，避免無限迴圈
        const local = localStorage.getItem(key);
        if (JSON.stringify(val) !== local) {
          localStorage.setItem(key, JSON.stringify(val));
          callback(val);
        }
      }
    });
  }
};
