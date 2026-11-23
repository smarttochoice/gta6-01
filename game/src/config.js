// SOLANO HEAT — tuning constants. One place for every number the world runs on.
export const WORLD = 3200; // city is WORLD x WORLD pixels
export const GRID = 8; // avenues and streets per axis
export const PITCH = 400; // distance between road centrelines
export const ROAD_HALF = 48; // half the width of a road
export const FIRST_ROAD = 160; // centreline of the first avenue / street

export const STEP = 1 / 60;
export const SAVE_KEY = 'solano-heat-save-v1';
export const BEST_KEY = 'solano-heat-best-v1';

// Player on foot.
export const PLAYER = {
  radius: 13,
  walk: 205,
  run: 325,
  health: 100,
  armor: 50,
  punchDamage: 12,
  shotDamage: 34,
  fireInterval: 0.22,
  interactRange: 64,
};

// Cars.
export const CAR = {
  length: 54,
  width: 28,
  accel: 520,
  brake: 900,
  reverseAccel: 320,
  maxSpeed: 560,
  maxReverse: 190,
  turnRate: 2.5,
  grip: 6.5,
  health: 130,
};

// Wanted / police.
export const WANTED = {
  stars: [0, 40, 110, 220, 380, 600], // heat needed for each star level
  decayPerSecond: 6, // heat lost while no police can see the player
  maxCops: [0, 2, 3, 4, 5, 6],
  copSpeed: 590,
  bustRange: 46,
  bustTime: 1.4,
};

// Traffic and pedestrians.
export const TRAFFIC_CARS = 14;
export const PEDESTRIANS = 26;
export const PICKUPS = 10;

// Palette: a sun-soaked coastal city at golden hour. All original art, drawn in code.
export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#74a158',
  sand: '#e8d29a',
  water: '#2e7f9e',
  waterDeep: '#256b87',
  road: '#3d3a44',
  roadEdge: '#2c2931',
  sidewalk: '#b9b3a4',
  lane: '#e8d44d',
  buildingRoofs: ['#c96f4a', '#d9a05b', '#7d9bb5', '#b5b0a6', '#a86a8a', '#5f8f7b', '#c9b458', '#8a7fb5'],
  roofEdge: '#00000033',
  palm: '#3f7d44',
  trunk: '#7a5a3a',
  hud: '#101014',
};
