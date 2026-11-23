// SOLANO HEAT — every tunable number in one place. The world, the player,
// the cars, the wanted ladder and the palette all read from here, so a balance
// change is one edit and never a hunt through the simulation.
export const TICK = 1 / 60;
export const SAVE_KEY = 'solano-heat-save-v1';
export const BEST_KEY = 'solano-heat-best-v1';

// The city: a square of CITY_SIZE pixels, GRID roads per axis.
export const CITY = {
  size: 3200,
  grid: 8,
  pitch: 400,
  roadHalf: 48,
  firstRoad: 160,
};

// Mara on foot.
export const FOOT = {
  radius: 13,
  walk: 205,
  run: 325,
  health: 100,
  armor: 50,
  shotDamage: 34,
  fireInterval: 0.22,
  grabRange: 64,
};

// Any car, player or traffic: one handling model.
export const VEHICLE = {
  length: 54,
  width: 28,
  accel: 520,
  brake: 900,
  reverseAccel: 320,
  topSpeed: 560,
  topReverse: 190,
  turnRate: 2.5,
  health: 130,
};

// Heat thresholds per star, and how the police answer.
export const HEAT = {
  thresholds: [0, 40, 110, 220, 380, 600],
  cap: 650,
  decayPerSecond: 6,
  maxCops: [0, 2, 3, 4, 5, 6],
  copSpeed: 590,
  bustRange: 46,
  bustTime: 1.4,
};

// Crowd sizes.
export const CROWD = {
  trafficCars: 14,
  parkedCars: 8,
  pedestrians: 26,
  pickups: 10,
};

// A sun-soaked coastal city at golden hour. All art is drawn in code.
export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#74a158',
  park: '#6d9e52',
  sand: '#e8d29a',
  water: '#2e7f9e',
  waterDeep: '#256b87',
  road: '#3d3a44',
  roadEdge: '#2c2931',
  sidewalk: '#b9b3a4',
  lane: '#e8d44d',
  roofs: ['#c96f4a', '#d9a05b', '#7d9bb5', '#b5b0a6', '#a86a8a', '#5f8f7b', '#c9b458', '#8a7fb5'],
  palm: '#3f7d44',
  trunk: '#7a5a3a',
  panel: '#101014',
};
