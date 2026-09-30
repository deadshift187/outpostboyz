// Per-game facts for the web shell: entry module, board key, chat words, touch layout and the controls sheet.
// Touch buttons send the game's OWN keyboard codes (every game reads KeyboardEvent.code on window).
export const GAMES = {
  climb: {
    reg: 'climb-or-die', entry: 'index', title: 'STACKED', board: 'climb-or-die-board', comments: ['help', 'sab'], nonet: true,
    pitch: 'Climb THE STACK as PATCH while chat drops planks to help you or bolts to knock you off.',
    dpad: 8, buttons: [['JUMP', 'Space'], ['DASH', 'ShiftLeft'], ['GRAPPLE', 'KeyE']],
    keys: [['Run', 'A / D or ← →'], ['Climb ladders', 'W / ↑'], ['Brace', 'S / ↓'], ['Jump (hold = higher)', 'Space'], ['Dash', 'Shift'], ['Grapple', 'E'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad move · A jump · X dash · RB grapple · Start pause',
  },
  goalie: {
    reg: 'goalie', entry: 'goalie', title: 'GOALIE', board: 'goalie-board', comments: ['help', 'sab'],
    pitch: "PATCH in goal: every SAB gift is a shot with the sender's name on the ball. Dive, punch, save.",
    dpad: 8, buttons: [['JUMP', 'Space'], ['DIVE', 'KeyK'], ['PUNCH', 'KeyJ'], ['SUPER', 'KeyQ'], ['WALL', 'KeyF']],
    keys: [['Move', 'A / D or ← →'], ['Reach up / crouch (smother)', 'W / S'], ['Jump', 'Space'], ['Dive (+ direction)', 'Shift or K'], ['Punch', 'E or J'], ['Super-dive (cooldown)', 'Q or U'], ['Wall (cooldown)', 'F or I'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick move · A jump · X / RT dive · B / RB punch · LB super-dive · Y wall · Start pause',
  },
  boss: {
    reg: 'boss', entry: 'boss', title: 'I AM THE BOSS', board: 'boss-board', comments: ['help', 'sab'],
    pitch: "You ARE the boss: viewers' gifts spawn named heroes who raid your AI war-machine for 5 minutes.",
    dpad: 8, buttons: [['STOMP', 'Space'], ['SWEEP', 'KeyJ'], ['LASER', 'KeyL'], ['DASH', 'ShiftLeft'], ['SHIELD', 'KeyS']],
    keys: [['Move', 'A / D or ← →'], ['Dash', 'Shift'], ['Sweep', 'J or Z'], ['Stomp', 'K, X or Space'], ['Laser', 'L or C'], ['Shield (hold)', 'S / ↓'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick move · A stomp · X sweep · Y / RT laser · B / RB dash · LB / LT shield · Start pause',
  },
  tightrope: {
    reg: 'tightrope', entry: 'tightrope', title: 'TIGHTROPE', board: 'tightrope-board', comments: ['help', 'sab'],
    pitch: 'Balance PATCH across skyscraper tightropes while chat sends gusts, pigeons and wrecking cranes.',
    dpad: 8, buttons: [['CROUCH', 'Space']],
    keys: [['Lean', 'A / D or ← →'], ['Walk forward', 'W / ↑'], ['Back up', 'S / ↓'], ['Crouch / grip (hold)', 'Space or Shift'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick lean · RT / stick up walk · LT back · A / LB crouch · Start pause',
  },
  derby: {
    reg: 'derby', entry: 'derby', title: 'DERBY', board: 'derby-board', comments: ['join', 'help', 'sab', 'paint'],
    pitch: 'Drive THE RIG in a scrapyard demolition derby; viewers join as named AI cars that hunt you.',
    dpad: 8, buttons: [['DRIFT', 'Space'], ['BOOST', 'ShiftLeft'], ['RAM', 'KeyE']],
    keys: [['Throttle', 'W / ↑'], ['Brake / reverse', 'S / ↓'], ['Steer', 'A / D or ← →'], ['Handbrake drift', 'Space'], ['Boost', 'Shift'], ['Ram', 'E or J'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick steer · RT / A throttle · LT brake · B / RB drift · X boost · Y / LB ram · Start pause',
  },
  munch: {
    reg: 'munch', entry: 'munch', title: 'SCRAP MUNCH', board: 'munch-board', comments: ['help', 'sab'],
    pitch: 'Maze chase: vacuum every bolt while viewers send named hunter bots after PATCH.',
    dpad: 4, buttons: [],
    keys: [['Move (turns buffer)', 'Arrows or WASD'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad move · Start pause',
  },
};
export const STREAMER_KEYS = [['Settings (knobs)', 'F10'], ['PANIC (clear the screen)', 'F9'], ['Key help', 'F1'], ['PANIC on a pad', 'Select + Start']];
