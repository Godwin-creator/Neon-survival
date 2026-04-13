import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Firebase Client SDK for backend writes
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyCfuRa1fvCDPqva3MjijMOfdMBk1GdVVWM",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "neon-survival-15e00.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "neon-survival-15e00",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "neon-survival-15e00.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1091184220776",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:1091184220776:web:2fec87d37b21549e7b39dd",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-HGHGK85T6M"
};

const firebaseApp = initializeApp(firebaseConfig, 'backend-app');
const db = getFirestore(firebaseApp);

// API Routes
app.post('/api/death-message', async (req, res) => {
  try {
    const { score, wave } = req.body;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Génère une phrase courte, sarcastique et unique (max 15 mots) en français pour un joueur qui vient de mourir dans un jeu vidéo rétro néon. Le joueur a atteint le score de ${score} à la vague ${wave}. Fais une pique amusante en fonction de ces statistiques.`,
    });
    res.json({ message: response.text });
  } catch (error) {
    console.error('Error generating death message:', error);
    res.status(500).json({ message: "Le néon s'est éteint. Vous avez échoué." });
  }
});

app.post('/api/scores', async (req, res) => {
  try {
    const { uid, displayName, score, wave, token } = req.body;
    
    // Basic validation
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Invalid score' });
    }
    if (typeof wave !== 'number' || wave < 1) {
      return res.status(400).json({ error: 'Invalid wave' });
    }
    
    // Verify token if provided (anti-cheat)
    if (token) {
      try {
        const verifyRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token })
        });
        const verifyData = await verifyRes.json();
        
        if (!verifyData.users || verifyData.users[0].localId !== uid) {
          return res.status(403).json({ error: 'Unauthorized or invalid token' });
        }
      } catch (e) {
        console.error('Token verification failed:', e);
        return res.status(403).json({ error: 'Invalid token' });
      }
    }

    // Save to Firestore using Client SDK
    await addDoc(collection(db, 'scores'), {
      uid,
      displayName: displayName || 'Anonyme',
      score,
      wave,
      createdAt: serverTimestamp()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving score:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
