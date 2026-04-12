/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, signInWithGoogle, logOut } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';

// --- Game Entities ---

class Player {
  x: number;
  y: number;
  angle: number;
  size: number;
  shieldTimer: number;
  spreadTimer: number;
  speedTimer: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.size = 15;
    this.shieldTimer = 0;
    this.spreadTimer = 0;
    this.speedTimer = 0;
  }

  update(mouseX: number, mouseY: number) {
    // Smooth follow
    const lerp = this.speedTimer > 0 ? 0.3 : 0.1;
    this.x += (mouseX - this.x) * lerp;
    this.y += (mouseY - this.y) * lerp;
    this.angle = Math.atan2(mouseY - this.y, mouseX - this.x);
    
    if (this.shieldTimer > 0) this.shieldTimer--;
    if (this.spreadTimer > 0) this.spreadTimer--;
    if (this.speedTimer > 0) this.speedTimer--;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    
    if (this.shieldTimer > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 1.8, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 85, 255, ${0.5 + Math.sin(Date.now() * 0.01) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#0055ff';
      ctx.stroke();
    }

    ctx.rotate(this.angle);
    
    let color = '#00f3ff';
    if (this.spreadTimer > 0) color = '#ff00ff';
    else if (this.speedTimer > 0) color = '#ffff00';

    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.size, 0);
    ctx.lineTo(-this.size * 0.6, this.size * 0.6);
    ctx.lineTo(-this.size * 0.6, -this.size * 0.6);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;

  constructor(x: number, y: number, angle: number) {
    this.x = x;
    this.y = y;
    const speed = 15;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 100;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f3ff';
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

type PowerUpType = 'shield' | 'spread' | 'speed';

class PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  size: number;
  life: number;
  tick: number;

  constructor(x: number, y: number, type: PowerUpType) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.size = 12;
    this.life = 600;
    this.tick = 0;
  }

  update() {
    this.life--;
    this.tick++;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tick * 0.05);
    
    let color = '#ffffff';
    if (this.type === 'shield') color = '#0055ff';
    else if (this.type === 'spread') color = '#ff00ff';
    else if (this.type === 'speed') color = '#ffff00';

    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    if (this.life < 120 && this.tick % 10 < 5) {
      ctx.globalAlpha = 0.3;
    }

    ctx.beginPath();
    ctx.arc(0, 0, this.size + Math.sin(this.tick * 0.1) * 2, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = color;
    if (this.type === 'shield') {
      ctx.fillRect(-4, -4, 8, 8);
    } else if (this.type === 'spread') {
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(5, 4); ctx.lineTo(-5, 4);
      ctx.fill();
    } else if (this.type === 'speed') {
      ctx.beginPath();
      ctx.moveTo(-4, -5); ctx.lineTo(4, 0); ctx.lineTo(-4, 5);
      ctx.fill();
    }

    ctx.restore();
  }
}

type EnemyType = 'chaser' | 'dasher' | 'tank' | 'wavy' | 'boss';

class Enemy {
  x: number;
  y: number;
  size: number;
  speed: number;
  type: EnemyType;
  color: string;
  hp: number;
  maxHp: number;
  tick: number;
  angle: number;
  state: number;
  stateTimer: number;

  constructor(x: number, y: number, speed: number, type: EnemyType) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.tick = 0;
    this.angle = 0;
    this.state = 0;
    this.stateTimer = 0;

