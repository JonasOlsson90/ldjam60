// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Debug mode: shows the navigation debug overlay (the transparent monitor
// screen area with the goal and the ship's live position) in the main scene
// and the steering minigame. false = release: no overlay.
const DEBUG = true;

// Navigation screen trigger: the area in front of the computer on the desk in
// the ship's top-left cabin (game coordinates, measured from ship_interior.png,
// which is upscaled 2x). The navigation screen opens when the player's center
// enters this area.
const COMPUTER_ZONE = { x: 40, y: 150, width: 160, height: 110 };

// Electricity generator trigger: the area around the bike in the ship's
// bottom-left corner (game coordinates, measured from ship_interior.png).
const BIKE_ZONE = { x: 30, y: 440, width: 250, height: 130 };

// Distiller trigger: the area around the distiller in the ship's bottom-right
// corner (game coordinates, measured from ship_interior.png). It sits at the
// right edge of the screen, so the player exits to the left of it (exit: -1).
const DISTILLER_ZONE = { x: 650, y: 440, width: 140, height: 130, exit: -1 };

// Steering wheel trigger: the area in front of the steering wheel in the
// ship's top-right corner (game coordinates). It sits at the right edge of
// the screen, so the player exits to the left of it (exit: -1).
const STEERING_ZONE = { x: 660, y: 150, width: 140, height: 160, exit: -1 };

// Remembers where the player stood when opening a minigame, so they return to
// the same spot afterwards (nudged out of the minigame's trigger zone in its
// exit direction, so it doesn't immediately reopen).
let playerReturnPos = null;

// Ship geometry (game coordinates, measured from ship_interior.png, which is
// displayed upscaled 2x): the heights of the two floors (the player's feet
// when standing on them) and the horizontal span of the ladder connecting
// them.
const FLOOR_TOP = 290;
const FLOOR_BOTTOM = 576;
const LADDER = { x: 360, width: 70 };

const MOVE_SPEED = 200; // px/s walking
const CLIMB_SPEED = 160; // px/s on the ladder
const GRAVITY = 1500; // px/s^2
const JUMP_SPEED = 550; // px/s upwards (reaches ~100 px high)

// Navigation screen: bounds of the monitor's screen inside comrad64.png
// (measured from the image). This is the field the ship will navigate in later.
const MONITOR_SCREEN = { x: 56, y: 63, width: 684, height: 464 };
// The goal square: the end station of the mission. It is placed randomly
// somewhere along the edge of the monitor screen, 16 px from the edge
// (measured to the square's side, like before).
const GOAL_SIZE = 24;
const GOAL_MARGIN = 16;
const GOAL_INSET = GOAL_MARGIN + GOAL_SIZE / 2; // center distance from the edge
const GOAL_SPAN_X = MONITOR_SCREEN.width - 2 * GOAL_INSET;
const GOAL_SPAN_Y = MONITOR_SCREEN.height - 2 * GOAL_INSET;
let GOAL_X, GOAL_Y;
switch (Math.floor(Math.random() * 4)) {
  case 0: // top edge
    GOAL_X = MONITOR_SCREEN.x + GOAL_INSET + Math.random() * GOAL_SPAN_X;
    GOAL_Y = MONITOR_SCREEN.y + GOAL_INSET;
    break;
  case 1: // right edge
    GOAL_X = MONITOR_SCREEN.x + MONITOR_SCREEN.width - GOAL_INSET;
    GOAL_Y = MONITOR_SCREEN.y + GOAL_INSET + Math.random() * GOAL_SPAN_Y;
    break;
  case 2: // bottom edge
    GOAL_X = MONITOR_SCREEN.x + GOAL_INSET + Math.random() * GOAL_SPAN_X;
    GOAL_Y = MONITOR_SCREEN.y + MONITOR_SCREEN.height - GOAL_INSET;
    break;
  default: // left edge
    GOAL_X = MONITOR_SCREEN.x + GOAL_INSET;
    GOAL_Y = MONITOR_SCREEN.y + GOAL_INSET + Math.random() * GOAL_SPAN_Y;
}

// --- Navigation simulation ---------------------------------------------------
// The ship shown on the navigation screen. This simulation ALWAYS runs in the
// background (whatever scene is active advances it); the scenes only
// visualize it. Minigames decide what the screen shows and steer the ship.
const SHIP_SPEED = 2; // px/s
const STEER_SPEED = 0.8; // rad/s the ship turns at full wheel deflection
const MAX_WHEEL_ANGLE = Math.PI; // steering wheel clamp: half a turn each way
// The navigation screen shows the ship's live data for this long after a
// measurement, then goes blind until the next one.
const NAV_DATA_TTL = 15; // s
const navSim = {
  // Real-time position (game px, inside MONITOR_SCREEN) and pointing
  // direction in radians (0 = right, positive = clockwise). The ship
  // constantly moves in the direction it points to. Starts in the center
  // of the screen, pointing up.
  shipX: MONITOR_SCREEN.x + MONITOR_SCREEN.width / 2,
  shipY: MONITOR_SCREEN.y + MONITOR_SCREEN.height / 2,
  angle: -Math.PI / 2,
  // The steering wheel's deflection in radians (0 = centered). It acts like
  // a car's steering wheel: it keeps its position until turned back, and
  // while it is turned the ship keeps turning at a rate proportional to the
  // deflection.
  wheel: 0,
  // The latest MEASURED state (position and direction), captured when the
  // player climbs out of the top of the screen and wins the measurement
  // minigame. The navigation screen shows the ship's LIVE data for
  // NAV_DATA_TTL seconds after a measurement, then goes blind.
  measuredX: MONITOR_SCREEN.x + MONITOR_SCREEN.width / 2,
  measuredY: MONITOR_SCREEN.y + MONITOR_SCREEN.height / 2,
  measuredAngle: -Math.PI / 2,
  // When the last measurement was taken (performance.now() timestamp in ms),
  // or null if the position has never been measured.
  measuredAt: null,
};

// --- Measurement minigame ----------------------------------------------------
// The arc minigame opened by climbing out of the top of the screen: press
// SPACE (or the controller's X button) when the sweeping slider overlaps the
// target. ARC_WINS_NEEDED hits in a row take the measurement (copy the ship's
// real state into the measured state); a miss resets the streak.
const ARC_MAX_ANGLE = 45; // degrees: target and slider stay within ±45°
const ARC_SLIDER_SPEED = 120; // degrees/s the slider sweeps at
// Offset allowance: how far the slider's angle may be off the target's (in
// degrees) for a press to still count as a hit (10% of the 90° swing = 9°).
const ARC_TOLERANCE = 9;
const ARC_WINS_NEEDED = 3; // hits in a row needed to take the measurement
// The sextant gently bobs and tilts along with the sweeping slider.
const SEXTANT_BOB = 0.2; // px of vertical bob per degree of slider angle
const SEXTANT_TILT = 0.08; // degrees of tilt per degree of slider angle
// The star field drifting from right to left behind the dial: bigger stars
// are closer, so they drift faster, giving a sense of speed.
const NAV_STAR_COUNT = 60;
const NAV_STAR_MIN_SCALE = 0.5;
const NAV_STAR_MAX_SCALE = 2;
const NAV_STAR_SPEED = 60; // px/s of drift per unit of star scale
// How far below the leaving point the player reappears on the ladder after
// the minigame, so the whole sprite is visible on screen (the sprite is 132
// px tall, so 140 leaves a small margin above its head).
const MEASURE_RETURN_DROP = 140;

