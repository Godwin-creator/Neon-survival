import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const getEnv = (key: string, fallback: string) => {
  const val = import.meta.env[key];
  // Use fallback if val is undefined, empty, or looks like a placeholder
  if (!val || val.trim() === '' || val.includes('TODO') || val.includes('your_')) {
    return fallback;
  }
  return val;
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY', "AIzaSyCJr1uicd-GyURjfF8pUO9hSaX7M16ET5w"),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', "gen-lang-client-0908897182.firebaseapp.com"),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID', "gen-lang-client-0908897182"),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', "gen-lang-client-0908897182.firebasestorage.app"),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', "631654501120"),
  appId: getEnv('VITE_FIREBASE_APP_ID', "1:631654501120:web:d52ee08483f616df33c1e5"),
  measurementId: getEnv('VITE_FIREBASE_MEASUREMENT_ID', "")
};

// Initialisation
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Utilisation de la Database ID ou "(default)" par défaut
export const db = getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-1028c091-ae8c-4dc4-aa0f-615482e6dcab");

export const googleProvider = new GoogleAuthProvider();

// Fonctions d'authentification
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result;
  } catch (error: any) {
    if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
      console.log("Popup closed by user");
    } else {
      console.error("Error signing in with Google", error);
    }
    throw error;
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};

export { onAuthStateChanged };