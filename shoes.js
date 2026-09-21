// shoes.js — the shoe pool players collect, and helpers for handing them out.

const SHOE_POOL = [
  // Common — the bulk of what you'll find
  { id: 'court-classic',   name: 'Court Classic',    rarity: 'common', hue: 205 },
  { id: 'street-runner',   name: 'Street Runner',    rarity: 'common', hue: 18  },
  { id: 'daily-trainer',   name: 'Daily Trainer',    rarity: 'common', hue: 95  },
  { id: 'canvas-low',      name: 'Canvas Low',       rarity: 'common', hue: 160 },
  { id: 'basic-slide',     name: 'Basic Slide',      rarity: 'common', hue: 260 },
  { id: 'retro-jogger',    name: 'Retro Jogger',     rarity: 'common', hue: 35  },
  { id: 'campus-kick',     name: 'Campus Kick',      rarity: 'common', hue: 320 },
  { id: 'weekend-walker',  name: 'Weekend Walker',   rarity: 'common', hue: 145 },
  // Rare — turns up less often
  { id: 'neon-flash',      name: 'Neon Flash',       rarity: 'rare', hue: 305 },
  { id: 'cloud-step',      name: 'Cloud Step',       rarity: 'rare', hue: 195 },
  { id: 'vapor-line',      name: 'Vapor Line',       rarity: 'rare', hue: 150 },
  { id: 'ember-runner',    name: 'Ember Runner',     rarity: 'rare', hue: 8   },
  // Epic — a real find
  { id: 'golden-hour',     name: 'Golden Hour',      rarity: 'epic', hue: 42  },
  { id: 'midnight-ghost',  name: 'Midnight Ghost',   rarity: 'epic', hue: 248 },
  { id: 'prism-wave',      name: 'Prism Wave',       rarity: 'epic', hue: 178 },
  // Legendary — the crown jewel
  { id: 'solar-crown',     name: 'Solar Crown',      rarity: 'legendary', hue: 46 },
];

const RARITY_WEIGHTS = { common: 60, rare: 27, epic: 11, legendary: 2 };
const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

function shoeById(id) {
  return SHOE_POOL.find(s => s.id === id) || null;
}

// Weighted random pick of a shoe type from the pool.
function pickRandomShoeType() {
  const weighted = SHOE_POOL.map(s => ({ shoe: s, w: RARITY_WEIGHTS[s.rarity] }));
  const total = weighted.reduce((sum, x) => sum + x.w, 0);
  let roll = Math.random() * total;
  for (const x of weighted) {
    if (roll < x.w) return x.shoe;
    roll -= x.w;
  }
  return weighted[0].shoe;
}

// Builds a starting collection: an object of instanceId -> shoeTypeId.
function makeStartingCollection(count = 3) {
  const collection = {};
  for (let i = 0; i < count; i++) {
    const instanceId = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    collection[instanceId] = pickRandomShoeType();
  }
  return collection;
}

// Picks a random instance key from a collection object, or null if empty.
function pickRandomInstanceKey(collection) {
  const keys = Object.keys(collection || {});
  if (keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)];
}