// Set when the ship travels outside the map boundaries: the game freezes
// (a proper game over image comes later).
let gameOver = false;
// Set when the ship reaches the goal: the game is won and freezes (a proper
// win screen comes later).
let gameWon = false;

function updateNavSim(dt) {
  if (gameOver || gameWon) return;
  // Steer like a car: the ship turns at a rate proportional to the wheel's
  // (persistent) deflection.
  navSim.angle += (navSim.wheel / MAX_WHEEL_ANGLE) * STEER_SPEED * dt;
  // No fuel, no thrust: the ship stands still (steering still works).
  if (fuelSim.fuel > 0) {
    navSim.shipX += Math.cos(navSim.angle) * SHIP_SPEED * dt;
    navSim.shipY += Math.sin(navSim.angle) * SHIP_SPEED * dt;
  }
  // Leaving the map boundaries is game over: freeze the game.
  const s = MONITOR_SCREEN;
  if (
    navSim.shipX < s.x ||
    navSim.shipX > s.x + s.width ||
    navSim.shipY < s.y ||
    navSim.shipY > s.y + s.height
  ) {
    gameOver = true;
  }
  // Reaching the goal wins the game: freeze it like a game over.
  if (
    Math.abs(navSim.shipX - GOAL_X) < GOAL_SIZE / 2 &&
    Math.abs(navSim.shipY - GOAL_Y) < GOAL_SIZE / 2
  ) {
    gameWon = true;
  }
}

// The ship is a small red triangle whose tip points along navSim.angle. The
// pivot is the middle of its base, so it turns around its tail like a real
// ship (shape vertices are relative to the top-left of the bounding box, the
// origin picks the pivot: 0, 0.5 = the middle of the left edge = the base).
function createNavShip(scene, alpha, depth) {
  return scene.add
    .triangle(navSim.shipX, navSim.shipY, 23, 9, 0, 0, 0, 18, 0xff0000, alpha)
    .setOrigin(0, 0.5)
    .setDepth(depth);
}

function syncNavShipLive(ship) {
  // The debug overlay shows the ship's real-time position and direction.
  if (!ship) return; // no overlay in release mode
  ship.setPosition(navSim.shipX, navSim.shipY);
  ship.setRotation(navSim.angle);
}

// Debug overlay: a transparent, always-on-top view of the navigation screen
// (monitor screen area, goal box, ship). The simulation behind it always
// runs, no matter which scene is active. Returns the ship marker (sync it
// every frame with syncNavShipLive), or null when not in debug mode.
function createNavOverlay(scene) {
  if (!DEBUG) return null;
  const ov = MONITOR_SCREEN;
  scene.add
    .rectangle(ov.x + ov.width / 2, ov.y + ov.height / 2, ov.width, ov.height, 0xffffff, 0.06)
    .setDepth(1000);
  scene.add.rectangle(GOAL_X, GOAL_Y, GOAL_SIZE, GOAL_SIZE, 0x00ff00, 0.5).setDepth(1001);
  return createNavShip(scene, 0.6, 1002);
}

// Debug end-of-game display: a big text slapped over the whole screen of
// whatever scene is active. Scrapped once the real end screens exist.
function showEndText(scene) {
  if (scene.endText && scene.endText.active) return;
  const won = gameWon && !gameOver;
  scene.endText = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, won ? 'YOU WIN!' : 'GAME OVER', {
      fontFamily: 'monospace',
      fontSize: '96px',
      color: won ? '#00ff00' : '#ff0000',
      stroke: '#000000',
      strokeThickness: 8,
    })
    .setOrigin(0.5)
    .setDepth(10000);
}

// --- Power simulation ----------------------------------------------------------
// The ship's battery. It always drains slowly (whatever scene is active
// advances it); pedaling the bike in the electricityGenerator minigame
// recharges it.
const BATTERY_MAX = 100;
// Global speed factor for battery power depletion and generation
// (1 = normal speed, lower = slower).
const POWER_SPEED = 0.5;
const BATTERY_DRAIN = 1; // % per second (before POWER_SPEED)
const PEDAL_BOOST = 2; // % per pedal stroke (before POWER_SPEED)
const powerSim = { battery: BATTERY_MAX }; // 0..100 %

function updatePowerSim(dt) {
  powerSim.battery = Math.max(0, powerSim.battery - BATTERY_DRAIN * POWER_SPEED * dt);
}

// --- Fuel simulation -----------------------------------------------------------
// The ship's fuel. It always drains slowly (whatever scene is active advances
// it); finishing the distiller refuel minigame refills it to 100 %.
const FUEL_MAX = 100;
// Global speed factor for fuel depletion (1 = normal speed, lower = slower).
const FUEL_SPEED = 1.5;
const FUEL_DRAIN = 1; // % per second (before FUEL_SPEED)
const fuelSim = { fuel: FUEL_MAX }; // 0..100 %

function updateFuelSim(dt) {
  fuelSim.fuel = Math.max(0, fuelSim.fuel - FUEL_DRAIN * FUEL_SPEED * dt);
}

// --- Main scene -------------------------------------------------------------
// The ambience loops for the entire game. Started once in the main scene
// (which is restarted when returning from minigames — hence the flag).
let ambienceStarted = false;

