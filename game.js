/**
 * Single-Zone RPG Upgrade for Game Jam
 * Features: Red Mage character, Grid-based Sprite Sheets, Battle System.
 */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ANIM_SPEED = 0.12;
const KNIGHT_SCALE = 4; // Used for hitbox calculation
const ENEMY_BASE_SCALE = 2;

const SCENE_CONFIG = {
  jail: {
    id: 'jail', bg: 'assets/scenes/jail-cell.png', spawn: { x: 1920, y: 1220 },
    playerScale: 6.0,
    walkable: (x, y) => (x >= 40 && x <= 2700 && y >= 950 && y <= 1405),
    interactables: [{ id: 'mirror', x: 243, y: 457, w: 176, h: 800 }, { id: 'door', x: 770, y: 310, w: 360, h: 650 }],
    portals: [], npcs: []
  },
  castle: {
    id: 'castle', bg: 'assets/scenes/castle.png', spawn: { x: 1376, y: 1175 },
    playerScale: 3.0,
    walkable: (x, y) => (y >= 1125 && y <= 1420) || (x >= 450 && x <= 750 && y >= 825 && y <= 1125),
    interactables: [], portals: [],
    npcs: []
  },
  blacksmith_room: {
    id: 'blacksmith_room', bg: 'assets/scenes/blacksmith-room.png', spawn: { x: 1376, y: 1220 },
    playerScale: 6.0,
    walkable: (x, y) => (x >= 50 && x <= 2700 && y >= 950 && y <= 1420),
    interactables: [], portals: [],
    npcs: [{ id: 'blacksmith', x: 1590, y: 1080 }]
  },
  rest_site: {
    id: 'rest_site', bg: 'assets/scenes/rest-site.png', spawn: { x: 1376, y: 1220 },
    playerScale: 6.0,
    walkable: (x, y) => (x >= 50 && x <= 2700 && y >= 950 && y <= 1420),
    interactables: [{ id: 'rest_point', x: 460, y: 320, w: 460, h: 360 }], 
    portals: [], npcs: []
  },
  act_1_title: {
    id: 'act_1_title', bg: 'assets/scenes/act-1-title.png', isOverlay: true,
    walkable: () => false, interactables: [], portals: [], npcs: []
  }
};
let activeScene = 'jail';

// --- Character Data ---
let CHARACTERS = [];
let ITEMS = [];
let ENEMIES = [];
let NPCS = [];

// --- Helper: Asset Loader ---
async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

