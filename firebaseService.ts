import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';

import { getAuth } from 'firebase/auth';

const db = getFirestore();
const auth = getAuth();

/* ----------------------------------
   使用者（users）
---------------------------------- */

// 取得目前登入者 UID（統一入口）
function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('User not authenticated');
  }
  return uid;
}

// 第一次登入時建立 users/{uid}
export async function ensureUserDocument() {
  const uid = requireUid();
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      role: 'user',       // admin / user
      enabled: false,     // ❗ 預設不可用，由 admin 開
      createdAt: serverTimestamp()
    });
  }
}

// 取得自己的 user 設定（判斷 enabled / role）
export async function getMyUserInfo() {
  const uid = requireUid();
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data();
}

/* ----------------------------------
   Members（成員）- admin only write
---------------------------------- */

export async function getMembers() {
  const snap = await getDocs(collection(db, 'members'));
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

export async function addMember(name: string) {
  return await addDoc(collection(db, 'members'), {
    name,
    createdAt: serverTimestamp()
  });
}

/* ----------------------------------
   Lists（每個人自己的清單）
---------------------------------- */

export async function getMyLists() {
  const uid = requireUid();

  const q = query(
    collection(db, 'lists'),
    where('ownerUid', '==', uid)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

export async function createList(title: string) {
  const uid = requireUid();

  return await addDoc(collection(db, 'lists'), {
    title,
    ownerUid: uid,
    createdAt: serverTimestamp()
  });
}

/* ----------------------------------
   Expenses（分帳）
---------------------------------- */

export async function getExpenses(listId: string) {
  const q = query(
    collection(db, 'expenses'),
    where('listId', '==', listId)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

export async function addExpense(params: {
  listId: string;
  title: string;
  amount: number;
  paidByMemberId: string;
  splitMemberIds: string[];
}) {
  const uid = requireUid();

  return await addDoc(collection(db, 'expenses'), {
    ...params,
    createdBy: uid,
    createdAt: serverTimestamp()
  });
}