class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    this.load.image('ship_interior', 'imgs/ship_interior.png');
    // Player: 2-frame spritesheet, 63x132 per frame.
    this.load.spritesheet('player', 'imgs/Sprite-0001.png', {
      frameWidth: 63,
      frameHeight: 132,
    });
    // The looping ambience.
    this.load.audio('ambience', 'sound/lusit_sven-bitcrushed-ambience-600682.mp3');
    // Load other textures and audio here, e.g.:
    // this.load.image('bg', 'assets/bg.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#16213e');

    // Start the looping ambience (once — this scene restarts on return from
    // minigames). Browsers block audio until the first user input; Phaser
    // starts the sound as soon as the context unlocks.
    if (!ambienceStarted) {
      ambienceStarted = true;
      this.sound.play('ambience', { loop: true, volume: 0.5 });
    }

    // Full-screen background (source is 400x300, upscaled 2x for a crisp
    // pixel-art look). The PNG has a transparent margin, so the page
    // background color shows through around the ship.
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'ship_interior')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setDepth(0);

    // Player: the character sprite, standing at the bottom-center of the
    // screen (feet on the edge) with the 2-frame idle animation looping.
    this.player = this.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT, 'player').setDepth(10);
    // True when returning from the measurement minigame: the player starts
    // on the ladder in the climbing pose (applied after the animation
    // setup below).
    let startOnLadder = false;
    if (playerReturnPos) {
      if (playerReturnPos.ladder) {
        // Returning from the measurement minigame: back on the ladder,
        // slightly lower than when the player climbed out, so the sprite is
        // visible on screen.
        this.player.x = playerReturnPos.x;
        this.player.y = Math.min(
          playerReturnPos.y + MEASURE_RETURN_DROP,
          FLOOR_BOTTOM - this.player.displayHeight / 2
        );
        startOnLadder = true;
      } else {
        // Returning from a minigame: restore the position, but nudge out of
        // the minigame's trigger zone (in its exit direction) so it doesn't
        // immediately reopen.
        const z = playerReturnPos.zone;
        const margin = this.player.displayWidth / 2 + 4;
        this.player.x =
          z.exit === -1
            ? Math.min(playerReturnPos.x, z.x - margin)
            : Math.max(playerReturnPos.x, z.x + z.width + margin);
        this.player.y = playerReturnPos.y;
      }
    } else {
      this.player.y = FLOOR_BOTTOM - this.player.displayHeight / 2;
    }
    // Vertical velocity (px/s) while falling; 0 when standing or climbing.
    this.playerVy = 0;
    // True while a jump is airborne (so the ladder's hang doesn't grab the
    // player mid-jump); cleared on landing or when grabbing the ladder.
    this.jumpInAir = false;

    // The animations are global to the game, so only register them once —
    // the main scene is restarted when returning from the navigation screen.
    // Spritesheet: frames 1+2 = idle, frames 1+3 = walking, frame 4 = climbing.
    if (!this.anims.exists('idle')) {
      this.anims.create({
        key: 'idle',
        frames: this.anims.generateFrameNumbers('player', { frames: [0, 1] }),
        frameRate: 4,
        repeat: -1,
      });
    }
    if (!this.anims.exists('walk')) {
      this.anims.create({
        key: 'walk',
        frames: this.anims.generateFrameNumbers('player', { frames: [0, 2] }),
        frameRate: 8,
        repeat: -1,
      });
    }
    this.player.play('idle');
    // Current sprite state ('idle' | 'walk' | 'climb'), to only switch the
    // animation when the state actually changes.
    this.playerState = 'idle';
    if (startOnLadder) {
      // Returning from the measurement minigame: hang on the ladder in the
      // climbing frame.
      this.player.anims.stop();
      this.player.setFrame(3);
      this.playerState = 'climb';
    }

    // Debug overlay: a transparent, always-on-top view of the navigation
    // screen (monitor screen area, goal box, ship). The simulation behind it
    // always runs, no matter which scene is active.
    this.navShipDebug = createNavOverlay(this);

    // Debug: battery status, always visible in the top left of the screen.
    this.batteryDebug = this.add
      .text(10, 10, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
      .setDepth(1003);
    // Debug: fuel status, below the battery status.
    this.fuelDebug = this.add
      .text(10, 30, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
      .setDepth(1003);

    // Set once the computer triggers the navigation screen, so the scene
    // transition is only queued once (reset on every scene start).
    this._leaving = false;

    // Set by the space bar or the controller's X button (consumed in update):
    // request a small jump.
    this.jumpRequested = false;
    this.padXWasDown = false;
    this.input.keyboard.on('keydown-SPACE', () => {
      this.jumpRequested = true;
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    // WASD mirrors the arrow keys (same as in the minigames).
    this.wasd = {
      w: this.input.keyboard.addKey('W'),
      a: this.input.keyboard.addKey('A'),
      s: this.input.keyboard.addKey('S'),
      d: this.input.keyboard.addKey('D'),
    };
  }

  update(time, delta) {
    // Game over: show the debug text and freeze everything.
    if (gameOver || gameWon) {
      showEndText(this);
      return;
    }
    const dt = delta / 1000;
    const p = this.player;

    // Input: keyboard (arrows or WASD) or an Xbox controller (D-pad moves,
    // X jumps).
    const pad = this.input.gamepad ? this.input.gamepad.pad1 : null;
    const moveLeft = this.cursors.left.isDown || this.wasd.a.isDown || !!(pad && pad.left);
    const moveRight = this.cursors.right.isDown || this.wasd.d.isDown || !!(pad && pad.right);
    const moveUp = this.cursors.up.isDown || this.wasd.w.isDown || !!(pad && pad.up);
    const moveDown = this.cursors.down.isDown || this.wasd.s.isDown || !!(pad && pad.down);
    if (pad && pad.X && !this.padXWasDown) this.jumpRequested = true;
    this.padXWasDown = !!(pad && pad.X);

    // Walking (always possible).
    if (moveLeft) p.x -= MOVE_SPEED * dt;
    if (moveRight) p.x += MOVE_SPEED * dt;
    p.x = Phaser.Math.Clamp(p.x, p.displayWidth / 2, GAME_WIDTH - p.displayWidth / 2);

    const feet = () => p.y + p.displayHeight / 2;
    const onLadder = p.x >= LADDER.x && p.x <= LADDER.x + LADDER.width;
    const onFloor =
      Math.abs(feet() - FLOOR_TOP) < 2 || Math.abs(feet() - FLOOR_BOTTOM) < 2;

    if (onLadder && (moveUp || moveDown)) {
      // Climbing the ladder: no gravity while moving along it. The player may
      // climb as high as they want — even out of the top of the screen; the
      // lower end of the ladder is the bottom floor. Grabbing the ladder
      // cancels any ongoing jump.
      this.playerVy = 0;
      this.jumpInAir = false;
      if (moveUp) p.y -= CLIMB_SPEED * dt;
      else p.y += CLIMB_SPEED * dt;
      p.y = Phaser.Math.Clamp(
        p.y,
        -p.displayHeight / 2,
        FLOOR_BOTTOM - p.displayHeight / 2
      );
    } else if (onLadder && !onFloor && !this.jumpInAir) {
      // Hanging on the ladder between the floors (not while a jump is
      // airborne — then gravity rules).
      this.playerVy = 0;
    } else {
      // A space-bar press or X button while standing on a floor starts a
      // small jump.
      if (this.jumpRequested && onFloor) {
        this.playerVy = -JUMP_SPEED;
        this.jumpInAir = true;
      }

      // Gravity: accelerate downwards and land on the highest floor whose
      // level the feet reached or crossed this frame. (The crossing check
      // prevents tunneling through the top floor during a fast fall; the
      // small tolerance keeps a standing player from sinking through it.)
      const prevFeet = feet();
      this.playerVy += GRAVITY * dt;
      p.y += this.playerVy * dt;
      if (feet() >= FLOOR_TOP && prevFeet <= FLOOR_TOP + 4) {
        p.y = FLOOR_TOP - p.displayHeight / 2;
        this.playerVy = 0;
        this.jumpInAir = false;
      } else if (feet() >= FLOOR_BOTTOM) {
        p.y = FLOOR_BOTTOM - p.displayHeight / 2;
        this.playerVy = 0;
        this.jumpInAir = false;
      }
    }

    // The jump request is consumed (or discarded) every frame.
    this.jumpRequested = false;

    // Advance the navigation simulation (the real-time ship position).
    updateNavSim(dt);
    // The battery always drains slowly; show it in the debug display.
    updatePowerSim(dt);
    updateFuelSim(dt);
    this.batteryDebug.setText('Battery: ' + Math.round(powerSim.battery) + '%');
    this.fuelDebug.setText('Fuel: ' + Math.round(fuelSim.fuel) + '%');

    // Taking a measurement: climbing out of the top of the screen opens the
    // arc measurement minigame; winning it updates the navigation display's
    // measured state to the ship's current real position and direction.
    if (!this._leaving && feet() <= 0) {
      this._leaving = true;
      playerReturnPos = { x: p.x, y: p.y, ladder: true };
      this.scene.start('measurement');
    }

    // Sprite state: climbing (on the ladder, moving or hanging mid-air),
    // walking, or idle. Switch the animation only on state changes.
    const moving = moveUp || moveDown;
    const state =
      onLadder && (moving || !onFloor)
        ? 'climb'
        : moveLeft || moveRight
        ? 'walk'
        : 'idle';
    if (state !== this.playerState) {
      this.playerState = state;
      if (state === 'climb') {
        p.anims.stop();
        p.setFrame(3);
      } else {
        p.play(state);
      }
    }
    if (state === 'walk') {
      // Face the walking direction (flipped when walking left).
      p.setFlipX(moveLeft);
    } else if (state === 'climb' && moving) {
      // Flip the climbing frame back and forth while climbing.
      p.setFlipX(Math.floor(time / 250) % 2 === 0);
    }

    // Sync the debug overlay with the ship's real-time state.
    syncNavShipLive(this.navShipDebug);

    // Minigame triggers: the computer opens the navigation screen, the bike
    // opens the electricity generator, the steering wheel opens the steering
    // minigame, the distiller opens the dino run.
    const inComputer =
      p.x >= COMPUTER_ZONE.x &&
      p.x <= COMPUTER_ZONE.x + COMPUTER_ZONE.width &&
      p.y >= COMPUTER_ZONE.y &&
      p.y <= COMPUTER_ZONE.y + COMPUTER_ZONE.height;
    const inBike =
      p.x >= BIKE_ZONE.x &&
      p.x <= BIKE_ZONE.x + BIKE_ZONE.width &&
      p.y >= BIKE_ZONE.y &&
      p.y <= BIKE_ZONE.y + BIKE_ZONE.height;
    const inSteering =
      p.x >= STEERING_ZONE.x &&
      p.x <= STEERING_ZONE.x + STEERING_ZONE.width &&
      p.y >= STEERING_ZONE.y &&
      p.y <= STEERING_ZONE.y + STEERING_ZONE.height;
    const inDistiller =
      p.x >= DISTILLER_ZONE.x &&
      p.x <= DISTILLER_ZONE.x + DISTILLER_ZONE.width &&
      p.y >= DISTILLER_ZONE.y &&
      p.y <= DISTILLER_ZONE.y + DISTILLER_ZONE.height;

    let target = null;
    let zone = null;
    if (inComputer) {
      target = 'navigationScreen';
      zone = COMPUTER_ZONE;
    } else if (inBike) {
      target = 'electricityGenerator';
      zone = BIKE_ZONE;
    } else if (inSteering) {
      target = 'steeringWheel';
      zone = STEERING_ZONE;
    } else if (inDistiller) {
      target = 'distiller';
      zone = DISTILLER_ZONE;
    }
    if (!this._leaving && target) {
      this._leaving = true;
      playerReturnPos = { x: p.x, y: p.y, zone };
      this.scene.start(target);
    }
  }
}

// --- Navigation screen scene ---------------------------------------------------
// The ship's navigation screen, shown on the computer monitor. Later a ship
// will navigate towards the goal square here. Esc returns to 'MainScene'.
class NavigationScreenScene extends Phaser.Scene {
  constructor() {
    super({ key: 'navigationScreen' });
  }

  preload() {
    this.load.image('comrad64', 'imgs/comrad64.png');
  }

  create() {
    // Full-screen background (source is 800x600, the game resolution).
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'comrad64').setDepth(0);

    // The goal: a static square near the top-right corner of the monitor
    // screen, with a small margin. The ship navigates towards it.
    this.goal = this.add.rectangle(GOAL_X, GOAL_Y, GOAL_SIZE, GOAL_SIZE, 0x00ff00).setDepth(10);

    // The ship: a red triangle that moves in the direction it points to
    // (driven by the always-running navigation simulation).
    this.ship = createNavShip(this, 1, 10);

    // The remaining lifetime of the current data, in the upper left corner
    // of the monitor screen; updated live in update().
    this.ageText = this.add
      .text(MONITOR_SCREEN.x + 10, MONITOR_SCREEN.y + 10, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setDepth(20);

    // Shown instead of the ship once the measured data has gone stale.
    this.outdatedText = this.add
      .text(
        MONITOR_SCREEN.x + MONITOR_SCREEN.width / 2,
        MONITOR_SCREEN.y + MONITOR_SCREEN.height / 2,
        'Navigational data outdated, please provide new data.',
        { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff' }
      )
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    // Shown when the battery is empty: the computer is dead.
    this.noPowerText = this.add
      .text(
        MONITOR_SCREEN.x + MONITOR_SCREEN.width / 2,
        MONITOR_SCREEN.y + MONITOR_SCREEN.height / 2,
        'No power.',
        { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff' }
      )
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    // Esc (or the controller's B button) returns to the main ship screen.
    this.padBWasDown = false;
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.start('MainScene');
    });
  }

  update(time, delta) {
    // Game over: show the debug text and freeze everything.
    if (gameOver || gameWon) {
      showEndText(this);
      return;
    }
    // Advance the shared simulations and show the ship's state.
    updateNavSim(delta / 1000);
    updatePowerSim(delta / 1000);
    updateFuelSim(delta / 1000);
    // No battery, no computer: the screen is dead.
    const noPower = powerSim.battery <= 0;
    this.noPowerText.setVisible(noPower);

    // Fresh data (NAV_DATA_TTL seconds after a measurement): show the ship's
    // live position and direction. Older data is worthless: hide the ship and
    // just ask for new data.
    const dataAge =
      navSim.measuredAt === null
        ? Infinity
        : (performance.now() - navSim.measuredAt) / 1000;
    const showData = !noPower && dataAge <= NAV_DATA_TTL;
    this.ship.setVisible(showData);
    if (showData) syncNavShipLive(this.ship);
    this.ageText.setVisible(showData);
    if (showData) {
      this.ageText.setText(
        'Navigational data outdated in ' + Math.ceil(NAV_DATA_TTL - dataAge) + 's'
      );
    }
    this.outdatedText.setVisible(!noPower && !showData);

    // The controller's B button exits like Esc.
    const pad = this.input.gamepad ? this.input.gamepad.pad1 : null;
    if (pad && pad.B && !this.padBWasDown) this.scene.start('MainScene');
    this.padBWasDown = !!(pad && pad.B);
  }
}

// --- Electricity generator scene ------------------------------------------------
// Pedal the bike to charge the ship's battery: alternate A/D, the left/right
// arrow keys, or the controller's D-pad left/right. Each alternation
// generates power; the battery always drains slowly. For now the minigame
// just shows the battery level as a number.
// Esc (or the controller's B button) returns to 'MainScene'.
// A pedal stroke faster than this (ms between alternating strokes) counts as
// fast; only fast strokes recharge the battery.
const PEDAL_FAST_MS = 100;
class ElectricityGeneratorScene extends Phaser.Scene {
  constructor() {
    super({ key: 'electricityGenerator' });
  }

  preload() {
    // The pedaling cyclist: 6-frame spritesheet, 200x150 per frame. Frame 1:
    // idle; frames 2-4: slow pedaling; frames 5-6: fast pedaling.
    this.load.spritesheet('cycler', 'imgs/Sprite-0003.png', {
      frameWidth: 200,
      frameHeight: 150,
    });
  }

  create() {
    this.cameras.main.setBackgroundColor('#101018');

    // The current battery power as a plain number (0-100%).
    this.batteryText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: 'monospace',
        fontSize: '64px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // The cyclist in the bottom left corner, shown at 2x size; it mirrors
    // the pedaling (idle / slow / fast) in update().
    this.cycler = this.add
      .sprite(200, GAME_HEIGHT - 150, 'cycler')
      .setScale(2)
      .setFrame(0);
    if (!this.anims.exists('pedal_slow')) {
      this.anims.create({
        key: 'pedal_slow',
        frames: this.anims.generateFrameNumbers('cycler', { frames: [1, 2, 3] }),
        frameRate: 6,
        repeat: -1,
      });
    }
    if (!this.anims.exists('pedal_fast')) {
      this.anims.create({
        key: 'pedal_fast',
        frames: this.anims.generateFrameNumbers('cycler', { frames: [4, 5] }),
        frameRate: 10,
        repeat: -1,
      });
    }
    // Pedal stroke timing, for picking the cyclist's animation.
    this.lastStrokeAt = 0; // ms of the last counted stroke
    this.strokeInterval = Infinity; // ms between the last two strokes

    // Pedaling: each time the pedal side changes, power is generated.
    this.lastPedalSide = null;
    this.pedal = (side) => {
      if (gameOver || gameWon) return; // frozen
      if (this.lastPedalSide !== null && side !== this.lastPedalSide) {
        const now = performance.now();
        this.strokeInterval = now - this.lastStrokeAt;
        this.lastStrokeAt = now;
        // Only fast pedaling recharges the battery.
        if (this.strokeInterval < PEDAL_FAST_MS) {
          powerSim.battery = Math.min(BATTERY_MAX, powerSim.battery + PEDAL_BOOST * POWER_SPEED);
        }
      }
      this.lastPedalSide = side;
    };
    this.input.keyboard.on('keydown-A', () => this.pedal('left'));
    this.input.keyboard.on('keydown-LEFT', () => this.pedal('left'));
    this.input.keyboard.on('keydown-D', () => this.pedal('right'));
    this.input.keyboard.on('keydown-RIGHT', () => this.pedal('right'));

    // Esc (or the controller's B button) returns to the main ship screen.
    this.padLeftWasDown = false;
    this.padRightWasDown = false;
    this.padBWasDown = false;
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.start('MainScene');
    });
  }

  update(time, delta) {
    // Game over: show the debug text and freeze everything.
    if (gameOver || gameWon) {
      showEndText(this);
      return;
    }
    updatePowerSim(delta / 1000);
    updateFuelSim(delta / 1000);
    this.batteryText.setText(Math.round(powerSim.battery) + '%');

    // A full battery ends the minigame. The battery drains a little every
    // frame (before this check), so it never sits at exactly 100 — treat
    // anything within half a percent of full as full.
    if (powerSim.battery >= BATTERY_MAX - 0.5) {
      this.scene.start('MainScene');
      return;
    }

    // The cyclist mirrors the input: idle when no pedal stroke came for a
    // moment, pedaling slowly for slow strokes and fast for fast ones.
    const sinceStroke = performance.now() - this.lastStrokeAt;
    if (sinceStroke > 600) {
      if (this.cycler.anims.isPlaying) this.cycler.anims.stop();
      this.cycler.setFrame(0);
    } else {
      const anim =
        this.strokeInterval < PEDAL_FAST_MS ? 'pedal_fast' : 'pedal_slow';
      if (
        !this.cycler.anims.isPlaying ||
        this.cycler.anims.currentAnim.key !== anim
      )
        this.cycler.play(anim);
    }

    // Controller: the D-pad left/right pedals (each press is a stroke, like
    // the A/D keys) and the B button exits like Esc.
    const pad = this.input.gamepad ? this.input.gamepad.pad1 : null;
    const leftDown = !!(pad && pad.left);
    const rightDown = !!(pad && pad.right);
    if (leftDown && !this.padLeftWasDown) this.pedal('left');
    if (rightDown && !this.padRightWasDown) this.pedal('right');
    this.padLeftWasDown = leftDown;
    this.padRightWasDown = rightDown;
    if (pad && pad.B && !this.padBWasDown) this.scene.start('MainScene');
    this.padBWasDown = !!(pad && pad.B);
  }
}

