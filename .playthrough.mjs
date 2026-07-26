import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:4173';
const BOARD_WIDTH = 374;
const BOARD_HEIGHT = 430;
const SPOTS = [[70, 118], [206, 88], [292, 196], [69, 282], [206, 372]]; // forearm case

function fitViewport(canvasWidth, canvasHeight) {
  const scale = Math.min(canvasWidth / BOARD_WIDTH, canvasHeight / BOARD_HEIGHT);
  return {
    scale,
    offsetX: (canvasWidth - BOARD_WIDTH * scale) / 2,
    offsetY: (canvasHeight - BOARD_HEIGHT * scale) / 2,
  };
}

async function boardSpotScreenPos(page, spotIndex) {
  const box = await page.getByTestId('board-canvas').boundingBox();
  if (box === null) throw new Error('board-canvas not found');
  const v = fitViewport(box.width, box.height);
  const [sx, sy] = SPOTS[spotIndex];
  return { x: box.x + sx * v.scale + v.offsetX, y: box.y + sy * v.scale + v.offsetY };
}

async function tapSpot(page, spotIndex) {
  const pos = await boardSpotScreenPos(page, spotIndex);
  await page.mouse.click(pos.x, pos.y);
}

async function energyValue(page) {
  const text = await page.getByTestId('energy').textContent();
  return Number(text);
}

/**
 * Throat has no bleed (its rule is 'virus', not 'wound'), but a clot's slow still matters: it
 * is what gives every other tower's range enough dwell time to matter at all, independent of
 * the bleed it also happens to stop. One clot, then antibody/killer cell alternating for tag
 * (armour-strip, regen-stop, dot) and the raw hit to finish what got stripped.
 */
async function buildRound(page, occupied) {
  const COSTS = { clot: 70, nk: 130, anti: 95, phago: 40 };

  if (!occupied.has('clot')) {
    const energy = await energyValue(page);
    if (energy >= COSTS.clot) {
      await page.getByTestId('dock-card-clot').click();
      await tapSpot(page, 0);
      occupied.add(0);
      occupied.add('clot');
      console.log(`  placed clot at spot 0, energy now ${energy - COSTS.clot}`);
    }
  }

  const plan = ['anti', 'clot', 'anti', 'nk'];
  const spotsPlaced = [...occupied].filter((v) => typeof v === 'number').length;
  let planIndex = spotsPlaced - (occupied.has('clot') ? 1 : 0);

  for (let spot = 0; spot < SPOTS.length; spot += 1) {
    if (occupied.has(spot)) continue;
    if (planIndex >= plan.length) break;
    const kind = plan[planIndex];
    const energy = await energyValue(page);
    if (energy < COSTS[kind]) continue; // save toward it rather than buy something weaker
    await page.getByTestId(`dock-card-${kind}`).click();
    await tapSpot(page, spot);
    occupied.add(spot);
    console.log(`  placed ${kind} at spot ${spot}, energy now ${energy - COSTS[kind]}`);
    planIndex += 1;
  }
  return occupied;
}

async function waitForResult(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await page.getByTestId('result-title').count();
    if (count > 0) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(BASE_URL);
  await page.getByTestId('go-there').click();
  await page.getByTestId('get-in-there').click();
  await page.waitForSelector('[data-testid="board-canvas"]');
  await page.waitForTimeout(500); // let the Pixi renderer finish starting

  const occupied = new Set();
  let waveNumber = 1;
  const maxWaves = 5;
  let cleared = false;

  while (waveNumber <= maxWaves) {
    await buildRound(page, occupied, null);
    const spotsFilled = [...occupied].filter((v) => typeof v === 'number').length;
    const energyAtStart = await energyValue(page);
    console.log(`wave ${waveNumber} build: spots=${spotsFilled}/5 energyLeft=${energyAtStart}`);
    // Speed up combat.
    const speedLabel = await page.getByTestId('speed').textContent();
    if (speedLabel === '1×') await page.getByTestId('speed').click();

    await page.getByTestId('start-wave').click();
    // Fever is a free once-per-wave slow; spend it once the wave's enemies are mostly on the
    // board rather than at the first instant, so its 5 s window covers more of them.
    const feverDelay = waveNumber >= 4 ? 1800 : 2800;
    await page.waitForTimeout(feverDelay);
    const feverAvailable = await page.getByTestId('fever').getAttribute('data-available');
    if (feverAvailable === 'true') {
      await page.getByTestId('fever').click();
      console.log('  fever triggered');
    }

    const gotResult = await waitForResult(page, 90000);
    if (!gotResult) throw new Error(`wave ${waveNumber} never resolved within the time budget`);

    const title = await page.getByTestId('result-title').textContent();
    const cta = await page.getByTestId('result-cta').textContent();
    const kills = await page.getByTestId('result-kills').textContent();
    const leaks = await page.getByTestId('result-leaks').textContent();
    const pips = await page.getByTestId('pip').all();
    let litCount = 0;
    for (const pip of pips) {
      const lit = await pip.getAttribute('data-lit');
      if (lit === 'true') litCount += 1;
    }
    console.log(
      `wave ${waveNumber} result: "${title}" cta: "${cta}" kills=${kills} leaks=${leaks} ` +
      `pipsLit=${litCount}/${pips.length} occupied=${[...occupied].filter((v) => typeof v === 'number').length}`,
    );

    if (cta === 'Try this case again') {
      throw new Error(`case lost on wave ${waveNumber}: ${title}`);
    }

    await page.getByTestId('result-cta').click();

    if (cta === 'Back to the body') {
      cleared = true;
      break;
    }
    waveNumber += 1;
  }

  if (!cleared) throw new Error('ran out of waves without a case-clear result');

  await page.waitForURL(BASE_URL + '/');
  await page.waitForTimeout(300);

  const dayBefore = await page.getByTestId('bank').textContent();
  console.log('bank shown on map after clear:', dayBefore);

  await page.screenshot({ path: 'E:/data/src/towerdefence-body/.shots/map-after-clear.png' });

  const heldCountBefore = await page.getByTestId('held-count').textContent();
  const kicker = await page.locator('.mono.kicker').first().textContent();
  console.log('held-count before reload:', heldCountBefore, 'kicker:', kicker);

  await page.reload();
  await page.waitForSelector('[data-testid="bank"]');
  const bankAfterReload = await page.getByTestId('bank').textContent();
  const heldCountAfterReload = await page.getByTestId('held-count').textContent();
  const kickerAfterReload = await page.locator('.mono.kicker').first().textContent();
  console.log('bank after reload:', bankAfterReload, 'held-count after reload:', heldCountAfterReload, 'kicker:', kickerAfterReload);

  if (bankAfterReload !== dayBefore || heldCountAfterReload !== heldCountBefore) {
    throw new Error('persistence check failed: values changed after reload');
  }

  console.log('PERSISTENCE CONFIRMED');

  await browser.close();
}

main().catch((error) => {
  console.error('PLAYTHROUGH FAILED:', error);
  process.exit(1);
});
