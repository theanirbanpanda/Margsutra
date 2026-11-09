import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

export const getTripByCode = async (code) => {
  try {
    const q = query(collection(db, "trips"), where("code", "==", code.trim().toUpperCase()));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return { success: false, error: "not_found" };
    return { success: true, trip: { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } };
  } catch (error) {
    return { success: false, error: "unreachable" };
  }
};

export const subscribeToSafetyProtocols = (callback) => {
  const q = query(collection(db, "safety_protocols"));
  return onSnapshot(q, (snapshot) => {
    const protocols = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(protocols);
  });
};