// --- Steering wheel scene ---------------------------------------------------
// Steer the ship like a car: A/D, the left/right arrow keys, or the
// controller's D-pad turn the steering wheel. The wheel keeps its position
// when the keys are released, so the ship (navSim.angle) and the star field
// keep turning until the wheel is steered back to center.
// Esc (or the controller's B button) returns to 'MainScene'.
const WHEEL_TURN_SPEED = 2.0; // rad/s the A/D keys turn the wheel
// The windshield's horizontal field of view: it links the star drift to the
// ship's turn rate, so the stars scroll exactly as fast as the ship turns.
const WINDSHIELD_FOV = Math.PI / 2; // radians (90 degrees)
const STAR_COUNT = 80;
// wheel_base.png is a full-screen cockpit image: the star field shows in its
// windshield (the black area, measured from the image) and the wheel sits on
// the center pedestal.
const WINDSHIELD = { x: 56, y: 40, width: 684, height: 320 };
const WHEEL_X = GAME_WIDTH / 2;
const WHEEL_Y = 370;
// The compass dial on the dashboard, right of the steering wheel.
const COMPASS_X = 680;
const COMPASS_Y = 480;

class SteeringWheelScene extends Phaser.Scene {
  constructor() {
    super({ key: 'steeringWheel' });
  }