function cloneItem(item) {
  if (!item) return null;
  return JSON.parse(JSON.stringify(item));
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
    this.moveSpeed = (incomingParams?.speed || 5) * 100;
    this.config = config;
    this.images = animationImages;
    this.state = 'idle'; 
    this.facing = 1;
    this.frame = 0;
    this.frameTime = 0;
    this.hitboxR = 40; // Adjusted for Bruxa
    
    this.baseStats = config.stats || { hp: 50, strength: 10, intelligence: 10, dex: 10, speed: 10, luck: 10 };
    this.bonusStats = { hp: 0, strength: 0, intelligence: 0, dex: 0, speed: 0, luck: 0 };
    this.inventory = [];
    this.equipment = { weapon: null, armor: null, accessory: null };
    
    this.hp = this.maxHp;
    this.actionsRemaining = 0;
    this.specialCooldown = 0;
    this.secondaryCooldown = 0;
    this.animRepeats = 0;
    this.currentScale = config.sprite_config.scale || 3.0;
  }

  getEffectiveStat(statName) {
    let val = (this.baseStats[statName] || 0) + (this.bonusStats[statName] || 0);
    if (this.equipment.weapon && this.equipment.weapon.modifiers && this.equipment.weapon.modifiers[statName]) val += this.equipment.weapon.modifiers[statName];
    if (this.equipment.armor && this.equipment.armor.modifiers && this.equipment.armor.modifiers[statName]) val += this.equipment.armor.modifiers[statName];
    if (this.equipment.accessory && this.equipment.accessory.modifiers && this.equipment.accessory.modifiers[statName]) val += this.equipment.accessory.modifiers[statName];
    return val;
  }

  get maxHp() { return this.getEffectiveStat('hp'); }
  get strength() { return this.getEffectiveStat('strength'); }
  get intelligence() { return this.getEffectiveStat('intelligence'); }
  get dex() { return this.getEffectiveStat('dex'); }
  get speed() { return this.getEffectiveStat('speed'); }
  get luck() { return this.getEffectiveStat('luck'); }
  get maxActions() { return Math.floor(this.speed / 5); }

  get basicDamage() { 
    const statName = this.equipment.weapon?.damage_type || 'strength';
    return Math.floor(this.getEffectiveStat(statName) * 1.0); 
  }
  get specialDamage() { 
    const statName = this.equipment.weapon?.damage_type || 'strength';
    return Math.floor(this.getEffectiveStat(statName) * 2.0); 
  }

  update(dt, keys, worldW, worldH, inBattle) {
    if (inBattle) { this.updateAnimation(dt); return; }
    const prevX = this.x; const prevY = this.y;
    this.vx = 0; this.vy = 0;
    if (keys['w']) this.vy -= 1; if (keys['s']) this.vy += 1;
    if (keys['a']) this.vx -= 1; if (keys['d']) this.vx += 1;
    if (this.vx !== 0 || this.vy !== 0) {
      const mag = Math.hypot(this.vx, this.vy);
      this.vx = (this.vx / mag) * this.moveSpeed;
      this.vy = (this.vy / mag) * this.moveSpeed;
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

    if (!inBattle) this.drawName(ctx);
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
class Enemy {
  constructor(x, y, config) {
    this.x = x; this.y = y;
    this.config = config;
    this.type = config.type || 'normal';
    this.hitboxR = config.hitboxR || 50;
    this.pulse = 0; this.vx = 0; this.vy = 0; this.wanderTimer = 0; 
    this.worldSpeed = config.worldSpeed || 120;
    this.actionsRemaining = 0;
    this.maxHp = config.stats.hp;
    this.hp = this.maxHp;
  }
  get name() { return this.config.name; }
  get speed() { return this.config.stats.speed; }
  get strength() { return this.config.stats.strength; }
  get luck() { return this.config.stats.luck || 0; }
  get maxActions() { return Math.floor(this.speed / 5); }

  update(dt, worldW, worldH, inBattle) {
    this.pulse += dt; if (inBattle) return;
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * this.worldSpeed; this.vy = Math.sin(angle) * this.worldSpeed;
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
    const s = this.config.visual_config?.scale || ENEMY_BASE_SCALE; 
    const bob = Math.sin(this.pulse * 2) * 2 * s;
    // Basic colored visual for enemies
    ctx.fillStyle = this.config.id === 'zombie' ? '#497328' : '#e0e0e0'; 
    ctx.fillRect(-15 * s, -75 * s + bob, 30 * s, 30 * s);
    ctx.fillStyle = this.config.id === 'zombie' ? '#2d4c8c' : '#a0a0a0';
    ctx.fillRect(-15 * s, -45 * s + bob, 30 * s, 40 * s);
    ctx.fillStyle = '#3c245c'; ctx.fillRect(-15 * s, -5 * s + bob, 12 * s, 20 * s);
    ctx.fillRect(3 * s, -5 * s + bob, 12 * s, 20 * s);
    ctx.fillStyle = this.config.id === 'zombie' ? '#497328' : '#e0e0e0';
    ctx.fillRect(-27 * s, -42 * s + bob, 12 * s, 8 * s);
    ctx.fillRect(15 * s, -42 * s + bob, 12 * s, 8 * s);
    ctx.restore();
    if (inBattle) this.drawHPBar(ctx);
  }
  drawHPBar(ctx) {
    const w = 100; const h = 10; const x = this.x - w / 2; const y = this.y - 180;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ff4444'; ctx.fillRect(x, y, w * (Math.max(0, this.hp) / this.maxHp), h);
    ctx.strokeStyle = '#fff'; ctx.strokeRect(x, y, w, h);
    
    // Draw HP Numbers
    ctx.fillStyle = '#fff'; ctx.font = '600 18px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(this.hp)}/${this.maxHp}`, this.x, y - 10);
  }
}

// --- NPC Class ---
class NPC {
  constructor(x, y, config, images) {
    this.x = x; this.y = y;
    this.config = config;
    this.images = images;
    this.state = 'idle';
    this.frame = 0;
    this.frameTime = 0;
    this.facing = 1; // Default facing right
  }

  update(dt) {
    this.frameTime += dt;
    const cfg = this.config.sprite_config;
    const stateCfg = cfg.states[this.state];
    const totalFrames = stateCfg.frames;
    const speed = cfg.anim_speed || ANIM_SPEED;

    if (this.frameTime >= speed) {
      this.frame = (this.frame + 1) % totalFrames;
      this.frameTime = 0;
    }
  }

  draw(ctx) {
    const img = this.images[this.state];
    if (!img) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.facing === -1) ctx.scale(-1, 1);
    
    const cfg = this.config.sprite_config;
    const stateCfg = cfg.states[this.state];
    const sw = stateCfg.sw;
    const sh = stateCfg.sh;
    const cols = stateCfg.cols;
    
    const sx = (this.frame % cols) * sw;
    const sy = Math.floor(this.frame / cols) * sh;
    
    const scale = cfg.scale || 3.0;
    const dw = sw * scale; const dh = sh * scale;

    ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh + 40, dw, dh);
    ctx.restore();
    
    // Draw NPC Name
    ctx.fillStyle = '#fff'; ctx.font = '600 20px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5;
    ctx.fillText(this.config.name.toUpperCase(), this.x, this.y - (sh * scale) + 20);
    ctx.shadowBlur = 0;
  }
}

