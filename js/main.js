import {
  CELL,
  CELL_SIZE,
  DIRS,
  DOOR_LOOKS,
  STAIR_STYLES,
  bakeRegions,
  bakeWorld,
  canWalk,
  cloneWorld,
  createDefaultWorld,
  createEmptyWorld,
  createLayer,
  currentLayer,
  doorInFront,
  ensurePlay,
  eraseCell,
  exportMapJson,
  fillRect,
  findDoor,
  getDoorBetween,
  getLayer,
  isDoorOpen,
  isSecretDoor,
  isWalkable,
  nearestEdge,
  parseMapJson,
  placeDoor,
  placeStairs,
  resetPlay,
  resizeLayer,
  revealAt,
  saveWorld,
  setDoorOpen,
  stairsAt,
} from './world.js';
import { cellAtWorld, render, screenToWorld } from './render.js';

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const stage = document.querySelector('.stage');
const hintEl = document.getElementById('stage-hint');
const floorBadge = document.getElementById('floor-badge');
const saveStatus = document.getElementById('save-status');
const propsEl = document.getElementById('props');
const propsTitle = document.getElementById('props-title');
const layerList = document.getElementById('layer-list');
const toastEl = document.getElementById('toast');

let world = createEmptyWorld();
let mode = 'boot';
let tool = 'select';
let layerId = world.start.layerId;
let selection = null;
let hover = null;
let dragRect = null;
let painting = false;
let panning = false;
let lastPan = null;
let spaceDown = false;
let maskPreview = false;
let pendingLink = null;
let doorDraft = { appearance: 'wood', swing: 's', hinge: 'a', hidden: false };
let stairsDraft = { style: 'up' };
let undoStack = [];
let redoStack = [];
let saveTimer = 0;
let moveCooldown = 0;
let heldMove = null;

const cam = { x: 0, y: 0, zoom: 1 };
centerCamera();

function viewSize() {
  const r = stage.getBoundingClientRect();
  return { vw: r.width, vh: r.height, dpr: Math.min(2, window.devicePixelRatio || 1) };
}

