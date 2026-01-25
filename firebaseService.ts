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
  getDocs,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { TodoItem, ChecklistItem, Expense, Member, Booking } from './types';

const firebaseConfig = {
  apiKey: "AIzaSyB0UTQFSuHA_Hmd3l2CuPOFHNnEVs-JfjQ",
  authDomain: "travelplan1-30c98.firebaseapp.com",
  projectId: "travelplan1-30c98",
  storageBucket: "travelplan1-30c98.firebasestorage.app",
  messagingSenderId: "759774907663",
  appId: "1:759774907663:web:7f4de18c0cbf8d999c827a",
  measurementId: "G-GLX8PVM78F"
};

let db: any;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase 初始化失敗，請檢查網路或金鑰", e);
}

export const dbService = {
  // === 成員管理 (Members) ===
  // 監聽成員，實現跨裝置同步
  subscribeMembers: (callback: (members: Member[]) => void) => {
    if (!db) return;
    return onSnapshot(collection(db, "members"), (snapshot) => {
      const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Member[];
      callback(members);
    });
  },

  saveMember: async (member: Omit<Member, 'id'>) => {
    if (!db) return;
    return await addDoc(collection(db, "members"), member);
  },

  // === 行程管理 (Schedules) ===
  subscribeSchedules: (callback: (data: any) => void) => {
    if (!db) return;
    const q = query(collection(db, "schedules"), orderBy("time"));
    return onSnapshot(q, (snapshot) => {
      const data: any = {};
      snapshot.forEach((doc) => {
        const item = doc.data();
        if (!data[item.date]) data[item.date] = [];
        data[item.date].push({ id: doc.id, ...item });
      });
      callback(data);
    });
  },

  // === 支出管理 (Expenses) ===
  subscribeExpenses: (callback: (expenses: Expense[]) => void) => {
    if (!db) return;
    const q = query(collection(db, "expenses"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Expense[];
      callback(expenses);
    });
  },

  saveExpense: async (expense: Omit<Expense, 'id'>) => {
    if (!db) return;
    await addDoc(collection(db, "expenses"), { ...expense, createdAt: new Date() });
  }
};
