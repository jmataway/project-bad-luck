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
    interactables: [{ id: 'mirror', x: 243, y: 457, w: 176, h: 400 }, { id: 'door', x: 770, y: 310, w: 360, h: 650 }],
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
    interactables: [{ id: 'rest_point', x: 960, y: 520, w: 810, h: 600 }],
    portals: [], npcs: []
  },  act_1_title: {
    id: 'act_1_title', bg: 'assets/scenes/act-1-title.png', isOverlay: true,
    walkable: () => false, interactables: [], portals: [], npcs: []
  },
  end_demo: {
    id: 'end_demo', bg: 'assets/scenes/act-1-demo-end.png', isOverlay: true,
    walkable: () => false, interactables: [], portals: [], npcs: []
  }
};
let activeScene = 'jail';

// --- Character Data ---
let CHARACTERS = [];
let ITEMS = [];
let RELICS = [];
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
    this.multiplierStats = {};
    this.inventory = [];
    this.relics = [];
    this.equipment = { weapon: null, armor: null, accessory: null };
    
    this.hp = this.maxHp;
    this.actionsRemaining = 0;
    this.specialCooldown = 0;
    this.secondaryCooldown = 0;
    this.animRepeats = 0;
    this.currentScale = config.sprite_config.scale || 3.0;
  }

  addRelic(relicData) {
    this.relics.push(relicData);
    const effect = relicData.option.effect;
    if (effect.type === 'stat_bonus') {
      this.bonusStats[effect.stat || effect.action] = (this.bonusStats[effect.stat || effect.action] || 0) + effect.value;
      if (effect.stat === 'hp' || effect.action === 'hp') this.hp += effect.value;
    } else if (effect.type === 'stat_multiplier') {
      this.multiplierStats[effect.stat] = (this.multiplierStats[effect.stat] || 1) * effect.multiplier;
    }
  }

  getEffectiveStat(statName) {
    let val = (this.baseStats[statName] || 0) + (this.bonusStats[statName] || 0);
    if (this.equipment.weapon && this.equipment.weapon.modifiers && this.equipment.weapon.modifiers[statName]) val += this.equipment.weapon.modifiers[statName];
    if (this.equipment.armor && this.equipment.armor.modifiers && this.equipment.armor.modifiers[statName]) val += this.equipment.armor.modifiers[statName];
    if (this.equipment.accessory && this.equipment.accessory.modifiers && this.equipment.accessory.modifiers[statName]) val += this.equipment.accessory.modifiers[statName];
    return Math.floor(val * (this.multiplierStats[statName] || 1));
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
    let baseDmg = Math.floor(this.getEffectiveStat(statName) * 1.0); 
    baseDmg += (this.bonusStats['basicDamage'] || 0);
    return Math.floor(baseDmg * (this.multiplierStats['basicDamage'] || 1));
  }
  get specialDamage() { 
    const statName = this.equipment.weapon?.damage_type || 'strength';
    let specialDmg = Math.floor(this.getEffectiveStat(statName) * 2.0); 
    specialDmg += (this.bonusStats['specialDamage'] || 0);
    return Math.floor(specialDmg * (this.multiplierStats['specialDamage'] || 1));
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
  constructor(x, y, config, images) {
    this.x = x; this.y = y;
    this.config = config;
    this.images = images || {};
    this.type = config.type || 'normal';
    this.hitboxR = config.hitboxR || 50;
    this.pulse = 0; this.vx = 0; this.vy = 0; this.wanderTimer = 0; 
    this.worldSpeed = config.worldSpeed || 120;
    this.actionsRemaining = 0;
    this.maxHp = config.stats.hp;
    this.hp = this.maxHp;

    this.state = 'idle';
    this.frame = 0;
    this.frameTime = 0;
    this.facing = this.config.visual_config?.facing || -1; // Default enemies face left
  }
  get name() { return this.config.name; }
  get speed() { return this.config.stats.speed; }
  get strength() { return this.config.stats.strength; }
  get luck() { return this.config.stats.luck || 0; }
  get maxActions() { return Math.floor(this.speed / 5); }

  update(dt, worldW, worldH, inBattle) {
    this.pulse += dt; 
    
    // Animation update
    if (this.config.visual_config && this.config.visual_config.states) {
      this.frameTime += dt;
      const stateCfg = this.config.visual_config.states[this.state] || this.config.visual_config.states['idle'];
      if (stateCfg) {
        const speed = this.config.visual_config.anim_speed || ANIM_SPEED;
        if (this.frameTime >= speed) {
          this.frame++;
          if (this.frame >= stateCfg.frames) {
            if (this.state === 'attack' || this.state === 'death') {
              if (this.state === 'attack') { this.state = 'idle'; this.frame = 0; }
              else { this.frame = stateCfg.frames - 1; } // Stay on last frame of death
            } else {
              this.frame = 0;
            }
          }
          this.frameTime = 0;
        }
      }
    }

    if (inBattle) return;
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
    if (this.config.visual_config && this.config.visual_config.animations) {
      const img = this.images[this.state] || this.images['idle'];
      if (img) {
        ctx.save();
        ctx.translate(this.x, this.y);
        if (this.facing === -1) ctx.scale(-1, 1);
        
        const stateCfg = this.config.visual_config.states[this.state] || this.config.visual_config.states['idle'];
        const sw = stateCfg.sw;
        const sh = stateCfg.sh;
        const cols = stateCfg.cols;
        
        const sx = (this.frame % cols) * sw;
        const sy = Math.floor(this.frame / cols) * sh;
        
        const scale = this.config.visual_config.scale || ENEMY_BASE_SCALE;
        const dw = sw * scale; const dh = sh * scale;

        ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh + 40, dw, dh);
        ctx.restore();
      } else {
        this.drawPlaceholder(ctx, inBattle);
      }
    } else {
      this.drawPlaceholder(ctx, inBattle);
    }
    
    if (inBattle) this.drawHPBar(ctx);
  }

  drawPlaceholder(ctx, inBattle) {
    ctx.save(); ctx.translate(this.x, this.y);
    if (this.facing === -1) ctx.scale(-1, 1);
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
  }

  playAttack() {
    this.state = 'attack';
    this.frame = 0;
    this.frameTime = 0;
  }

  drawHPBar(ctx) {
    const w = 120; const h = 12; const x = this.x - w / 2; const y = this.y + 1;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ff4444'; ctx.fillRect(x, y, w * (Math.max(0, this.hp) / this.maxHp), h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    
    // Draw HP Numbers
    ctx.fillStyle = '#fff'; ctx.font = '600 20px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(this.hp)}/${this.maxHp}`, this.x, y + 30);
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

      const relicsResponse = await fetch('config/relics.json');
      if (!relicsResponse.ok) throw new Error(`HTTP error! status: ${relicsResponse.status} for relics.json`);
      RELICS = await relicsResponse.json();

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
    const enemyImages = {};
    let portalSheet = null;
    let heartImg = null;
    let energyImg = null;
    let mapImages = {};
    let relicImages = {};
    const preload = [];

    // Load Relic icons
    RELICS.forEach(r => {
      if (r.icon) {
        preload.push(loadImage(r.icon).then(img => { relicImages[r.id] = img; }).catch(e => console.warn(`Failed to load relic icon ${r.icon}`)));
      }
      r.options.forEach(opt => {
        if (opt.icon) {
          preload.push(loadImage(opt.icon).then(img => { relicImages[opt.id] = img; }).catch(e => console.warn(`Failed to load relic option icon ${opt.icon}`)));
        }
      });
    });

    // Load map icons
    const mapIconNames = ['arrows_down_right.png', 'arrows_right.png', 'arrows_up_right.png', 'fight_enemy.png', 'fight_mini_boss.png', 'fight_boss.png', 'campfire.png', 'question.png', 'blacksmith.png'];
    mapIconNames.forEach(name => {
      preload.push(loadImage(`assets/ui/icons/map/${name}`).then(img => { mapImages[name] = img; }).catch(e => console.warn(`Failed to load ${name}`)));
    });

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

    // Load Enemy animations
    ENEMIES.forEach(enemy => {
      if (enemy.visual_config && enemy.visual_config.animations) {
        enemyImages[enemy.id] = {};
        Object.keys(enemy.visual_config.animations).forEach(state => {
          const path = enemy.visual_config.animations[state];
          if (path) {
            preload.push(loadImage(path).then(img => { 
              enemyImages[enemy.id][state] = img; 
            }).catch(err => console.error(`Failed to load ${enemy.id} ${state}:`, err)));
          }
        });
      }
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
    let worldEnemies = [];

    // Initialize Portals for each scene
    const exitPortalData = { r: 100, color: '#13ec6a', label: nextTarget ? `→ ${nextTarget.title}` : 'no destinations', target: nextTarget?.url || null, pulse: 0 };
    const returnPortalData = incomingParams.ref ? { r: 80, color: '#13ec6a', label: '← back', target: incomingParams.ref, pulse: 0 } : null;

    // Jail Portals
    SCENE_CONFIG.jail.portals.push({ ...exitPortalData, x: 1800, y: 850 });
    if (returnPortalData) SCENE_CONFIG.jail.portals.push({ ...returnPortalData, x: 100, y: 1175 });

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
    
    let encounterMap = null; // Stores { nodes: [], links: [], currentFloor: 0 }
    let activeRelicReward = null;

    function generateEncounterMap() {
      encounterMap = { nodes: [], links: [], currentFloor: 0 };
      const ROWS = 4;
      const COLS = 12;

      // Generate Nodes
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          let nodeType = 'fight_enemy.png';
          if (c === COLS - 1) {
            nodeType = 'fight_boss.png';
          } else if (c === COLS - 2) {
            nodeType = 'campfire.png';
          } else if (c < 3) {
            // First 3 columns: 25% question, 75% enemy
            if (Math.random() < 0.25) nodeType = 'question.png';
          } else {
            // Columns 3-9: specific probabilities
            const rand = Math.random();
            if (rand < 0.07) nodeType = 'campfire.png';
            else if (rand < 0.14) nodeType = 'blacksmith.png';
            else if (rand < 0.24) nodeType = 'fight_mini_boss.png';
            else if (rand < 0.44) nodeType = 'question.png';
          }
          
          encounterMap.nodes.push({ id: `${c}-${r}`, row: r, col: c, type: nodeType, active: c === 0 });
        }
      }
      
      // Generate Links (each node in col C links to 1-3 nodes in col C+1)
      encounterMap.nodes.filter(n => n.col < COLS - 1).forEach(node => {
        let potentialTargets = encounterMap.nodes.filter(n => n.col === node.col + 1 && Math.abs(n.row - node.row) <= 1);
        
        // Randomly drop some connections to make it interesting, but ensure at least 1 path
        let targets = potentialTargets.filter(() => Math.random() > 0.4);
        if (targets.length === 0) targets = [potentialTargets[Math.floor(Math.random() * potentialTargets.length)]];
        
        targets.forEach(t => {
          let arrowType = 'arrows_right.png';
          if (t.row < node.row) arrowType = 'arrows_up_right.png';
          if (t.row > node.row) arrowType = 'arrows_down_right.png';
          
          encounterMap.links.push({ from: node.id, to: t.id, arrow: arrowType });
        });
      });

      // Guarantee at least 2 mini-bosses on a traversable route
      let validPathNodes = [];
      let currentNode = encounterMap.nodes.find(n => n.col === 0 && n.active);
      if (!currentNode) currentNode = encounterMap.nodes.find(n => n.col === 0);
      
      for(let c = 0; c < COLS - 1; c++) {
        let linksFrom = encounterMap.links.filter(l => l.from === currentNode.id);
        if(linksFrom.length === 0) break;
        let nextLink = linksFrom[Math.floor(Math.random() * linksFrom.length)];
        currentNode = encounterMap.nodes.find(n => n.id === nextLink.to);
        validPathNodes.push(currentNode);
      }
      
      let eligibleCols = validPathNodes.filter(n => n.col >= 3 && n.col < COLS - 1);
      for(let i=0; i<2; i++) {
        if (eligibleCols.length > 0) {
            let idx = Math.floor(Math.random() * eligibleCols.length);
            eligibleCols[idx].type = 'fight_mini_boss.png';
            eligibleCols.splice(idx, 1);
        }
      }
    }

    function startRandomFight(type) {
      if (!inBattle) {
        const enemyList = ENEMIES.filter(e => e.type === type);
        const config = enemyList.length > 0 ? enemyList[Math.floor(Math.random() * enemyList.length)] : ENEMIES[0];
        const tempEnemy = new Enemy(player.x, player.y, config, enemyImages[config.id]);
        isPaused = false;
        startBattle(tempEnemy);
      }
    }

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
        { label: 'Generate Map', x: 0, y: 0, w: 200, h: 60, action: () => { 
          generateEncounterMap(); 
          openEncounterMap(); 
        } },
        { label: 'Reset Game', x: 0, y: 0, w: 200, h: 60, action: () => { if(confirm("RESET?")) location.reload(); } },
        { label: 'Back', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'pause'; } }
      ],
      battle: [
        { label: 'Heal All', x: 0, y: 0, w: 200, h: 60, action: () => { player.hp = player.maxHp; } },
        { label: 'Start Fight', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'enemy_type_select'; } },
        { label: 'End Fight', x: 0, y: 0, w: 200, h: 60, action: () => { 
          if (inBattle && activeEnemy) {
            activeEnemy.hp = 0;
            battleMessage = "VICTORY (DEV)!";
            setTimeout(openRewardsMenu, 500);
          }
        } },
        { label: 'Back', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'dev'; } }
      ],
      enemy_type_select: [
        { label: 'Normal', x: 0, y: 0, w: 200, h: 60, action: () => { startRandomFight('normal'); } },
        { label: 'Mini-Boss', x: 0, y: 0, w: 200, h: 60, action: () => { startRandomFight('mini-boss'); } },
        { label: 'Boss', x: 0, y: 0, w: 200, h: 60, action: () => { startRandomFight('boss'); } },
        { label: 'Back', x: 0, y: 0, w: 200, h: 60, action: () => { currentMenu = 'battle'; } }
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
        { label: 'Map', x: 0, y: 0, w: 200, h: 60, action: () => { openEncounterMap(); } },
        { label: 'Jail', x: 0, y: 0, w: 200, h: 60, action: () => { switchScene('jail'); isPaused = false; } },
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
        { label: 'REST', desc: 'HEAL TO FULL HP', x: 0, y: 0, w: 400, h: 60, action: () => { 
          player.hp = player.maxHp; 
          battleMessage = "FULLY RESTED!";
          setTimeout(() => { 
            battleMessage = ""; 
            switchScene('castle'); 
            if (encounterMap && encounterMap.currentFloor >= 12) {
              switchScene('end_demo');
            } else {
              openEncounterMap(); 
            }
          }, 1500);
        } },
        { label: 'TRAIN', desc: 'UPGRADE A STAT (+3)', x: 0, y: 0, w: 400, h: 60, action: () => { currentMenu = 'rest_upgrade'; } },
        { label: 'LEAVE', desc: 'RETURN TO MAP', x: 0, y: 0, w: 400, h: 60, action: () => { 
          switchScene('castle'); 
          if (encounterMap && encounterMap.currentFloor >= 12) {
            switchScene('end_demo');
          } else {
            openEncounterMap(); 
          }
        } }
      ],
      rest_upgrade: ['hp', 'strength', 'intelligence', 'dex', 'speed', 'luck'].map(s => ({
        label: `+3 ${s.toUpperCase()}`,
        desc: `PERMANENTLY INCREASE ${s.toUpperCase()}`,
        x: 0, y: 0, w: 400, h: 60,
        action: () => {
          player.bonusStats[s] += 3;
          if (s === 'hp') player.hp += 3;
          battleMessage = `TRAINED ${s.toUpperCase()}!`;
          setTimeout(() => { 
            battleMessage = ""; 
            switchScene('castle'); 
            if (encounterMap && encounterMap.currentFloor >= 12) {
              switchScene('end_demo');
            } else {
              openEncounterMap(); 
            }
          }, 1500);
        }
      })).concat([{ label: 'BACK', desc: 'RETURN TO CAMPFIRE', x: 0, y: 0, w: 400, h: 60, action: () => { currentMenu = 'rest'; } }])
    };

    function openEncounterMap() {
      if (!encounterMap) generateEncounterMap();
      isPaused = true;
      currentMenu = 'encounter_map';
      buttons.encounter_map = [];
      
      const nodeSize = 60;
      const marginX = worldW / 2 - 605;
      const marginY = worldH / 2 - 270;
      const spacingX = 110;
      const spacingY = 180;
      
      encounterMap.nodes.forEach(n => {
        buttons.encounter_map.push({
          label: '', x: marginX + n.col * spacingX - nodeSize/2, y: marginY + n.row * spacingY - nodeSize/2, w: nodeSize, h: nodeSize,
          isMapNode: true, node: n,
          action: () => {
            if (n.col === encounterMap.currentFloor && n.active) {
              encounterMap.currentFloor++;
              encounterMap.nodes.forEach(no => no.active = false);
              
              encounterMap.links.filter(l => l.from === n.id).forEach(l => {
                const targetNode = encounterMap.nodes.find(no => no.id === l.to);
                if (targetNode) targetNode.active = true;
              });
              
              battleMessage = `SELECTED: ${n.type.replace('.png', '').toUpperCase()}`;
              setTimeout(() => battleMessage = "", 2000);
              
              // Trigger a battle if it's a fight or boss
              if (n.type.includes('fight')) {
                let enemyList = ENEMIES.filter(e => e.type !== 'mini-boss' && e.type !== 'boss');
                if (n.type === 'fight_mini_boss.png') {
                  enemyList = ENEMIES.filter(e => e.type === 'mini-boss');
                } else if (n.type === 'fight_boss.png') {
                  enemyList = ENEMIES.filter(e => e.id === 'executioner');
                }
                const config = enemyList.length > 0 ? enemyList[Math.floor(Math.random() * enemyList.length)] : ENEMIES[0];
                const tempEnemy = new Enemy(player.x, player.y, config, enemyImages[config.id]);
                isPaused = false;
                startBattle(tempEnemy);
              } else if (n.type === 'campfire.png') {
                 isPaused = false;
                 currentMenu = 'main';
                 switchScene('rest_site');
              } else if (n.type === 'blacksmith.png') {
                 isPaused = false;
                 currentMenu = 'main';
                 switchScene('blacksmith_room');
              } else if (n.type === 'question.png') {
                 const rand = Math.random();
                 if (rand < 0.4) {
                   isPaused = false;
                   currentMenu = 'main';
                   switchScene('rest_site');
                 } else if (rand < 0.8) {
                   isPaused = false;
                   currentMenu = 'main';
                   switchScene('blacksmith_room');
                 } else {
                   openRewardsMenu(true);
                 }
              }
            }
          }
        });
      });
      
      if (activeScene !== 'castle') {
        buttons.encounter_map.push({ label: 'CLOSE MAP', x: worldW / 2 - 100, y: worldH - 80, w: 200, h: 60, action: () => { isPaused = false; currentMenu = 'main'; } });
      }
    }

    function openRewardsMenu(forceRelic = false) {
      isPaused = true;
      currentMenu = 'rewards';
      buttons.rewards = [];
      const startX = worldW / 2 + 100;
      const startY = worldH / 2 - 100;
      
      if (forceRelic === true || (activeEnemy && (activeEnemy.type === 'mini-boss' || activeEnemy.type === 'boss'))) {
        // Relic Rewards
        activeRelicReward = RELICS[Math.floor(Math.random() * RELICS.length)];
        const relicStartX = worldW / 2 + 25;

        activeRelicReward.options.forEach((opt, i) => {
          buttons.rewards.push({
            label: opt.reveal_prompt,
            desc: opt.description.toUpperCase(),
            iconId: opt.id,
            x: relicStartX, y: startY + i * 110, w: 800, h: 90,
            action: () => {
              player.addRelic({ relic: activeRelicReward, option: opt });
              activeRelicReward = null;
              endBattle();
            }
          });
        });
      } else {
        // Stat Rewards
        const stats = ['hp', 'strength', 'intelligence', 'dex', 'speed', 'luck'];
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
              endBattle();
            }
          });
        });
      }
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
        label: 'Leave',
        desc: 'RETURN TO MAP',
        x: startX, y: startY + 85, w: 400, h: 60,
        action: () => { 
          switchScene('castle'); 
          if (encounterMap && encounterMap.currentFloor >= 12) {
            switchScene('end_demo');
          } else {
            openEncounterMap(); 
          }
        }
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
            setTimeout(() => {
              battleMessage = ""; 
              switchScene('castle'); 
              if (encounterMap && encounterMap.currentFloor >= 12) {
                switchScene('end_demo');
              } else {
                openEncounterMap(); 
              }
            }, 1500);
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
      ['pause', 'dev', 'travel', 'stat_select', 'battle', 'enemy_type_select'].forEach(m => {
        const menu = buttons[m]; const sX = worldW / 2 - (menu.length * 220 - 20) / 2;
        menu.forEach((b, i) => { b.x = sX + i * 220; b.y = pY; });
      });

      // Character Select - Vertical Layout to prevent description overlap
      const csX = worldW / 2 - 125;
      const csY = worldH / 2 - 50;
      buttons.character_select.forEach((b, i) => { b.x = csX; b.y = csY + i * 85; });
      
      // Rest Menu - Vertical Layout on the right side
      const rX = worldW / 2 + 100;
      const rY = worldH / 2 - 100;
      buttons.rest.forEach((b, i) => { b.x = rX; b.y = rY + i * 85; b.w = 400; b.h = 60; });
      buttons.rest_upgrade?.forEach((b, i) => { b.x = rX; b.y = rY - 150 + i * 75; b.w = 400; b.h = 60; });
    }
    layoutButtons();

    canvas.addEventListener('mousedown', e => {
      const rect = canvas.getBoundingClientRect();
      const sX = canvas.width / rect.width; const sY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * sX; const my = (e.clientY - rect.top) * sY;
      
      if (!isPaused && (!inBattle || battleTurn !== 'player')) {
        if (!inBattle && !isPaused && !activeScene.includes('title')) {
           const closest = getClosestInteractable();
           if (closest) {
             // For clicking, let's ensure the user actually clicked somewhat near the object's visual bounds.
             // Since we already calculated proximity, and we only have 1 active interactable at a time,
             // any click could arguably just trigger it. Let's trigger it.
             handleInteraction(closest);
           }
        }
        return;
      }
      
      if (buttons[currentMenu]) buttons[currentMenu].forEach(b => { if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) b.action(); });
    });

    window.addEventListener('keydown', e => { if (e.key === 'Escape') { isPaused = !isPaused; currentMenu = isPaused ? 'pause' : 'main'; } });

    function startBattle(z) {
      if (isStartingBattle || inBattle) return;
      preBattlePos = { x: player.x, y: player.y }; activeEnemy = z;
      inBattle = true; battleTurn = 'player'; currentMenu = 'main'; battleMessage = "";
      player.x = worldW / 2 - 400; player.y = 1300; player.facing = 1; player.state = 'idle'; player.frame = 0;
      player.actionsRemaining = player.maxActions;
      activeEnemy.x = worldW / 2 + 400; activeEnemy.y = 1300; activeEnemy.actionsRemaining = activeEnemy.maxActions;
      player.specialCooldown = 0; player.secondaryCooldown = 0;
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
      }    function endBattle() { 
      inBattle = false; 
      isPaused = false; 
      player.x = preBattlePos.x; 
      player.y = preBattlePos.y; 
      battleMessage = ""; 
      
      if (activeScene === 'castle') {
        if (encounterMap && encounterMap.currentFloor >= 12) {
          switchScene('end_demo');
        } else {
          openEncounterMap();
        }
      } else {
        currentMenu = 'main';
      }
    }
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
          activeEnemy.state = 'death';
          activeEnemy.frame = 0;
          activeEnemy.frameTime = 0;
          battleMessage = "VICTORY!";
          setTimeout(openRewardsMenu, 1500);
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
      activeEnemy.playAttack();
      
      let waitTime = 1500;
      if (activeEnemy.config.visual_config && activeEnemy.config.visual_config.states['attack']) {
        const stateCfg = activeEnemy.config.visual_config.states['attack'];
        waitTime = stateCfg.frames * (activeEnemy.config.visual_config.anim_speed || ANIM_SPEED) * 1000 + 500;
      }

      const isCrit = Math.random() < (activeEnemy.luck / 100);
      let dmg = (Math.floor(activeEnemy.strength * 1.0) + Math.floor(Math.random() * 3)) * (isCrit ? 2 : 1);
      player.hp -= dmg; 
      battleMessage = isCrit ? `CRITICAL HIT! ${activeEnemy.name.toUpperCase()} ATTACKS FOR ${dmg} DAMAGE!` : `${activeEnemy.name.toUpperCase()} ATTACKS FOR ${dmg} DAMAGE!`; 
      
      activeEnemy.actionsRemaining--;

      setTimeout(() => {
        if (player.hp <= 0) {
          battleMessage = "DEFEAT...";
          setTimeout(() => {
            location.reload();
          }, 3000);
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
      }, waitTime);
    }

    function getClosestInteractable() {
      if (inBattle || isPaused || activeScene.includes('title')) return null;
      const scene = SCENE_CONFIG[activeScene];
      if (!scene) return null;

      let closest = null;
      let minDist = 250; // Interaction radius

      if (scene.interactables) {
        scene.interactables.forEach(obj => {
          // Find the closest point on the rectangle to the player
          const cx = Math.max(obj.x, Math.min(player.x, obj.x + obj.w));
          const cy = Math.max(obj.y, Math.min(player.y, obj.y + obj.h));
          const d = Math.hypot(player.x - cx, player.y - cy);
          if (d < minDist) { minDist = d; closest = { type: 'obj', ref: obj, cx, cy, d }; }
        });
      }

      worldNpcs.forEach(npc => {
        const d = Math.hypot(player.x - npc.x, player.y - npc.y);
        if (d < minDist) { minDist = d; closest = { type: 'npc', ref: npc, cx: npc.x, cy: npc.y, d }; }
      });

      if (scene.portals) {
        scene.portals.forEach(p => {
          const d = Math.hypot(player.x - p.x, player.y - p.y);
          if (d < minDist) { minDist = d; closest = { type: 'portal', ref: p, cx: p.x, cy: p.y, d }; }
        });
      }

      return closest;
    }

    function handleInteraction(closest) {
      if (!closest) return;
      if (closest.type === 'obj') {
        if (closest.ref.id === 'mirror') {
          isPaused = true;
          currentMenu = 'character_select';
        } else if (closest.ref.id === 'door') {
          activeScene = 'act_1_title';
          setTimeout(() => {
            switchScene('castle');
            openEncounterMap();
          }, 3000);
        } else if (closest.ref.id === 'rest_point') {
          isPaused = true;
          currentMenu = 'rest';
        }
      } else if (closest.type === 'npc') {
        if (closest.ref.config.id === 'blacksmith') {
          openBlacksmithMenu(closest.ref);
        }
      } else if (closest.type === 'portal') {
        checkPortal(closest.ref, true);
      }
    }

    function update(dt) {
      if (isPaused) return;
      if (activeScene.includes('title')) return; // Don't update player during title screens
      
      player.update(dt, keys, worldW, worldH, inBattle);
      
      if (!inBattle) {
        // Interaction Logic
        if (keys['e'] || keys[' ']) {
          const closest = getClosestInteractable();
          handleInteraction(closest);

          // Debounce interaction keys
          keys['e'] = false; keys[' '] = false;
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
      } else { activeEnemy.draw(ctx, inBattle); }
      
      if (!activeScene.includes('title')) {
        if (currentMenu !== 'encounter_map') {
          player.draw(ctx, inBattle);
        }

        // Draw Interaction Boxes
        if (!inBattle && !isPaused) {
          const closest = getClosestInteractable();
          if (closest) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(19, 236, 106, 0.8)';
            ctx.fillStyle = 'rgba(19, 236, 106, 1.0)';
            ctx.font = '600 18px "Space Grotesk", sans-serif';
            ctx.textAlign = 'left';
            
            let bx = 0, by = 0, bw = 0, bh = 0;

            if (closest.type === 'obj') {
              bx = closest.ref.x; by = closest.ref.y; bw = closest.ref.w; bh = closest.ref.h;
            } else if (closest.type === 'portal') {
              bx = closest.ref.x - closest.ref.r; by = closest.ref.y - closest.ref.r; 
              bw = closest.ref.r * 2; bh = closest.ref.r * 2;
            } else if (closest.type === 'npc') {
              bx = closest.ref.x - 75; by = closest.ref.y - 150; 
              bw = 150; bh = 170;
            }

            // Draw a subtle glowing box
            ctx.shadowColor = '#13ec6a';
            ctx.shadowBlur = 10;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.fillText('press e or click', bx + 4, by - 8);
            ctx.shadowBlur = 0;
          }
        }
      }

      ctx.restore();
      if (inBattle) drawBattleUI(); if (isPaused) drawPauseMenu();
    }
    function drawPauseMenu() {
      ctx.fillStyle = 'rgba(6, 10, 6, 0.9)'; ctx.fillRect(0, 0, worldW, worldH);
      
      if (currentMenu === 'encounter_map') {
        ctx.fillStyle = '#13ec6a'; ctx.font = '800 60px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 15;
        ctx.fillText('ENCOUNTER MAP', worldW / 2, 100); ctx.shadowBlur = 0;
        
        // Draw Links
        if (encounterMap) {
          const nodeSize = 60;
          const marginX = worldW / 2 - 605;
          const marginY = worldH / 2 - 270;
          const spacingX = 110;
          const spacingY = 180;
          
          encounterMap.links.forEach(l => {
            const fromN = encounterMap.nodes.find(n => n.id === l.from);
            const toN = encounterMap.nodes.find(n => n.id === l.to);
            if (fromN && toN) {
              const img = mapImages[l.arrow];
              if (img) {
                // Determine position to draw the arrow (shifted closer to the source node to prevent overlap)
                const fromX = marginX + fromN.col * spacingX;
                const fromY = marginY + fromN.row * spacingY;
                const toX = marginX + toN.col * spacingX;
                const toY = marginY + toN.row * spacingY;
                const factor = 0.35;
                const drawX = fromX + (toX - fromX) * factor;
                const drawY = fromY + (toY - fromY) * factor;
                ctx.drawImage(img, drawX - img.width, drawY - img.height, img.width * 2, img.height * 2);
              }
            }
          });
        }
      } else {
        const isCustomMenu = ['inventory', 'rewards', 'blacksmith', 'rest', 'rest_upgrade', 'weapon_select', 'upgrade_choice', 'enemy_type_select'].includes(currentMenu);

        if (isCustomMenu) {
          let title = 'PAUSED';
          if (currentMenu === 'inventory') title = 'INVENTORY';
          if (currentMenu === 'rewards') title = 'VICTORY';
          if (currentMenu === 'blacksmith') title = 'BLACKSMITH';
          if (currentMenu === 'rest') title = 'REST SITE';
          if (currentMenu === 'rest_upgrade') title = 'TRAIN STATS';
          if (currentMenu === 'weapon_select') title = 'SELECT ITEM';
          if (currentMenu === 'upgrade_choice') title = 'CHOOSE UPGRADE';
          if (currentMenu === 'enemy_type_select') title = 'SELECT ENEMY TYPE';
          ctx.fillStyle = '#13ec6a'; ctx.font = '800 80px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 15;
          ctx.fillText(title, worldW / 2, 100); ctx.shadowBlur = 0;
          
          if (currentMenu !== 'enemy_type_select') {
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
              if (activeRelicReward) {
                const centerX = worldW / 2 + 325;
                const baseIcon = relicImages[activeRelicReward.id];
                if (baseIcon) {
                   ctx.drawImage(baseIcon, centerX - 280, worldH / 2 - 240, 64, 64);
                }
                ctx.fillStyle = 'rgba(19, 236, 106, 0.8)'; ctx.font = '700 20px "Space Grotesk", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('WHAT DO YOU SENSE FROM THIS RELIC?', centerX, worldH / 2 - 180);
                ctx.font = '800 40px "Space Grotesk", sans-serif';
                ctx.fillText(activeRelicReward.name.toUpperCase(), centerX, worldH / 2 - 220);
              } else {
                ctx.fillStyle = 'rgba(19, 236, 106, 0.8)'; ctx.font = '700 20px "Space Grotesk", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('PICK ONE REWARD', worldW / 2 + 300, worldH / 2 - 140);
              }
            }
          }
        } else {
          ctx.fillStyle = '#13ec6a'; ctx.font = '800 100px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#13ec6a'; ctx.shadowBlur = 15;
          ctx.fillText('PAUSED', worldW / 2, worldH / 2 - 150); ctx.shadowBlur = 0;
        }
      }
      
      if (buttons[currentMenu]) buttons[currentMenu].forEach(b => drawButton(ctx, b));
    }
    function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function drawButton(ctx, b) {
      if (b.isMapNode) {
        const img = mapImages[b.node.type];
        const isReachable = b.node.col === encounterMap.currentFloor && b.node.active;
        const isPassed = b.node.col < encounterMap.currentFloor;
        ctx.globalAlpha = isReachable ? 1.0 : (isPassed ? 0.3 : 0.5);
        if (img) {
          ctx.drawImage(img, b.x, b.y, b.w, b.h);
        } else {
          ctx.fillStyle = 'rgba(19, 236, 106, 0.5)';
          ctx.fillRect(b.x, b.y, b.w, b.h);
        }
        ctx.globalAlpha = 1.0;
        
        if (isReachable) {
          ctx.strokeStyle = '#13ec6a'; ctx.lineWidth = 3;
          ctx.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
        }
        return;
      }
      ctx.fillStyle = 'rgba(19, 236, 106, 0.1)'; ctx.strokeStyle = '#13ec6a'; ctx.lineWidth = 2;
      roundRect(ctx, b.x, b.y, b.w, b.h, 4); ctx.fill(); ctx.stroke();
      const lT = (typeof b.label === 'function') ? b.label() : b.label;
      
      if (b.iconId) {
        const iconImg = relicImages[b.iconId];
        if (iconImg) ctx.drawImage(iconImg, b.x + 15, b.y + 15, 60, 60);
        ctx.fillStyle = '#13ec6a'; ctx.font = '600 22px "Space Grotesk", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(lT.toUpperCase(), b.x + 90, b.y + 40);
      } else {
        ctx.fillStyle = '#13ec6a'; ctx.font = '600 24px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lT.toUpperCase(), b.x + b.w/2, b.y + 38);
      }
      
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
        if (b.iconId) {
          ctx.textAlign = 'left'; ctx.font = '300 18px "Space Grotesk", sans-serif'; ctx.fillStyle = 'rgba(19, 236, 106, 0.8)';
          ctx.fillText(dT.toUpperCase(), b.x + 90, b.y + 70);
        } else {
          ctx.textAlign = 'left'; ctx.font = '300 18px "Space Grotesk", sans-serif'; ctx.fillStyle = 'rgba(19, 236, 106, 0.8)'; 
          ctx.fillText(dT.toUpperCase(), b.x + b.w + 30, b.y + 36);
        }
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
