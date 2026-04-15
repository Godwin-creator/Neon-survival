# Neon Survival 🕹️

Neon Survival est un jeu de tir d'arcade (twin-stick shooter) au style rétro "synthwave" des années 80, développé avec React, TypeScript et HTML5 Canvas. Survivez à des vagues infinies d'ennemis géométriques, collectez des power-ups et hissez-vous au sommet du classement !

## ✨ Fonctionnalités

- **Gameplay Frénétique** : Déplacez-vous et tirez pour survivre à des vagues d'ennemis de plus en plus difficiles.
- **Esthétique Rétro-Néon** : Graphismes vectoriels lumineux, particules et effets visuels inspirés des années 80.
- **Génération par l'IA** : Des messages de mort sarcastiques et uniques générés par l'IA (Google Gemini) à chaque défaite.
- **Classement en Ligne** : Authentification via Google ou en tant qu'invité pour enregistrer vos scores sur une base de données en temps réel (Firebase).
- **Architecture Sécurisée** : Un backend Node.js/Express pour valider les scores et protéger les clés API.
- **Support Multi-plateforme** : Jouable au clavier/souris sur ordinateur, et avec des joysticks virtuels tactiles sur mobile.

## 🛠️ Technologies Utilisées

- **Frontend** : React 18, TypeScript, Vite, Tailwind CSS, HTML5 Canvas API, Lucide React (Icônes), Motion (Animations).
- **Backend** : Node.js, Express.
- **Base de données & Auth** : Firebase (Authentication, Firestore).
- **Intelligence Artificielle** : API Google Gemini (`gemini-2.5-flash`).

## 🚀 Installation et Lancement (Développement)

### Prérequis
- Node.js (v18+)
- Un projet Firebase (avec Authentication et Firestore activés)
- Une clé API Google Gemini

### 1. Cloner le projet et installer les dépendances
```bash
npm install
```

### 2. Configuration des variables d'environnement
Créez un fichier `.env` à la racine du projet et ajoutez vos clés :

```env
# Clé API Gemini (Backend uniquement)
GEMINI_API_KEY=votre_cle_api_gemini

# Configuration Firebase (Frontend & Backend)
VITE_FIREBASE_API_KEY=votre_cle_firebase
VITE_FIREBASE_AUTH_DOMAIN=votre_domaine_firebase
VITE_FIREBASE_PROJECT_ID=votre_project_id
VITE_FIREBASE_STORAGE_BUCKET=votre_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=votre_sender_id
VITE_FIREBASE_APP_ID=votre_app_id
VITE_FIREBASE_MEASUREMENT_ID=votre_measurement_id
```

### 3. Lancer le serveur de développement
```bash
npm run dev
```
Le jeu sera accessible sur `http://localhost:3000`.

## 🎮 Comment jouer ?

- **Sur Ordinateur** : 
  - `Z, Q, S, D` ou `Flèches directionnelles` pour se déplacer.
  - La souris pour viser, `Clic gauche` pour tirer.
- **Sur Mobile** : 
  - Joystick gauche pour le déplacement.
  - Joystick droit pour viser et tirer.

## 📜 Licence
Ce projet est créé à des fins éducatives et de divertissement.
