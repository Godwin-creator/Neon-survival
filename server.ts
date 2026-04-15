import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = 3000;
const GAME_SECRET = process.env.GAME_SECRET || 'neon_survival_secret_key_123';
const MAX_SCORE_PER_SECOND = 1000; // Anti-cheat threshold

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
app.post('/api/game/start', (req, res) => {
  // Generate a signed token containing the exact start time
  const token = jwt.sign({ startTime: Date.now() }, GAME_SECRET, { expiresIn: '2h' });
  res.json({ sessionToken: token });
});

// Optional: Endpoint to update session token when a wave is cleared (prevents wave skipping)
app.post('/api/game/wave', (req, res) => {
  const { sessionToken, wave } = req.body;
  if (!sessionToken) return res.status(403).json({ error: 'Missing token' });
  
  try {
    const decoded = jwt.verify(sessionToken, GAME_SECRET) as any;
    // Issue a new token with the updated wave
    const newToken = jwt.sign({ 
      startTime: decoded.startTime,
      waveReached: wave,
      lastWaveTime: Date.now()
    }, GAME_SECRET, { expiresIn: '2h' });
    
    res.json({ sessionToken: newToken });
  } catch (e) {
    res.status(403).json({ error: 'Invalid token' });
  }
});

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
    const { uid, displayName, score, wave, token, sessionToken } = req.body;
    
    // Basic validation
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Invalid score' });
    }
    if (typeof wave !== 'number' || wave < 1) {
      return res.status(400).json({ error: 'Invalid wave' });
    }
    
    // Anti-Cheat: Validate Game Session
    if (!sessionToken) {
      return res.status(403).json({ error: 'Missing game session token. Cheat detected.' });
    }
    
    try {
      const decoded = jwt.verify(sessionToken, GAME_SECRET) as { startTime: number, waveReached?: number };
      const elapsedSeconds = (Date.now() - decoded.startTime) / 1000;
      
      // 1. Check Score Rate (Max points per second)
      // A boss is 500 pts, normal enemies are 10-50 pts. 
      // Even with a perfect run, scoring more than ~150-200 pts per second consistently is impossible.
      const maxPlausibleScoreRate = 250; 
      
      // 2. Check Wave Progression Speed
      // A wave requires 500 points. At max plausible rate, a wave takes at least 2 seconds.
      // In reality, enemies spawn slowly, so a wave takes much longer (10-30 seconds).
      const minSecondsPerWave = 5; 
      const expectedMinDuration = wave * minSecondsPerWave;

      // 3. Check Score vs Wave consistency
      // You need at least (wave-1)*500 points to reach a wave.
      const minRequiredScore = (wave - 1) * 500;

      if (score < minRequiredScore) {
         console.warn(`Cheat detected! Score too low for wave. Score: ${score}, Wave: ${wave}`);
         return res.status(403).json({ error: 'Score rejected: mathematical inconsistency.' });
      }

      if (elapsedSeconds < 1 || (score / elapsedSeconds) > maxPlausibleScoreRate) {
        console.warn(`Cheat detected! Score: ${score}, Time: ${elapsedSeconds}s, Rate: ${score/elapsedSeconds} pts/s`);
        return res.status(403).json({ error: 'Score rejected: unrealistic score rate (possible cheat detected).' });
      }

      if (elapsedSeconds < expectedMinDuration) {
        console.warn(`Cheat detected! Reached wave ${wave} in only ${elapsedSeconds}s`);
        return res.status(403).json({ error: 'Score rejected: wave progression too fast.' });
      }

    } catch (e) {
      return res.status(403).json({ error: 'Invalid or expired game session.' });
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