  preload() {
    this.load.image('star', 'imgs/star.png');
    this.load.image('wheel_base', 'imgs/wheel_base.png');
    this.load.image('wheel', 'imgs/wheel.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');

    // The cockpit dashboard fills the whole screen.
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'wheel_base')
      .setDepth(0);

    // The star field, visible through the windshield; it drifts sideways
    // while steering.
    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push(
        this.add
          .image(
            WINDSHIELD.x + Math.random() * WINDSHIELD.width,
            WINDSHIELD.y + Math.random() * WINDSHIELD.height,
            'star'
          )
          .setDepth(1)
      );
    }

    // The steering wheel mounted on the center pedestal.
    this.wheel = this.add.image(WHEEL_X, WHEEL_Y, 'wheel').setDepth(2);

    // The same navigation debug overlay as on the main screen, so the ship's
    // real-time position and turning are visible while steering.
    this.navShipDebug = createNavOverlay(this);

    // Compass placeholder until the real compass graphic exists: a needle on
    // a small dial. It rotates against the ship's heading so it always points
    // north on the map.
    this.add.circle(COMPASS_X, COMPASS_Y, 36, 0x000000, 0.5).setDepth(2);
    // The needle pivots on the middle of its base (the pin in the center of
    // the dial): origin 0.5, 1 = the middle of the bottom edge.
    this.compass = this.add
      .triangle(COMPASS_X, COMPASS_Y, 12, 0, 0, 34, 24, 34, 0xffcc00)
      .setOrigin(0.5, 1)
      .setDepth(3);

    this.keys = {
      a: this.input.keyboard.addKey('A'),
      d: this.input.keyboard.addKey('D'),
      left: this.input.keyboard.addKey('LEFT'),
      right: this.input.keyboard.addKey('RIGHT'),
    };

    // Esc (or the controller's B button) returns to the main ship screen.
    this.padBWasDown = false;
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.start('MainScene');
    });
  }

  update(time, delta) {
    // Game over: show the debug text and freeze everything.
    if (gameOver || gameWon) {
      showEndText(this);
      return;
    }
    const dt = delta / 1000;
    // The ship keeps flying (and turning, while the wheel is deflected) and
    // the battery keeps draining while steering.
    updateNavSim(dt);
    updatePowerSim(dt);
    updateFuelSim(dt);
    syncNavShipLive(this.navShipDebug);

    // Turn the steering wheel with A/D, the left/right arrow keys, or the
    // controller's D-pad left/right.
    const pad = this.input.gamepad ? this.input.gamepad.pad1 : null;
    const steerRight =
      this.keys.d.isDown || this.keys.right.isDown || !!(pad && pad.right);
    const steerLeft =
      this.keys.a.isDown || this.keys.left.isDown || !!(pad && pad.left);
    const steer = (steerRight ? 1 : 0) - (steerLeft ? 1 : 0);
    if (steer !== 0) {
      navSim.wheel = Phaser.Math.Clamp(
        navSim.wheel + steer * WHEEL_TURN_SPEED * dt,
        -MAX_WHEEL_ANGLE,
        MAX_WHEEL_ANGLE
      );
    }

    // The controller's B button exits like Esc.
    if (pad && pad.B && !this.padBWasDown) this.scene.start('MainScene');
    this.padBWasDown = !!(pad && pad.B);

    // The star field scrolls in sync with the ship's turn rate (opposite to
    // the turn), wrapping around the windshield — it keeps moving while the
    // wheel stays turned. A turn of ω rad/s sweeps the view across
    // ω * (windshield width / field of view) px/s of star field.
    const turnRate = (navSim.wheel / MAX_WHEEL_ANGLE) * STEER_SPEED; // rad/s
    if (turnRate !== 0) {
      const drift = (turnRate * WINDSHIELD.width) / WINDSHIELD_FOV; // px/s
      for (const s of this.stars) {
        s.x -= drift * dt;
        if (s.x < WINDSHIELD.x - 4) s.x += WINDSHIELD.width + 8;
        else if (s.x > WINDSHIELD.x + WINDSHIELD.width + 4)
          s.x -= WINDSHIELD.width + 8;
      }
    }

    // The wheel shows its own deflection (upright = centered = straight).
    this.wheel.setRotation(navSim.wheel);

    // The compass needle rotates against the ship's heading, always pointing
    // north on the map (navSim.angle 0 = east, so north is angle -π/2).
    this.compass.setRotation(-(navSim.angle + Math.PI / 2));
  }
}

