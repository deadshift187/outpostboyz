// Per-game facts for the web shell: entry module, board key, chat words, touch layout and the controls sheet.
// Touch buttons send the game's OWN keyboard codes (every game reads KeyboardEvent.code on window): keydown while
// the finger is down, keyup on release, so every button can be held.
//   buttons: [label, code] or [label, code, 'hold'] ('hold' only marks the button HOLD on screen: the game reads it held)
//   dpad: 4 | 8 ways; dpadKeys: { up|down|left|right: code } overrides a direction's arrow key (pileup: up = hard drop)
//   tapCanvas: the game reads taps / clicks on the stage itself (whack: smash a pipe; holdthedoor: aim + fire)
//   group: 'approved' (on the site) | 'review' (the launcher's two headings)
export const GAMES = {
  stacked: {
    reg: 'climb-or-die', entry: 'index', title: 'STACKED', board: 'climb-or-die-board', comments: ['help', 'sab'], nonet: true, group: 'approved',
    pitch: 'Climb THE STACK as PATCH while chat drops planks to help you or bolts to knock you off.',
    dpad: 8, buttons: [['JUMP', 'Space', 'hold'], ['DASH', 'ShiftLeft'], ['GRAPPLE', 'KeyE']],
    keys: [['Run', 'A / D or ← →'], ['Climb ladders', 'W / ↑'], ['Brace', 'S / ↓'], ['Jump (hold = higher)', 'Space'], ['Dash', 'Shift'], ['Grapple', 'E'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad move · A jump · X dash · RB grapple · Start pause',
  },
  tightrope: {
    reg: 'tightrope', entry: 'tightrope', title: 'TIGHTROPE', board: 'tightrope-board', comments: ['help', 'sab'], group: 'approved',
    pitch: 'Balance PATCH across skyscraper tightropes while chat sends gusts, pigeons and wrecking cranes.',
    dpad: 8, buttons: [['CROUCH', 'Space', 'hold']],
    keys: [['Lean', 'A / D or ← →'], ['Walk forward', 'W / ↑'], ['Back up', 'S / ↓'], ['Crouch / grip (hold)', 'Space or Shift'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick lean · RT / stick up walk · LT back · A / LB crouch · Start pause',
  },
  goalie: {
    reg: 'goalie', entry: 'goalie', title: 'GOALIE', board: 'goalie-board', comments: ['help', 'sab'], group: 'review',
    pitch: "PATCH in goal: every SAB gift is a shot with the sender's name on the ball. Dive, punch, save.",
    dpad: 8, buttons: [['JUMP', 'Space'], ['DIVE', 'KeyK'], ['PUNCH', 'KeyJ'], ['SUPER', 'KeyQ'], ['WALL', 'KeyF']],
    keys: [['Move', 'A / D or ← →'], ['Reach up / crouch (smother)', 'W / S'], ['Jump', 'Space'], ['Dive (+ direction)', 'Shift or K'], ['Punch', 'E or J'], ['Super-dive (cooldown)', 'Q or U'], ['Wall (cooldown)', 'F or I'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick move · A jump · X / RT dive · B / RB punch · LB super-dive · Y wall · Start pause',
  },
  derby: {
    reg: 'derby', entry: 'derby', title: 'DERBY', board: 'derby-board', comments: ['join', 'help', 'sab', 'paint'], group: 'review',
    pitch: 'Drive THE RIG through three hazard arenas; viewers join as named AI cars that hunt you. Grab weapons, chain stunts, beat the boss.',
    dpad: 8, buttons: [['DRIFT', 'Space', 'hold'], ['BOOST', 'ShiftLeft'], ['RAM', 'KeyE'], ['FIRE', 'KeyF', 'hold']],
    keys: [['Throttle', 'W / ↑'], ['Brake / reverse', 'S / ↓'], ['Steer', 'A / D or ← →'], ['Handbrake drift', 'Space'], ['Boost', 'Shift'], ['Ram', 'E or J'], ['Fire weapon (hold: flamer / oil)', 'F or K'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick steer · RT / A throttle · LT brake · B drift · X boost · Y / LB ram · RB fire · Start pause',
  },
  munch: {
    reg: 'munch', entry: 'munch', title: 'SCRAP MUNCH', board: 'munch-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Maze chase: vacuum every bolt, grab weapons and scrap bosses while viewers send named hunter bots after PATCH.',
    dpad: 4, buttons: [['FIRE', 'Space']],
    keys: [['Move (turns buffer)', 'Arrows or WASD'], ['Fire the weapon you hold', 'Space / F'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad move · A / X / RT fire · Start pause',
  },

  // ---------- round 2 (from app/game/<slug>/WEB.json) ----------
  horsederby: {
    reg: 'horsederby', entry: 'horsederby', title: 'HORSE DERBY', board: 'horsederby-board', comments: ['join', 'help', 'sab'], group: 'review',
    pitch: "Ride PATCH's robo-horse on the hoofbeat against viewers' named horses; chat throws carrots or mud and stampedes.",
    dpad: 4, buttons: [['STRIDE', 'Space'], ['JUMP', 'KeyD'], ['WHIP', 'ShiftLeft']],
    keys: [['Stride (tap on the hoofbeat)', 'Space or J'], ['Jump', 'D, → or K'], ['Whip burst', 'Shift or L'], ['Lane up / down', 'W / S or ↑ ↓'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'A stride · B / RB jump · X / RT whip · stick / d-pad up-down lanes · Start pause',
  },
  bullride: {
    reg: 'bullride', entry: 'bullride', title: 'BULL RIDE', board: 'bullride-board', comments: ['help', 'sab'], group: 'review',
    pitch: "Hang on to PATCH's mechanical robo-bull: lean against telegraphed bucks while chat sends bigger bucks or the rodeo clown.",
    dpad: 4, buttons: [['GRIP', 'Space', 'hold'], ['SHOW OFF', 'ShiftLeft', 'hold']],
    keys: [['Lean back / forward', 'A / D or ← →'], ['Grip the strap (hold)', 'Space or S / ↓'], ['Show off (hold, score ×2)', 'W / ↑ or Shift'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick lean · A / LT grip · Y / RB show off · Start pause',
  },
  knockout: {
    reg: 'knockout', entry: 'knockout', title: 'KNOCKOUT', board: 'knockout-board', comments: ['help', 'sab'], group: 'review',
    pitch: "Box as PATCH: read the robo-boxer's tell, dodge, counter. Viewers book named challenger bots onto the fight card.",
    dpad: 4, buttons: [['JAB L', 'KeyJ'], ['JAB R', 'KeyK'], ['STAR', 'Space'], ['BLOCK', 'KeyW', 'hold']],
    keys: [['Dodge left / right', 'A / D or ← →'], ['Duck', 'S / ↓'], ['Block (hold)', 'W / ↑'], ['Left / right jab', 'J / K'], ['Star punch', 'Space'], ['Get up', 'mash J / K'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick dodge / duck · LB / LT block · X / B jab · Y / A / RT star punch · Start pause',
  },
  fishing: {
    reg: 'fishing', entry: 'fishing', title: 'FISHING FRENZY', board: 'fishing-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Cast, strike and fight robo-fish as PATCH; viewers put fish with their name on the line, or send sharks to steal it.',
    dpad: 4, buttons: [['REEL', 'Space', 'hold']],
    keys: [['Cast (hold + release) / strike / reel', 'Space'], ['Rod left / right (against the run)', 'A / D or ← →'], ['Rod up (dives, gulls) · lure up', 'W / ↑'], ['Slack · lure down', 'S / ↓'], ['Shake a tangle loose', 'tap W ×3'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'A / RT cast · strike · reel · stick rod · Y rod up · LT / B slack · Start pause',
  },
  holdthedoor: {
    reg: 'holdthedoor', entry: 'holdthedoor', title: 'HOLD THE DOOR', board: 'holdthedoor-board', comments: ['help', 'sab'], group: 'review', tapCanvas: true,
    pitch: 'Board up the cabin as PATCH: shoot the named Dead through the doorways and repair the barricades until dawn.',
    dpad: 8, buttons: [['FIRE', 'Space', 'hold'], ['REPAIR', 'KeyE', 'hold'], ['RELOAD', 'KeyR']],
    keys: [['Move', 'W A S D or arrows'], ['Aim + fire', 'Mouse (hold click) or tap the game'], ['Fire where you face (aim assist)', 'Space or F'], ['Aim + fire in 8 directions', 'I J K L'], ['Strafe (keep aim)', 'Shift'], ['Repair the door you stand at (hold)', 'E'], ['Reload', 'R'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Left stick move · right stick aim + fire · A / RT fire · X / RB repair · Y / B reload · LB / LT strafe · Start pause',
    touchNote: 'Tap or hold the game itself to aim and fire at that spot.',
  },
  defuse: {
    reg: 'defuse', entry: 'defuse', title: 'DEFUSE', board: 'defuse-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Read the manual, cut the right wire: PATCH defuses AI scrap bombs while chat steals seconds or buys freezes.',
    dpad: 4, buttons: [['ACT', 'Space'], ['PREV', 'KeyQ'], ['NEXT', 'KeyE'], ['BOMB', 'Tab']],
    keys: [['Pick a wire / switch, turn the dial', 'Arrows or W A S D'], ['Cut · flip · LOCK · TX', 'Space, Enter or F'], ['Next / previous module', 'E / Q'], ['Jump to a module', '1 - 6'], ['Switch bombs', 'Tab'], ['Pause (the clock stops)', 'P'], ['Music', 'M']],
    pad: 'D-pad / stick pick · A act · LB / RB module · Y other bomb · Start pause',
  },
  heist: {
    reg: 'heist', entry: 'heist', title: 'HEIST', board: 'heist-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Sneak PATCH past guards, cameras and laser grids to crack the vault while chat sends smoke bombs or named guards.',
    dpad: 8, buttons: [['CRACK', 'Space'], ['SNEAK', 'ShiftLeft', 'hold']],
    keys: [['Sneak around', 'WASD or arrows'], ['Sneak (hold: quiet, small cones)', 'Shift or C'], ['Crack the vault (tap on green)', 'Space or E'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad move · LT / B sneak · A crack · Start pause',
  },
  skydive: {
    reg: 'skydive', entry: 'skydive', title: 'SKY DIVE', board: 'skydive-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Free-fall PATCH down a canyon of AI megatowers, pull the chute and stick the bullseye while chat sends birds, billboards and storms.',
    dpad: 8, buttons: [['PULL', 'Space'], ['FLARE', 'KeyW', 'hold'], ['DIVE', 'KeyS', 'hold']],
    keys: [['Steer', 'A / D or ← →'], ['Dive (hold: faster, more points)', 'S / ↓'], ['Flare (hold: slower; the landing flare)', 'W / ↑'], ['Pull the chute (green band)', 'Space'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad steer · RT dive · LT flare · A pull (and flare under canopy) · Start pause',
  },
  lava: {
    reg: 'lava', entry: 'lava', title: 'RISING LAVA', board: 'lava-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Race PATCH up a scrap shaft before the lava gets him, while chat freezes it or sends fireballs and eruptions with their names on them.',
    dpad: 8, buttons: [['JUMP', 'Space', 'hold'], ['DASH', 'ShiftLeft'], ['JET', 'KeyE']],
    keys: [['Run', 'A / D or ← →'], ['Jump (hold = higher, off a wall = wall jump)', 'Space, W or ↑'], ['Dash (any direction, dodges hazards)', 'Shift or J'], ['Jetpack (HELP charges)', 'E or L'], ['Drop through a girder', 'S + Space'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad run · A jump · X / RT dash · Y / RB jetpack · Start pause',
  },
  pileup: {
    reg: 'pileup', entry: 'pileup', title: 'PILE UP LIVE', board: 'pileup-board', comments: ['help', 'sab'], group: 'review',
    pitch: "Pack PATCH's moving truck Tetris-style before it leaves, while chat sends small boxes and straps or cursed pianos with their names on them.",
    dpad: 4, dpadKeys: { up: 'Space' }, buttons: [['ROTATE', 'KeyX'], ['DROP', 'Space'], ['HOLD', 'KeyC']],
    keys: [['Slide (hold to repeat)', 'A / D or ← →'], ['Rotate', 'W, ↑ or X (Z / Q the other way)'], ['Soft drop', 'S / ↓'], ['Hard drop', 'Space'], ['Hold', 'C or Shift'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'D-pad / stick slide · A rotate · B rotate back · Y / d-pad up hard drop · LB / RB hold · Start pause',
    touchNote: 'D-pad up = hard drop.',
  },
  crossy: {
    reg: 'crossy', entry: 'crossy', title: 'CROSSY STREET', board: 'crossy-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Hop PATCH up an endless wasteland street of robot traffic, maglev rails and sludge rivers while chat sends named cars or crossing guards.',
    dpad: 4, buttons: [['LONG JUMP', 'Space']],
    keys: [['Hop (hold = keep hopping)', 'Arrows or WASD'], ['Long jump (2 lanes, airborne)', 'Space or Shift'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad hop · A / X / RT long jump · Start pause',
  },
  whack: {
    reg: 'whack', entry: 'whack', title: 'WHACK-A-BOT', board: 'whack-board', comments: ['help', 'sab'], group: 'review', tapCanvas: true,
    pitch: "Swing PATCH's hammer across 12 scrap pipes to beat the round quota while chat sends named dodgers, decoy bombs and gold bots.",
    dpad: 4, buttons: [['SMASH', 'Space']],
    keys: [['Smash a pipe directly', '1 2 3 / Q W E / A S D / Z X C'], ['Move the hammer', 'Arrows'], ['Smash at the hammer', 'Space or Enter'], ['Tap / click a pipe', 'Smashes it'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad move the hammer · A / X / RT smash · Start pause',
    touchNote: 'Tap a pipe to smash it.',
  },
  drift: {
    reg: 'drift', entry: 'drift', title: 'DRIFT KING', board: 'drift-board', comments: ['help', 'sab'], group: 'review',
    pitch: "Drift PATCH's scrap racer through timed laps while chat drops named cones, oil and cop bots, or nitro and drift multipliers.",
    dpad: 8, buttons: [['DRIFT', 'Space', 'hold'], ['NITRO', 'ShiftLeft'], ['TOW', 'KeyT']],
    keys: [['Throttle', 'W / ↑'], ['Brake / reverse', 'S / ↓'], ['Steer', 'A / D or ← →'], ['Handbrake drift (hold)', 'Space'], ['Nitro', 'Shift or E'], ['Tow back to the track', 'T'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick steer · RT / A throttle · LT brake · B / LB drift · X / RB nitro · Y tow · Start pause',
  },
  sumo: {
    reg: 'sumo', entry: 'sumo', title: 'SUMO RING', board: 'sumo-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Charge, sidestep and brace: PATCH throws viewer-named sumo bots out of the ring, wave after wave, up to the YOKOZUNA.',
    dpad: 8, buttons: [['CHARGE', 'Space'], ['SIDESTEP', 'ShiftLeft'], ['BRACE', 'KeyE', 'hold']],
    keys: [['Move', 'WASD or arrows'], ['Charge (shove)', 'Space or J'], ['Sidestep (dodge)', 'Shift or K'], ['Brace (hold)', 'E or L'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad move · A / RT charge · B / X sidestep · LB / LT brace (hold) · Start pause',
  },
  jetpack: {
    reg: 'jetpack', entry: 'jetpack', title: 'JETPACK DASH', board: 'jetpack-board', comments: ['help', 'sab'], group: 'review',
    pitch: "Fly PATCH's scrap jetpack through zappers while chat sends fuel and shields, or missiles and the MOTHERSHIP.",
    dpad: 4, buttons: [['THRUST', 'Space', 'hold'], ['DIVE', 'KeyS', 'hold'], ['DASH', 'ShiftLeft']],
    keys: [['Thrust (hold)', 'Space / W / ↑'], ['Dive', 'S / ↓'], ['Dash (i-frames)', 'Shift or K'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'A / RT thrust · LT dive · X / RB dash · Start pause',
  },
  pizza: {
    reg: 'pizza', entry: 'pizza', title: 'PIZZA RUSH', board: 'pizza-board', comments: ['help', 'sab'], group: 'review',
    pitch: "Race PATCH's delivery bike through robot traffic; chat orders the pizzas, opens shortcuts, or sends dogs and ROAD CLOSED.",
    dpad: 8, buttons: [['TURBO', 'ShiftLeft'], ['DRIFT', 'Space', 'hold']],
    keys: [['Steer (rides that way)', 'Arrows or WASD'], ['Turbo', 'Shift or K'], ['Drift (tight turns)', 'Space'], ['Brake', 'X'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick / d-pad steer · A / RT turbo · B / RB drift · LT brake · Start pause',
  },
  surf: {
    reg: 'surf', entry: 'surf', title: 'TSUNAMI SURF', board: 'surf-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Ride a giant wave as PATCH: pump to outrun the curl, flip off the lip, dodge the sharks chat throws in.',
    dpad: 8, buttons: [['GRAB', 'Space', 'hold']],
    keys: [['Carve up / down the face (pump)', 'W / S or ↑ ↓'], ['Flip in the air', 'A / D or ← →'], ['Grab (hold, in the air)', 'Space or Shift'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick ↕ carve · stick ↔ / LB RB flip · A / X grab · Start pause',
  },
  megaramp: {
    reg: 'megaramp', entry: 'megaramp', title: 'MEGA RAMP', board: 'megaramp-board', comments: ['help', 'sab'], group: 'review',
    pitch: "Drive PATCH's monster truck off an arena mega ramp: hit the speed window, pop the lip, flip it, stick it.",
    dpad: 8, buttons: [['POP', 'Space']],
    keys: [['Gas / drop in', 'W or ↑'], ['Brake', 'S or ↓'], ['POP at the lip', 'Space or Shift'], ['Lean back / backflip (air)', 'A or ←'], ['Lean forward (air)', 'D or →'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'RT gas · LT brake · A / X pop · stick or LB / RB pitch · Start pause',
  },
  hoops: {
    reg: 'hoops', entry: 'hoops', title: 'HOOPS', board: 'hoops-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Shoot hoops as PATCH against the shot clock while chat sends named defender bots, wind and a TINY HOOP.',
    dpad: 8, buttons: [['SHOOT', 'Space', 'hold']],
    keys: [['Move along the court', 'A / D or ← →'], ['Aim the arc up / down', 'W / S or ↑ ↓'], ['Shoot (hold = power swings, release = shoot)', 'Space or J'], ['Steer a SLOW BALL in the air', 'A / D'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick move · right stick / d-pad ↑↓ aim · hold A or RT, release to shoot · Start pause',
  },
  snowboard: {
    reg: 'snowboard', entry: 'snowboard', title: 'SNOWBOARD', board: 'snowboard-board', comments: ['help', 'sab'], group: 'review',
    pitch: 'Carve PATCH down a ruined ski mountain and land tricks while chat drops named trees, an avalanche and the YETI in your line.',
    dpad: 8, buttons: [['JUMP', 'Space', 'hold']],
    keys: [['Carve (in the air: spin)', 'A / D or ← →'], ['Tuck (faster, wider turns)', 'W / ↑'], ['Brake', 'S / ↓'], ['Ollie (tap) · grab (hold in the air)', 'Space or J'], ['Pause', 'P'], ['Music', 'M']],
    pad: 'Stick carve / spin · RT or stick up tuck · LT or stick down brake · A ollie, hold A in the air to grab · Start pause',
  },
};
// launcher order: approved first, then review (round 2 in design/ROUND2-GAMES.md order)
export const ORDER = ['stacked', 'tightrope', 'goalie', 'derby', 'munch', 'horsederby', 'bullride', 'knockout', 'fishing', 'holdthedoor', 'defuse', 'heist', 'skydive', 'lava', 'pileup', 'crossy', 'whack', 'drift', 'sumo', 'jetpack', 'pizza', 'surf', 'megaramp', 'hoops', 'snowboard'];
export const STREAMER_KEYS = [['Settings (knobs)', 'F10'], ['PANIC (clear the screen)', 'F9'], ['Key help', 'F1'], ['PANIC on a pad', 'Select + Start']];
