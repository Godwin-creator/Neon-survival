# Documentation Technique - Neon Survival

Ce document détaille l'architecture, les mécaniques de jeu et les choix techniques du projet Neon Survival.

---

## 1. Architecture Globale

Le projet utilise une architecture **Full-Stack** intégrée via Vite et Express.

- **Frontend (SPA React)** : Gère le rendu du jeu (Canvas), l'interface utilisateur (UI), les menus, et l'authentification Firebase côté client.
- **Backend (Express)** : Gère la sécurisation des appels API (Gemini) et la validation des scores avant insertion dans Firestore.

Le fichier `server.ts` sert de point d'entrée. En développement, il utilise Vite comme middleware. En production, il sert les fichiers statiques générés dans le dossier `dist/`.

---

## 2. Mécaniques de Jeu (Frontend)

Le cœur du jeu se trouve dans `src/App.tsx` et les entités dans `src/game/entities.ts`.

### La Boucle de Jeu (Game Loop)
Le jeu utilise `requestAnimationFrame` pour mettre à jour et dessiner l'état du jeu à environ 60 FPS.
- **Update** : Calcule les nouvelles positions, gère les collisions, met à jour les timers (power-ups, spawn d'ennemis).
- **Draw** : Efface le canvas (avec un léger effet de traînée pour le style néon) et redessine toutes les entités.

### Entités (`entities.ts`)
- **Player** : Gère la position, la santé, le tir et les power-ups actifs.
- **Enemy** : Différents types d'ennemis avec des comportements distincts :
  - `basic` : Suit le joueur.
  - `dasher` : Rapide, fonce sur le joueur.
  - `tank` : Lent, beaucoup de points de vie.
  - `wavy` : Se déplace en suivant une courbe sinusoïdale.
  - `boss` : Apparaît toutes les 5 vagues, tire des projectiles.
- **Projectile** : Gère les tirs du joueur et du boss.
- **PowerUp** : Objets à ramasser (`spread` = tir multiple, `rapid` = cadence de tir augmentée, `shield` = invincibilité temporaire).
- **Particle** : Utilisé pour les effets d'explosion et les traînées visuelles.

---

## 3. Backend et API (`server.ts`)

Le backend expose deux routes principales pour sécuriser les opérations sensibles.

### `POST /api/death-message`
Génère un message de mort sarcastique via l'API Google Gemini.
- **Payload attendu** : `{ "score": number, "wave": number }`
- **Fonctionnement** : Le backend utilise la clé `GEMINI_API_KEY` (invisible pour le client) pour interroger le modèle `gemini-2.5-flash`.
- **Réponse** : `{ "message": string }`

### `POST /api/scores`
Valide et enregistre le score du joueur dans Firebase Firestore.
- **Payload attendu** : `{ "uid": string, "displayName": string, "score": number, "wave": number, "token": string, "sessionToken": string }`
- **Sécurité (Anti-triche)** :
  1. Vérifie que le score et la vague sont des nombres positifs.
  2. **Validation de Session (JWT)** : Vérifie le `sessionToken` généré au début de la partie. Calcule le temps écoulé depuis le début de la partie et rejette le score s'il est mathématiquement impossible (ex: un ratio de points par seconde trop élevé). Cela empêche l'injection de faux scores via DevTools ou requêtes HTTP forgées.
  3. Utilise l'API REST de Firebase (`identitytoolkit.googleapis.com`) pour vérifier la validité du `token` (ID Token) fourni par le client.
  4. S'assure que le `uid` du token correspond au `uid` de la requête.
- **Action** : Si valide, insère le document dans la collection `scores`.

---

## 4. Base de Données (Firebase Firestore)

### Collection `scores`
Structure d'un document de score :
```typescript
{
  uid: string;           // ID unique de l'utilisateur Firebase
  displayName: string;   // Nom du joueur (ou "Anonyme" / "Joueur Invité")
  score: number;         // Score final
  wave: number;          // Vague atteinte
  createdAt: Timestamp;  // Date et heure de l'enregistrement (généré par le serveur)
}
```

### Règles de Sécurité Firestore (Recommandées)
Puisque le backend s'occupe de l'écriture via le SDK Client (avec validation préalable), les règles Firestore peuvent être configurées pour n'autoriser que la lecture publique et l'écriture authentifiée :

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /scores/{document} {
      allow read: if true; // Permet d'afficher le classement à tous
      allow write: if request.auth != null; // Permet l'écriture si authentifié
    }
  }
}
```

---

## 5. Authentification

L'authentification est gérée par Firebase Auth côté client (`src/firebase.ts`).
- **Google Auth** : Connexion via un pop-up (`signInWithPopup`). Nécessite l'ajout des domaines autorisés dans la console Firebase.
- **Guest Auth** : Connexion anonyme (`signInAnonymously`) pour permettre aux joueurs de tester le jeu et d'enregistrer un score sans compte Google.

---

## 6. Audio et Accessibilité

- **AudioEngine (`src/game/AudioEngine.ts`)** : Un synthétiseur audio basique utilisant l'API Web Audio pour générer des sons rétro (tirs, explosions, power-ups) sans avoir besoin de fichiers `.mp3` externes.
- **Accessibilité** : Un mode "Réduire les effets visuels" est disponible dans les paramètres pour désactiver les tremblements d'écran (screen shake) et réduire les flashs lumineux, rendant le jeu plus confortable pour les personnes sensibles.
