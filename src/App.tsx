/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pause, Play, Settings, Edit2, X, Volume2, VolumeX } from 'lucide-react';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { Player, Projectile, PowerUp, Enemy, Particle, PowerUpType, Difficulty, EnemyType } from './game/entities';
import { audio } from './game/AudioEngine';

// --- Main Application ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [gameId, setGameId] = useState(0);
  const [deathMessage, setDeathMessage] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [currentScreen, setCurrentScreen] = useState<'home' | 'game' | 'dashboard'>('home');
  const [isTutorial, setIsTutorial] = useState(false);
  const [tutorialText, setTutorialText] = useState('');
  const [accessibilityMode, setAccessibilityMode] = useState(false);
  
  // Settings & Customization
  const [volume, setVolume] = useState(0.5);
  const [particlesEnabled, setParticlesEnabled] = useState(true);
  const [shakeEnabled, setShakeEnabled] = useState(true);
  const [playerColor, setPlayerColor] = useState('#00f3ff');
  const [particleStyle, setParticleStyle] = useState<'circle' | 'square' | 'star'>('circle');
  const [bgTheme, setBgTheme] = useState<'classic' | 'grid' | 'matrix'>('classic');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Apply volume
  useEffect(() => {
    audio.setVolume(volume);
  }, [volume]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error("Error attempting to enable fullscreen:", err));
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
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
    isGameStarted: false,
    mouseX: window.innerWidth / 2,
    mouseY: window.innerHeight / 2,
    isShooting: false,
    shootCooldown: 0,
    frames: 0,
    bossSpawnedForWave: 0,
    bossesKilled: 0,
    cloneTimer: 0,
    clone: { x: window.innerWidth / 2, y: window.innerHeight / 2, angle: 0 },
    joystick: { active: false, dx: 0, dy: 0, touchId: -1 },
    aimTouchId: -1,
    extraBonusDuration: 0,
    damageFlash: 0,
    comboCount: 0,
    comboTimer: 0,
    comboMessage: '',
    comboMessageTimer: 0,
    comboScale: 1,
    accessibilityMode: false,
  });

  // Fetch a snarky death message using Gemini API
  const fetchDeathMessage = async (finalScore: number, finalWave: number) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `Génère une phrase courte, sarcastique et unique (max 15 mots) en français pour un joueur qui vient de mourir dans un jeu vidéo rétro néon. Le joueur a atteint le score de ${finalScore} à la vague ${finalWave}. Fais une pique amusante en fonction de ces statistiques.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });
      if (response.text) {
        setDeathMessage(response.text);
      } else {
        setDeathMessage("Le néon s'est éteint. Vous avez échoué.");
      }
    } catch (err) {
      console.error('Error generating death message:', err);
      setDeathMessage("Le néon s'est éteint. Vous avez échoué.");
    }
  };

  useEffect(() => {
    if (currentScreen !== 'game') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    gameState.current.accessibilityMode = accessibilityMode;

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
    const player = new Player(canvas.width / 2, canvas.height / 2, playerColor);
    if (difficulty === 'easy') {
      player.shieldTimer = 600; // Start with shield on easy
    }

    gameState.current = {
      player,
      projectiles: [],
      enemies: [],
      powerUps: [],
      particles: [],
      score: 0,
      wave: 1,
      shake: 0,
      isGameOver: false,
      isPaused: false,
      isGameStarted: true,
      mouseX: canvas.width / 2,
      mouseY: canvas.height / 2,
      isShooting: false,
      shootCooldown: 0,
      frames: 0,
      bossSpawnedForWave: 0,
      joystick: { active: false, dx: 0, dy: 0, touchId: -1 },
      aimTouchId: -1,
      extraBonusDuration: 0,
      damageFlash: 0,
      comboCount: 0,
      comboTimer: 0,
      comboMessage: '',
      comboMessageTimer: 0,
      comboScale: 1,
      accessibilityMode: accessibilityMode,
      tutorialStep: isTutorial ? 0 : -1,
      tutorialTimer: 0,
      tutorialEnemySpawned: false,
      tutorialPowerUpSpawned: false,
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
      const speedMultiplier = difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.5 : 1.0;
      const speed = (1 + Math.random() * (wave * 0.3)) * speedMultiplier;

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
      if (!particlesEnabled) return;
      for (let i = 0; i < count; i++) {
        gameState.current.particles.push(new Particle(x, y, color, particleStyle));
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
      if (bgTheme === 'classic') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (bgTheme === 'grid') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.1)';
        ctx.lineWidth = 1;
        const offset = (state.frames * 2) % 50;
        ctx.beginPath();
        for(let i = 0; i < canvas.width; i += 50) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
        for(let i = 0; i < canvas.height; i += 50) { ctx.moveTo(0, i + offset); ctx.lineTo(canvas.width, i + offset); }
        ctx.stroke();
      } else if (bgTheme === 'matrix') {
        ctx.fillStyle = 'rgba(0, 20, 0, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 255, 68, 0.1)';
        for(let i = 0; i < 20; i++) {
          const x = Math.random() * canvas.width;
          const y = (state.frames * (Math.random() * 5 + 2)) % canvas.height;
          ctx.fillRect(x, y, 2, 10 + Math.random() * 20);
        }
      }

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
        if (shakeEnabled) {
          const dx = (Math.random() - 0.5) * state.shake;
          const dy = (Math.random() - 0.5) * state.shake;
          ctx.translate(dx, dy);
        }
      }

      // Player
      if (state.player) {
        const isAiming = state.aimTouchId !== -1 || (!state.joystick.active && state.isShooting);
        state.player.update(state.mouseX, state.mouseY, state.joystick, isAiming);
        state.player.draw(ctx);

        // Clone logic
        if (state.cloneTimer > 0) {
          state.cloneTimer--;
          const targetX = state.player.x - Math.cos(state.player.angle) * 40;
          const targetY = state.player.y - Math.sin(state.player.angle) * 40;
          state.clone.x += (targetX - state.clone.x) * 0.1;
          state.clone.y += (targetY - state.clone.y) * 0.1;

          let nearestEnemy = null;
          let minDist = Infinity;
          for (const e of state.enemies) {
            const dist = Math.hypot(e.x - state.clone.x, e.y - state.clone.y);
            if (dist < minDist) {
              minDist = dist;
              nearestEnemy = e;
            }
          }

          if (nearestEnemy) {
            state.clone.angle = Math.atan2(nearestEnemy.y - state.clone.y, nearestEnemy.x - state.clone.x);
          } else {
            state.clone.angle = state.player.angle;
          }

          ctx.save();
          ctx.translate(state.clone.x, state.clone.y);
          ctx.rotate(state.clone.angle);
          ctx.strokeStyle = '#00ff44';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(15, 0);
          ctx.lineTo(-10, 10);
          ctx.lineTo(-10, -10);
          ctx.closePath();
          ctx.stroke();
          
          if (state.player.shieldTimer > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, 25, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 243, 255, ${Math.min(1, state.player.shieldTimer / 60)})`;
            ctx.stroke();
          }
          ctx.restore();
        }

        // Speed Trail
        if (state.player.speedTimer > 0 && state.frames % 2 === 0) {
          const p = new Particle(state.player.x, state.player.y, '#ffff00', particleStyle);
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
            if (state.cloneTimer > 0) {
              state.projectiles.push(new Projectile(state.clone.x, state.clone.y, state.clone.angle));
              state.projectiles.push(new Projectile(state.clone.x, state.clone.y, state.clone.angle - 0.25));
              state.projectiles.push(new Projectile(state.clone.x, state.clone.y, state.clone.angle + 0.25));
            }
            state.shootCooldown = 6;
          } else {
            state.projectiles.push(new Projectile(state.player.x, state.player.y, state.player.angle));
            if (state.cloneTimer > 0) {
              state.projectiles.push(new Projectile(state.clone.x, state.clone.y, state.clone.angle));
            }
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
      if (!isTutorial) {
        const isBossAlive = state.enemies.some(e => e.type === 'boss');
        const spawnRateMultiplier = difficulty === 'easy' ? 1.5 : difficulty === 'hard' ? 0.7 : 1.0;
        const baseSpawnRate = Math.max(15, 80 - state.wave * 5);
        const spawnRate = isBossAlive ? 120 : Math.floor(baseSpawnRate * spawnRateMultiplier);
        
        if (state.frames % spawnRate === 0) {
          spawnEnemy();
        }
      }

      // Tutorial Logic
      if (isTutorial && state.player) {
        if (state.tutorialStep === 0) {
          setTutorialText("Utilisez ZQSD, les flèches ou le joystick pour vous déplacer.");
          if (state.joystick.active || Math.abs(state.player.x - canvas.width / 2) > 50 || Math.abs(state.player.y - canvas.height / 2) > 50) {
            state.tutorialTimer++;
            if (state.tutorialTimer > 60) {
              state.tutorialStep = 1;
              state.tutorialTimer = 0;
            }
          }
        } else if (state.tutorialStep === 1) {
          setTutorialText("Utilisez la souris ou touchez l'écran pour tirer.");
          if (state.isShooting) {
            state.tutorialTimer++;
            if (state.tutorialTimer > 30) {
              state.tutorialStep = 2;
              state.tutorialTimer = 0;
            }
          }
        } else if (state.tutorialStep === 2) {
          setTutorialText("Détruisez cet ennemi d'entraînement !");
          if (!state.tutorialEnemySpawned) {
            const enemy = new Enemy(canvas.width / 2, canvas.height / 4, 0.5, 'chaser');
            enemy.hp = 3;
            enemy.maxHp = 3;
            state.enemies.push(enemy);
            state.tutorialEnemySpawned = true;
          }
          if (state.enemies.length === 0 && state.tutorialEnemySpawned) {
             state.tutorialStep = 3;
             state.tutorialTimer = 0;
          }
        } else if (state.tutorialStep === 3) {
          setTutorialText("Ramassez le bonus pour améliorer votre vaisseau !");
          if (!state.tutorialPowerUpSpawned) {
             state.powerUps.push(new PowerUp(canvas.width / 2, canvas.height / 4, 'spread'));
             state.tutorialPowerUpSpawned = true;
          }
          if (state.powerUps.length === 0 && state.tutorialPowerUpSpawned) {
            state.tutorialStep = 4;
            state.tutorialTimer = 0;
          }
        } else if (state.tutorialStep === 4) {
          setTutorialText("Préparez-vous, la vraie bataille commence !");
          state.tutorialTimer++;
          if (state.tutorialTimer > 120) {
            setIsTutorial(false);
            setTutorialText('');
            state.tutorialStep = -1;
            // Reset score and wave for the real game start
            state.score = 0;
            setScore(0);
            state.wave = 1;
            setWave(1);
          }
        }
      } else if (!isTutorial) {
        setTutorialText('');
      }

      // Wave progression
      if (state.score >= state.wave * 500) {
        state.wave++;
        setWave(state.wave);
        
        const extraSeconds = Math.random() < 0.5 ? 10 : 5;
        state.extraBonusDuration += extraSeconds * 60;
        
        if (state.player) {
          audio.playPowerUp();
          state.player.shieldTimer = Math.max(state.player.shieldTimer, 0) + 600 + state.extraBonusDuration;
          state.player.spreadTimer = Math.max(state.player.spreadTimer, 0) + 420 + state.extraBonusDuration;
          state.player.speedTimer = Math.max(state.player.speedTimer, 0) + 420 + state.extraBonusDuration;
          createExplosion(state.player.x, state.player.y, '#ffffff', 30);
        }
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
            if (pu.type === 'shield') state.player.shieldTimer = 600 + state.extraBonusDuration;
            if (pu.type === 'spread') state.player.spreadTimer = 420 + state.extraBonusDuration;
            if (pu.type === 'speed') state.player.speedTimer = 420 + state.extraBonusDuration;
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
        if (e.hitFlash > 0) e.hitFlash--;
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
              state.damageFlash = 1.0;
              state.player.shieldTimer = 0; // Shield breaks
              continue;
            } else {
              audio.playGameOver();
              state.isGameOver = true;
              state.damageFlash = 1.0;
              createExplosion(state.player.x, state.player.y, '#00f3ff', 50);
              setIsGameOver(true);
              fetchDeathMessage(state.score, state.wave);
            }
          }
        }

        // Projectile collision
        for (let j = state.projectiles.length - 1; j >= 0; j--) {
          const p = state.projectiles[j];
          const dist = Math.hypot(p.x - e.x, p.y - e.y);
          if (dist < e.size) {
            e.hp--;
            e.hitFlash = 5;
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
              
              // Combo logic
              state.comboCount++;
              state.comboTimer = 120; // 2 seconds to keep combo
              if (state.comboCount > 1) {
                state.comboMessageTimer = 90;
                state.comboScale = 2.0;
                switch (state.comboCount) {
                  case 2: state.comboMessage = "DOUBLE KILL"; break;
                  case 3: state.comboMessage = "TRIPLE KILL"; break;
                  case 4: state.comboMessage = "QUAD KILL"; break;
                  case 5: state.comboMessage = "PENTA KILL"; break;
                  default: state.comboMessage = "RAMPAGE!"; break;
                }
              }

              if (e.type === 'boss') {
                state.bossesKilled++;
                if (state.bossesKilled === 1) {
                  state.cloneTimer = 180 * 60; // 3 minutes at 60fps
                  if (state.player) {
                    state.clone.x = state.player.x;
                    state.clone.y = state.player.y;
                  }
                }
              }

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
      if (state.shake > 0 && !state.accessibilityMode) {
        ctx.restore();
        state.shake *= 0.9;
        if (state.shake < 0.5) state.shake = 0;
      } else if (state.shake > 0) {
        state.shake *= 0.9;
        if (state.shake < 0.5) state.shake = 0;
      }

      // Combo timers
      if (state.comboTimer > 0) {
        state.comboTimer--;
        if (state.comboTimer <= 0) state.comboCount = 0;
      }
      if (state.comboMessageTimer > 0) {
        state.comboMessageTimer--;
        if (state.comboScale > 1) state.comboScale -= 0.1;
        
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 4);
        ctx.scale(state.comboScale, state.comboScale);
        
        let comboColor = '#ff00ff';
        if (state.comboCount >= 5) comboColor = '#ff003c';
        else if (state.comboCount === 4) comboColor = '#ffff00';
        else if (state.comboCount === 3) comboColor = '#00ff44';

        ctx.fillStyle = comboColor;
        ctx.font = '900 40px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 20;
        ctx.shadowColor = comboColor;
        ctx.globalAlpha = Math.min(1, state.comboMessageTimer / 30);
        ctx.fillText(state.comboMessage, 0, 0);
        ctx.restore();
      }

      // Damage flash
      if (state.damageFlash > 0) {
        if (!state.accessibilityMode) {
          ctx.fillStyle = `rgba(255, 0, 60, ${state.damageFlash * 0.5})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        state.damageFlash -= 0.05;
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
  }, [gameId, currentScreen, difficulty, isTutorial, particlesEnabled, shakeEnabled]);

  // Input Listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      gameState.current.mouseX = e.clientX;
      gameState.current.mouseY = e.clientY;
    };
    const handleMouseDown = () => {
      audio.init();
      if (!gameState.current.isGameStarted) return;
      if (gameState.current.isGameOver) return;
      if (gameState.current.isPaused) {
        gameState.current.isPaused = false;
        setIsPaused(false);
      }
      gameState.current.isShooting = true;
    };
    const handleMouseUp = () => { 
      if (!gameState.current.joystick.active) {
        gameState.current.isShooting = false; 
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      audio.init();
      if (!gameState.current.isGameStarted) return;
      if (e.key.toLowerCase() === 'p' && !gameState.current.isGameOver) {
        gameState.current.isPaused = !gameState.current.isPaused;
        setIsPaused(gameState.current.isPaused);
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      audio.init();
      if (!gameState.current.isGameStarted || gameState.current.isGameOver || gameState.current.isPaused) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== gameState.current.joystick.touchId) {
          gameState.current.aimTouchId = t.identifier;
          gameState.current.mouseX = t.clientX;
          gameState.current.mouseY = t.clientY;
          gameState.current.isShooting = true;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === gameState.current.aimTouchId) {
          gameState.current.mouseX = t.clientX;
          gameState.current.mouseY = t.clientY;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === gameState.current.aimTouchId) {
          gameState.current.aimTouchId = -1;
          if (!gameState.current.joystick.active) {
            gameState.current.isShooting = false;
          }
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  const startGame = async (selectedDifficulty: Difficulty, tutorial = false) => {
    setDifficulty(selectedDifficulty);
    setIsTutorial(tutorial);
    setCurrentScreen('game');
    setScore(0);
    setWave(1);
    setIsGameOver(false);
    setIsPaused(false);
    setDeathMessage(null);
    setGameId((id) => id + 1);
  };

  const handleRestart = () => {
    setIsGameOver(false);
    setCurrentScreen('home');
  };

  // Joystick Handlers
  const updateJoyPos = (clientX: number, clientY: number) => {
    if (!joystickBaseRef.current || !joystickKnobRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const maxDist = rect.width / 2;
    const dist = Math.hypot(dx, dy);
    
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    
    joystickKnobRef.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    gameState.current.joystick.dx = dx / maxDist;
    gameState.current.joystick.dy = dy / maxDist;
  };

  const handleJoyStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    audio.init();
    const t = e.changedTouches[0];
    gameState.current.joystick.active = true;
    gameState.current.joystick.touchId = t.identifier;
    gameState.current.isShooting = true;
    updateJoyPos(t.clientX, t.clientY);
  };
  
  const handleJoyMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === gameState.current.joystick.touchId) {
        updateJoyPos(t.clientX, t.clientY);
      }
    }
  };
  
  const handleJoyEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === gameState.current.joystick.touchId) {
        gameState.current.joystick.active = false;
        gameState.current.joystick.touchId = -1;
        gameState.current.joystick.dx = 0;
        gameState.current.joystick.dy = 0;
        if (joystickKnobRef.current) {
          joystickKnobRef.current.style.transform = `translate(-50%, -50%)`;
        }
        if (gameState.current.aimTouchId === -1) {
          gameState.current.isShooting = false;
        }
      }
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black font-['Inter'] select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
      />

      {/* HUD */}
      <div className="absolute top-6 right-24 text-right pointer-events-none">
        <div className="text-4xl font-bold text-[#00f3ff] drop-shadow-[0_0_10px_rgba(0,243,255,0.8)]">
          {score}
        </div>
        <div className="text-xl font-semibold text-white/80 tracking-widest uppercase mt-1">
          Vague {wave}
        </div>
      </div>

      {/* Pause Button */}
      {currentScreen === 'game' && !isGameOver && (
        <button 
          onClick={() => {
            gameState.current.isPaused = !gameState.current.isPaused;
            setIsPaused(gameState.current.isPaused);
          }}
          className="absolute top-6 right-6 z-50 p-3 bg-black/50 border-2 border-[#00f3ff] rounded-full text-[#00f3ff] hover:bg-[#00f3ff] hover:text-black transition-colors shadow-[0_0_10px_rgba(0,243,255,0.4)]"
        >
          {isPaused ? <Play size={24} /> : <Pause size={24} />}
        </button>
      )}

      {/* Joystick */}
      {currentScreen === 'game' && !isGameOver && (
        <div 
          ref={joystickBaseRef}
          className="absolute bottom-8 left-8 w-32 h-32 bg-white/10 rounded-full border-2 border-white/20 touch-none z-40 md:hidden"
          onTouchStart={handleJoyStart}
          onTouchMove={handleJoyMove}
          onTouchEnd={handleJoyEnd}
          onTouchCancel={handleJoyEnd}
        >
          <div 
            ref={joystickKnobRef}
            className="absolute top-1/2 left-1/2 w-12 h-12 bg-white/50 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_15px_rgba(255,255,255,0.5)]"
          />
        </div>
      )}

      {/* Tutorial Text */}
      {currentScreen === 'game' && tutorialText && (
        <div className="absolute top-24 left-0 right-0 text-center pointer-events-none z-40">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block bg-black/60 border border-[#00f3ff] text-[#00f3ff] px-6 py-3 rounded-full text-lg tracking-widest uppercase shadow-[0_0_15px_rgba(0,243,255,0.5)]"
          >
            {tutorialText}
          </motion.div>
        </div>
      )}

      {/* Portrait Warning */}
      <div className="hidden portrait:flex fixed inset-0 z-[100] bg-black flex-col items-center justify-center text-white text-center p-8">
        <svg className="w-16 h-16 mb-6 text-[#00f3ff] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <h2 className="text-2xl font-bold mb-4 tracking-widest text-[#00f3ff]">MODE PAYSAGE REQUIS</h2>
        <p className="text-zinc-400">Veuillez tourner votre appareil pour jouer à Neon Survival.</p>
      </div>

      {/* Home Screen */}
      <AnimatePresence>
        {currentScreen === 'home' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md z-40"
          >
            <div className="absolute top-6 right-6 flex gap-4">
              <button 
                onClick={() => {
                  setAccessibilityMode(!accessibilityMode);
                }} 
                className={`p-3 rounded-full border transition-colors shadow-lg ${accessibilityMode ? 'bg-[#00f3ff] text-black border-[#00f3ff]' : 'bg-zinc-900 border-zinc-700 text-white hover:border-[#00f3ff] hover:text-[#00f3ff]'}`}
                title="Mode Accessibilité (Désactive les flashs et secousses)"
              >
                {accessibilityMode ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
            </div>

            <h1 className="text-7xl font-black text-[#00f3ff] drop-shadow-[0_0_30px_rgba(0,243,255,0.8)] mb-6 tracking-tighter text-center px-4">
              NEON SURVIVAL
            </h1>
            
            <p className="text-zinc-400 max-w-lg text-center mb-12 text-lg leading-relaxed px-4">
              Pilotez votre vaisseau néon, survivez à des vagues infinies d'ennemis géométriques et collectez des bonus pour augmenter votre puissance de feu.
            </p>
            
            <div className="flex flex-col items-center gap-6 w-full max-w-md px-4">
              <div className="flex gap-4 w-full mb-2">
                <button
                  onClick={() => setDifficulty('easy')}
                  className={`flex-1 py-2 rounded-lg font-bold text-sm uppercase tracking-widest border-2 transition-all duration-300 ${difficulty === 'easy' ? 'bg-[#00ff44] text-black border-[#00ff44] shadow-[0_0_15px_rgba(0,255,68,0.6)]' : 'bg-transparent text-[#00ff44] border-[#00ff44] hover:bg-[#00ff44]/20'}`}
                >
                  Facile
                </button>
                <button
                  onClick={() => setDifficulty('medium')}
                  className={`flex-1 py-2 rounded-lg font-bold text-sm uppercase tracking-widest border-2 transition-all duration-300 ${difficulty === 'medium' ? 'bg-[#ffff00] text-black border-[#ffff00] shadow-[0_0_15px_rgba(255,255,0,0.6)]' : 'bg-transparent text-[#ffff00] border-[#ffff00] hover:bg-[#ffff00]/20'}`}
                >
                  Normal
                </button>
                <button
                  onClick={() => setDifficulty('hard')}
                  className={`flex-1 py-2 rounded-lg font-bold text-sm uppercase tracking-widest border-2 transition-all duration-300 ${difficulty === 'hard' ? 'bg-[#ff003c] text-black border-[#ff003c] shadow-[0_0_15px_rgba(255,0,60,0.6)]' : 'bg-transparent text-[#ff003c] border-[#ff003c] hover:bg-[#ff003c]/20'}`}
                >
                  Difficile
                </button>
              </div>

              <button
                onClick={() => startGame(difficulty)}
                className="w-full py-4 bg-[#00f3ff] text-black font-black text-2xl uppercase tracking-[0.2em] hover:bg-white transition-all duration-300 shadow-[0_0_20px_rgba(0,243,255,0.6)] hover:shadow-[0_0_40px_rgba(255,255,255,0.8)] rounded-lg"
              >
                JOUER
              </button>
              
              <button
                onClick={() => startGame('easy', true)}
                className="w-full py-3 bg-transparent border-2 border-zinc-500 text-zinc-400 font-bold text-sm uppercase tracking-widest hover:bg-zinc-800 hover:text-white transition-all duration-300 rounded-lg"
              >
                Tutoriel (20s)
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dashboard Screen */}
      <AnimatePresence>
        {currentScreen === 'dashboard' && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute inset-0 bg-black z-50 flex flex-col overflow-y-auto"
          >
            <div className="sticky top-0 bg-black/80 backdrop-blur-md p-6 border-b border-zinc-800 flex justify-between items-center z-10">
              <h2 className="text-3xl font-black text-white tracking-widest">DASHBOARD</h2>
              <button onClick={() => setCurrentScreen('home')} className="p-2 text-zinc-400 hover:text-white">
                <X size={32} />
              </button>
            </div>

            <div className="p-8 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Customization Section */}
              <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-6">
                <h3 className="text-xl font-bold text-[#ff00ff] flex items-center gap-2">
                  <Edit2 className="w-5 h-5" /> Personnalisation
                </h3>
                
                <div className="space-y-4">
                    <div>
                      <span className="text-zinc-300 block mb-2 text-sm">Couleur du Vaisseau</span>
                      <div className="flex gap-3">
                        {['#00f3ff', '#ff00ff', '#00ff44', '#ffff00', '#ff003c'].map(color => (
                          <button
                            key={color}
                            onClick={() => {
                              setPlayerColor(color);
                            }}
                            className={`w-8 h-8 rounded-full border-2 transition-transform ${playerColor === color ? 'scale-125 border-white' : 'border-transparent'}`}
                            style={{ backgroundColor: color, boxShadow: playerColor === color ? `0 0 10px ${color}` : 'none' }}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-zinc-300 block mb-2 text-sm">Style de Particules</span>
                      <div className="flex gap-2">
                        {(['circle', 'square', 'star'] as const).map(style => (
                          <button
                            key={style}
                            onClick={() => {
                              setParticleStyle(style);
                            }}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${particleStyle === style ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                          >
                            {style === 'circle' ? 'Cercle' : style === 'square' ? 'Carré' : 'Étoile'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-zinc-300 block mb-2 text-sm">Thème Visuel (Fond)</span>
                      <div className="space-y-2">
                        <button
                          onClick={() => {
                            setBgTheme('classic');
                          }}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${bgTheme === 'classic' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                        >
                          Classique (Vide spatial)
                        </button>
                        <button
                          onClick={() => {
                            setBgTheme('grid');
                          }}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex justify-between items-center ${bgTheme === 'grid' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                        >
                          <span>Grille Néon</span>
                        </button>
                        <button
                          onClick={() => {
                            setBgTheme('matrix');
                          }}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex justify-between items-center ${bgTheme === 'matrix' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                        >
                          <span>Matrice Cyberpunk</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Settings */}
                <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
                  <h3 className="text-xl font-bold text-[#00f3ff] mb-6 flex items-center gap-2"><Settings /> Paramètres</h3>
                  
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-zinc-300">Volume</span>
                        <span className="text-zinc-500">{Math.round(volume * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <VolumeX size={18} className="text-zinc-500" />
                        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setVolume(val);
                        }} className="w-full accent-[#00f3ff]" />
                        <Volume2 size={18} className="text-zinc-500" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-zinc-300">Plein Écran</span>
                      <button 
                        onClick={toggleFullscreen}
                        className={`w-12 h-6 rounded-full transition-colors relative ${isFullscreen ? 'bg-[#00f3ff]' : 'bg-zinc-700'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isFullscreen ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-zinc-300">Particules & Explosions</span>
                      <button onClick={() => {
                        setParticlesEnabled(!particlesEnabled);
                      }} className={`w-12 h-6 rounded-full transition-colors relative ${particlesEnabled ? 'bg-[#00f3ff]' : 'bg-zinc-700'}`}>
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${particlesEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-zinc-300">Secousses d'écran</span>
                      <button onClick={() => {
                        setShakeEnabled(!shakeEnabled);
                      }} className={`w-12 h-6 rounded-full transition-colors relative ${shakeEnabled ? 'bg-[#00f3ff]' : 'bg-zinc-700'}`}>
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${shakeEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
              Menu Principal
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