// --- Measurement minigame scene ----------------------------------------------
// Take a navigation measurement: a dial with a yellow target marker rotated
// to a random angle (±ARC_MAX_ANGLE) and a green slider that sweeps back and
// forth across the arc automatically. Press SPACE (or the controller's X
// button) when the slider overlaps the target. ARC_WINS_NEEDED hits in a row
// take the measurement (update the navigation display's measured state to the
// ship's real position and direction); a miss resets the streak.
// Esc (or the controller's B button) aborts without measuring.
class MeasurementScene extends Phaser.Scene {
  constructor() {
    super({ key: 'measurement' });
  }

  preload() {
    this.load.image('arc', 'imgs/arc.png');
    this.load.image('arc_target', 'imgs/arc_target.png');
    this.load.image('arc_slider', 'imgs/arc_slider.png');
    this.load.image('sextant', 'imgs/sextant.png');
    this.load.image('nav_overlay', 'imgs/nav_overlay.png');
    this.load.image('star', 'imgs/star.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#101018');

    // The star field behind everything: stars of differing sizes drift from
    // right to left at speeds proportional to their size (bigger = closer =
    // faster), wrapping around at the left edge.
    this.stars = [];
    for (let i = 0; i < NAV_STAR_COUNT; i++) {
      const scale = Phaser.Math.FloatBetween(
        NAV_STAR_MIN_SCALE,
        NAV_STAR_MAX_SCALE
      );
      const star = this.add
        .image(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT, 'star')
        .setScale(scale);
      star.drift = scale * NAV_STAR_SPEED; // px/s
      this.stars.push(star);
    }

    // The dial in the middle of the screen. All three images are 600x600
    // with their markings at the 3-o'clock position, so they rotate around
    // the shared image center and the markers travel along the arc.
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.add.image(cx, cy, 'arc');
    // The cosmonaut with the sextant in front of the dial. Its origin is the
    // center of its bottom edge so the gentle bob and tilt (driven by the
    // slider in update()) pivot there.
    this.sextant = this.add.image(cx, GAME_HEIGHT, 'sextant').setOrigin(0.5, 1);
    this.target = this.add.image(cx, cy, 'arc_target');
    this.slider = this.add.image(cx, cy, 'arc_slider');
    // The static overlay framing the scene, on top of everything else.
    this.add.image(cx, cy, 'nav_overlay');

    // The streak of successful hits; ARC_WINS_NEEDED in a row take the
    // measurement. The target's angle is re-rolled after every press.
    this.wins = 0;
    this.newTarget();

    // The slider sweeps between -ARC_MAX_ANGLE and +ARC_MAX_ANGLE, going up
    // (counterclockwise) 45° first, then down 90°, up 90°, and so on.
    this.sliderAngle = 0;
    this.sliderDir = -1;

    // Descriptive text: what to do, and how many hits are left.
    this.add
      .text(GAME_WIDTH / 2, 40, 'Take a navigation measurement!', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .text(
        GAME_WIDTH / 2,
        80,
        'Press SPACE (or X) when the green slider overlaps the yellow target.\n' +
          'A miss resets the streak. ESC (or B) aborts.',
        {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#aaaaaa',
          align: 'center',
        }
      )
      .setOrigin(0.5, 0);
    this.streakText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, '', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.feedbackText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 110, '', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.updateStreakText();

    // SPACE (or the controller's X button, edge-detected in update) tries a
    // hit. Esc (or the controller's B button) aborts. OS key auto-repeat is
    // filtered out so a held SPACE (or a controller button mapped to it)
    // can not machine-gun hits.
    this.input.keyboard.on('keydown-SPACE', (event) => {
      if (!event.repeat) this.tryHit();
    });
    this.padXWasDown = false;
    this.padBWasDown = false;
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.start('MainScene');
    });
  }

  // Roll a new random target angle (±ARC_MAX_ANGLE) and rotate the marker.
  newTarget() {
    this.targetAngle = Phaser.Math.FloatBetween(-ARC_MAX_ANGLE, ARC_MAX_ANGLE);
    this.target.setAngle(this.targetAngle);
  }

  updateStreakText() {
    this.streakText.setText(
      'Hits in a row: ' +
        this.wins +
        ' / ' +
        ARC_WINS_NEEDED +
        '  (' +
        (ARC_WINS_NEEDED - this.wins) +
        ' to go)'
    );
  }

  // A press: count a hit when the slider's angle is within the offset
  // allowance of the target's angle, otherwise reset the streak.
  tryHit() {
    if (gameOver || gameWon) return; // frozen
    const off = Math.abs(this.sliderAngle - this.targetAngle);
    if (off <= ARC_TOLERANCE) {
      this.wins++;
      if (this.wins >= ARC_WINS_NEEDED) {
        // Measurement taken: copy the ship's real position and direction
        // into the measured state shown on the navigation screen.
        navSim.measuredX = navSim.shipX;
        navSim.measuredY = navSim.shipY;
        navSim.measuredAngle = navSim.angle;
        navSim.measuredAt = performance.now();
        this.scene.start('MainScene');
        return;
      }
      this.feedbackText.setText('HIT!').setColor('#00ff00');
    } else {
      this.wins = 0;
      this.feedbackText.setText('Miss — streak reset!').setColor('#ff0000');
    }
    this.newTarget();
    this.updateStreakText();
  }

  update(time, delta) {
    // Game over: show the debug text and freeze everything.
    if (gameOver || gameWon) {
      showEndText(this);
      return;
    }
    const dt = delta / 1000;
    // The ship keeps flying and the battery keeps draining while measuring.
    updateNavSim(dt);
    updatePowerSim(dt);
    updateFuelSim(dt);

    // Sweep the slider back and forth between -ARC_MAX_ANGLE and
    // +ARC_MAX_ANGLE, reversing at the ends of the arc.
    this.sliderAngle += this.sliderDir * ARC_SLIDER_SPEED * dt;
    if (this.sliderAngle <= -ARC_MAX_ANGLE) {
      this.sliderAngle = -ARC_MAX_ANGLE;
      this.sliderDir = 1;
    } else if (this.sliderAngle >= ARC_MAX_ANGLE) {
      this.sliderAngle = ARC_MAX_ANGLE;
      this.sliderDir = -1;
    }
    this.slider.setAngle(this.sliderAngle);

    // The sextant follows the slider: as the slider sweeps up
    // (counterclockwise) the sextant bobs up and tilts counterclockwise; as
    // it sweeps down the sextant sinks and tilts clockwise.
    this.sextant.setY(GAME_HEIGHT + this.sliderAngle * SEXTANT_BOB);
    this.sextant.setAngle(this.sliderAngle * SEXTANT_TILT);

    // Drift the star field from right to left, wrapping at the edges.
    for (const s of this.stars) {
      s.x -= s.drift * dt;
      if (s.x < -8) s.x += GAME_WIDTH + 16;
    }

    // Controller: the X button presses like SPACE, the B button exits like
    // Esc.
    const pad = this.input.gamepad ? this.input.gamepad.pad1 : null;
    if (pad && pad.X && !this.padXWasDown) this.tryHit();
    this.padXWasDown = !!(pad && pad.X);
    if (pad && pad.B && !this.padBWasDown) this.scene.start('MainScene');
    this.padBWasDown = !!(pad && pad.B);
  }
}

