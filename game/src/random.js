// Seeded RNG (splitmix32) so the city and every staged screenshot are
// reproducible: the same seed always builds the same Solano Bay.
export function createRandom(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x9e3779b9) | 0;
      let z = a;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      z ^= z >>> 15;
      return (z >>> 0) / 4294967296;
    },
    range(min, max) {
      return min + this.next() * (max - min);
    },
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    },
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    },
    chance(p) {
      return this.next() < p;
    },
  };
}
