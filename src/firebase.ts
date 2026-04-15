import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
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
  apiKey: getEnv('VITE_FIREBASE_API_KEY', "AIzaSyCfuRa1fvCDPqva3MjijMOfdMBk1GdVVWM"),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', "neon-survival-15e00.firebaseapp.com"),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID', "neon-survival-15e00"),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', "neon-survival-15e00.firebasestorage.app"),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', "1091184220776"),
  appId: getEnv('VITE_FIREBASE_APP_ID', "1:1091184220776:web:2fec87d37b21549e7b39dd"),
  measurementId: getEnv('VITE_FIREBASE_MEASUREMENT_ID', "G-HGHGK85T6M")
};

// Initialisation
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Utilisation de la Database par défaut
export const db = getFirestore(app);

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

export const signInAsGuest = async () => {
  try {
    const result = await signInAnonymously(auth);
    return result;
  } catch (error) {
    console.error("Error signing in anonymously", error);
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