// --- Distiller minigame scene -------------------------------------------------
// Refuel run: the player carries a full bottle to the fuel tank but drinks
// from it continually on the way — the faster the run, the more fuel is left
// to pour into the ship's tank. Hold D / right arrow (or the controller's
// D-pad right) to accelerate from a standstill; the speed is kept until an
// obstacle is hit, which stops the player cold. Jump (SPACE / UP / X / D-pad
// up) over the obstacles. Reaching the tank adds the bottle's remaining
// contents to the ship's fuel; a bottle drunk dry before the tank means the
// run failed. Esc (or the controller's B button) aborts.
const RUN_MAX_SPEED = 350; // px/s at full tilt
// px/s^2 while holding right: deliberately slow, so hitting an obstacle (and
// losing all speed) costs precious seconds of bottle — jumping is always
// better than tanking a hit.
const RUN_ACCEL = 100;
const RUN_TANK_DISTANCE = 3000; // px from the start to the fuel tank
// Positions (px) of the obstacles along the run.
const RUN_OBSTACLES = [700, 1250, 1800, 2350];
const RUN_GROUND = 500; // y of the player's feet
const RUN_PLAYER_X = 150;
const RUN_OBSTACLE_SIZE = 70; // px, the native size of bad.png
const BOTTLE_FULL = 100; // %
const BOTTLE_DRAIN = 6; // % per second the player drinks

class DistillerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'distiller' });
  }

  preload() {
    this.load.image('bad', 'imgs/bad.png');
    this.load.image('fueltank', 'imgs/fueltank.png');
    // The runner: 2-frame spritesheet, 100x125 per frame.
    if (!this.textures.exists('runner'))
      this.load.spritesheet('runner', 'imgs/Sprite-0002.png', {
        frameWidth: 100,
        frameHeight: 125,
      });
  }

  create() {
    this.cameras.main.setBackgroundColor('#101018');

    // The ground the player runs on.
    this.add.rectangle(GAME_WIDTH / 2, RUN_GROUND, GAME_WIDTH, 4, 0xffffff, 0.3);

    // What to do.
    this.add
      .text(
        GAME_WIDTH / 2,
        40,
        'Hurry to the fuel tank before the fuel is gone!\n' +
          'Press SPACE to jump and RIGHT to run!',
        {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#ffffff',
          align: 'center',
        }
      )
      .setOrigin(0.5)
      .setDepth(10);

    // The player starts at a standstill on the left of the screen. The run
    // animation's base frame rate is for full speed; it is scaled down with
    // the actual speed while running.
    this.runner = this.add.sprite(RUN_PLAYER_X, 0, 'runner');
    this.runner.y = RUN_GROUND - this.runner.displayHeight / 2;
    this.runner.setFrame(0);
    if (!this.anims.exists('run')) {
      this.anims.create({
        key: 'run',
        frames: this.anims.generateFrameNumbers('runner', { frames: [0, 1] }),
        frameRate: 8,
        repeat: -1,
      });
    }
    this.speed = 0; // px/s, built up by holding right
    this.jumpVy = 0; // < 0 while jumping

    // The bottle starts full; the player drinks from it continually.
    this.bottle = BOTTLE_FULL; // %
    this.finished = false; // bottle drunk dry before reaching the tank
    this.bottleText = this.add
      .text(GAME_WIDTH / 2, 90, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(10);

    // The obstacles and the fuel tank stand at fixed positions along the run
    // and scroll towards the player with the player's speed.
    this.obstacles = RUN_OBSTACLES.map((x) =>
      this.add.image(x, RUN_GROUND - RUN_OBSTACLE_SIZE / 2, 'bad')
    );
    // The fuel tank the player has to reach, standing on the ground at the
    // end of the run. It is drawn behind the runner, so the player stands in
    // front of it when they overlap at the finish.
    this.tank = this.add
      .image(RUN_TANK_DISTANCE, 0, 'fueltank')
      .setDisplaySize(208, 132)
      .setDepth(-1);
    this.tank.y = RUN_GROUND - this.tank.displayHeight / 2;

    // Accelerate: D / right arrow / D-pad right. Jump: SPACE / UP / W, or the
    // controller's X button / D-pad up (all edge-detected in update).
    // Esc (or B) aborts.
    this.keys = {
      space: this.input.keyboard.addKey('SPACE'),
      up: this.input.keyboard.addKey('UP'),
      w: this.input.keyboard.addKey('W'),
      d: this.input.keyboard.addKey('D'),
      right: this.input.keyboard.addKey('RIGHT'),
    };
    this.jumpWasDown = false;
    this.padBWasDown = false;
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.start('MainScene');
    });
  }

  update(time, delta) {
    // Game over: show the debug text and freeze everything.
    if (gameOver || gameWon) {
      showEndText(this);
      return;
    }
    const dt = delta / 1000;
    // The ship keeps flying and the battery keeps draining while running.
    updateNavSim(dt);
    updatePowerSim(dt);
    updateFuelSim(dt);

    // The controller's B button exits like Esc.
    const pad = this.input.gamepad ? this.input.gamepad.pad1 : null;
    if (pad && pad.B && !this.padBWasDown) this.scene.start('MainScene');
    this.padBWasDown = !!(pad && pad.B);
    if (this.finished) return;

    const feetY = () => this.runner.y + this.runner.displayHeight / 2;

    // Accelerate while right is held; the speed is kept until an obstacle
    // stops the player cold.
    const accelDown =
      this.keys.d.isDown || this.keys.right.isDown || !!(pad && pad.right);
    if (accelDown) {
      this.speed = Math.min(RUN_MAX_SPEED, this.speed + RUN_ACCEL * dt);
    }

    // The runner runs in place while moving, stands while slow; the faster
    // it runs, the faster the animation plays.
    if (this.speed > 5) {
      if (!this.runner.anims.isPlaying) this.runner.play('run');
      this.runner.anims.timeScale = Math.max(0.2, this.speed / RUN_MAX_SPEED);
    } else if (this.runner.anims.isPlaying) {
      this.runner.anims.stop();
      this.runner.setFrame(0);
    }

    // Jump (edge-detected), only from the ground.
    const jumpDown =
      this.keys.space.isDown ||
      this.keys.up.isDown ||
      this.keys.w.isDown ||
      !!(pad && (pad.X || pad.up));
    if (jumpDown && !this.jumpWasDown && feetY() >= RUN_GROUND - 0.5) {
      this.jumpVy = -JUMP_SPEED;
    }
    this.jumpWasDown = jumpDown;

    // Gravity: the runner lands back on the ground line.
    if (feetY() < RUN_GROUND - 0.5 || this.jumpVy < 0) {
      this.runner.y += this.jumpVy * dt;
      this.jumpVy += GRAVITY * dt;
      if (feetY() >= RUN_GROUND) {
        this.runner.y = RUN_GROUND - this.runner.displayHeight / 2;
        this.jumpVy = 0;
      }
    }

    // The world scrolls towards the player with the player's speed.
    for (const ob of this.obstacles) ob.x -= this.speed * dt;
    this.tank.x -= this.speed * dt;

    // The player drinks from the bottle continually; a bottle drunk dry
    // before the tank means the run failed.
    this.bottle = Math.max(0, this.bottle - BOTTLE_DRAIN * dt);
    this.bottleText.setText('Bottle: ' + Math.round(this.bottle) + '%');
    if (this.bottle <= 0) {
      this.finished = true;
      this.runner.setTint(0xff0000);
      this.time.delayedCall(900, () => this.scene.start('MainScene'));
      return;
    }

    // Hitting an obstacle knocks it away and stops the player cold. The
    // runner's hitbox is only the left half of the sprite, so it is centered
    // a quarter of the sprite's width to the left of its center.
    const hitX = RUN_PLAYER_X - this.runner.displayWidth / 4;
    const hitW = this.runner.displayWidth / 2;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const ob = this.obstacles[i];
      if (
        Math.abs(ob.x - hitX) < (RUN_OBSTACLE_SIZE + hitW) / 2 - 8 &&
        feetY() > RUN_GROUND - RUN_OBSTACLE_SIZE + 8
      ) {
        this.obstacles.splice(i, 1);
        ob.destroy();
        this.speed = 0;
        this.runner.setTint(0xff0000);
        this.time.delayedCall(250, () => this.runner.clearTint());
      }
    }

    // Reaching the fuel tank: the bottle's remaining contents are poured into
    // the ship's fuel — the more is left, the bigger the refill.
    if (this.tank.x <= RUN_PLAYER_X + 60) {
      fuelSim.fuel = Math.min(FUEL_MAX, fuelSim.fuel + this.bottle);
      this.scene.start('MainScene');
    }
  }
}

// --- Game config ------------------------------------------------------------
const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game',
  backgroundColor: '#16213e',
  // Nearest-neighbor filtering for the whole game: the 400x300 background
  // upscaled 2x to 800x600 stays crisp.
  pixelArt: true,
  input: {
    gamepad: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [
    MainScene,
    NavigationScreenScene,
    ElectricityGeneratorScene,
    SteeringWheelScene,
    MeasurementScene,
    DistillerScene,
  ],
};

const game = new Phaser.Game(config);

// Keep the movement keys for the game even when the canvas doesn't have
// browser focus (e.g. right after a page reload).
game.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE');
game.canvas.addEventListener('mousedown', () => game.canvas.focus());
