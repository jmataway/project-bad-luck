/**
 * Single-Zone RPG Upgrade for Game Jam
 * Features: Red Mage character, Grid-based Sprite Sheets, Battle System.
 */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ANIM_SPEED = 0.12;
const KNIGHT_SCALE = 4; // Used for hitbox calculation
const ZOMBIE_SCALE = 2;

const SCENE_CONFIG = {
  jail: {
    id: 'jail', bg: 'assets/scenes/jail-cell-test.png', spawn: { x: 1920, y: 1220 },
    playerScale: 6.0,
    walkable: (x, y) => (x >= 40 && x <= 2700 && y >= 950 && y <= 1405),
    interactables: [{ id: 'mirror', x: 243, y: 457, w: 176, h: 800 }, { id: 'door', x: 770, y: 310, w: 360, h: 650 }],
    portals: []
  },
  castle: {
    id: 'castle', bg: 'assets/scenes/castle-test.png', spawn: { x: 1376, y: 1175 },
    playerScale: 3.0,
    walkable: (x, y) => (y >= 1125 && y <= 1420) || (x >= 450 && x <= 750 && y >= 825 && y <= 1125),
    interactables: [], portals: []
  }
};
let activeScene = 'jail';

// --- Character Data ---
let CHARACTERS = [];

// --- Helper: Asset Loader ---
async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

// --- Movement Constraints ---
function isWalkable(x, y) {
  return SCENE_CONFIG[activeScene].walkable(x, y);
}

let incomingParams = null;

// --- Playable Character Class ---
class Player {
  constructor(x, y, config, animationImages) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.speed = (incomingParams?.speed || 5) * 100;
    this.config = config;
    this.images = animationImages;
    this.state = 'idle'; 
    this.facing = 1;
    this.frame = 0;
    this.frameTime = 0;
    this.hitboxR = 40; // Adjusted for Bruxa
    
    this.maxHp = config.hit_points || 50;
    this.hp = this.maxHp;
    this.flurryCooldown = 0;
    this.blockCooldown = 0;
    this.isBlocking = false;
    this.animRepeats = 0;
    this.currentScale = config.sprite_config.scale || 3.0;
  }

  get basicDamage() { return this.config.basic_attack.damage; }
  get flurryDamage() { return this.config.special_attack.damage; }

  update(dt, keys, worldW, worldH, inBattle) {
    if (inBattle) { this.updateAnimation(dt); return; }
    const prevX = this.x; const prevY = this.y;
    this.vx = 0; this.vy = 0;
    if (keys['w']) this.vy -= 1; if (keys['s']) this.vy += 1;
    if (keys['a']) this.vx -= 1; if (keys['d']) this.vx += 1;
    if (this.vx !== 0 || this.vy !== 0) {
      const mag = Math.hypot(this.vx, this.vy);
      this.vx = (this.vx / mag) * this.speed;
      this.vy = (this.vy / mag) * this.speed;
      this.state = 'run';
      if (this.vx > 0) this.facing = 1; if (this.vx < 0) this.facing = -1;
    } else { this.state = 'idle'; }
    this.x += this.vx * dt;
    if (this.x < 0) this.x = 0; if (this.x > worldW) this.x = worldW;
    if (!isWalkable(this.x, this.y)) this.x = prevX;
    this.y += this.vy * dt;
    if (!isWalkable(this.x, this.y)) this.y = prevY;
    this.updateAnimation(dt);
  }

  updateAnimation(dt) {
    this.frameTime += dt;
    const cfg = this.config.sprite_config;
    const stateCfg = cfg.states[this.state];
    const totalFrames = stateCfg.frames;
    const speed = cfg.anim_speed || ANIM_SPEED;

    if (this.frameTime >= speed) {
      this.frame++;
      if (this.frame >= totalFrames) {
        if (this.state === 'attack' || this.state === 'special') {
          if (this.animRepeats > 0) { this.animRepeats--; this.frame = 0; }
          else { this.state = 'idle'; this.frame = 0; }
        } else { this.frame = 0; }
      }
      this.frameTime = 0;
    }
  }

  draw(ctx, inBattle) {
    const img = this.images[this.state] || this.images['idle'];
    if (!img) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    // Inverse scaling: Bruxa sprites face left by default, so we flip on facing 1 (Right)
    if (this.facing === 1) ctx.scale(-1, 1);
    
    const cfg = this.config.sprite_config;
    const stateCfg = cfg.states[this.state] || cfg.states['idle'];
    const sw = stateCfg.sw;
    const sh = stateCfg.sh;
    const cols = stateCfg.cols;
    
    const sx = (this.frame % cols) * sw;
    const sy = Math.floor(this.frame / cols) * sh;
    
    const scale = inBattle ? (cfg.scale || 3.0) : this.currentScale;
    const dw = sw * scale; const dh = sh * scale;

    ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh + 40, dw, dh);
    ctx.restore();

    if (inBattle) this.drawHPBar(ctx);
    else this.drawName(ctx);
  }

  drawName(ctx) {
    if (!incomingParams) return;
    ctx.fillStyle = '#13ec6a'; ctx.font = '600 24px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 10;
    ctx.fillText(incomingParams.username.toUpperCase(), this.x, this.y - 280);
    ctx.shadowBlur = 0;
  }

  drawHPBar(ctx) {
    const w = 150; const h = 15; const x = this.x - w / 2; const y = this.y - 320;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#13ec6a'; ctx.fillRect(x, y, w * (Math.max(0, this.hp) / this.maxHp), h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.font = '20px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(`${Math.ceil(this.hp)}/${this.maxHp}`, this.x, y - 10);
  }

  playAttack(repeats = 0, type = 'attack') {
    this.state = type; this.frame = 0; this.frameTime = 0; this.animRepeats = repeats;
  }
}

