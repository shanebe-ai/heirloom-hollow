// The HTML layer over the canvas: the toolbar, the HUD chips and every panel.
// It reads and writes the one game state in state.ts and never runs game
// rules of its own beyond buying seeds and moving produce into the box.
import { G, farmId, useFarmId, saveGame, blockSaves, markStep, guideActive, setFarmPassword, unlockFarm, logIn, logOut } from './state';
import { ITEMS, CROPS, TIRED_BELOW, GUIDE_STEP_IDS, FARMER_LOOKS, FLOWER_STALL, nameIsKind, nameIsTaken } from '../shared/rules.js';
import { BUILDING, STORE_GOODS, FOOD, isOpen, hoursText, buyAtStore, eat, hadToday } from '../shared/town.js';
import { NAMES } from './walker';
import { drawToolIcon } from './world';

const $ = (id: string) => document.getElementById(id)!;
const PANELS = ['bagPanel', 'placePanel', 'shipPanel', 'seedPop', 'sleepPanel', 'summaryPanel', 'settingsPanel', 'letterPanel', 'setupPanel', 'unlockPanel', 'stallPanel', 'infoPanel', 'loginPanel'];

/** The first steps guide: the card words and the hint line for each step. */
const GUIDE_WORDS: Record<string, { label: string; hint: string }> = {
  buy: { label: 'Buy a seed at the General Store in town', hint: 'First steps: follow the path east into town and tap the General Store.' },
  hoe: { label: 'Hoe a patch of grass inside the fence', hint: 'First steps: pick the Hoe below and tap grass inside the fence.' },
  plant: { label: 'Plant a seed on the tilled soil', hint: 'First steps: pick Seeds below and tap a patch of tilled soil.' },
  water: { label: 'Water it (the pond fills your can)', hint: 'First steps: pick the Can and tap your planted seed. The pond refills it.' },
  sleep: { label: 'Sleep in the farmhouse bed', hint: 'First steps: walk into the farmhouse and tap the bed to sleep.' },
  harvest: { label: 'Pick a ripe crop with your hand', hint: 'First steps: a ripe crop looks big and full. Pick it with the Hand.' },
  ship: { label: 'Ship it in the box by the house', hint: 'First steps: tap the wooden box by the farmhouse and ship your crop.' },
};

let guideSignature: string | null = null;
let guideWasActive = false;
/** Draw the first steps card and point the hint line at the current step. */
export function refreshGuide() {
  const g = G.save.guide;
  const card = $('stepsCard');
  if (!g || !guideActive() || !G.save.profile) {
    card.classList.remove('on');
    if (guideWasActive && g && !g.off) {
      toast('That is the whole loop. The farm is yours now.');
      $('hint').style.opacity = '0';
    }
    guideWasActive = false;
    guideSignature = null;
    return;
  }
  guideWasActive = true;
  const signature = g.done.join(',');
  if (signature !== guideSignature) {
    guideSignature = signature;
    const list = $('stepsList');
    list.innerHTML = '';
    let currentSet = false;
    for (const id of GUIDE_STEP_IDS) {
      const row = document.createElement('div');
      const done = g.done.includes(id);
      row.className = `step${done ? ' done' : !currentSet ? ' now' : ''}`;
      if (!done && !currentSet) currentSet = true;
      row.textContent = `${done ? '✓ ' : ''}${GUIDE_WORDS[id].label}`;
      list.appendChild(row);
    }
  }
  card.classList.add('on');
  const next = GUIDE_STEP_IDS.find((id) => !g.done.includes(id))!;
  const hint = $('hint');
  hint.textContent = GUIDE_WORDS[next].hint;
  hint.style.opacity = '1';
}

/** Hazel's letter, addressed to whoever farms here now. */
export function openLetter() {
  $('letterGreeting').textContent = `Dear ${G.save.profile?.name || 'Rosa'},`;
  openPanel('letterPanel');
}

/** Hazel's letter greets any farmer who has not read it yet. */
export function maybeShowLetter() {
  const g = G.save.guide;
  if (g && !g.seen && !g.off) openLetter();
}

let setupLook = FARMER_LOOKS[0];
function pickLook(key: string) {
  const look = FARMER_LOOKS.find((l) => l.key === key) || FARMER_LOOKS[0];
  setupLook = look;
  for (const l of FARMER_LOOKS) $(`pick-${l.key}`).classList.toggle('sel', l.key === look.key);
  const name = $('setupName') as HTMLInputElement;
  if (!name.value || FARMER_LOOKS.some((l) => l.name === name.value)) name.value = look.name;
}