// --- Main Engine ---
async function start() {
  try {
    incomingParams = Portal.readPortalParams();
    document.getElementById('username').textContent = incomingParams.username;
    let worldNpcs = [];

    // Load Characters from JSON
    try {
      const response = await fetch('config/playable_characters.json');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for playable_characters`);
      CHARACTERS = await response.json();
      
      const itemsResponse = await fetch('config/items.json');
      if (!itemsResponse.ok) throw new Error(`HTTP error! status: ${itemsResponse.status} for items.json`);
      ITEMS = await itemsResponse.json();

      const enemiesResponse = await fetch('config/enemies.json');
      if (!enemiesResponse.ok) throw new Error(`HTTP error! status: ${enemiesResponse.status} for enemies.json`);
      ENEMIES = await enemiesResponse.json();

      const npcsResponse = await fetch('config/npcs.json');
      if (!npcsResponse.ok) throw new Error(`HTTP error! status: ${npcsResponse.status} for npcs.json`);
      NPCS = await npcsResponse.json();
    } catch (e) {
      console.error("Failed to load game data:", e);
      alert("CRITICAL: Game data missing. Error: " + e.message);
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
    const npcImages = {};
    let portalSheet = null;
    let heartImg = null;
    let energyImg = null;
    const preload = [];
    
    // Load portal sheet
    preload.push(loadImage('assets/world/portal.png').then(img => { portalSheet = img; }));
    preload.push(loadImage('assets/ui/heart.png').then(img => { heartImg = img; }));
    preload.push(loadImage('assets/ui/energy.png').then(img => { energyImg = img; }));

    // Load all scene backgrounds
    Object.keys(SCENE_CONFIG).forEach(key => {
      preload.push(loadImage(SCENE_CONFIG[key].bg).then(img => { sceneBackgrounds[key] = img; }));
    });

    // Load NPC animations
    NPCS.forEach(npc => {
      npcImages[npc.id] = {};
      Object.keys(npc.animations).forEach(state => {
        preload.push(loadImage(npc.animations[state]).then(img => { npcImages[npc.id][state] = img; }));
      });
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
    
    // Equip starting weapon
    const staffTemplate = ITEMS.find(i => i.id === 'wooden_staff');
    if (staffTemplate) player.equipment.weapon = cloneItem(staffTemplate);
    
    // Initialize NPCs
    function initSceneNpcs(sceneId) {
      worldNpcs = [];
      const cfg = SCENE_CONFIG[sceneId];
      if (cfg.npcs) {
        cfg.npcs.forEach(nDef => {
          const npcCfg = NPCS.find(n => n.id === nDef.id);
          if (npcCfg) {
            worldNpcs.push(new NPC(nDef.x, nDef.y, npcCfg, npcImages[nDef.id]));
          }
        });
      }
    }
    initSceneNpcs(activeScene);
    
    const initialEnemyConfig = ENEMIES.find(e => e.id === 'zombie') || ENEMIES[0];
    let worldEnemies = [
      new Enemy(worldW / 2 + 500, 1175, initialEnemyConfig), 
      new Enemy(worldW / 2 - 500, 1175, initialEnemyConfig)
    ];
    
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
      initSceneNpcs(sceneId);
      battleMessage = `ENTERING ${sceneId.toUpperCase()}...`;
      setTimeout(() => { if (battleMessage.includes("ENTERING")) battleMessage = ""; }, 2000);
    }

    const keys = {};
    window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

    let inBattle = false; let isStartingBattle = false;
    let isPaused = false; let activeEnemy = null;
    let battleTurn = 'player'; let battleMessage = "";
    let currentMenu = 'main'; let preBattlePos = { x: 0, y: 0 };
    let transitionTimer = 0; const TRANSITION_DURATION = 0.8;

    const buttons = {
      main: [
        { 
          label: player.config.basic_attack.name.toUpperCase(), 
          cols: { type: 'Damage', amt: () => player.basicDamage, cd: '0' },
          x: 0, y: 0, w: 250, h: 60, 
          action: () => { attackAction(); } 
        },
        { 
          label: player.config.special_attack.name.toUpperCase(), 
          cols: { type: 'Damage', amt: () => player.specialDamage, cd: player.config.special_attack.cooldown },
          x: 0, y: 0, w: 250, h: 60, 
          action: () => { specialAction(); } 
        },
        { 
          label: player.config.secondary_action.name.toUpperCase(), 
          cols: { 
            type: player.config.secondary_action.type === 'cure' ? 'Heal' : 'Block', 
            amt: () => player.intelligence, 
            cd: player.config.secondary_action.cooldown 
          },
          x: 0, y: 0, w: 250, h: 60, 
          action: () => { secondaryAction(); } 
        }
      ],
      pause: [
        { label: 'Travel', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'travel'; } },
        { label: 'Inventory', x: 0, y: 0, w: 200, h: 60, action: () => { openInventoryMenu(); } },
        { label: 'Dev', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'dev'; } },
        { label: 'Resume', x: 0, y: 0, w: 200, h: 60, action: () => { isPaused = false; } }
      ],
      dev: [
        { label: 'Battle', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'battle'; } },
        { label: 'Add Stats', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'stat_select'; } },
        { label: 'Reset Stats', x: 0, y: 0, w: 200, h: 60, action: () => { 
          Object.keys(player.bonusStats).forEach(s => player.bonusStats[s] = 0);
          player.hp = Math.min(player.hp, player.maxHp);
          battleMessage = "STATS RESET TO BASE!";
          setTimeout(() => battleMessage = "", 2000);
        } },
        { label: 'Reset Game', x: 0, y: 0, w: 200, h: 60, action: () => { if(confirm("RESET?")) location.reload(); } },
        { label: 'Back', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'pause'; } }
      ],
      battle: [
        { label: 'Heal All', x: 0, y: 0, w: 200, h: 60, action: () => { player.hp = player.maxHp; } },
        { label: 'Start Fight', x: 0, y: 0, w: 200, h: 60, action: () => { 
          if (!inBattle) {
            const config = ENEMIES.find(e => e.id === 'zombie') || ENEMIES[0];
            const tempEnemy = new Enemy(player.x, player.y, config);
            isPaused = false;
            startBattle(tempEnemy);
          }
        } },
        { label: 'End Fight', x: 0, y: 0, w: 200, h: 60, action: () => { 
          if (inBattle && activeEnemy) {
            activeEnemy.hp = 0;
            battleMessage = "VICTORY (DEV)!";
            setTimeout(openRewardsMenu, 500);
          }
        } },
        { label: 'Back', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'dev'; } }
      ],
      inventory: [],
      rewards: [],
      stat_select: ['hp', 'strength', 'intelligence', 'dex', 'speed', 'luck'].map(s => ({
        label: s.toUpperCase(),
        x: 0, y: 0, w: 200, h: 60,
        action: () => {
          const val = prompt(`Enter value to add to ${s.toUpperCase()}:`, "10");
          if (val !== null) {
            const num = parseInt(val);
            if (!isNaN(num)) {
              player.bonusStats[s] += num;
              if (s === 'hp') player.hp += num;
              battleMessage = `ADDED ${num} TO ${s.toUpperCase()}!`;
              setTimeout(() => battleMessage = "", 2000);
            }
          }
        }
      })).concat([{ label: 'Back', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'dev'; } }]),
      travel: [
        { label: 'Portal', x: 0, y: 0, w: 200, h: 60, action: () => { 
          const scene = SCENE_CONFIG[activeScene];
          if (scene.portals.length > 0) checkPortal(scene.portals[0], true); 
        } },
        { label: 'Jail', x: 0, y: 0, w: 200, h: 60, action: () => { switchScene('jail'); isPaused = false; } },
        { label: 'Castle', x: 0, y: 0, w: 200, h: 60, action: () => { switchScene('castle'); isPaused = false; } },
        { label: 'Blacksmith', x: 0, y: 0, w: 200, h: 60, action: () => { switchScene('blacksmith_room'); isPaused = false; } },
        { label: 'Rest Site', x: 0, y: 0, w: 200, h: 60, action: () => { switchScene('rest_site'); isPaused = false; } },
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
      ],
      rest: [
        { label: 'REST', x: 0, y: 0, w: 200, h: 60, action: () => { 
          player.hp = player.maxHp; 
          battleMessage = "FULLY RESTED!";
          setTimeout(() => battleMessage = "", 2000);
        } },
        { label: 'BACK', x: 0, y: 0, w: 200, h: 60, action: () => { isPaused = false; } }
      ]
    };

    function openRewardsMenu() {
      isPaused = true;
      currentMenu = 'rewards';
      buttons.rewards = [];
      const stats = ['hp', 'strength', 'intelligence', 'dex', 'speed', 'luck'];
      const startX = worldW / 2 + 100;
      const startY = worldH / 2 - 100;
      
      // Select 3 unique random stats
      const selectedStats = [];
      while(selectedStats.length < 3) {
        const s = stats[Math.floor(Math.random() * stats.length)];
        if(!selectedStats.includes(s)) selectedStats.push(s);
      }

      selectedStats.forEach((stat, i) => {
        const bonus = stat === 'hp' ? 10 : 1;
        buttons.rewards.push({
          label: `+${bonus} ${stat.toUpperCase()}`,
          desc: `PERMANENTLY INCREASE ${stat.toUpperCase()}`,
          x: startX, y: startY + i * 85, w: 400, h: 60,
          action: () => {
            player.bonusStats[stat] += bonus;
            if (stat === 'hp') player.hp += bonus;
            worldEnemies = worldEnemies.filter(z => z !== activeEnemy);
            endBattle();
          }
        });
      });
    }

    function openBlacksmithMenu(npc) {
      isPaused = true;
      currentMenu = 'blacksmith';
      buttons.blacksmith = [];
      const startX = worldW / 2 + 100;
      const startY = worldH / 2 - 100;

      if (npc.config.services.includes('upgrade')) {
        buttons.blacksmith.push({
          label: 'Upgrade Weapon',
          desc: 'IMPROVE YOUR EQUIPPED WEAPON',
          x: startX, y: startY, w: 400, h: 60,
          action: () => { openWeaponSelectMenu(npc); }
        });
      }

      buttons.blacksmith.push({
        label: 'Close',
        desc: 'EXIT CONVERSATION',
        x: startX, y: startY + 85, w: 400, h: 60,
        action: () => { isPaused = false; }
      });
    }

    function openWeaponSelectMenu(npc) {
      currentMenu = 'weapon_select';
      buttons.weapon_select = [];
      const startX = worldW / 2 + 100;
      const startY = worldH / 2 - 100;

      // For now, only currently equipped weapon can be upgraded
      if (player.equipment.weapon) {
        buttons.weapon_select.push({
          label: player.equipment.weapon.name.toUpperCase(),
          desc: 'SELECT THIS WEAPON TO UPGRADE',
          x: startX, y: startY, w: 400, h: 60,
          action: () => { openUpgradeChoiceMenu(npc, player.equipment.weapon); }
        });
      } else {
        battleMessage = "NO WEAPON EQUIPPED!";
        setTimeout(() => battleMessage = "", 2000);
      }

      buttons.weapon_select.push({
        label: 'Back',
        x: startX, y: startY + 85, w: 400, h: 60,
        action: () => { currentMenu = 'blacksmith'; }
      });
    }

    function openUpgradeChoiceMenu(npc, item) {
      currentMenu = 'upgrade_choice';
      buttons.upgrade_choice = [];
      const startX = worldW / 2 + 100;
      const startY = worldH / 2 - 150;

      const upgrades = npc.config.available_upgrades;
      const choices = [];
      while (choices.length < Math.min(3, upgrades.length)) {
        const u = upgrades[Math.floor(Math.random() * upgrades.length)];
        if (!choices.includes(u)) choices.push(u);
      }

      choices.forEach((u, i) => {
        buttons.upgrade_choice.push({
          label: u.name.toUpperCase(),
          desc: `ADD +${u.value} ${u.stat.toUpperCase()} TO WEAPON`,
          x: startX, y: startY + i * 85, w: 400, h: 60,
          action: () => {
            item.modifiers[u.stat] = (item.modifiers[u.stat] || 0) + u.value;
            battleMessage = `${item.name.toUpperCase()} UPGRADED!`;
            isPaused = false;
            setTimeout(() => battleMessage = "", 2000);
          }
        });
      });

      buttons.upgrade_choice.push({
        label: 'Back',
        x: startX, y: startY + choices.length * 85 + 40, w: 400, h: 60,
        action: () => { currentMenu = 'weapon_select'; }
      });
    }

    function openInventoryMenu() {
      currentMenu = 'inventory';
      isPaused = true;
      buttons.inventory = [];
      const startX = worldW / 2 + 300;
      const startY = worldH / 2 - 200;
      
      ITEMS.forEach((item, i) => {
        buttons.inventory.push({
          label: () => `${item.name.toUpperCase()} ${player.equipment[item.slot]?.id === item.id ? '[EQ]' : ''}`,
          desc: () => Object.entries(item.modifiers).map(([k,v]) => `+${v} ${k.toUpperCase()}`).join(', '),
          x: startX, y: startY + i * 85, w: 350, h: 60,
          action: () => {
            if (player.equipment[item.slot]?.id === item.id) {
              player.equipment[item.slot] = null; // Unequip
            } else {
              player.equipment[item.slot] = item; // Equip
            }
            player.hp = Math.min(player.hp, player.maxHp);
          }
        });
      });

      buttons.inventory.push({
        label: 'Back', desc: 'RETURN TO PAUSE MENU',
        x: startX, y: startY + ITEMS.length * 85 + 40, w: 350, h: 60,
        action: () => { currentMenu = 'pause'; }
      });
    }

    function layoutButtons() {
      const bX = worldW / 2 - 300; const bY = worldH - 280 + 25;
      buttons.main.forEach((b, i) => { b.x = bX; b.y = bY + i * 85; });
      
      const pY = worldH / 2 - 30;
      ['pause', 'dev', 'travel', 'stat_select', 'battle'].forEach(m => {
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
      isStartingBattle = true; preBattlePos = { x: player.x, y: player.y }; activeEnemy = z; transitionTimer = TRANSITION_DURATION;
      setTimeout(() => {
        inBattle = true; isStartingBattle = false; battleTurn = 'player'; currentMenu = 'main'; battleMessage = "";
        player.x = worldW / 2 - 400; player.y = 1300; player.facing = 1; player.state = 'idle'; player.frame = 0;
        player.actionsRemaining = player.maxActions;
        activeEnemy.x = worldW / 2 + 400; activeEnemy.y = 1300; activeEnemy.actionsRemaining = activeEnemy.maxActions;
        player.specialCooldown = 0; player.secondaryCooldown = 0;
      }, (TRANSITION_DURATION / 2) * 1000);
    }

    function attackAction() { 
      player.playAttack(); 
      const isCrit = Math.random() < (player.luck / 100);
      const dmg = player.basicDamage * (isCrit ? 2 : 1);
      activeEnemy.hp -= dmg; 
      battleMessage = isCrit ? `CRITICAL HIT! DEALT ${dmg} DAMAGE!` : `YOU ATTACKED FOR ${dmg} DAMAGE!`; 
      endPlayerTurn(); 
    }
    function secondaryAction() {
      const cfg = player.config.secondary_action;
      if (player.secondaryCooldown > 0) return;
      
      if (cfg.type === 'cure') {
        const healAmt = player.intelligence;
        player.hp = Math.min(player.maxHp, player.hp + healAmt);
        player.secondaryCooldown = cfg.cooldown;
        battleMessage = `YOU ${cfg.name.toUpperCase()}! HEALED ${healAmt} HP!`;
      }
      
      endPlayerTurn();
    }
    function specialAction() {
      if (player.specialCooldown > 0) return;
      player.playAttack(0, 'special'); 
      const isCrit = Math.random() < (player.luck / 100);
      const dmg = player.specialDamage * (isCrit ? 2 : 1);
      activeEnemy.hp -= dmg; 
      player.specialCooldown = player.config.special_attack.cooldown;
      battleMessage = isCrit ? `CRITICAL HIT! ${player.config.special_attack.name.toUpperCase()} DEALT ${dmg} DAMAGE!` : `${player.config.special_attack.name.toUpperCase()}! DEALT ${dmg} DAMAGE!`; 
      endPlayerTurn(); 
      }    function endBattle() { inBattle = false; isPaused = false; currentMenu = 'main'; player.x = preBattlePos.x; player.y = preBattlePos.y; battleMessage = ""; }
    function runAction() { if (Math.random() > 0.5) { battleMessage = "ESCAPED!"; setTimeout(endBattle, 1000); } else { battleMessage = "FAILED!"; endPlayerTurn(); } }
    function endPlayerTurn() {
      player.actionsRemaining--;
      battleTurn = 'action_cooldown';

      let waitTime = 0;
      if (player.state === 'attack' || player.state === 'special') {
        const stateCfg = player.config.sprite_config.states[player.state];
        const frames = stateCfg.frames;
        waitTime = frames * (player.config.sprite_config.anim_speed || ANIM_SPEED) * 1000;
      }

      setTimeout(() => {
        if (activeEnemy.hp <= 0) {
          battleMessage = "VICTORY!";
          setTimeout(openRewardsMenu, 1000);
          return;
        }

        if (player.actionsRemaining > 0) {
          battleTurn = 'player';
          battleMessage = "SELECT NEXT ACTION";
        } else {
          battleTurn = 'enemy_waiting';
          setTimeout(enemyTurn, 1000);
        }
      }, waitTime);
    }
    function enemyTurn() {
      if (!inBattle) return;
      battleTurn = 'enemy'; 
      const isCrit = Math.random() < (activeEnemy.luck / 100);
      let dmg = (Math.floor(activeEnemy.strength * 1.0) + Math.floor(Math.random() * 3)) * (isCrit ? 2 : 1);
      player.hp -= dmg; 
      battleMessage = isCrit ? `CRITICAL HIT! ${activeEnemy.name.toUpperCase()} ATTACKS FOR ${dmg} DAMAGE!` : `${activeEnemy.name.toUpperCase()} ATTACKS FOR ${dmg} DAMAGE!`; 
      
      activeEnemy.actionsRemaining--;

      setTimeout(() => {
        if (player.hp <= 0) {
          battleMessage = "DEFEAT...";
          return;
        }

        if (activeEnemy.actionsRemaining > 0) {
          enemyTurn();
        } else {
          if (player.specialCooldown > 0) player.specialCooldown--; if (player.secondaryCooldown > 0) player.secondaryCooldown--;
          battleTurn = 'player';
          battleMessage = "YOUR TURN!";
          player.actionsRemaining = player.maxActions;
        }
      }, 1500);
    }

    function update(dt) {
      if (transitionTimer > 0) { transitionTimer -= dt; return; }
      if (isPaused) return;
      if (activeScene.includes('title')) return; // Don't update player during title screens
      
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
                activeScene = 'act_1_title';
                setTimeout(() => {
                  switchScene('castle');
                }, 3000);
              } else if (obj.id === 'rest_point') {
                isPaused = true;
                currentMenu = 'rest';
              }
            }
          });

          worldNpcs.forEach(npc => {
            if (Math.hypot(player.x - npc.x, player.y - npc.y) < 150) {
              if (npc.config.id === 'blacksmith') {
                openBlacksmithMenu(npc);
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
          worldEnemies.forEach(z => { z.update(dt, worldW, worldH, inBattle); if (Math.hypot(player.x - z.x, player.y - z.y) < player.hitboxR + z.hitboxR) startBattle(z); });
        }
        
        worldNpcs.forEach(n => n.update(dt));

        const scene = SCENE_CONFIG[activeScene];
        scene.portals.forEach(p => {
          p.pulse += dt * 3;
          p.frameTime = (p.frameTime || 0) + dt;
          if (p.frameTime > 0.1) {
            p.frame = ((p.frame || 0) + 1) % 8;
            p.frameTime = 0;
          }
        });
      } else { activeEnemy.update(dt, worldW, worldH, inBattle); }
    }
    function checkPortal(p, force = false) { 
      if (!p.target || !force) return; 
      Portal.sendPlayerThroughPortal(p.target, { username: incomingParams.username, color: incomingParams.color, speed: player.moveSpeed / 100 }); 
    }

    function render() {
      ctx.clearRect(0, 0, worldW, worldH); ctx.save(); if (inBattle) ctx.translate(0, -225); 
      
      const currentBg = sceneBackgrounds[activeScene];
      ctx.drawImage(currentBg, 0, 0, worldW, worldH);

      if (!inBattle) { 
        const scene = SCENE_CONFIG[activeScene];
        scene.portals.forEach(p => drawPortal(ctx, p));
        
        worldNpcs.forEach(n => n.draw(ctx));

        if (activeScene === 'castle') {
          worldEnemies.forEach(z => z.draw(ctx, inBattle)); 
        }
      } else { activeEnemy.draw(ctx, inBattle); }
      if (!activeScene.includes('title')) {
        player.draw(ctx, inBattle);

        // Draw Interaction Prompt
        if (!inBattle && !isPaused) {
          const scene = SCENE_CONFIG[activeScene];
          if (scene && scene.interactables) {
            const isNearObj = scene.interactables.some(obj => 
              player.x >= obj.x && player.x <= obj.x + obj.w &&
              player.y >= obj.y && player.y <= obj.y + obj.h
            );
            const isNearPortal = scene.portals && scene.portals.some(p => 
              Math.hypot(player.x - p.x, player.y - p.y) < p.r + 50
            );
            const isNearNpc = worldNpcs.some(npc => 
              Math.hypot(player.x - npc.x, player.y - npc.y) < 150
            );

            if (isNearObj || isNearPortal || isNearNpc) {
              ctx.fillStyle = '#fff'; ctx.font = '600 20px "Space Grotesk", sans-serif';              ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 10;
              ctx.fillText('E TO INTERACT', player.x, player.y - 320);
              ctx.shadowBlur = 0;
            }
          }
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
      
      const isCustomMenu = ['inventory', 'rewards', 'blacksmith', 'rest', 'weapon_select', 'upgrade_choice'].includes(currentMenu);

      if (isCustomMenu) {
        let title = 'PAUSED';
        if (currentMenu === 'inventory') title = 'INVENTORY';
        if (currentMenu === 'rewards') title = 'VICTORY';
        if (currentMenu === 'blacksmith') title = 'BLACKSMITH';
        if (currentMenu === 'rest') title = 'REST SITE';
        if (currentMenu === 'weapon_select') title = 'SELECT ITEM';
        if (currentMenu === 'upgrade_choice') title = 'CHOOSE UPGRADE';

        ctx.fillStyle = '#13ec6a'; ctx.font = '800 80px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 15;
        ctx.fillText(title, worldW / 2, 100); ctx.shadowBlur = 0;
        
        // Draw Sprite (Left)
        const img = player.images['idle'];
        if (img) {
          const cfg = player.config.sprite_config.states['idle'];
          const scale = 3.5;
          const dw = cfg.sw * scale; const dh = cfg.sh * scale;
          ctx.drawImage(img, 0, 0, cfg.sw, cfg.sh, worldW / 2 - 700 - dw / 2, worldH / 2 - dh / 2, dw, dh);
        }
        
        // Draw Stats (Middle)
        ctx.textAlign = 'left';
        ctx.font = '600 28px "Space Grotesk", sans-serif';
        const statsX = worldW / 2 - 250;
        let statsY = worldH / 2 - 125;
        let statsList = [
          { label: 'HP', val: player.maxHp },
          { label: 'STRENGTH', val: player.strength },
          { label: 'INTELLIGENCE', val: player.intelligence },
          { label: 'DEXTERITY', val: player.dex },
          { label: 'SPEED', val: player.speed },
          { label: 'LUCK', val: player.luck }
        ];
        
        if (currentMenu !== 'rewards') {
          statsList.push({ label: '------------------', val: '' });
          statsList.push({ label: 'BASIC DMG', val: player.basicDamage });
          statsList.push({ label: 'SPECIAL DMG', val: player.specialDamage });
        }

        statsList.forEach(s => {
          ctx.fillText(`${s.label}: ${s.val}`, statsX, statsY);
          statsY += 50;
        });

        // Add Reward Reminder
        if (currentMenu === 'rewards') {
          ctx.fillStyle = 'rgba(19, 236, 106, 0.8)'; ctx.font = '700 20px "Space Grotesk", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('PICK ONE REWARD', worldW / 2 + 300, worldH / 2 - 140);
        }
      } else {
        ctx.fillStyle = '#13ec6a'; ctx.font = '800 100px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 15;
        ctx.fillText('PAUSED', worldW / 2, worldH / 2 - 150); ctx.shadowBlur = 0;
      }
      
      if (buttons[currentMenu]) buttons[currentMenu].forEach(b => drawButton(ctx, b));
    }
    function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function drawButton(ctx, b) {
      ctx.fillStyle = 'rgba(19, 236, 106, 0.1)'; ctx.strokeStyle = '#13ec6a'; ctx.lineWidth = 2;
      roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fill(); ctx.stroke();
      const lT = (typeof b.label === 'function') ? b.label() : b.label;
      ctx.fillStyle = '#13ec6a'; ctx.font = '600 24px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lT.toUpperCase(), b.x + b.w/2, b.y + 38);
      
      if (b.cols) {
        ctx.font = '300 18px "Space Grotesk", sans-serif'; ctx.fillStyle = 'rgba(19, 236, 106, 0.8)';
        
        const typeX = b.x + b.w + 30;
        const amtX = typeX + 150;
        const cdX = amtX + 150;
        
        // Evaluate column values
        const type = (typeof b.cols.type === 'function' ? b.cols.type() : b.cols.type).toUpperCase();
        const amt = (typeof b.cols.amt === 'function' ? b.cols.amt() : b.cols.amt).toString().toUpperCase();
        const cd = (typeof b.cols.cd === 'function' ? b.cols.cd() : b.cols.cd).toString().toUpperCase();

        ctx.textAlign = 'center';
        ctx.fillText(type, typeX + 60, b.y + 38);
        ctx.fillText(amt, amtX + 60, b.y + 38);
        ctx.fillText(cd, cdX + 60, b.y + 38);
        
        // Draw thin divider lines
        ctx.strokeStyle = 'rgba(19, 236, 106, 0.3)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(typeX, b.y + 10); ctx.lineTo(typeX, b.y + 50);
        ctx.moveTo(amtX, b.y + 10); ctx.lineTo(amtX, b.y + 50);
        ctx.moveTo(cdX, b.y + 10); ctx.lineTo(cdX, b.y + 50);
        ctx.stroke();
      } else if (b.desc) {
        const dT = (typeof b.desc === 'function') ? b.desc() : b.desc;
        ctx.textAlign = 'left'; ctx.font = '300 18px "Space Grotesk", sans-serif'; ctx.fillStyle = 'rgba(19, 236, 106, 0.8)'; ctx.fillText(dT.toUpperCase(), b.x + b.w + 30, b.y + 36);
      }
    }
    function drawBattleUI() {
      const uiH = 400; const uiY = worldH - uiH;
      ctx.fillStyle = 'rgba(6, 10, 6, 0.95)'; ctx.fillRect(0, uiY, worldW, uiH);
      ctx.strokeStyle = '#13ec6a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, uiY); ctx.lineTo(worldW, uiY); ctx.stroke();
      
      // Draw Heart and HP Text
      if (heartImg) {
        const heartSize = 40;
        const hpX = player.x - 70;
        const hpY = uiY - 60;
        ctx.drawImage(heartImg, hpX, hpY, heartSize, heartSize);
        ctx.fillStyle = '#fff'; ctx.font = '600 28px "Space Grotesk", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.ceil(player.hp)}/${player.maxHp}`, hpX + heartSize + 15, hpY + 30);

        // Draw Energy and Actions Text
        if (energyImg) {
          const energySize = 40;
          const enX = hpX + 220;
          const enY = hpY;
          ctx.drawImage(energyImg, enX, enY, energySize, energySize);
          ctx.fillStyle = '#fff'; ctx.font = '600 28px "Space Grotesk", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${player.actionsRemaining}/${player.maxActions}`, enX + energySize + 15, enY + 30);
        }
      }

      ctx.fillStyle = '#13ec6a'; ctx.font = '600 40px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 10;
      ctx.fillText(battleMessage.toUpperCase(), worldW / 2, uiY + 60); ctx.shadowBlur = 0;

      const m = buttons[currentMenu];
      if (m && battleTurn === 'player' && player.hp > 0 && activeEnemy.hp > 0) {
        // Draw Column Headers for battle menus
        if (currentMenu === 'main') {
          const headY = worldH - 280 - 10;
          const headX = worldW / 2 - 300 + 250 + 30;
          ctx.font = '700 16px "Space Grotesk", sans-serif'; ctx.fillStyle = 'rgba(19, 236, 106, 0.6)';
          ctx.textAlign = 'center';
          ctx.fillText('TYPE', headX + 60, headY);
          ctx.fillText('AMOUNT', headX + 150 + 60, headY);
          ctx.fillText('COOLDOWN', headX + 300 + 60, headY);
          
          ctx.strokeStyle = 'rgba(19, 236, 106, 0.3)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(headX - 10, headY + 10); ctx.lineTo(headX + 450, headY + 10); ctx.stroke();
        }

        m.forEach(b => {
          drawButton(ctx, b);
          const isF = (b.label.includes('SPECIAL') || b.label === player.config.special_attack.name.toUpperCase());
          const isB = (b.label === player.config.secondary_action.name.toUpperCase());
          if ((isF && player.specialCooldown > 0) || (isB && player.secondaryCooldown > 0)) {
            const cd = isF ? player.specialCooldown : player.secondaryCooldown;
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
