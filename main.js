// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Navigation screen trigger: the area in front of the computer on the desk in
// the ship's top-left cabin (game coordinates, measured from ship_interior.png,
// which is upscaled 2x). The navigation screen opens when the player's center
// enters this area.
const COMPUTER_ZONE = { x: 40, y: 150, width: 160, height: 110 };

// Electricity generator trigger: the area around the bike in the ship's
// bottom-left corner (game coordinates, measured from ship_interior.png).
const BIKE_ZONE = { x: 30, y: 440, width: 250, height: 130 };

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
const STEER_SPEED = 1.6; // rad/s the ship turns at full wheel deflection
const MAX_WHEEL_ANGLE = Math.PI; // steering wheel clamp: half a turn each way
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
  // The latest MEASURED state (position and direction): this is what the
  // navigation screen displays — frozen until the next measurement. It is
  // only updated when the player climbs out of the top of the screen and
  // wins the measurement minigame.
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
  navSim.shipX += Math.cos(navSim.angle) * SHIP_SPEED * dt;
  navSim.shipY += Math.sin(navSim.angle) * SHIP_SPEED * dt;
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

// The ship is a small red triangle whose tip points along navSim.angle.
function createNavShip(scene, alpha, depth) {
  return scene.add
    .triangle(navSim.shipX, navSim.shipY, 14, 0, -9, -9, -9, 9, 0xff0000, alpha)
    .setDepth(depth);
}

function syncNavShip(ship) {
  // The navigation screen shows the latest MEASUREMENT (position and
  // direction), frozen until the next measurement.
  ship.setPosition(navSim.measuredX, navSim.measuredY);
  ship.setRotation(navSim.measuredAngle);
}

function syncNavShipLive(ship) {
  // The debug overlay shows the ship's real-time position and direction.
  ship.setPosition(navSim.shipX, navSim.shipY);
  ship.setRotation(navSim.angle);
}

// Debug overlay: a transparent, always-on-top view of the navigation screen
// (monitor screen area, goal box, ship). The simulation behind it always
// runs, no matter which scene is active. Returns the ship marker (sync it
// every frame with syncNavShipLive).
function createNavOverlay(scene) {
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

// --- Main scene -------------------------------------------------------------
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
    // Load other textures and audio here, e.g.:
    // this.load.image('bg', 'assets/bg.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#16213e');

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
  }

  update(time, delta) {
    // Game over: show the debug text and freeze everything.
    if (gameOver || gameWon) {
      showEndText(this);
      return;
    }
    const dt = delta / 1000;
    const p = this.player;

    // Input: keyboard (arrows) or an Xbox controller (D-pad moves, X jumps).
    const pad = this.input.gamepad ? this.input.gamepad.pad1 : null;
    const moveLeft = this.cursors.left.isDown || !!(pad && pad.left);
    const moveRight = this.cursors.right.isDown || !!(pad && pad.right);
    const moveUp = this.cursors.up.isDown || !!(pad && pad.up);
    const moveDown = this.cursors.down.isDown || !!(pad && pad.down);
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
    this.batteryDebug.setText('Battery: ' + Math.round(powerSim.battery) + '%');

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
    // minigame.
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

    // The age of the displayed measurement, in the upper left corner of the
    // monitor screen; updated live in update().
    this.ageText = this.add
      .text(MONITOR_SCREEN.x + 10, MONITOR_SCREEN.y + 10, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setDepth(20);

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
    syncNavShip(this.ship);

    // Show how long ago the displayed position was measured.
    if (navSim.measuredAt === null) {
      this.ageText.setText('No data. Please provide navigational readings');
    } else {
      const age = Math.floor((performance.now() - navSim.measuredAt) / 1000);
      this.ageText.setText('Position updated ' + age + 's ago');
    }

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
class ElectricityGeneratorScene extends Phaser.Scene {
  constructor() {
    super({ key: 'electricityGenerator' });
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

    // Pedaling: each time the pedal side changes, power is generated.
    this.lastPedalSide = null;
    this.pedal = (side) => {
      if (gameOver || gameWon) return; // frozen
      if (this.lastPedalSide !== null && side !== this.lastPedalSide) {
        powerSim.battery = Math.min(BATTERY_MAX, powerSim.battery + PEDAL_BOOST * POWER_SPEED);
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
    this.batteryText.setText(Math.round(powerSim.battery) + '%');

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
const STAR_DRIFT = 160; // px/s at full deflection, opposite to the turn
const STAR_COUNT = 80;
// wheel_base.png is a full-screen cockpit image: the star field shows in its
// windshield (the black area, measured from the image) and the wheel sits on
// the center pedestal.
const WINDSHIELD = { x: 56, y: 40, width: 684, height: 320 };
const WHEEL_X = GAME_WIDTH / 2;
const WHEEL_Y = 370;

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

    // The star field drifts with the current turn rate (opposite to the
    // turn), wrapping around the windshield — it keeps moving while the
    // wheel stays turned.
    const turn = navSim.wheel / MAX_WHEEL_ANGLE; // -1..1
    if (turn !== 0) {
      for (const s of this.stars) {
        s.x -= turn * STAR_DRIFT * dt;
        if (s.x < WINDSHIELD.x - 4) s.x += WINDSHIELD.width + 8;
        else if (s.x > WINDSHIELD.x + WINDSHIELD.width + 4)
          s.x -= WINDSHIELD.width + 8;
      }
    }

    // The wheel shows its own deflection (upright = centered = straight).
    this.wheel.setRotation(navSim.wheel);
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
  }

  create() {
    this.cameras.main.setBackgroundColor('#101018');

    // The dial in the middle of the screen. All three images are 600x600
    // with their markings at the 3-o'clock position, so they rotate around
    // the shared image center and the markers travel along the arc.
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.add.image(cx, cy, 'arc');
    this.target = this.add.image(cx, cy, 'arc_target');
    this.slider = this.add.image(cx, cy, 'arc_slider');

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

    // Controller: the X button presses like SPACE, the B button exits like
    // Esc.
    const pad = this.input.gamepad ? this.input.gamepad.pad1 : null;
    if (pad && pad.X && !this.padXWasDown) this.tryHit();
    this.padXWasDown = !!(pad && pad.X);
    if (pad && pad.B && !this.padBWasDown) this.scene.start('MainScene');
    this.padBWasDown = !!(pad && pad.B);
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
  ],
};

const game = new Phaser.Game(config);

// Keep the movement keys for the game even when the canvas doesn't have
// browser focus (e.g. right after a page reload).
game.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE');
game.canvas.addEventListener('mousedown', () => game.canvas.focus());