let setupAcc = 'none';
function pickAcc(acc: string) {
  setupAcc = acc;
  for (const a of ['backpack', 'purse', 'none']) $(`pick-acc-${a}`).classList.toggle('sel', a === acc);
}

/** The first panels a player meets, in order: a locked farm asks for its
 * password, a farm with no farmer yet asks who is moving in, and only then
 * does Hazel's letter get its moment. */
export function postLoadPanels() {
  if (G.locked) { openPanel('unlockPanel'); return; }
  if (!G.save.profile) { pickLook('rosie'); openPanel('setupPanel'); return; }
  maybeShowLetter();
}

/** Marigold's flower stall: bought flowers are for giving, and every
 * purchase answers out loud like the seed sack does. */
export function openStall() {
  $('stallCoins').textContent = `You have ${G.save.coins} coins.`;
  const list = $('stallList');
  list.innerHTML = '';
  for (const { item, price } of FLOWER_STALL) {
    const def = ITEMS[item];
    const owned = G.save.inventory[item] ?? 0;
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span>${def.name}${owned ? ` <span class="own">(${owned} in your bag)</span>` : ''}</span>`;
    const btn = document.createElement('button');
    btn.textContent = `Buy ${price}`;
    btn.disabled = G.save.coins < price;
    btn.addEventListener('click', () => {
      if (G.save.coins < price) return;
      G.save.coins -= price;
      G.save.inventory[item] = (G.save.inventory[item] ?? 0) + 1;
      toast(`Bought a ${def.name.toLowerCase()} for ${price} coins. You have ${G.save.coins} coins.`);
      void saveGame();
      refreshHud();
      openStall();
    });
    row.appendChild(btn);
    list.appendChild(row);
  }
  openPanel('stallPanel');
}

export function closePanels() {
  for (const id of PANELS) $(id).classList.remove('open');
}

export function anyPanelOpen(): boolean {
  return PANELS.some((id) => $(id).classList.contains('open')) || $('talk').classList.contains('open');
}

function openPanel(id: string) {
  closePanels();
  $(id).classList.add('open');
}

/** A pop up card for things worth reading: signs, the noticeboard, where a road goes. */
export function info(title: string, text: string) {
  $('infoTitle').textContent = title;
  $('infoText').textContent = text;
  openPanel('infoPanel');
}

let toastTimer = 0;
export function toast(msg: string) {
  const el = $('toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.style.opacity = '0'; }, 2300);
}

/** The chips and bars at the top, plus the toolbar badges and highlights. */
export function refreshHud() {
  const s = G.save;
  $('coins').textContent = `${s.coins} coins`;
  const fill = $('energyFill');
  fill.style.width = `${Math.max(0, Math.min(100, s.energy))}%`;
  fill.classList.toggle('low', s.energy < TIRED_BELOW);
  $('tired').style.opacity = s.energy < TIRED_BELOW ? '1' : '0';
  $('canN').textContent = String(s.can);
  const seed = ITEMS[G.selectedSeed];
  $('seedName').textContent = G.selectedSeed === 'fertiliser' ? 'Fertiliser' : seed ? seed.name.replace(' seeds', '') : 'Seeds';
  $('seedN').textContent = String(s.inventory[G.selectedSeed] ?? 0);
  document.querySelectorAll('.tool').forEach((b) => {
    b.classList.toggle('sel', (b as HTMLElement).dataset.tool === G.selectedTool);
  });
  refreshGuide();
}

function ownedSeeds(): string[] {
  return Object.keys(G.save.inventory).filter((k) => (k.startsWith('seed_') || k === 'fertiliser') && G.save.inventory[k] > 0);
}

function selectTool(tool: typeof G.selectedTool) {
  if (tool === 'seeds') {
    if (G.selectedTool === 'seeds') { openSeedPop(); return; }
    if (!ownedSeeds().length) toast('No seeds in the bag. The General Store in town sells them.');
    else if (!ownedSeeds().includes(G.selectedSeed)) G.selectedSeed = ownedSeeds()[0];
  }
  G.selectedTool = tool;
  refreshHud();
}

function itemRow(name: string, sub: string, buttons: { label: string; soft?: boolean; disabled?: boolean; fn: () => void }[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  const grow = document.createElement('div');
  grow.className = 'grow';
  grow.innerHTML = `${name}<div class="sub">${sub}</div>`;
  row.appendChild(grow);
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = `pbtn${b.soft ? ' soft' : ''}`;
    btn.textContent = b.label;
    btn.disabled = !!b.disabled;
    btn.addEventListener('click', b.fn);
    row.appendChild(btn);
  }
  return row;
}

function emptyLine(text: string): HTMLElement {
  const el = document.createElement('p');
  el.className = 'note';
  el.textContent = text;
  return el;
}

export function openBag() {
  const list = $('bagList');
  list.innerHTML = '';
  $('bagCoins').textContent = String(G.save.coins);
  const entries = Object.entries(G.save.inventory).filter(([, n]) => n > 0);
  if (!entries.length) list.appendChild(emptyLine('Nothing in here yet. The field is waiting.'));
  for (const [item, n] of entries) {
    const def = ITEMS[item];
    if (!def) continue;
    const sub = def.sell ? `Sells for ${def.sell} coins in the shipping box` : item === 'fertiliser' ? 'Spread it on tilled soil with the Seeds button' : 'Plant from the toolbar';
    list.appendChild(itemRow(`${def.name} × ${n}`, sub, []));
  }
  openPanel('bagPanel');
}

const PLACE_ABOUT: Record<string, string> = {
  store: 'Seeds, fertiliser and everything in between, kept by the twins.',
  cafe: "Mrs. Tibbs's café. A meal here puts the spring back in your step.",
  bakery: "Benji's bakery. The smell reaches the fountain.",
  library: 'Shelves to the ceiling and a ladder on wheels.',
  mayor: 'Brass plate on the door: B. PUDDLE, MAYOR. Knock loudly.',
  clinic: 'Doctor Ines keeps the valley well.',
  smithy: 'The forge glows behind the door. Old Fennick builds from the yard too.',
  weaving: 'Every thread in the window was spun in the valley.',
  teahouse: 'The pot is always warm.',
  pottery: 'Jugs and bowls on every shelf, all made from river clay.',
  cottage_rose: 'A cottage with roses round the door. Rosie, Marigold, Clementine and Wren live here.',
  cottage_gull: 'A blue cottage by the river. Captain Gull, Theo, Ollie and Lottie live here.',
  ranch_house: "June's ranch house. Muddy boots by the door and a dog asleep on the step. Jed lives here too.",
  barn: 'Hay to the rafters, a horse called Biscuit, and Jed somewhere with a pitchfork.',
  honey_shed: "Hugo's honey shed. Jars in rows, glowing in the light. He sells honey on toast at the door.",
};

/** A building's door: its shop when open, or a sign saying when it opens.
 *  Interiors come later; for now the people who work there stand out front. */
export function openPlace(id: string) {
  const b = BUILDING[id];
  const s = G.save;
  $('placeTitle').textContent = b.name;
  const open = isOpen(id, s.minutes, s.day);
  const keepers = b.keepers.map((k) => NAMES[k] ?? k);
  const who = keepers.length ? ` ${keepers.join(' and ')} ${keepers.length > 1 ? 'work' : 'works'} here; tap them to chat.` : '';
  $('placeAbout').textContent = `${PLACE_ABOUT[id] ?? ''}${who}`;
  $('placeHours').textContent = b.home ? 'A home. Nobody answers the door to strangers just yet.' : `${open ? 'Open now. ' : 'Closed. '}${hoursText(id)}`;
  $('placeHours').classList.toggle('closed', !open);
  $('placeCoins').textContent = `You have ${s.coins} coins. Energy ${Math.floor(s.energy)}.`;
  const list = $('placeList');
  list.innerHTML = '';
  const after = (r: { ok: boolean; msg: string }) => {
    toast(r.msg);
    if (r.ok) { refreshHud(); void saveGame(); }
    openPlace(id);
  };
  if (open && id === 'store') {
    for (const crop of Object.values(CROPS)) {
      const owned = s.inventory[crop.seed] ?? 0;
      list.appendChild(itemRow(`${crop.name} seeds`,
        `${crop.seedCost} coins. Ripe in ${crop.days} watered nights${crop.regrow ? `, then again every ${crop.regrow}` : ''}. You have ${owned}.`,
        [{ label: 'Buy', soft: true, disabled: s.coins < crop.seedCost, fn: () => {
          const r = buyAtStore(G.save, crop.seed);
          if (r.ok) { markStep('buy'); if (!ownedSeeds().includes(G.selectedSeed)) G.selectedSeed = crop.seed; }
          after(r);
        } }]));
    }
    for (const g of STORE_GOODS) {
      const have = g.id === 'big_can' ? (s.bigCan ? 'You have it.' : '') : `You have ${s.inventory[g.id] ?? 0}.`;
      list.appendChild(itemRow(g.name, `${g.price} coins. ${g.about} ${have}`,
        [{ label: 'Buy', soft: true, disabled: s.coins < g.price || (g.id === 'big_can' && !!s.bigCan), fn: () => after(buyAtStore(G.save, g.id)) }]));
    }
  }
  if (open) {
    for (const [key, f] of Object.entries(FOOD)) {
      if (f.place !== id) continue;
      const had = f.daily && hadToday(s, key);
      list.appendChild(itemRow(f.name, `${f.price} coins. Energy up ${f.energy}.${f.daily ? had ? ' Had today.' : ' Once a day.' : ''}`,
        [{ label: 'Eat', soft: true, disabled: had || s.coins < f.price, fn: () => after(eat(G.save, key)) }]));
    }
  }
  openPanel('placePanel');
}

export function openShip() {
  const list = $('shipList');
  list.innerHTML = '';
  $('shipCoins').textContent = String(G.save.coins);
  const produce = Object.keys(ITEMS).filter((k) => ITEMS[k].sell);
  let any = false;
  for (const item of produce) {
    const have = G.save.inventory[item] ?? 0;
    const boxed = G.save.shipping[item] ?? 0;
    if (!have && !boxed) continue;
    any = true;
    list.appendChild(itemRow(
      ITEMS[item].name,
      `In your bag: ${have}. In the box: ${boxed}. Sells for ${ITEMS[item].sell} coins.`,
      [
        {
          label: 'Ship one', disabled: have <= 0,
          fn: () => { moveToBox(item, 1); },
        },
        {
          label: 'Ship all', soft: true, disabled: have <= 0,
          fn: () => { moveToBox(item, have); },
        },
        {
          label: 'Take back', disabled: boxed <= 0,
          fn: () => {
            G.save.shipping[item] = boxed - 1;
            if (!G.save.shipping[item]) delete G.save.shipping[item];
            G.save.inventory[item] = have + 1;
            openShip();
            void saveGame();
          },
        },
      ],
    ));
  }
  if (!any) list.appendChild(emptyLine('Nothing to ship yet. Ripe crops, picked with the Hand, can go in the box.'));
  openPanel('shipPanel');
}

function moveToBox(item: string, n: number) {
  const have = G.save.inventory[item] ?? 0;
  const put = Math.min(n, have);
  if (put <= 0) return;
  markStep('ship');
  G.save.inventory[item] = have - put;
  if (!G.save.inventory[item]) delete G.save.inventory[item];
  G.save.shipping[item] = (G.save.shipping[item] ?? 0) + put;
  openShip();
  void saveGame();
}

export function openSeedPop() {
  const list = $('seedList');
  list.innerHTML = '';
  const seeds = ownedSeeds();
  if (!seeds.length) list.appendChild(emptyLine('No seeds in the bag. The General Store in town sells them.'));
  for (const seed of seeds) {
    list.appendChild(itemRow(ITEMS[seed].name, `You have ${G.save.inventory[seed]}`, [{
      label: G.selectedSeed === seed ? 'In hand' : 'Take', soft: true,
      fn: () => {
        G.selectedSeed = seed;
        G.selectedTool = 'seeds';
        closePanels();
        refreshHud();
      },
    }]));
  }
  openPanel('seedPop');
}

export function askSleep(onYes: () => void) {
  openPanel('sleepPanel');
  $('sleepYes').onclick = () => { closePanels(); onYes(); };
  $('sleepNo').onclick = () => closePanels();
}

/** The morning card. Resolves when the player taps the button. */
export function showSummary(summary: { title: string; lines: string[] }): Promise<void> {
  $('summaryTitle').textContent = summary.title;
  $('summaryLines').innerHTML = summary.lines.map((l) => `<div>${l}</div>`).join('');
  openPanel('summaryPanel');
  return new Promise((resolve) => {
    $('summaryOk').onclick = () => { closePanels(); resolve(); };
  });
}

export function fade(on: boolean) {
  $('fade').classList.toggle('on', on);
}

export function initUI() {
  document.querySelectorAll('.tool').forEach((b) => {
    const el = b as HTMLElement;
    const kind = el.dataset.tool as typeof G.selectedTool;
    const img = el.querySelector('img')!;
    img.src = drawToolIcon(kind).toDataURL();
    el.addEventListener('click', () => selectTool(kind));
  });
  $('bagBtn').addEventListener('click', openBag);
  $('gearBtn').addEventListener('click', () => {
    $('farmCode').textContent = farmId();
    openPanel('settingsPanel');
  });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closePanels));
  document.addEventListener('hh-guide', refreshGuide);
  $('letterOk').addEventListener('click', () => {
    if (G.save.guide) G.save.guide.seen = true;
    closePanels();
    refreshGuide();
    void saveGame();
  });
  $('letterBtn').addEventListener('click', openLetter);
  $('infoOk').addEventListener('click', closePanels);
  $('toLogin').addEventListener('click', () => { $('loginMsg').textContent = ''; openPanel('loginPanel'); });
  $('toSetup').addEventListener('click', () => openPanel('setupPanel'));
  $('loginGo').addEventListener('click', async () => {
    const name = ($('loginName') as HTMLInputElement).value.trim();
    const pw = ($('loginPw') as HTMLInputElement).value;
    if (!name || !pw) { $('loginMsg').textContent = 'Type your farmer\'s name and password.'; return; }
    if (await logIn(name, pw)) { location.reload(); return; }
    $('loginMsg').textContent = 'That name and password do not match. Try again.';
    ($('loginPw') as HTMLInputElement).value = '';
  });
  $('logoutBtn').addEventListener('click', async () => {
    await saveGame();
    blockSaves();
    logOut();
    location.reload();
  });
  for (const l of FARMER_LOOKS) $(`pick-${l.key}`).addEventListener('click', () => pickLook(l.key));
  for (const a of ['backpack', 'purse', 'none']) $(`pick-acc-${a}`).addEventListener('click', () => pickAcc(a));
  $('stallChat').addEventListener('click', () => {
    closePanels();
    document.dispatchEvent(new CustomEvent('hh-chat', { detail: 'marigold' }));
  });
  $('setupGo').addEventListener('click', async () => {
    const name = ($('setupName') as HTMLInputElement).value.trim();
    if (!name) { toast('Your farmer needs a name.'); return; }
    if (!nameIsKind(name) || nameIsTaken(name)) { toast('That name will not do here. Pick another one.'); return; }
    try {
      const r = await fetch(`/api/name/${encodeURIComponent(name)}`);
      if (r.ok && (await r.json()).taken) { toast('Another farmer already goes by that name. Pick another one.'); return; }
    } catch { /* the server keeps the final word when the farm is saved */ }
    const pw = ($('setupPw') as HTMLInputElement).value;
    const pw2 = ($('setupPw2') as HTMLInputElement).value;
    if (pw.length < 4) { toast('The password needs at least 4 characters.'); return; }
    if (pw !== pw2) { toast('The passwords do not match. Type them again.'); return; }
    G.save.profile = { name, gender: setupLook.gender, look: setupLook.key, accessory: setupAcc };
    const kept = await setFarmPassword(pw);
    if (!kept) toast('The password could not be kept just now. Your farm code still opens the farm.');
    await saveGame();
    location.reload(); // come back in as the farmer just chosen, letter waiting
  });
  $('unlockGo').addEventListener('click', async () => {
    const pw = ($('unlockPw') as HTMLInputElement).value;
    if (await unlockFarm(pw)) { location.reload(); return; }
    $('unlockMsg').textContent = 'That password did not work. Try again.';
    ($('unlockPw') as HTMLInputElement).value = '';
  });
  $('stepsHide').addEventListener('click', () => {
    if (G.save.guide) G.save.guide.off = true;
    refreshGuide();
    void saveGame();
  });
  $('useCode').addEventListener('click', () => {
    const value = ($('farmCodeInput') as HTMLInputElement).value.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      toast('That does not look like a farm code. Check it and try again.');
      return;
    }
    useFarmId(value);
    blockSaves(); // the reload must not save this farm over the one we are joining
    location.reload();
  });
  refreshHud();
  postLoadPanels();
}
