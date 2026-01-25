
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  orderBy,
  setDoc,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { TodoItem, ChecklistItem, Expense, Member, Booking } from './types';

// 注意：在實際環境中，這裡會放入您的 Firebase 專案配置
// 但為了展示，我們建立一個可以連接的結構，假設 API_KEY 等環境變數已由平台處理
const firebaseConfig = {
  apiKey: "AIzaSy...", // 這裡通常由環境變數注入
  authDomain: "nordictrip-demo.firebaseapp.com",
  projectId: "nordictrip-demo",
  storageBucket: "nordictrip-demo.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// 由於我們是在演示環境，若無真實金鑰，我們保留一個回退機制到 LocalStorage
// 但代碼邏輯已完全符合 Firestore v10 規範
let db: any;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase 初始化失敗，切換至離線模擬模式");
}

export const dbService = {
  // 監聽行程更新
  subscribeSchedule: (callback: (data: any) => void) => {
    if (!db) return;
    const q = query(collection(db, "schedules"), orderBy("time"));
    return onSnapshot(q, (snapshot) => {
      const data: any = {};
      snapshot.forEach((doc) => {
        const item = doc.data();
        const date = item.date;
        if (!data[date]) data[date] = [];
        data[date].push({ id: doc.id, ...item });
      });
      callback(data);
    });
  },

  // 新增/更新支出
  saveExpense: async (expense: Omit<Expense, 'id'>) => {
    if (!db) {
      const current = JSON.parse(localStorage.getItem('expenses') || '[]');
      localStorage.setItem('expenses', JSON.stringify([{ id: Date.now().toString(), ...expense }, ...current]));
      return;
    }
    await addDoc(collection(db, "expenses"), { ...expense, createdAt: new Date() });
  },

  // 獲取所有成員
  getMembers: async () => {
    if (!db) return JSON.parse(localStorage.getItem('members') || '[]');
    const querySnapshot = await getDocs(collection(db, "members"));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // 更多 Firestore 實作...
  getState: () => {
    const stored = localStorage.getItem('nordic_trip_data');
    if (stored) return JSON.parse(stored);
    return {
      todos: [], packing: [], shopping: [], expenses: [], members: [], bookings: []
    };
  }
};
