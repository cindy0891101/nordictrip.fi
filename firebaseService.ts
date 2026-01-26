import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  query, 
  orderBy,
  setDoc,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { Expense, Member, ArchivedSettlement } from './types';

// Firebase 配置 (請確保 apiKey 是正確的)
const firebaseConfig = {
  apiKey: "AIzaSyB0UTQFSuHA_Hmd3l2CuPOFHNnEVs-JfjQ",
  authDomain: "travelplan1-30c98.firebaseapp.com",
  projectId: "travelplan1-30c98",
  storageBucket: "travelplan1-30c98.firebasestorage.app",
  messagingSenderId: "759774907663",
  appId: "1:759774907663:web:7f4de18c0cbf8d999c827a",
  measurementId: "G-GLX8PVM78F"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const dbService = {
  // === 1. 成員同步 (解決你提到的不同步問題) ===
  subscribeMembers: (callback: (members: Member[]) => void) => {
  const q = query(collection(db, 'members'),
  orderBy('createdAt', 'asc'));
    // 使用 onSnapshot 才能達成「多人即時同步」
    return onSnapshot(q, (snapshot) => {
      const members = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Member));
      callback(members);
    });
  },

 addMember: async (name: string) => {
  await addDoc(collection(db, 'members'), {
    name,
    avatar: '/avatar/default.png',
    createdAt: Date.now()
  });
},

  // === 2. 支出同步 ===
  subscribeExpenses: (callback: (expenses: Expense[]) => void) => {
    const q = query(collection(db, 'expenses'), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const expenses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Expense));
      callback(expenses);
    });
  },

  saveExpense: async (expense: Expense) => {
    if (expense.id && expense.id.length > 15) { // 假設手動生成的 ID 較長
      await setDoc(doc(db, 'expenses', expense.id), { ...expense, updatedAt: new Date() });
    } else {
      await addDoc(collection(db, 'expenses'), { ...expense, createdAt: new Date() });
    }
  },

  deleteExpense: async (id: string) => {
    await deleteDoc(doc(db, 'expenses', id));
  },

  // === 3. 結算同步 ===
  subscribeArchivedSettlements: (callback: (data: ArchivedSettlement[]) => void) => {
    const q = query(collection(db, 'settlements'), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ArchivedSettlement));
      callback(data);
    });
  },

  saveArchivedSettlement: async (data: ArchivedSettlement) => {
    await setDoc(doc(db, 'settlements', data.id), data);
  },

  // === 4. 行程同步 ===
  subscribeSchedule: (callback: (data: any) => void) => {
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
  }
};