// --- Enemy Class ---
class Zombie {
  constructor(x, y) {
    this.x = x; this.y = y; this.hitboxR = 50;
    this.pulse = 0; this.vx = 0; this.vy = 0; this.wanderTimer = 0; this.speed = 120;
    this.maxHp = 20; this.hp = 20;
  }
  update(dt, worldW, worldH, inBattle) {
    this.pulse += dt; if (inBattle) return;
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * this.speed; this.vy = Math.sin(angle) * this.speed;
      this.wanderTimer = 1 + Math.random() * 2;
    }
    const prevX = this.x; const prevY = this.y;
    this.x += this.vx * dt;
    if (!isWalkable(this.x, this.y)) { this.x = prevX; this.vx *= -1; }
    this.y += this.vy * dt;
    if (!isWalkable(this.x, this.y)) { this.y = prevY; this.vy *= -1; }
  }
  draw(ctx, inBattle) {
    ctx.save(); ctx.translate(this.x, this.y);
    const s = ZOMBIE_SCALE; const bob = Math.sin(this.pulse * 2) * 2 * s;
    ctx.fillStyle = '#497328'; ctx.fillRect(-15 * s, -75 * s + bob, 30 * s, 30 * s);
    ctx.fillStyle = '#2d4c8c'; ctx.fillRect(-15 * s, -45 * s + bob, 30 * s, 40 * s);
    ctx.fillStyle = '#3c245c'; ctx.fillRect(-15 * s, -5 * s + bob, 12 * s, 20 * s);
    ctx.fillRect(3 * s, -5 * s + bob, 12 * s, 20 * s);
    ctx.fillStyle = '#497328'; ctx.fillRect(-27 * s, -42 * s + bob, 12 * s, 8 * s);
    ctx.fillRect(15 * s, -42 * s + bob, 12 * s, 8 * s);
    ctx.restore();
    if (inBattle) this.drawHPBar(ctx);
  }
  drawHPBar(ctx) {
    const w = 100; const h = 10; const x = this.x - w / 2; const y = this.y - 180;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ff4444'; ctx.fillRect(x, y, w * (Math.max(0, this.hp) / this.maxHp), h);
    ctx.strokeStyle = '#fff'; ctx.strokeRect(x, y, w, h);
  }
}