    switch (type) {
      case 'boss':
        this.size = 45;
        this.speed = speed * 1.2;
        this.color = '#ffffff'; // White
        this.hp = 100;
        break;
      case 'dasher':
        this.size = 12;
        this.speed = speed * 1.8;
        this.color = '#ffaa00'; // Orange
        this.hp = 1;
        break;
      case 'tank':
        this.size = 24;
        this.speed = speed * 0.5;
        this.color = '#b700ff'; // Purple
        this.hp = 5;
        break;
      case 'wavy':
        this.size = 14;
        this.speed = speed * 1.2;
        this.color = '#00ff44'; // Green
        this.hp = 2;
        break;
      case 'chaser':
      default:
        this.size = 16;
        this.speed = speed;
        this.color = '#ff003c'; // Red
        this.hp = 1;
        break;
    }
    this.maxHp = this.hp;
  }

  update(playerX: number, playerY: number) {
    this.tick++;
    const targetAngle = Math.atan2(playerY - this.y, playerX - this.x);

    if (this.type === 'boss') {
      this.stateTimer++;
      if (this.state === 0) {
        // Orbit and approach slowly
        const orbitDist = 250;
        const targetX = playerX + Math.cos(this.tick * 0.03) * orbitDist;
        const targetY = playerY + Math.sin(this.tick * 0.03) * orbitDist;
        const angleToTarget = Math.atan2(targetY - this.y, targetX - this.x);
        this.x += Math.cos(angleToTarget) * this.speed;
        this.y += Math.sin(angleToTarget) * this.speed;
        
        if (this.stateTimer > 180) {
          this.state = 1;
          this.stateTimer = 0;
          this.angle = targetAngle; // Lock target for dash
        }
      } else if (this.state === 1) {
        // Dash attack
        this.x += Math.cos(this.angle) * this.speed * 3.5;
        this.y += Math.sin(this.angle) * this.speed * 3.5;
        
        if (this.stateTimer > 45) {
          this.state = 0;
          this.stateTimer = 0;
        }
      }
    } else if (this.type === 'wavy') {
      this.angle = targetAngle;
      const waveOffset = Math.sin(this.tick * 0.15) * 4;
      this.x += Math.cos(this.angle) * this.speed + Math.cos(this.angle + Math.PI/2) * waveOffset;
      this.y += Math.sin(this.angle) * this.speed + Math.sin(this.angle + Math.PI/2) * waveOffset;
    } else if (this.type === 'dasher') {
       this.angle = targetAngle;
       this.x += Math.cos(this.angle) * this.speed;
       this.y += Math.sin(this.angle) * this.speed;
    } else {
      this.angle = targetAngle;
      this.x += Math.cos(this.angle) * this.speed;
      this.y += Math.sin(this.angle) * this.speed;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.translate(this.x, this.y);

    const hpRatio = this.hp / this.maxHp;
    ctx.globalAlpha = 0.4 + 0.6 * hpRatio;

    if (this.type === 'boss') {
      ctx.rotate(this.tick * 0.02);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 / 8) * i;
        const r = i % 2 === 0 ? this.size : this.size * 0.6;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = this.color;
      ctx.globalAlpha = 0.2 * hpRatio;
      ctx.fill();
      
      // Draw a core
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = this.state === 1 ? '#ff003c' : this.color; // Core turns red when dashing
      ctx.globalAlpha = 0.8;
      ctx.fill();
    } else if (this.type === 'tank') {
      ctx.rotate(this.tick * 0.02);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i;
        ctx.lineTo(Math.cos(a) * this.size, Math.sin(a) * this.size);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = this.color;
      ctx.globalAlpha = 0.2 * hpRatio;
      ctx.fill();
    } else if (this.type === 'dasher') {
      ctx.rotate(this.angle);
      ctx.beginPath();
      ctx.moveTo(this.size, 0);
      ctx.lineTo(-this.size, this.size * 0.6);
      ctx.lineTo(-this.size * 0.5, 0);
      ctx.lineTo(-this.size, -this.size * 0.6);
      ctx.closePath();
      ctx.stroke();
    } else if (this.type === 'wavy') {
      ctx.rotate(this.tick * 0.05);
      ctx.beginPath();
      ctx.moveTo(0, -this.size);
      ctx.lineTo(this.size, 0);
      ctx.lineTo(0, this.size);
      ctx.lineTo(-this.size, 0);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.rotate(this.tick * 0.05);
      ctx.strokeRect(-this.size / 2, -this.size / 2, this.size, this.size);
    }

    ctx.restore();
  }
}

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 1;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1;
    this.decay = Math.random() * 0.05 + 0.02;
    this.color = color;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- Audio System ---