function resizeCanvas() {
  const { vw, vh, dpr } = viewSize();
  canvas.width = Math.max(1, Math.floor(vw * dpr));
  canvas.height = Math.max(1, Math.floor(vh * dpr));
  canvas.style.width = `${vw}px`;
  canvas.style.height = `${vh}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function layer() {
  return currentLayer(world, layerId);
}

function centerCamera() {
  const l = layer();
  cam.x = (l.width * CELL_SIZE) / 2;
  cam.y = (l.height * CELL_SIZE) / 2;
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function markDirty() {
  saveStatus.textContent = '保存中…';
  saveStatus.classList.add('is-dirty');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveWorld(world);
    saveStatus.textContent = '保存済み';
    saveStatus.classList.remove('is-dirty');
  }, 250);
}

function pushUndo() {
  undoStack.push(JSON.stringify(cloneWorld(world)));
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(cloneWorld(world)));
  world = JSON.parse(undoStack.pop());
  bakeWorld(world);
  ensurePlay(world);
  if (!getLayer(world, layerId)) layerId = world.layers[0].id;
  selection = null;
  refreshAll();
  markDirty();
}

function pointerWorld(e) {
  const { vw, vh } = viewSize();
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  return screenToWorld(cam, sx, sy, vw, vh);
}

function pointerCell(e) {
  const w = pointerWorld(e);
  const c = cellAtWorld(w.x, w.y);
  return { ...c, wx: w.x, wy: w.y };
}

function clampHover(c) {
  const l = layer();
  if (c.x < 0 || c.y < 0 || c.x >= l.width || c.y >= l.height) return null;
  return c;
}

function refreshLayers() {
  layerList.innerHTML = '';
  for (const l of world.layers) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'layer' + (l.id === layerId ? ' is-active' : '');
    const kind = l.kind === 'place' ? '別の場所' : '階層';
    btn.innerHTML = `${escapeHtml(l.name)}<small>${kind}　${l.width}×${l.height}</small>`;
    btn.addEventListener('click', () => {
      layerId = l.id;
      selection = null;
      centerCamera();
      refreshAll();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost del';
    del.textContent = '×';
    del.title = 'レイヤー削除';
    del.addEventListener('click', () => {
      if (world.layers.length <= 1) {
        toast('最後のレイヤーは削除できません');
        return;
      }
      confirmModal(`「${l.name}」を削除しますか？`, () => {
        pushUndo();
        world.layers = world.layers.filter((x) => x.id !== l.id);
        for (const other of world.layers) {
          for (const s of other.stairs) {
            if (s.targetLayerId === l.id) {
              s.targetLayerId = null;
            }
          }
        }
        if (world.start.layerId === l.id) {
          const first = world.layers[0];
          const walk = first.cells.flatMap((row, y) => row.map((t, x) => (t ? { x, y } : null))).filter(Boolean)[0];
          world.start.layerId = first.id;
          world.start.x = walk ? walk.x : 0;
          world.start.y = walk ? walk.y : 0;
        }
        if (layerId === l.id) layerId = world.layers[0].id;
        bakeWorld(world);
        ensurePlay(world);
        refreshAll();
        markDirty();
      });
    });
    li.append(btn, del);
    layerList.append(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function layerName(id) {
  const l = world.layers.find((x) => x.id === id);
  return l ? l.name : '（未接続）';
}

function refreshProps() {
  const l = layer();
  if (mode === 'play') {
    propsTitle.textContent = '探索状況';
    const revealed = (world.play.revealed[l.id] || []).length;
    propsEl.innerHTML = `
      <p class="muted">現在地　${escapeHtml(getLayer(world, world.play.layerId).name)}　(${world.play.x}, ${world.play.y})</p>
      <p class="muted">向き　${DIRS[world.play.facing].label}</p>
      <p class="muted">このレイヤーで解除した区画　${revealed}</p>
      <p class="muted">未訪問の区画は闇に覆われます。部屋や廊下が扉で区切られていると、入った区画だけがまとめて見えます。</p>
    `;
    return;
  }

  if (pendingLink) {
    propsTitle.textContent = '接続先';
    propsEl.innerHTML = `
      <p class="muted">接続先のマスをクリックしてください。別レイヤーへ切り替えてからクリックすることもできます。</p>
      <button type="button" class="btn" id="cancel-link">接続をやめる</button>
    `;
    propsEl.querySelector('#cancel-link').onclick = () => {
      pendingLink = null;
      refreshProps();
    };
    return;
  }

  if (selection?.type === 'door') {
    const d = selection.door;
    propsTitle.textContent = '扉';
    const looks = Object.entries(DOOR_LOOKS).map(([k, v]) =>
      `<button type="button" class="swatch ${d.appearance === k ? 'is-active' : ''}" data-look="${k}" style="--sw:${v.fill}">${v.name}</button>`
    ).join('');
    const swings = d.side === 'n'
      ? [['n', '北へ開く'], ['s', '南へ開く']]
      : [['w', '西へ開く'], ['e', '東へ開く']];
    const hinges = d.side === 'n'
      ? [['a', '西寄り（左）'], ['b', '東寄り（右）']]
      : [['a', '北寄り（上）'], ['b', '南寄り（下）']];
    propsEl.innerHTML = `
      <p class="muted">位置　(${d.x}, ${d.y})　${d.side === 'n' ? '南北の境' : '東西の境'}</p>
      <label class="field">見た目</label>
      <div class="swatches" id="looks">${looks}</div>
      <label class="field">開く方向</label>
      <div class="choice" id="swings">${swings.map(([k, n]) => `<button type="button" data-k="${k}" class="${d.swing === k ? 'is-active' : ''}">${n}</button>`).join('')}</div>
      <label class="field">蝶番</label>
      <div class="choice" id="hinges">${hinges.map(([k, n]) => `<button type="button" data-k="${k}" class="${d.hinge === k ? 'is-active' : ''}">${n}</button>`).join('')}</div>
      <label class="check-row"><input type="checkbox" id="door-hidden" ${isSecretDoor(d) ? 'checked' : ''}/><span>隠し扉（壁に擬態）</span></label>
      <label class="check-row"><input type="checkbox" id="door-open" ${d.defaultOpen ? 'checked' : ''}/><span>初期状態で開いている</span></label>
      <button type="button" class="btn" id="del-door">この扉を削除</button>
    `;
    propsEl.querySelector('#looks').onclick = (e) => {
      const b = e.target.closest('[data-look]');
      if (!b) return;
      pushUndo();
      d.appearance = b.dataset.look;
      d.hidden = d.appearance === 'secret';
      doorDraft.appearance = d.appearance;
      doorDraft.hidden = d.hidden;
      markDirty();
      refreshProps();
    };
    propsEl.querySelector('#swings').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      pushUndo();
      d.swing = b.dataset.k;
      doorDraft.swing = d.swing;
      markDirty();
      refreshProps();
    };
    propsEl.querySelector('#hinges').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      pushUndo();
      d.hinge = b.dataset.k;
      doorDraft.hinge = d.hinge;
      markDirty();
      refreshProps();
    };
    propsEl.querySelector('#door-hidden').onchange = (e) => {
      pushUndo();
      d.hidden = e.target.checked;
      if (d.hidden) d.appearance = 'secret';
      else if (d.appearance === 'secret') d.appearance = 'wood';
      doorDraft.appearance = d.appearance;
      doorDraft.hidden = d.hidden;
      markDirty();
      refreshProps();
    };
    propsEl.querySelector('#door-open').onchange = (e) => {
      pushUndo();
      d.defaultOpen = e.target.checked;
      markDirty();
    };
    propsEl.querySelector('#del-door').onclick = () => deleteSelection();
    return;
  }

  if (selection?.type === 'stairs') {
    const s = selection.stairs;
    const styles = Object.entries(STAIR_STYLES).map(([k, v]) =>
      `<button type="button" data-k="${k}" class="${s.style === k ? 'is-active' : ''}">${v.name}</button>`
    ).join('');
    const opts = world.layers.map((ly) =>
      `<option value="${ly.id}" ${s.targetLayerId === ly.id ? 'selected' : ''}>${escapeHtml(ly.name)}</option>`
    ).join('');
    propsTitle.textContent = '階段 / 転移';
    propsEl.innerHTML = `
      <p class="muted">位置　(${s.x}, ${s.y})</p>
      <label class="field">見た目</label>
      <div class="choice" id="st-style">${styles}</div>
      <label class="field">接続先レイヤー
        <select id="st-layer"><option value="">未接続</option>${opts}</select>
      </label>
      <div class="row">
        <label class="field">接続先 X<input type="number" id="st-tx" value="${s.targetX}" /></label>
        <label class="field">接続先 Y<input type="number" id="st-ty" value="${s.targetY}" /></label>
      </div>
      <button type="button" class="btn" id="pick-target">マップ上で接続先を指定</button>
      <button type="button" class="btn" id="new-floor-link">新しい階層を作って接続</button>
      <button type="button" class="btn" id="new-place-link">別の場所を作って接続</button>
      <button type="button" class="btn" id="del-st">この階段を削除</button>
    `;
    propsEl.querySelector('#st-style').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      pushUndo();
      s.style = b.dataset.k;
      stairsDraft.style = s.style;
      markDirty();
      refreshProps();
    };
    propsEl.querySelector('#st-layer').onchange = (e) => {
      pushUndo();
      s.targetLayerId = e.target.value || null;
      markDirty();
    };
    const setNum = (id, key) => {
      propsEl.querySelector(id).onchange = (e) => {
        pushUndo();
        s[key] = Number(e.target.value) | 0;
        markDirty();
      };
    };
    setNum('#st-tx', 'targetX');
    setNum('#st-ty', 'targetY');
    propsEl.querySelector('#pick-target').onclick = () => {
      pendingLink = { stairsId: s.id, fromLayer: l.id };
      refreshProps();
      toast('接続先のマスをクリック');
    };
    propsEl.querySelector('#new-floor-link').onclick = () => linkNewLayer(s, 'floor');
    propsEl.querySelector('#new-place-link').onclick = () => linkNewLayer(s, 'place');
    propsEl.querySelector('#del-st').onclick = () => deleteSelection();
    return;
  }

  if (tool === 'door') {
    propsTitle.textContent = '扉を置く';
    const looks = Object.entries(DOOR_LOOKS).map(([k, v]) =>
      `<button type="button" class="swatch ${doorDraft.appearance === k ? 'is-active' : ''}" data-look="${k}" style="--sw:${v.fill}">${v.name}</button>`
    ).join('');
    propsEl.innerHTML = `
      <p class="muted">歩けるマス同士の境界付近をクリックすると扉が入ります。閉じている間は通行できません。隠し扉は壁と同じ見た目になります。</p>
      <label class="field">見た目</label>
      <div class="swatches" id="looks">${looks}</div>
      <label class="field">開く方向（設置後にも変更可）</label>
      <div class="choice" id="swings">
        ${[['n','北'],['e','東'],['s','南'],['w','西']].map(([k,n]) =>
          `<button type="button" data-k="${k}" class="${doorDraft.swing === k ? 'is-active' : ''}">${n}</button>`).join('')}
      </div>
      <label class="field">蝶番</label>
      <div class="choice" id="hinges">
        <button type="button" data-k="a" class="${doorDraft.hinge === 'a' ? 'is-active' : ''}">左 / 上</button>
        <button type="button" data-k="b" class="${doorDraft.hinge === 'b' ? 'is-active' : ''}">右 / 下</button>
      </div>
      <label class="check-row"><input type="checkbox" id="draft-hidden" ${doorDraft.appearance === 'secret' || doorDraft.hidden ? 'checked' : ''}/><span>隠し扉（壁に擬態）</span></label>
    `;
    propsEl.querySelector('#looks').onclick = (e) => {
      const b = e.target.closest('[data-look]');
      if (!b) return;
      doorDraft.appearance = b.dataset.look;
      doorDraft.hidden = doorDraft.appearance === 'secret';
      refreshProps();
    };
    propsEl.querySelector('#swings').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      doorDraft.swing = b.dataset.k;
      refreshProps();
    };
    propsEl.querySelector('#hinges').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      doorDraft.hinge = b.dataset.k;
      refreshProps();
    };
    propsEl.querySelector('#draft-hidden').onchange = (e) => {
      doorDraft.hidden = e.target.checked;
      doorDraft.appearance = doorDraft.hidden ? 'secret' : (doorDraft.appearance === 'secret' ? 'wood' : doorDraft.appearance);
      refreshProps();
    };
    return;
  }

  if (tool === 'stairs') {
    propsTitle.textContent = '階段を置く';
    const styles = Object.entries(STAIR_STYLES).map(([k, v]) =>
      `<button type="button" data-k="${k}" class="${stairsDraft.style === k ? 'is-active' : ''}">${v.name}</button>`
    ).join('');
    propsEl.innerHTML = `
      <p class="muted">歩けるマスをクリックして設置します。別階層・別の場所へつなぐには、置いたあと接続先を指定してください。</p>
      <label class="field">種類</label>
      <div class="choice" id="st-style">${styles}</div>
    `;
    propsEl.querySelector('#st-style').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      stairsDraft.style = b.dataset.k;
      refreshProps();
    };
    return;
  }

  const toolsHelp = {
    select: '扉・階段をクリックして編集します。Delete で削除、Ctrl+Z で元に戻します。',
    path: 'ドラッグして通路を描きます。同じ通路が扉で区切られていない限り、進入時にまとめて開示されます。',
    room: 'ドラッグして矩形の部屋を置きます。部屋はひとつの区画としてマスク解除されます。',
    spawn: 'プレイ開始位置をクリックして指定します。',
    erase: 'ドラッグしてマスを空にします。そのマスの階段や隣接する扉も消えます。',
  };

  propsTitle.textContent = 'レイヤー';
  propsEl.innerHTML = `
    <p class="muted">${toolsHelp[tool] || ''}</p>
    <label class="field">名前<input type="text" id="ly-name" value="${escapeHtml(l.name)}" /></label>
    <label class="field">種類
      <select id="ly-kind">
        <option value="floor" ${l.kind === 'floor' ? 'selected' : ''}>階層</option>
        <option value="place" ${l.kind === 'place' ? 'selected' : ''}>別の場所</option>
      </select>
    </label>
    <div class="row">
      <label class="field">幅<input type="number" id="ly-w" min="4" max="48" value="${l.width}" /></label>
      <label class="field">高さ<input type="number" id="ly-h" min="4" max="48" value="${l.height}" /></label>
    </div>
    <p class="muted">ホイールで拡大、Space+ドラッグまたは中ボタンで移動。</p>
  `;
  propsEl.querySelector('#ly-name').onchange = (e) => {
    pushUndo();
    l.name = e.target.value || l.name;
    refreshLayers();
    markDirty();
  };
  propsEl.querySelector('#ly-kind').onchange = (e) => {
    pushUndo();
    l.kind = e.target.value;
    refreshLayers();
    markDirty();
  };
  const applySize = () => {
    const w = Number(propsEl.querySelector('#ly-w').value) | 0;
    const h = Number(propsEl.querySelector('#ly-h').value) | 0;
    pushUndo();
    resizeLayer(l, w, h);
    bakeRegions(l);
    centerCamera();
    refreshLayers();
    markDirty();
  };
  propsEl.querySelector('#ly-w').onchange = applySize;
  propsEl.querySelector('#ly-h').onchange = applySize;
}

function linkNewLayer(stairs, kind) {
  pushUndo();
  const n = world.layers.filter((x) => x.kind === kind).length + 1;
  const name = kind === 'place' ? `場所${n}` : `${n}階`;
  const src = layer();
  const nl = createLayer({
    name,
    kind,
    width: src.width,
    height: src.height,
  });
  const tx = Math.min(stairs.x, nl.width - 1);
  const ty = Math.min(stairs.y, nl.height - 1);
  nl.cells[ty][tx] = CELL.ROOM;
  const reverse = stairs.style === 'up' ? 'down' : stairs.style === 'down' ? 'up' : stairs.style;
  placeStairs(nl, tx, ty, {
    style: reverse,
    targetLayerId: src.id,
    targetX: stairs.x,
    targetY: stairs.y,
  });
  stairs.targetLayerId = nl.id;
  stairs.targetX = tx;
  stairs.targetY = ty;
  world.layers.push(nl);
  bakeWorld(world);
  layerId = nl.id;
  selection = { type: 'stairs', stairs: stairsAt(nl, tx, ty), x: tx, y: ty };
  centerCamera();
  refreshAll();
  markDirty();
  toast(`${name} を追加して接続しました`);
}

function hintText() {
  if (mode === 'play') return 'WASD 移動　F 扉　Esc 戻る';
  const map = {
    select: 'クリックで選択　Delete 削除　Ctrl+Z 取り消し',
    path: 'ドラッグで道を描く',
    room: 'ドラッグで部屋を置く',
    door: 'マスの境界をクリックして扉',
    stairs: 'クリックで階段 / 転移門',
    spawn: 'クリックで開始位置',
    erase: 'ドラッグで消去',
  };
  const pos = hover ? `　(${hover.x}, ${hover.y})` : '';
  return (map[tool] || '') + pos;
}

function refreshHint() {
  hintEl.textContent = hintText();
}

function refreshBadge() {
  const l = mode === 'play' ? getLayer(world, world.play.layerId) : layer();
  floorBadge.textContent = l.name;
}

function refreshAll() {
  refreshLayers();
  refreshProps();
  refreshHint();
  refreshBadge();
}

function hideBoot() {
  document.getElementById('boot').classList.add('hidden');
}

function showBoot() {
  exitBrowserFullscreen();
  document.getElementById('boot').classList.remove('hidden');
  document.getElementById('app').classList.remove('is-play');
  stage.classList.remove('is-play');
  document.getElementById('play-hud').classList.add('hidden');
  mode = 'boot';
  heldMove = null;
  selection = null;
  pendingLink = null;
  dragRect = null;
  refreshHint();
}

function startCreate() {
  world = createEmptyWorld();
  layerId = world.start.layerId;
  undoStack = [];
  redoStack = [];
  hideBoot();
  centerCamera();
  setMode('create');
  toast('白紙のマップを開きました');
}

function startPlayFromText(text, filename) {
  const next = parseMapJson(text);
  world = next;
  layerId = world.play.layerId;
  undoStack = [];
  redoStack = [];
  hideBoot();
  setMode('play');
  toast(filename ? `${filename} を読み込みました` : 'マップを読み込みました');
}

function pickPlayFile() {
  document.getElementById('boot-file').click();
}

function setMode(next) {
  if (next === 'boot') {
    showBoot();
    return;
  }
  hideBoot();
  mode = next;
  document.getElementById('app').classList.toggle('is-play', mode === 'play');
  document.getElementById('btn-create').classList.toggle('is-active', mode === 'create');
  document.getElementById('btn-play').classList.toggle('is-active', mode === 'play');
  document.getElementById('tools-panel').classList.toggle('hidden', mode === 'play');
  document.getElementById('play-help').classList.toggle('hidden', mode !== 'play');
  document.getElementById('mask-preview-row').classList.toggle('hidden', mode === 'play');
  document.getElementById('play-hud').classList.toggle('hidden', mode !== 'play');
  stage.classList.toggle('is-play', mode === 'play');
  selection = null;
  pendingLink = null;
  dragRect = null;
  if (mode === 'play') {
    layerId = world.play.layerId;
    ensurePlay(world);
    followPlayer();
    requestAnimationFrame(() => {
      resizeCanvas();
      followPlayer();
      canvas.focus();
    });
  } else {
    exitBrowserFullscreen();
    requestAnimationFrame(() => resizeCanvas());
  }
  refreshAll();
  markDirty();
}

async function enterBrowserFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement) return;
  try {
    await root.requestFullscreen();
  } catch {
    /* ブラウザが拒否してもアプリ内全画面で続行 */
  }
}

async function exitBrowserFullscreen() {
  if (!document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

function setTool(next) {
  tool = next;
  selection = null;
  for (const b of document.querySelectorAll('.tool')) {
    b.classList.toggle('is-active', b.dataset.tool === tool);
  }
  refreshHint();
  refreshProps();
}

function hitTest(c) {
  const l = layer();
  if (!c) return null;
  const st = stairsAt(l, c.x, c.y);
  if (st) return { type: 'stairs', stairs: st, x: st.x, y: st.y };
  const edge = nearestEdge(c.fx, c.fy);
  const near = (edge === 'n' && c.fy < 0.28) || (edge === 's' && c.fy > 0.72) || (edge === 'w' && c.fx < 0.28) || (edge === 'e' && c.fx > 0.72);
  if (near) {
    const door = findDoor(l, c.x, c.y, edge);
    if (door) return { type: 'door', door };
  }
  return { type: 'cell', x: c.x, y: c.y };
}

function deleteSelection() {
  if (!selection) return;
  const l = layer();
  pushUndo();
  if (selection.type === 'door') {
    l.doors = l.doors.filter((d) => d.id !== selection.door.id);
  } else if (selection.type === 'stairs') {
    l.stairs = l.stairs.filter((s) => s.id !== selection.stairs.id);
  }
  selection = null;
  bakeRegions(l);
  markDirty();
  refreshAll();
}

function applyPendingLink(c) {
  const from = getLayer(world, pendingLink.fromLayer);
  const st = from.stairs.find((s) => s.id === pendingLink.stairsId);
  if (!st || !isWalkable(layer(), c.x, c.y)) {
    toast('歩けるマスを指定してください');
    return;
  }
  pushUndo();
  st.targetLayerId = layerId;
  st.targetX = c.x;
  st.targetY = c.y;
  pendingLink = null;
  selection = { type: 'stairs', stairs: st, x: st.x, y: st.y };
  bakeWorld(world);
  markDirty();
  refreshAll();
  toast('接続しました');
}

function onDown(e) {
  if (e.button === 1 || spaceDown || e.button === 2) {
    panning = true;
    lastPan = { x: e.clientX, y: e.clientY };
    stage.classList.add('is-pan');
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  const c = clampHover(pointerCell(e));
  hover = c;
  if (mode === 'play') return;
  if (!c) return;

  if (pendingLink) {
    applyPendingLink(c);
    return;
  }

  if (tool === 'select') {
    selection = hitTest(c);
    if (selection?.type === 'cell') selection = null;
    refreshProps();
    return;
  }

  if (tool === 'path' || tool === 'erase') {
    pushUndo();
    painting = true;
    paintAt(c.x, c.y);
    return;
  }

  if (tool === 'room') {
    pushUndo();
    dragRect = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
    return;
  }

  if (tool === 'door') {
    const edge = nearestEdge(c.fx, c.fy);
    pushUndo();
    const swingByEdge = { n: 's', s: 'n', w: 'e', e: 'w' };
    let swing = doorDraft.swing;
    if (edge === 'n' || edge === 's') {
      swing = swing === 'n' || swing === 's' ? swing : swingByEdge[edge];
    } else {
      swing = swing === 'e' || swing === 'w' ? swing : swingByEdge[edge];
    }
    const door = placeDoor(layer(), c.x, c.y, edge, { ...doorDraft, swing });
    if (!door) {
      undoStack.pop();
      toast('歩けるマス同士の境に置いてください');
      return;
    }
    selection = { type: 'door', door };
    bakeRegions(layer());
    markDirty();
    refreshProps();
    return;
  }

  if (tool === 'stairs') {
    pushUndo();
    const st = placeStairs(layer(), c.x, c.y, { style: stairsDraft.style });
    if (!st) {
      undoStack.pop();
      toast('歩けるマスに置いてください');
      return;
    }
    selection = { type: 'stairs', stairs: st, x: st.x, y: st.y };
    markDirty();
    refreshProps();
    return;
  }

  if (tool === 'spawn') {
    if (!isWalkable(layer(), c.x, c.y)) {
      toast('歩けるマスを指定してください');
      return;
    }
    pushUndo();
    world.start = { layerId, x: c.x, y: c.y };
    markDirty();
    toast('開始位置を更新しました');
  }
}

function paintAt(x, y) {
  const l = layer();
  if (tool === 'path') {
    if (!l.cells[y] || x < 0 || y < 0 || x >= l.width || y >= l.height) return;
    l.cells[y][x] = CELL.PATH;
  } else if (tool === 'erase') {
    eraseCell(l, x, y);
  }
  bakeRegions(l);
  markDirty();
}

function onMove(e) {
  if (panning && lastPan) {
    const { vw } = viewSize();
    const dx = e.clientX - lastPan.x;
    const dy = e.clientY - lastPan.y;
    cam.x -= dx / cam.zoom;
    cam.y -= dy / cam.zoom;
    lastPan = { x: e.clientX, y: e.clientY };
    return;
  }
  const c = clampHover(pointerCell(e));
  hover = c;
  refreshHint();
  if (mode === 'play' || !c) return;
  if (painting) paintAt(c.x, c.y);
  if (dragRect) {
    dragRect.x1 = c.x;
    dragRect.y1 = c.y;
  }
}

function onUp() {
  if (panning) {
    panning = false;
    lastPan = null;
    stage.classList.remove('is-pan');
  }
  if (dragRect) {
    const l = layer();
    const x = Math.min(dragRect.x0, dragRect.x1);
    const y = Math.min(dragRect.y0, dragRect.y1);
    const w = Math.abs(dragRect.x1 - dragRect.x0) + 1;
    const h = Math.abs(dragRect.y1 - dragRect.y0) + 1;
    fillRect(l, x, y, w, h, CELL.ROOM);
    bakeRegions(l);
    markDirty();
    dragRect = null;
  }
  painting = false;
}

function onWheel(e) {
  e.preventDefault();
  const { vw, vh } = viewSize();
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  const before = screenToWorld(cam, sx, sy, vw, vh);
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  cam.zoom = Math.max(0.4, Math.min(2.8, cam.zoom * factor));
  const after = screenToWorld(cam, sx, sy, vw, vh);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
}

function followPlayer() {
  cam.x = world.play.x * CELL_SIZE + CELL_SIZE / 2;
  cam.y = world.play.y * CELL_SIZE + CELL_SIZE / 2;
  layerId = world.play.layerId;
}

function tryMove(dir) {
  const l = getLayer(world, world.play.layerId);
  world.play.facing = dir;
  const nx = world.play.x + DIRS[dir].x;
  const ny = world.play.y + DIRS[dir].y;
  const door = getDoorBetween(l, world.play.x, world.play.y, nx, ny);
  if (door && !isDoorOpen(world, door)) {
    if (!isSecretDoor(door)) toast('扉が閉まっている');
    return;
  }
  if (!canWalk(world, l, world.play.x, world.play.y, dir)) return;
  world.play.x += DIRS[dir].x;
  world.play.y += DIRS[dir].y;
  const newly = revealAt(world, l, world.play.x, world.play.y);
  if (newly) toast('区画のマスクを解除');
  const st = stairsAt(l, world.play.x, world.play.y);
  if (st && st.targetLayerId && !world.play.ignoreStairs) {
    const dest = getLayer(world, st.targetLayerId);
    if (dest && isWalkable(dest, st.targetX, st.targetY)) {
      world.play.layerId = dest.id;
      world.play.x = st.targetX;
      world.play.y = st.targetY;
      world.play.ignoreStairs = true;
      bakeRegions(dest);
      revealAt(world, dest, world.play.x, world.play.y);
      toast(`${dest.name} へ移動`);
    }
  } else if (!st) {
    world.play.ignoreStairs = false;
  }
  followPlayer();
  refreshBadge();
  refreshProps();
  markDirty();
}

function interactDoor() {
  const l = getLayer(world, world.play.layerId);
  const door = doorInFront(l, world.play.x, world.play.y, world.play.facing);
  if (!door) return;
  const open = !isDoorOpen(world, door);
  setDoorOpen(world, door, open);
  const secret = isSecretDoor(door);
  toast(secret
    ? (open ? '隠し扉を開けた' : '隠し扉を閉じた')
    : (open ? '扉を開けた' : '扉を閉じた'));
  markDirty();
}

function confirmModal(text, onOk) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-text').textContent = text;
  modal.classList.remove('hidden');
  const ok = document.getElementById('modal-ok');
  const cancel = document.getElementById('modal-cancel');
  const close = () => modal.classList.add('hidden');
  const go = () => {
    close();
    onOk();
  };
  ok.onclick = go;
  cancel.onclick = close;
}

function tick(t) {
  const { vw, vh } = viewSize();
  if (mode === 'play') followPlayer();
  if (mode === 'boot') {
    requestAnimationFrame(tick);
    return;
  }
  if (mode === 'play' && heldMove && t >= moveCooldown) {
    tryMove(heldMove);
    moveCooldown = t + 160;
  }
  render(ctx, {
    world,
    layerId: mode === 'play' ? world.play.layerId : layerId,
    mode,
    cam,
    vw,
    vh,
    hover: mode === 'create' ? hover : null,
    selection: mode === 'create' ? selection : null,
    dragRect,
    useFog: mode === 'play' || maskPreview,
    pendingLink,
  });
  requestAnimationFrame(tick);
}

function applyWorld(next, message) {
  pushUndo();
  world = next;
  layerId = world.start.layerId;
  selection = null;
  pendingLink = null;
  centerCamera();
  refreshAll();
  markDirty();
  if (message) toast(message);
}

function jsonIncludePlay() {
  return document.getElementById('json-include-play').checked;
}

function fillJsonEditor() {
  document.getElementById('json-text').value = exportMapJson(world, { includePlay: jsonIncludePlay() });
}

function openJsonModal() {
  fillJsonEditor();
  document.getElementById('json-modal').classList.remove('hidden');
  const ta = document.getElementById('json-text');
  ta.scrollTop = 0;
  ta.focus();
  ta.setSelectionRange(0, 0);
}

function closeJsonModal() {
  document.getElementById('json-modal').classList.add('hidden');
}

function downloadJson(text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mitidure-map.json';
  a.click();
  URL.revokeObjectURL(url);
}

function applyJsonText() {
  const raw = document.getElementById('json-text').value;
  try {
    const next = parseMapJson(raw);
    applyWorld(next, 'JSONを適用しました。プレイできます');
    closeJsonModal();
  } catch (err) {
    toast(`JSONを読めません: ${err.message || err}`);
  }
}

function resetExploration() {
  confirmModal('探索状況（位置・マスク・扉の開閉）を開始時点に戻します。マップ自体は消えません。', () => {
    resetPlay(world);
    if (mode === 'play') {
      layerId = world.play.layerId;
      followPlayer();
    }
    refreshAll();
    markDirty();
    toast('探索をリセットしました');
  });
}

document.getElementById('btn-create').onclick = () => setMode('create');
document.getElementById('btn-play').onclick = () => setMode('play');
document.getElementById('btn-exit-play').onclick = () => showBoot();
document.getElementById('btn-title').onclick = () => showBoot();
document.getElementById('boot-create').onclick = () => startCreate();
document.getElementById('boot-play').onclick = () => pickPlayFile();
document.getElementById('boot-file').onchange = (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      startPlayFromText(String(reader.result || ''), file.name);
    } catch (err) {
      toast(`JSONを読めません: ${err.message || err}`);
    }
  };
  reader.readAsText(file, 'utf-8');
};
document.getElementById('boot').addEventListener('dragover', (e) => {
  e.preventDefault();
});
document.getElementById('boot').addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      startPlayFromText(String(reader.result || ''), file.name);
    } catch (err) {
      toast(`JSONを読めません: ${err.message || err}`);
    }
  };
  reader.readAsText(file, 'utf-8');
});
document.getElementById('btn-play-fs').onclick = () => {
  if (document.fullscreenElement) exitBrowserFullscreen();
  else enterBrowserFullscreen();
};
document.getElementById('btn-json').onclick = () => openJsonModal();
document.getElementById('json-cancel').onclick = () => closeJsonModal();
document.getElementById('json-include-play').onchange = () => fillJsonEditor();
document.getElementById('json-download').onclick = () => {
  downloadJson(document.getElementById('json-text').value);
  toast('JSONファイルを保存しました');
};
document.getElementById('json-copy').onclick = async () => {
  const text = document.getElementById('json-text').value;
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました');
  } catch {
    document.getElementById('json-text').select();
    toast('Ctrl+C でコピーしてください');
  }
};
document.getElementById('json-load').onclick = () => document.getElementById('json-file').click();
document.getElementById('json-file').onchange = (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('json-text').value = String(reader.result || '');
    toast(`${file.name} を読み込みました。適用して使うを押してください`);
  };
  reader.readAsText(file, 'utf-8');
};
document.getElementById('json-apply').onclick = () => applyJsonText();
document.getElementById('json-modal').addEventListener('click', (e) => {
  if (e.target.id === 'json-modal') closeJsonModal();
});
document.getElementById('chk-mask-preview').onchange = (e) => {
  maskPreview = e.target.checked;
};
document.getElementById('tool-grid').onclick = (e) => {
  const b = e.target.closest('[data-tool]');
  if (b) setTool(b.dataset.tool);
};
document.getElementById('btn-add-floor').onclick = () => {
  pushUndo();
  const n = world.layers.filter((x) => x.kind === 'floor').length + 1;
  const nl = createLayer({ name: `${n}階`, kind: 'floor', width: layer().width, height: layer().height });
  world.layers.push(nl);
  layerId = nl.id;
  centerCamera();
  refreshAll();
  markDirty();
};
document.getElementById('btn-add-place').onclick = () => {
  pushUndo();
  const n = world.layers.filter((x) => x.kind === 'place').length + 1;
  const nl = createLayer({ name: `場所${n}`, kind: 'place', width: 12, height: 10 });
  world.layers.push(nl);
  layerId = nl.id;
  centerCamera();
  refreshAll();
  markDirty();
};
document.getElementById('btn-reset-play').onclick = () => resetExploration();
document.getElementById('btn-reset-play-hud').onclick = () => resetExploration();
document.getElementById('btn-load-sample').onclick = () => {
  confirmModal('サンプル迷宮に置き換えます。現在のマップは消えます。', () => {
    world = createDefaultWorld();
    layerId = world.start.layerId;
    undoStack = [];
    centerCamera();
    refreshAll();
    markDirty();
    toast('サンプルを読み込みました');
  });
};
document.getElementById('btn-new-map').onclick = () => {
  confirmModal('空のマップを新規作成します。保存済みのデータは上書きされます。', () => {
    world = createEmptyWorld();
    layerId = world.start.layerId;
    undoStack = [];
    centerCamera();
    refreshAll();
    markDirty();
    toast('新規マップを作成しました');
  });
};

canvas.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', onUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', onWheel, { passive: false });
window.addEventListener('resize', resizeCanvas);

const toolKeys = {
  q: 'select',
  e: 'room',
  r: 'door',
  t: 'stairs',
  x: 'erase',
  1: 'select',
  2: 'path',
  3: 'room',
  4: 'door',
  5: 'stairs',
  6: 'spawn',
  7: 'erase',
};

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.getElementById('json-modal').classList.contains('hidden')) {
      closeJsonModal();
      return;
    }
    if (!document.getElementById('modal').classList.contains('hidden')) {
      document.getElementById('modal').classList.add('hidden');
      return;
    }
    if (mode === 'play' && !document.fullscreenElement) {
      showBoot();
      return;
    }
  }
  if (e.target.matches('input, select, textarea')) return;
  if (e.code === 'Space') {
    spaceDown = true;
    e.preventDefault();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (mode === 'create') undo();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (mode === 'create') deleteSelection();
    return;
  }
  if (mode === 'create' && toolKeys[e.key.toLowerCase()]) {
    setTool(toolKeys[e.key.toLowerCase()]);
    return;
  }
  const map = { w: 'n', a: 'w', s: 's', d: 'e', ArrowUp: 'n', ArrowLeft: 'w', ArrowDown: 's', ArrowRight: 'e' };
  if (mode === 'play') {
    const dir = map[e.key] || map[e.key.toLowerCase()];
    if (dir) {
      e.preventDefault();
      if (!e.repeat) {
        tryMove(dir);
        moveCooldown = performance.now() + 220;
      }
      heldMove = dir;
    }
    if ((e.key.toLowerCase() === 'f' || e.code === 'KeyF') && !e.repeat) {
      e.preventDefault();
      interactDoor();
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') spaceDown = false;
  const map = { w: 'n', a: 'w', s: 's', d: 'e', ArrowUp: 'n', ArrowLeft: 'w', ArrowDown: 's', ArrowRight: 'e' };
  const dir = map[e.key] || map[e.key.toLowerCase()];
  if (dir && heldMove === dir) heldMove = null;
});

document.addEventListener('fullscreenchange', () => {
  const btn = document.getElementById('btn-play-fs');
  if (btn) btn.textContent = document.fullscreenElement ? '全画面解除' : '全画面';
  requestAnimationFrame(() => resizeCanvas());
});

window.addEventListener('beforeunload', () => saveWorld(world));

resizeCanvas();
refreshAll();
requestAnimationFrame(tick);