// --- Main Engine ---
async function start() {
  try {
    incomingParams = Portal.readPortalParams();
    document.getElementById('username').textContent = incomingParams.username;

    // Load Characters from JSON
    try {
      const response = await fetch('character_template.json');
      CHARACTERS = await response.json();
    } catch (e) {
      console.error("Failed to load character template:", e);
      alert("CRITICAL: Character data missing.");
      return;
    }

    let nextTarget = null;
    try {
      nextTarget = await Promise.race([
        Portal.pickPortalTarget(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
      ]);
    } catch (e) { console.warn("Registry skip"); }

    const charConfig = CHARACTERS.find(c => c.id === 'bruxa') || CHARACTERS[0];
    const charImages = {};
    const sceneBackgrounds = {};
    let portalSheet = null;
    const preload = [];
    
    // Load portal sheet
    preload.push(loadImage('assets/world/portal.png').then(img => { portalSheet = img; }));

    // Load all scene backgrounds
    Object.keys(SCENE_CONFIG).forEach(key => {
      preload.push(loadImage(SCENE_CONFIG[key].bg).then(img => { sceneBackgrounds[key] = img; }));
    });
    
    Object.keys(charConfig.animations).forEach(s => {
      preload.push(loadImage(charConfig.animations[s]).then(img => { charImages[s] = img; }));
    });

    await Promise.all(preload);
    const bgImg = sceneBackgrounds[activeScene];

    canvas.width = bgImg.width; canvas.height = bgImg.height;
    const worldW = canvas.width; const worldH = canvas.height;
    
    const initialSpawn = SCENE_CONFIG[activeScene].spawn;
    const player = new Player(initialSpawn.x, initialSpawn.y, charConfig, charImages);
    player.currentScale = SCENE_CONFIG[activeScene].playerScale;
    let zombies = [new Zombie(worldW / 2 + 500, 1175), new Zombie(worldW / 2 - 500, 1175)];
    
    // Initialize Portals for each scene
    const exitPortalData = { r: 100, color: '#13ec6a', label: nextTarget ? `→ ${nextTarget.title}` : 'no destinations', target: nextTarget?.url || null, pulse: 0 };
    const returnPortalData = incomingParams.ref ? { r: 80, color: '#13ec6a', label: '← back', target: incomingParams.ref, pulse: 0 } : null;

    // Jail Portals
    SCENE_CONFIG.jail.portals.push({ ...exitPortalData, x: 1800, y: 850 });
    
    // Castle Portals
    SCENE_CONFIG.castle.portals.push({ ...exitPortalData, x: 600, y: 900 });
    if (returnPortalData) SCENE_CONFIG.castle.portals.push({ ...returnPortalData, x: 100, y: 1175 });

    if (incomingParams.fromPortal && returnPortalData) { 
      // Handle spawn logic if coming from a portal
      player.x = 100 + 80 + 50; player.y = 1175; 
    }

    function switchScene(sceneId) {
      activeScene = sceneId;
      const cfg = SCENE_CONFIG[sceneId];
      player.x = cfg.spawn.x;
      player.y = cfg.spawn.y;
      player.currentScale = cfg.playerScale;
      battleMessage = `ENTERING ${sceneId.toUpperCase()}...`;
      setTimeout(() => { if (battleMessage.includes("ENTERING")) battleMessage = ""; }, 2000);
    }

    const keys = {};
    window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

    let inBattle = false; let isStartingBattle = false;
    let isPaused = false; let activeZombie = null;
    let battleTurn = 'player'; let battleMessage = "";
    let currentMenu = 'main'; let preBattlePos = { x: 0, y: 0 };
    let transitionTimer = 0; const TRANSITION_DURATION = 0.8;

    const buttons = {
      main: [
        { label: 'Attack', desc: () => `DEAL ${player.basicDamage} DAMAGE`, x: 0, y: 0, w: 250, h: 60, action: () => { currentMenu = 'attack'; } },
        { label: 'Block', desc: 'PREVENT 5 DMG, HEAL 5 HP, 2 TURN CD', x: 0, y: 0, w: 250, h: 60, action: () => { blockAction(); } }
      ],
      attack: [
        { label: player.config.basic_attack.name.toUpperCase(), desc: () => `DEAL ${player.basicDamage} DAMAGE`, x: 0, y: 0, w: 250, h: 60, action: () => { attackAction(); currentMenu = 'main'; } },
        { label: player.config.special_attack.name.toUpperCase(), desc: () => `DEAL ${player.flurryDamage} DAMAGE, ${player.config.special_attack.condition_length} TURN CD`, x: 0, y: 0, w: 250, h: 60, action: () => { flurryAction(); currentMenu = 'main'; } },
        { label: 'Back', desc: 'RETURN TO MAIN MENU', x: 0, y: 0, w: 250, h: 60, action: () => { currentMenu = 'main'; } }
      ],
      pause: [
        { label: 'Location', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'location'; } },
        { label: 'Portal', x: 0, y: 0, w: 200, h: 60, action: () => { 
          const scene = SCENE_CONFIG[activeScene];
          if (scene.portals.length > 0) checkPortal(scene.portals[0], true); 
        } },
        { label: 'Reset', x: 0, y: 0, w: 200, h: 60, action: () => { if(confirm("RESET?")) location.reload(); } },
        { label: 'Dev', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'dev'; } },
        { label: 'Resume', x: 0, y: 0, w: 200, h: 60, action: () => { isPaused = false; } }
      ],
      dev: [
        { label: 'Heal All', x: 0, y: 0, w: 200, h: 60, action: () => { player.hp = player.maxHp; } },
        { label: 'Spawn Zombie', x: 0, y: 0, w: 200, h: 60, action: () => { zombies.push(new Zombie(player.x + 200, player.y)); } },
        { label: 'Start Fight', x: 0, y: 0, w: 200, h: 60, action: () => { 
          if (!inBattle) {
            const tempZombie = new Zombie(player.x, player.y);
            isPaused = false;
            startBattle(tempZombie);
          }
        } },
        { label: 'End Fight', x: 0, y: 0, w: 200, h: 60, action: () => { 
          if (inBattle && activeZombie) {
            activeZombie.hp = 0;
            battleMessage = "VICTORY (DEV)!";
            isPaused = false;
            setTimeout(() => { zombies = zombies.filter(z => z !== activeZombie); endBattle(); }, 1000);
          }
        } },
        { label: 'Back', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'pause'; } }
      ],
      location: [
        { label: 'Jail', x: 0, y: 0, w: 200, h: 60, action: () => { switchScene('jail'); isPaused = false; } },
        { label: 'Castle', x: 0, y: 0, w: 200, h: 60, action: () => { switchScene('castle'); isPaused = false; } },
        { label: 'Back', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'pause'; } }
      ],
      character_select: [
        { 
          label: 'Bruxa', 
          desc: () => CHARACTERS.find(c => c.id === 'bruxa')?.description || 'SELECT THE SHADOW CLASS', 
          x: 0, y: 0, w: 250, h: 60, 
          action: () => { isPaused = false; battleMessage = "BRUXA SELECTED!"; setTimeout(() => battleMessage = "", 2000); } 
        },
        { label: 'Back', desc: 'CLOSE MENU', x: 0, y: 0, w: 250, h: 60, action: () => { isPaused = false; } }
      ]
    };

    function layoutButtons() {
      const bX = worldW / 2 - 300; const bY = worldH - 280;
      buttons.main.forEach((b, i) => { b.x = bX; b.y = bY + i * 85; });
      buttons.attack.forEach((b, i) => { b.x = bX; b.y = bY + i * 85; });
      
      const pY = worldH / 2 - 30;
      ['pause', 'dev', 'location'].forEach(m => {
        const menu = buttons[m]; const sX = worldW / 2 - (menu.length * 220 - 20) / 2;
        menu.forEach((b, i) => { b.x = sX + i * 220; b.y = pY; });
      });

      // Character Select - Vertical Layout to prevent description overlap
      const csX = worldW / 2 - 125;
      const csY = worldH / 2 - 50;
      buttons.character_select.forEach((b, i) => { b.x = csX; b.y = csY + i * 85; });
    }
    layoutButtons();

    canvas.addEventListener('mousedown', e => {
      if (!isPaused && (!inBattle || battleTurn !== 'player')) return;
      const rect = canvas.getBoundingClientRect();
      const sX = canvas.width / rect.width; const sY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * sX; const my = (e.clientY - rect.top) * sY;
      if (buttons[currentMenu]) buttons[currentMenu].forEach(b => { if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) b.action(); });
    });

    window.addEventListener('keydown', e => { if (e.key === 'Escape') { isPaused = !isPaused; currentMenu = isPaused ? 'pause' : 'main'; } });

    function startBattle(z) {
      if (isStartingBattle || inBattle) return;
      isStartingBattle = true; preBattlePos = { x: player.x, y: player.y }; activeZombie = z; transitionTimer = TRANSITION_DURATION;
      setTimeout(() => {
        inBattle = true; isStartingBattle = false; battleTurn = 'player'; currentMenu = 'main'; battleMessage = "BATTLE STARTED!";
        player.x = worldW / 2 - 400; player.y = 1300; player.facing = 1; player.state = 'idle'; player.frame = 0;
        activeZombie.x = worldW / 2 + 400; activeZombie.y = 1300; player.flurryCooldown = 0; player.blockCooldown = 0;
      }, (TRANSITION_DURATION / 2) * 1000);
    }

    function attackAction() { player.playAttack(); activeZombie.hp -= player.basicDamage; battleMessage = `YOU ATTACKED FOR ${player.basicDamage} DAMAGE!`; endPlayerTurn(); }
    function blockAction() { if (player.blockCooldown > 0) return; player.isBlocking = true; player.hp = Math.min(player.maxHp, player.hp + 5); player.blockCooldown = 2; battleMessage = "YOU BLOCK AND HEAL 5 HP!"; endPlayerTurn(); }
    function flurryAction() {
      if (player.flurryCooldown > 0) return;
      player.playAttack(0, 'special'); activeZombie.hp -= player.flurryDamage; player.flurryCooldown = player.config.special_attack.condition_length;
      battleMessage = `${player.config.special_attack.name.toUpperCase()}! DEALT ${player.flurryDamage} DAMAGE!`; endPlayerTurn();
    }
    function endBattle() { inBattle = false; player.x = preBattlePos.x; player.y = preBattlePos.y; battleMessage = ""; }
    function runAction() { if (Math.random() > 0.5) { battleMessage = "ESCAPED!"; setTimeout(endBattle, 1000); } else { battleMessage = "FAILED!"; endPlayerTurn(); } }
    function endPlayerTurn() {
      battleTurn = 'enemy_waiting';

      let waitTime = 0;
      if (player.state === 'attack' || player.state === 'special') {
        const stateCfg = player.config.sprite_config.states[player.state];
        const frames = stateCfg.frames;
        waitTime = frames * (player.config.sprite_config.anim_speed || ANIM_SPEED) * 1000;
      }

      setTimeout(() => {
        if (activeZombie.hp <= 0) {
          battleMessage = "VICTORY!";
          setTimeout(() => { zombies = zombies.filter(z => z !== activeZombie); endBattle(); }, 2000);
          return;
        }
        setTimeout(enemyTurn, 1000);
      }, waitTime);
    }
    function enemyTurn() {
      if (!inBattle) return;
      battleTurn = 'enemy'; let dmg = Math.floor(Math.random() * 4) + 3;
      if (player.isBlocking) { dmg = Math.max(0, dmg - 5); player.isBlocking = false; }
      player.hp -= dmg; battleMessage = `ZOMBIE ATTACKS FOR ${dmg} DAMAGE!`;
      if (player.flurryCooldown > 0) player.flurryCooldown--; if (player.blockCooldown > 0) player.blockCooldown--;
      if (player.hp <= 0) battleMessage = "DEFEAT..."; else setTimeout(() => { battleTurn = 'player'; battleMessage = "YOUR TURN!"; }, 1500);
    }

    function update(dt) {
      if (transitionTimer > 0) { transitionTimer -= dt; return; }
      if (isPaused) return;
      player.update(dt, keys, worldW, worldH, inBattle);
      
      if (!inBattle) {
        // Interaction Logic
        if (keys['e'] || keys[' ']) {
          const scene = SCENE_CONFIG[activeScene];
          scene.interactables.forEach(obj => {
            if (player.x >= obj.x && player.x <= obj.x + obj.w &&
                player.y >= obj.y && player.y <= obj.y + obj.h) {
              if (obj.id === 'mirror') {
                isPaused = true;
                currentMenu = 'character_select';
              } else if (obj.id === 'door') {
                switchScene('castle');
              }
            }
          });

          scene.portals.forEach(p => {
            if (Math.hypot(player.x - p.x, player.y - p.y) < p.r + 50) {
              checkPortal(p, true);
            }
          });

          // Debounce interaction keys
          keys['e'] = false; keys[' '] = false;
        }

        if (activeScene === 'castle') {
          zombies.forEach(z => { z.update(dt, worldW, worldH, inBattle); if (Math.hypot(player.x - z.x, player.y - z.y) < player.hitboxR + z.hitboxR) startBattle(z); });
        }
        
        const scene = SCENE_CONFIG[activeScene];
        scene.portals.forEach(p => {
          p.pulse += dt * 3;
          p.frameTime = (p.frameTime || 0) + dt;
          if (p.frameTime > 0.1) {
            p.frame = ((p.frame || 0) + 1) % 8;
            p.frameTime = 0;
          }
        });
      } else { activeZombie.update(dt, worldW, worldH, inBattle); }
    }
    function checkPortal(p, force = false) { 
      if (!p.target || !force) return; 
      Portal.sendPlayerThroughPortal(p.target, { username: incomingParams.username, color: incomingParams.color, speed: player.speed / 100 }); 
    }

    function render() {
      ctx.clearRect(0, 0, worldW, worldH); ctx.save(); if (inBattle) ctx.translate(0, -225); 
      
      const currentBg = sceneBackgrounds[activeScene];
      ctx.drawImage(currentBg, 0, 0);

      if (!inBattle) { 
        const scene = SCENE_CONFIG[activeScene];
        scene.portals.forEach(p => drawPortal(ctx, p));
        
        if (activeScene === 'castle') {
          zombies.forEach(z => z.draw(ctx, inBattle)); 
        }
      } else { activeZombie.draw(ctx, inBattle); }
      player.draw(ctx, inBattle);

      // Draw Interaction Prompt
      if (!inBattle && !isPaused) {
        const scene = SCENE_CONFIG[activeScene];
        const isNearObj = scene.interactables.some(obj => 
          player.x >= obj.x && player.x <= obj.x + obj.w &&
          player.y >= obj.y && player.y <= obj.y + obj.h
        );
        const isNearPortal = scene.portals.some(p => 
          Math.hypot(player.x - p.x, player.y - p.y) < p.r + 50
        );

        if (isNearObj || isNearPortal) {
          ctx.fillStyle = '#fff'; ctx.font = '600 20px "Space Grotesk", sans-serif';
          ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 10;
          ctx.fillText('E TO INTERACT', player.x, player.y - 320);
          ctx.shadowBlur = 0;
        }
      }

      ctx.restore();
      if (inBattle) drawBattleUI(); if (isPaused) drawPauseMenu(); if (transitionTimer > 0) drawTransition();
    }
    function drawTransition() {
      const p = 1 - (transitionTimer / TRANSITION_DURATION); ctx.save(); ctx.translate(worldW / 2, worldH / 2);
      for (let i = 0; i < 10; i++) {
        const s = p * (2000 / 10) * (i + 1); const a = Math.sin(p * Math.PI);
        ctx.strokeStyle = `rgba(19, 236, 106, ${a * 0.5})`; ctx.lineWidth = 10; ctx.rotate(p * Math.PI * 0.2); ctx.strokeRect(-s / 2, -s / 2, s, s);
      }
      ctx.restore();
    }
    function drawPauseMenu() {
      ctx.fillStyle = 'rgba(6, 10, 6, 0.9)'; ctx.fillRect(0, 0, worldW, worldH);
      ctx.fillStyle = '#13ec6a'; ctx.font = '800 100px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 15;
      ctx.fillText('PAUSED', worldW / 2, worldH / 2 - 150); ctx.shadowBlur = 0;
      buttons[currentMenu].forEach(b => drawButton(ctx, b));
    }
    function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function drawButton(ctx, b) {
      ctx.fillStyle = 'rgba(19, 236, 106, 0.1)'; ctx.strokeStyle = '#13ec6a'; ctx.lineWidth = 2;
      roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#13ec6a'; ctx.font = '600 24px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(b.label.toUpperCase(), b.x + b.w/2, b.y + 38);
      if (b.desc) {
        const dT = (typeof b.desc === 'function') ? b.desc() : b.desc;
        ctx.textAlign = 'left'; ctx.font = '300 18px "Space Grotesk", sans-serif'; ctx.fillStyle = 'rgba(19, 236, 106, 0.8)'; ctx.fillText(dT.toUpperCase(), b.x + b.w + 30, b.y + 36);
      }
    }
    function drawBattleUI() {
      const uiH = 400; const uiY = worldH - uiH;
      ctx.fillStyle = 'rgba(6, 10, 6, 0.95)'; ctx.fillRect(0, uiY, worldW, uiH);
      ctx.strokeStyle = '#13ec6a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, uiY); ctx.lineTo(worldW, uiY); ctx.stroke();
      ctx.fillStyle = '#13ec6a'; ctx.font = '600 40px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 10;
      ctx.fillText(battleMessage.toUpperCase(), worldW / 2, uiY + 60); ctx.shadowBlur = 0;
      const m = buttons[currentMenu];
      if (m && battleTurn === 'player' && player.hp > 0 && activeZombie.hp > 0) {
        m.forEach(b => {
          drawButton(ctx, b);
          const isF = (b.label.includes('FLURRY') || b.label === player.config.special_attack.name.toUpperCase());
          const isB = b.label.includes('BLOCK');
          if ((isF && player.flurryCooldown > 0) || (isB && player.blockCooldown > 0)) {
            const cd = isF ? player.flurryCooldown : player.blockCooldown;
            ctx.fillStyle = 'rgba(6, 10, 6, 0.8)'; roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fill();
            ctx.fillStyle = '#ff4444'; ctx.font = '600 20px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`COOLDOWN: ${cd}`, b.x + b.w/2, b.y + 38);
          }
        });
      }
    }
    function drawPortal(ctx, p) {
      if (!portalSheet) return;
      const sw = 64; const sh = 64;
      const sx = (p.frame || 0) * sw;
      const scale = 8;
      const dw = sw * scale; const dh = sh * scale;
      
      ctx.save();
      ctx.shadowColor = p.color; ctx.shadowBlur = 15 + Math.sin(p.pulse) * 5;
      ctx.drawImage(portalSheet, sx, 0, sw, sh, p.x - dw / 2, p.y - dh / 2, dw, dh);
      ctx.fillStyle = '#fff'; ctx.font = '600 24px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.label, p.x, p.y - dh / 2 - 20);
      ctx.restore();
    }

    function loop() {
      try { const now = performance.now(); const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; update(dt); render(); requestAnimationFrame(loop); }
      catch (e) { console.error("Loop crash:", e); alert("GAME CRASHED: " + e.message); }
    }
    let last = performance.now(); loop();
  } catch (err) { console.error("START ERROR:", err); alert("CRITICAL ERROR: " + err.message); }
}
start();