class AudioEngine {
  ctx: AudioContext | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playShoot() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playExplosion(isBoss = false) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(isBoss ? 100 : 200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + (isBoss ? 0.5 : 0.2));
    gain.gain.setValueAtTime(isBoss ? 0.2 : 0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (isBoss ? 0.5 : 0.2));
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + (isBoss ? 0.5 : 0.2));
  }

  playPowerUp() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.setValueAtTime(554.37, this.ctx.currentTime + 0.05);
    osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playGameOver() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 1.5);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 1.5);
  }
}

const audio = new AudioEngine();

// --- Main Application ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [gameId, setGameId] = useState(0);
  const [deathMessage, setDeathMessage] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Firebase Leaderboard Listener
  useEffect(() => {
    const q = query(collection(db, 'scores'), orderBy('score', 'desc'), limit(5));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const scoresData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeaderboard(scoresData);
    }, (error) => {
      console.error("Error fetching leaderboard:", error);
    });
    return () => unsubscribe();
  }, []);

  const saveScore = async (finalScore: number, finalWave: number) => {
    if (!user || finalScore === 0) return;
    try {
      await addDoc(collection(db, 'scores'), {
        uid: user.uid,
        displayName: user.displayName || 'Anonyme',
        score: finalScore,
        wave: finalWave,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error saving score:", error);
    }
  };

  const gameState = useRef({
    player: null as Player | null,
    projectiles: [] as Projectile[],
    enemies: [] as Enemy[],
    powerUps: [] as PowerUp[],
    particles: [] as Particle[],
    score: 0,
    wave: 1,
    shake: 0,
    isGameOver: false,
    isPaused: false,
    mouseX: window.innerWidth / 2,
    mouseY: window.innerHeight / 2,
    isShooting: false,
    shootCooldown: 0,
    frames: 0,
    bossSpawnedForWave: 0,
  });

  // Fetch a snarky death message using Gemini Flash Lite
  const fetchDeathMessage = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: `Génère une phrase courte et sarcastique (max 10 mots) en français pour un joueur qui vient de mourir dans un jeu vidéo rétro néon. N'inclus pas les stats dans la phrase, juste la pique.`,
      });
      setDeathMessage(response.text);
    } catch (err) {
      setDeathMessage("Le néon s'est éteint. Vous avez échoué.");
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle Resize
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    let animationId: number;

    // Reset State
    gameState.current = {
      player: new Player(canvas.width / 2, canvas.height / 2),
      projectiles: [],
      enemies: [],
      powerUps: [],
      particles: [],
      score: 0,
      wave: 1,
      shake: 0,
      isGameOver: false,
      isPaused: false,
      mouseX: canvas.width / 2,
      mouseY: canvas.height / 2,
      isShooting: false,
      shootCooldown: 0,
      frames: 0,
      bossSpawnedForWave: 0,
    };

    const spawnEnemy = () => {
      const { wave } = gameState.current;
      
      if (wave > 0 && wave % 5 === 0 && gameState.current.bossSpawnedForWave !== wave) {
        gameState.current.bossSpawnedForWave = wave;
        const boss = new Enemy(canvas.width / 2, -100, 1.5, 'boss');
        boss.hp = 50 + wave * 10;
        boss.maxHp = boss.hp;
        gameState.current.enemies.push(boss);
        return;
      }

      let x, y;
      if (Math.random() < 0.5) {
        x = Math.random() < 0.5 ? -30 : canvas.width + 30;
        y = Math.random() * canvas.height;
      } else {
        x = Math.random() * canvas.width;
        y = Math.random() < 0.5 ? -30 : canvas.height + 30;
      }
      const speed = 1 + Math.random() * (wave * 0.3);

      let type: EnemyType = 'chaser';
      const rand = Math.random();

      if (wave >= 4) {
        if (rand < 0.4) type = 'chaser';
        else if (rand < 0.65) type = 'dasher';
        else if (rand < 0.85) type = 'wavy';
        else type = 'tank';
      } else if (wave >= 3) {
        if (rand < 0.5) type = 'chaser';
        else if (rand < 0.75) type = 'dasher';
        else type = 'tank';
      } else if (wave >= 2) {
        if (rand < 0.7) type = 'chaser';
        else type = 'dasher';
      }

      gameState.current.enemies.push(new Enemy(x, y, speed, type));
    };

    const createExplosion = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        gameState.current.particles.push(new Particle(x, y, color));
      }
    };

    const loop = () => {
      const state = gameState.current;

      if (state.isPaused) {
        animationId = requestAnimationFrame(loop);
        return;
      }

      state.frames++;

      // Trail effect background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (state.isGameOver) {
        // Only update particles if game is over
        for (let i = state.particles.length - 1; i >= 0; i--) {
          const p = state.particles[i];
          p.update();
          p.draw(ctx);
          if (p.life <= 0) state.particles.splice(i, 1);
        }
        if (state.particles.length > 0) {
          animationId = requestAnimationFrame(loop);
        }
        return;
      }

      // Screen shake
      if (state.shake > 0) {
        ctx.save();
        const dx = (Math.random() - 0.5) * state.shake;
        const dy = (Math.random() - 0.5) * state.shake;
        ctx.translate(dx, dy);
      }

      // Player
      if (state.player) {
        state.player.update(state.mouseX, state.mouseY);
        state.player.draw(ctx);

        // Speed Trail
        if (state.player.speedTimer > 0 && state.frames % 2 === 0) {
          const p = new Particle(state.player.x, state.player.y, '#ffff00');
          p.vx = 0;
          p.vy = 0;
          p.life = 0.5;
          p.decay = 0.03;
          state.particles.push(p);
        }

        if (state.isShooting && state.shootCooldown <= 0) {
          audio.playShoot();
          if (state.player.spreadTimer > 0) {
            state.projectiles.push(new Projectile(state.player.x, state.player.y, state.player.angle));
            state.projectiles.push(new Projectile(state.player.x, state.player.y, state.player.angle - 0.25));
            state.projectiles.push(new Projectile(state.player.x, state.player.y, state.player.angle + 0.25));
            state.shootCooldown = 6;
          } else {
            state.projectiles.push(new Projectile(state.player.x, state.player.y, state.player.angle));
            state.shootCooldown = 8;
          }
        }
        if (state.shootCooldown > 0) state.shootCooldown--;
      }

      // Projectiles
      for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        p.update();
        p.draw(ctx);
        if (p.life <= 0 || p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
          state.projectiles.splice(i, 1);
        }
      }

      // Spawning logic
      const isBossAlive = state.enemies.some(e => e.type === 'boss');
      const spawnRate = isBossAlive ? 120 : Math.max(15, 80 - state.wave * 5);
      
      if (state.frames % spawnRate === 0) {
        spawnEnemy();
      }

      // Wave progression
      if (state.score >= state.wave * 500) {
        state.wave++;
        setWave(state.wave);
      }

      // PowerUps
      for (let i = state.powerUps.length - 1; i >= 0; i--) {
        const pu = state.powerUps[i];
        pu.update();
        pu.draw(ctx);

        if (state.player) {
          const dist = Math.hypot(state.player.x - pu.x, state.player.y - pu.y);
          if (dist < state.player.size + pu.size) {
            audio.playPowerUp();
            if (pu.type === 'shield') state.player.shieldTimer = 600;
            if (pu.type === 'spread') state.player.spreadTimer = 420;
            if (pu.type === 'speed') state.player.speedTimer = 420;
            state.powerUps.splice(i, 1);
            createExplosion(pu.x, pu.y, pu.type === 'shield' ? '#0055ff' : pu.type === 'spread' ? '#ff00ff' : '#ffff00', 15);
            continue;
          }
        }

        if (pu.life <= 0) {
          state.powerUps.splice(i, 1);
        }
      }

      // Enemies
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        if (state.player) e.update(state.player.x, state.player.y);
        e.draw(ctx);

        // Player collision
        if (state.player) {
          const dist = Math.hypot(state.player.x - e.x, state.player.y - e.y);
          if (dist < state.player.size + e.size / 2) {
            if (state.player.shieldTimer > 0) {
              audio.playExplosion();
              state.enemies.splice(i, 1);
              createExplosion(e.x, e.y, e.color, 20);
              state.shake = 5;
              state.player.shieldTimer = 0; // Shield breaks
              continue;
            } else {
              audio.playGameOver();
              state.isGameOver = true;
              createExplosion(state.player.x, state.player.y, '#00f3ff', 50);
              setIsGameOver(true);
              fetchDeathMessage();
              saveScore(state.score, state.wave);
            }
          }
        }

        // Projectile collision
        for (let j = state.projectiles.length - 1; j >= 0; j--) {
          const p = state.projectiles[j];
          const dist = Math.hypot(p.x - e.x, p.y - e.y);
          if (dist < e.size) {
            e.hp--;
            state.projectiles.splice(j, 1);
            createExplosion(p.x, p.y, e.color, 5); // Small hit explosion

            if (e.hp <= 0) {
              audio.playExplosion(e.type === 'boss');
              state.enemies.splice(i, 1);
              const points = e.type === 'boss' ? 500 : e.type === 'tank' ? 50 : e.type === 'wavy' ? 30 : e.type === 'dasher' ? 20 : 10;
              state.score += points;
              setScore(state.score);
              state.shake = e.type === 'boss' ? 30 : e.type === 'tank' ? 15 : 8;
              createExplosion(e.x, e.y, e.color, e.type === 'boss' ? 100 : e.type === 'tank' ? 30 : 15);
              
              // PowerUp drop
              if (Math.random() < 0.1 || e.type === 'boss') {
                const types: PowerUpType[] = ['shield', 'spread', 'speed'];
                const type = types[Math.floor(Math.random() * types.length)];
                state.powerUps.push(new PowerUp(e.x, e.y, type));
              }
            }
            break;
          }
        }
      }

      // Particles
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.update();
        p.draw(ctx);
        if (p.life <= 0) {
          state.particles.splice(i, 1);
        }
      }

      // Restore screen shake
      if (state.shake > 0) {
        ctx.restore();
        state.shake *= 0.9;
        if (state.shake < 0.5) state.shake = 0;
      }

      // Draw PowerUp UI
      if (state.player) {
        let yOffset = canvas.height - 30;
        const drawBar = (label: string, timer: number, maxTimer: number, color: string) => {
          if (timer <= 0) return;
          const width = 150;
          const height = 8;
          const x = 30;
          
          ctx.save();
          ctx.fillStyle = color;
          ctx.shadowBlur = 10;
          ctx.shadowColor = color;
          ctx.font = 'bold 12px Inter';
          ctx.fillText(label, x, yOffset - 8);
          
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, yOffset, width, height);
          
          ctx.fillRect(x, yOffset, width * (timer / maxTimer), height);
          ctx.restore();
          
          yOffset -= 45;
        };

        drawBar('VITESSE', state.player.speedTimer, 420, '#ffff00');
        drawBar('TIR MULTIPLE', state.player.spreadTimer, 420, '#ff00ff');
        drawBar('BOUCLIER', state.player.shieldTimer, 600, '#0055ff');
      }

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [gameId]);

  // Input Listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      gameState.current.mouseX = e.clientX;
      gameState.current.mouseY = e.clientY;
    };
    const handleMouseDown = () => {
      audio.init();
      if (gameState.current.isGameOver) return;
      if (gameState.current.isPaused) {
        gameState.current.isPaused = false;
        setIsPaused(false);
      }
      gameState.current.isShooting = true;
    };
    const handleMouseUp = () => { gameState.current.isShooting = false; };
    const handleKeyDown = (e: KeyboardEvent) => {
      audio.init();
      if (e.key.toLowerCase() === 'p' && !gameState.current.isGameOver) {
        gameState.current.isPaused = !gameState.current.isPaused;
        setIsPaused(gameState.current.isPaused);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleRestart = () => {
    setScore(0);
    setWave(1);
    setIsGameOver(false);
    setIsPaused(false);
    setDeathMessage(null);
    setGameId((id) => id + 1);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black font-['Inter'] select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
      />

      {/* HUD */}
      <div className="absolute top-6 right-8 text-right pointer-events-none">
        <div className="text-4xl font-bold text-[#00f3ff] drop-shadow-[0_0_10px_rgba(0,243,255,0.8)]">
          {score}
        </div>
        <div className="text-xl font-semibold text-white/80 tracking-widest uppercase mt-1">
          Vague {wave}
        </div>
      </div>

      {/* Auth UI */}
      <div className="absolute top-6 left-8 z-10">
        {user ? (
          <div className="flex items-center gap-4 bg-black/50 p-2 rounded-full border border-zinc-800 backdrop-blur-sm">
            {user.photoURL && <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />}
            <span className="text-white text-sm font-medium">{user.displayName}</span>
            <button onClick={logOut} className="text-xs text-zinc-400 hover:text-white px-2">Déconnexion</button>
          </div>
        ) : (
          <button 
            onClick={signInWithGoogle}
            className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full font-bold hover:bg-zinc-200 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Connexion Google
          </button>
        )}
      </div>

      {/* Pause Screen */}
      <AnimatePresence>
        {isPaused && !isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none"
          >
            <h2 className="text-6xl font-black text-white tracking-[0.2em] drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]">
              PAUSE
            </h2>
            <p className="text-zinc-300 mt-6 tracking-widest text-lg uppercase">
              Appuyez sur 'P' ou cliquez pour reprendre
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over Screen */}
      <AnimatePresence>
        {isGameOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <h1 className="text-6xl font-black text-[#ff003c] drop-shadow-[0_0_20px_rgba(255,0,60,0.8)] mb-4 tracking-tighter">
              GAME OVER
            </h1>
            
            <div className="text-2xl text-white mb-8">
              Score Final : <span className="text-[#00f3ff] font-bold">{score}</span>
            </div>

            {/* Leaderboard */}
            <div className="bg-black/50 border border-zinc-800 rounded-xl p-6 mb-8 w-full max-w-md">
              <h3 className="text-xl font-bold text-white mb-4 text-center tracking-widest">TOP SCORES</h3>
              {leaderboard.length > 0 ? (
                <div className="space-y-3">
                  {leaderboard.map((entry, index) => (
                    <div key={entry.id} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-zinc-300' : index === 2 ? 'text-amber-600' : 'text-zinc-500'}`}>
                          #{index + 1}
                        </span>
                        <span className="text-white">{entry.displayName}</span>
                      </div>
                      <div className="text-[#00f3ff] font-mono">{entry.score}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-zinc-500 text-center text-sm">Aucun score enregistré</div>
              )}
              {!user && (
                <div className="mt-4 text-center text-xs text-zinc-400">
                  Connectez-vous pour sauvegarder votre score !
                </div>
              )}
            </div>

            {deathMessage && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md text-center text-zinc-400 italic mb-12 text-lg"
              >
                "{deathMessage}"
              </motion.div>
            )}

            <button
              onClick={handleRestart}
              className="px-8 py-4 bg-transparent border-2 border-[#00f3ff] text-[#00f3ff] font-bold text-xl uppercase tracking-widest hover:bg-[#00f3ff] hover:text-black transition-all duration-300 shadow-[0_0_15px_rgba(0,243,255,0.4)] hover:shadow-[0_0_30px_rgba(0,243,255,0.8)]"
            >
              Rejouer
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
