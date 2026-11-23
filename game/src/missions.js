// The story: five jobs for Mara Reyes, getaway driver of Solano Bay. Each mission
// is a list of steps the world interprets; the text is what the HUD shows.
export const MISSIONS = [
  {
    id: 'first-pickup',
    title: 'Job 1 — First Pickup',
    reward: 500,
    briefing: [
      'Dante Cole, fixer: "Mara. A package is waiting at the west docks."',
      '"Grab it, bring it back to my garage. And keep it clean — first job nerves, I get it."',
    ],
    steps: [
      { kind: 'goto', at: 'docks', radius: 70, text: 'Pick up the package at the west docks' },
      { kind: 'goto', at: 'garage', radius: 80, text: 'Deliver the package to Dante\'s garage' },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Job 2 — Hot Wheels',
    reward: 1200,
    briefing: [
      'Dante: "A client wants a Comet GT — the yellow one parked uptown. It is not his."',
      '"Take it and bring it to the garage. Seventy-five seconds, before the owner notices."',
    ],
    steps: [
      { kind: 'steal', at: 'sportsCar', radius: 70, timeLimit: 75, text: 'Steal the yellow Comet GT uptown' },
      { kind: 'goto', at: 'garage', radius: 80, text: 'Deliver the Comet GT to the garage', needCar: 'sports' },
    ],
  },
  {
    id: 'getaway',
    title: 'Job 3 — Getaway',
    reward: 1500,
    briefing: [
      'Dante: "The crew hit a courier van. Cops are all over the bay now."',
      '"You are the wheelman. Lose them. All of them. Then call me."',
    ],
    steps: [
      { kind: 'evade', text: 'Lose the police — drop your wanted level to zero' },
    ],
  },
  {
    id: 'street-sweep',
    title: 'Job 4 — Street Sweep',
    reward: 2000,
    briefing: [
      'Dante: "The Vipers moved onto the pier. Four of them, armed, claiming our turf."',
      '"Go on foot. Make it loud. The pier is yours when the last one drops."',
    ],
    steps: [
      { kind: 'eliminate', at: 'pier', count: 4, radius: 260, text: 'Clear the Vipers off the south pier (0/4)' },
    ],
  },
  {
    id: 'big-score',
    title: 'Job 5 — The Big Score',
    reward: 5000,
    briefing: [
      'Dante: "Three stores, one night, no alarms tripped twice. Then vanish."',
      '"Hit all three, then run to the safehouse. The whole bay will be looking for you."',
    ],
    steps: [
      { kind: 'rob', at: 'stores', holdSeconds: 3, text: 'Rob the three marked stores (0/3)' },
      { kind: 'goto', at: 'safehouse', radius: 80, text: 'Escape to the safehouse' },
    ],
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? null;
}
