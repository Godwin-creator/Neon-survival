import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCfuRa1fvCDPqva3MjijMOfdMBk1GdVVWM",
  authDomain: "neon-survival-15e00.firebaseapp.com",
  projectId: "neon-survival-15e00",
  storageBucket: "neon-survival-15e00.firebasestorage.app",
  messagingSenderId: "1091184220776",
  appId: "1:1091184220776:web:2fec87d37b21549e7b39dd",
  measurementId: "G-HGHGK85T6M"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function test() {
  try {
    const docRef = await addDoc(collection(db, 'scores'), {
      uid: 'test-backend-uid',
      displayName: 'Backend Test',
      score: 100,
      wave: 2,
      createdAt: serverTimestamp()
    });
    console.log('Client SDK on backend works! Doc ID:', docRef.id);
  } catch (e) {
    console.error('Client SDK failed:', e);
  }
}
test();
