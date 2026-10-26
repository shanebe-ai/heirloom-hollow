// The HTML layer over the canvas: the toolbar, the HUD chips and every panel.
// It reads and writes the one game state in state.ts and never runs game
// rules of its own beyond buying seeds and moving produce into the box.
import { G, farmId, useFarmId, saveGame, blockSaves } from './state';
import { ITEMS, CROPS, TIRED_BELOW } from '../shared/rules.js';
import { drawToolIcon } from './world';

const $ = (id: string) => document.getElementById(id)!;
const PANELS = ['bagPanel', 'shopPanel', 'shipPanel', 'seedPop', 'sleepPanel', 'summaryPanel', 'settingsPanel'];

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
  $('seedName').textContent = seed ? seed.name.replace(' seeds', '') : 'Seeds';
  $('seedN').textContent = String(s.inventory[G.selectedSeed] ?? 0);
  document.querySelectorAll('.tool').forEach((b) => {
    b.classList.toggle('sel', (b as HTMLElement).dataset.tool === G.selectedTool);
  });
}

function ownedSeeds(): string[] {
  return Object.keys(G.save.inventory).filter((k) => k.startsWith('seed_') && G.save.inventory[k] > 0);
}

function selectTool(tool: typeof G.selectedTool) {
  if (tool === 'seeds') {
    if (G.selectedTool === 'seeds') { openSeedPop(); return; }
    if (!ownedSeeds().length) toast('No seeds in the bag. The sack by the signpost has more.');
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
  const entries = Object.entries(G.save.inventory).filter(([, n]) => n > 0);
  if (!entries.length) list.appendChild(emptyLine('Nothing in here yet. The field is waiting.'));
  for (const [item, n] of entries) {
    const def = ITEMS[item];
    if (!def) continue;
    const sub = def.sell ? `Sells for ${def.sell} coins in the shipping box` : 'Plant from the toolbar';
    list.appendChild(itemRow(`${def.name} × ${n}`, sub, []));
  }
  openPanel('bagPanel');
}

export function openShop() {
  const list = $('shopList');
  list.innerHTML = '';
  $('shopCoins').textContent = String(G.save.coins);
  for (const crop of Object.values(CROPS)) {
    const owned = G.save.inventory[crop.seed] ?? 0;
    list.appendChild(itemRow(
      crop.name,
      `${crop.seedCost} coins a seed. Ripe in ${crop.days} watered nights${crop.regrow ? `, then again every ${crop.regrow}` : ''}. You have ${owned}.`,
      [{
        label: 'Buy', soft: true, disabled: G.save.coins < crop.seedCost,
        fn: () => {
          if (G.save.coins < crop.seedCost) return;
          G.save.coins -= crop.seedCost;
          G.save.inventory[crop.seed] = (G.save.inventory[crop.seed] ?? 0) + 1;
          if (!ownedSeeds().includes(G.selectedSeed)) G.selectedSeed = crop.seed;
          openShop();
          refreshHud();
          void saveGame();
        },
      }],
    ));
  }
  openPanel('shopPanel');
}

export function openShip() {
  const list = $('shipList');
  list.innerHTML = '';
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
  if (!seeds.length) list.appendChild(emptyLine('No seeds in the bag. The sack by the signpost has more.'));
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
}
