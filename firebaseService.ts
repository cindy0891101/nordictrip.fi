import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  doc,
} from "firebase/firestore";

import { Member, Expense, Booking } from "./types";

/* =========================
   Firebase 初始化
========================= */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========================
   共用 tripId（暫時）
   之後可換成動態
========================= */

const DEFAULT_TRIP_ID = "default-trip";

/* =========================
   Members
========================= */

export const membersService = {
  subscribe: (callback: (members: Member[]) => void) => {
    const colRef = collection(
      db,
      "trips",
      DEFAULT_TRIP_ID,
      "members"
    );

    return onSnapshot(colRef, (snapshot) => {
      const members = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Member[];

      callback(members);
    });
  },

  add: async (name: string) => {
    await addDoc(
      collection(db, "trips", DEFAULT_TRIP_ID, "members"),
      {
        name,
        createdAt: serverTimestamp(),
      }
    );
  },

  updateName: async (memberId: string, name: string) => {
    await updateDoc(
      doc(db, "trips", DEFAULT_TRIP_ID, "members", memberId),
      { name }
    );
  },

  remove: async (memberId: string) => {
    await deleteDoc(
      doc(db, "trips", DEFAULT_TRIP_ID, "members", memberId)
    );
  },
};

/* =========================
   Expenses
========================= */

export const expensesService = {
  subscribe: (callback: (expenses: Expense[]) => void) => {
    const q = query(
      collection(db, "trips", DEFAULT_TRIP_ID, "expenses"),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(q, (snapshot) => {
      const expenses = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Expense[];

      callback(expenses);
    });
  },

  add: async (expense: Omit<Expense, "id">) => {
    await addDoc(
      collection(db, "trips", DEFAULT_TRIP_ID, "expenses"),
      {
        ...expense,
        createdAt: serverTimestamp(),
      }
    );
  },

  update: async (
    expenseId: string,
    data: Partial<Expense>
  ) => {
    await updateDoc(
      doc(db, "trips", DEFAULT_TRIP_ID, "expenses", expenseId),
      data
    );
  },

  remove: async (expenseId: string) => {
    await deleteDoc(
      doc(db, "trips", DEFAULT_TRIP_ID, "expenses", expenseId)
    );
  },
};

/* =========================
   Schedules / Bookings
========================= */

export const schedulesService = {
  subscribe: (
    callback: (grouped: Record<string, Booking[]>) => void
  ) => {
    const q = query(
      collection(db, "trips", DEFAULT_TRIP_ID, "schedules"),
      orderBy("time", "asc")
    );

    return onSnapshot(q, (snapshot) => {
      const grouped: Record<string, Booking[]> = {};

      snapshot.docs.forEach((doc) => {
        const item = {
          id: doc.id,
          ...doc.data(),
        } as Booking;

        if (!grouped[item.date]) grouped[item.date] = [];
        grouped[item.date].push(item);
      });

      callback(grouped);
    });
  },

  add: async (booking: Omit<Booking, "id">) => {
    await addDoc(
      collection(db, "trips", DEFAULT_TRIP_ID, "schedules"),
      {
        ...booking,
        createdAt: serverTimestamp(),
      }
    );
  },

  update: async (
    bookingId: string,
    data: Partial<Booking>
  ) => {
    await updateDoc(
      doc(db, "trips", DEFAULT_TRIP_ID, "schedules", bookingId),
      data
    );
  },

  remove: async (bookingId: string) => {
    await deleteDoc(
      doc(db, "trips", DEFAULT_TRIP_ID, "schedules", bookingId)
    );
  },
};
