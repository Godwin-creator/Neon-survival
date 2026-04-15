export class Player {
  x: number;
  y: number;
  angle: number;
  size: number;
  shieldTimer: number;
  spreadTimer: number;
  speedTimer: number;
  color: string;

  constructor(x: number, y: number, color: string = '#00f3ff') {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.size = 15;
    this.shieldTimer = 0;
    this.spreadTimer = 0;
    this.speedTimer = 0;
    this.color = color;
  }

  update(mouseX: number, mouseY: number, joystick: { active: boolean, dx: number, dy: number }, isAiming: boolean) {
    if (joystick.active) {
      const speed = this.speedTimer > 0 ? 8 : 5;
      this.x += joystick.dx * speed;
      this.y += joystick.dy * speed;
      
      // Clamp to screen bounds
      this.x = Math.max(this.size, Math.min(window.innerWidth - this.size, this.x));
      this.y = Math.max(this.size, Math.min(window.innerHeight - this.size, this.y));
      
      if (isAiming) {
        this.angle = Math.atan2(mouseY - this.y, mouseX - this.x);
      } else if (joystick.dx !== 0 || joystick.dy !== 0) {
        this.angle = Math.atan2(joystick.dy, joystick.dx);
      }
    } else {
      // Smooth follow
      const lerp = this.speedTimer > 0 ? 0.3 : 0.1;
      this.x += (mouseX - this.x) * lerp;
      this.y += (mouseY - this.y) * lerp;
      this.angle = Math.atan2(mouseY - this.y, mouseX - this.x);
    }
    
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
    
    let drawColor = this.color;
    if (this.spreadTimer > 0) drawColor = '#ff00ff';
    else if (this.speedTimer > 0) drawColor = '#ffff00';

    ctx.shadowBlur = 20;
    ctx.shadowColor = drawColor;
    ctx.strokeStyle = drawColor;
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

export class Projectile {
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

export type PowerUpType = 'shield' | 'spread' | 'speed';
export type Difficulty = 'easy' | 'medium' | 'hard';

export class PowerUp {
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

export type EnemyType = 'chaser' | 'dasher' | 'tank' | 'wavy' | 'boss';

export class Enemy {
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
  hitFlash: number;

  constructor(x: number, y: number, speed: number, type: EnemyType) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.tick = 0;
    this.angle = 0;
    this.state = 0;
    this.stateTimer = 0;
    this.hitFlash = 0;

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
        this.size = 25;
        this.speed = speed * 0.5;
        this.color = '#ff003c'; // Red
        this.hp = 5;
        break;
      case 'wavy':
        this.size = 15;
        this.speed = speed * 1.2;
        this.color = '#00ff44'; // Green
        this.hp = 2;
        break;
      default: // chaser
        this.size = 15;
        this.speed = speed;
        this.color = '#ff00ff'; // Pink
        this.hp = 1;
        break;
    }
    this.maxHp = this.hp;
  }

  update(playerX: number, playerY: number) {
    this.tick++;
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);

    if (this.type === 'boss') {
      if (this.state === 0) { // Chasing
        this.angle = targetAngle;
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.stateTimer++;
        if (this.stateTimer > 180) {
          this.state = 1; // Dash prep
          this.stateTimer = 0;
        }
      } else if (this.state === 1) { // Dash prep
        this.stateTimer++;
        if (this.stateTimer > 60) {
          this.state = 2; // Dashing
          this.stateTimer = 0;
          this.angle = targetAngle;
        }
      } else if (this.state === 2) { // Dashing
        this.x += Math.cos(this.angle) * this.speed * 3;
        this.y += Math.sin(this.angle) * this.speed * 3;
        this.stateTimer++;
        if (this.stateTimer > 30) {
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
    ctx.shadowColor = this.hitFlash > 0 ? '#ffffff' : this.color;
    ctx.strokeStyle = this.hitFlash > 0 ? '#ffffff' : this.color;
    ctx.lineWidth = 2;
    ctx.translate(this.x, this.y);

    const hpRatio = this.hp / this.maxHp;
    ctx.globalAlpha = 0.4 + 0.6 * hpRatio;

    let fillColor = this.hitFlash > 0 ? '#ffffff' : this.color;

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
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = 0.2 * hpRatio;
      ctx.fill();
      
      // Draw a core
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : (this.state === 1 ? '#ff003c' : this.color); // Core turns red when dashing
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
      ctx.fillStyle = fillColor;
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
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = 0.2 * hpRatio;
      ctx.fill();
    } else if (this.type === 'wavy') {
      ctx.rotate(this.tick * 0.05);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI * 2 / 4) * i;
        ctx.lineTo(Math.cos(a) * this.size, Math.sin(a) * this.size);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = 0.2 * hpRatio;
      ctx.fill();
    } else {
      ctx.rotate(this.angle);
      ctx.beginPath();
      ctx.moveTo(this.size, 0);
      ctx.lineTo(-this.size, this.size * 0.8);
      ctx.lineTo(-this.size * 0.4, 0);
      ctx.lineTo(-this.size, -this.size * 0.8);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = 0.2 * hpRatio;
      ctx.fill();
    }

    ctx.restore();
  }
}

export type ParticleStyle = 'circle' | 'square' | 'star';

export class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
  style: ParticleStyle;

  constructor(x: number, y: number, color: string, style: ParticleStyle = 'circle') {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 5 + 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.0;
    this.decay = Math.random() * 0.02 + 0.01;
    this.color = color;
    this.style = style;
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
    ctx.translate(this.x, this.y);
    
    if (this.style === 'square') {
      ctx.fillRect(-2, -2, 4, 4);
    } else if (this.style === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        ctx.lineTo(Math.cos((18 + i * 72) / 180 * Math.PI) * 3, -Math.sin((18 + i * 72) / 180 * Math.PI) * 3);
        ctx.lineTo(Math.cos((54 + i * 72) / 180 * Math.PI) * 1.5, -Math.sin((54 + i * 72) / 180 * Math.PI) * 1.5);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
}
