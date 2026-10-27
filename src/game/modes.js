export const MODES = {
  defuse: { id: 'defuse', teams: true, respawn: false, rounds: true, bomb: true, limits: [5, 9, 13], roundTime: 115, freeze: 8, voice: 'start' },
  dm: { id: 'dm', teams: false, respawn: true, limits: [10, 20, 30], respawnTime: 2.2, voice: 'start' },
  tdm: { id: 'tdm', teams: true, respawn: true, limits: [25, 50, 75], respawnTime: 2.5, voice: 'team_deathmatch' },
  arms: { id: 'arms', teams: false, respawn: true, arms: true, fixedLimit: true, limits: [8, 8, 8], respawnTime: 1.8, voice: 'start' },
  elim: { id: 'elim', teams: true, respawn: false, rounds: true, limits: [3, 5, 7], roundTime: 100, freeze: 4, voice: 'elimination' },
};
