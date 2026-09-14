export const STORAGE_KEY = 'mitidure-gatari-dungeon-v1';
export const CELL = { VOID: 0, PATH: 1, ROOM: 2 };
export const CELL_SIZE = 40;

export const DIRS = {
  n: { x: 0, y: -1, opp: 's', label: '北' },
  e: { x: 1, y: 0, opp: 'w', label: '東' },
  s: { x: 0, y: 1, opp: 'n', label: '南' },
  w: { x: -1, y: 0, opp: 'e', label: '西' },
};

export const DOOR_LOOKS = {
  wood: { name: '木の扉', fill: '#6b3e26', stroke: '#31190f', metal: '#c4a574' },
  iron: { name: '鉄格子', fill: '#2f333a', stroke: '#121416', metal: '#b7bec6' },
  stone: { name: '石の扉', fill: '#6d6a64', stroke: '#3a3834', metal: '#9c9890' },
  ornate: { name: '装飾扉', fill: '#5a1818', stroke: '#2a0b0b', metal: '#d4b483' },
  steel: { name: '鋼鉄扉', fill: '#6d7884', stroke: '#262c32', metal: '#e4eaf0' },
  worn: { name: '古びた扉', fill: '#5a4a36', stroke: '#2a2218', metal: '#8a7a62' },
  sweep: { name: '振れ扉', fill: '#4a3d28', stroke: '#1c1610', metal: '#d4b483' },
  secret: { name: '隠し扉（壁）', fill: '#1a1612', stroke: '#1a1612', metal: '#3d3428' },
};

export function isSecretDoor(door) {
  return !!door && (door.appearance === 'secret' || door.hidden === true);
}

export function isSweepDoor(door) {
  return !!door && door.appearance === 'sweep' && !isSecretDoor(door);
}

export const STAIR_STYLES = {
  up: { name: '上り階段', mark: '上' },
  down: { name: '下り階段', mark: '下' },
  ladder: { name: 'はしご', mark: '梯子' },
  portal: { name: '転移門', mark: '門' },
};

export function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function blankCells(w, h, fill = 0) {
  return Array.from({ length: h }, () => Array(w).fill(fill));
}

export function inBounds(layer, x, y) {
  return x >= 0 && y >= 0 && x < layer.width && y < layer.height;
}

export function isWalkable(layer, x, y) {
  if (!inBounds(layer, x, y)) return false;
  const t = layer.cells[y][x];
  return t === CELL.PATH || t === CELL.ROOM;
}

export function createLayer({ id, name, kind = 'floor', width = 16, height = 12, cells } = {}) {
  return {
    id: id || uid('L'),
    name: name || '1階',
    kind,
    width,
    height,
    cells: cells || blankCells(width, height),
    doors: [],
    stairs: [],
    marks: [],
  };
}

export function freshPlay(layerId, x, y) {
  return {
    layerId,
    x,
    y,
    facing: 'n',
    revealed: {},
    doorsOpen: {},
    doorNumsFlipped: {},
    ignoreStairs: false,
  };
}

export function parseDoorNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(999, Math.floor(n));
}

export function doorNum(door) {
  return parseDoorNum(door?.num);
}

export function countDoorsWithNum(world, num) {
  const n = parseDoorNum(num);
  if (n === null) return 0;
  let c = 0;
  for (const layer of world.layers) {
    for (const d of layer.doors) {
      if (doorNum(d) === n) c++;
    }
  }
  return c;
}

export function fillRect(layer, x, y, w, h, type) {
  let x0 = w >= 0 ? x : x + w + 1;
  let y0 = h >= 0 ? y : y + h + 1;
  let x1 = w >= 0 ? x + w - 1 : x;
  let y1 = h >= 0 ? y + h - 1 : y;
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(layer.width - 1, x1);
  y1 = Math.min(layer.height - 1, y1);
  if (x1 < x0 || y1 < y0) return;
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) layer.cells[iy][ix] = type;
  }
}

export function getLayer(world, id) {
  return world.layers.find((l) => l.id === id) || world.layers[0];
}

export function currentLayer(world, layerId) {
  return getLayer(world, layerId);
}

function normalizeEdge(x, y, side) {
  if (side === 's') return { x, y: y + 1, side: 'n' };
  if (side === 'e') return { x: x + 1, y, side: 'w' };
  return { x, y, side };
}

export function doorKey(door) {
  return `${door.x},${door.y},${door.side}`;
}

export function findDoor(layer, x, y, side) {
  const n = normalizeEdge(x, y, side);
  return layer.doors.find((d) => d.x === n.x && d.y === n.y && d.side === n.side) || null;
}

function edgeFromCells(x1, y1, x2, y2) {
  if (x2 === x1 && y2 === y1 - 1) return normalizeEdge(x1, y1, 'n');
  if (x2 === x1 && y2 === y1 + 1) return normalizeEdge(x1, y1, 's');
  if (x2 === x1 - 1 && y2 === y1) return normalizeEdge(x1, y1, 'w');
  if (x2 === x1 + 1 && y2 === y1) return normalizeEdge(x1, y1, 'e');
  return null;
}

export function storedDoorBetween(layer, x1, y1, x2, y2) {
  const edge = edgeFromCells(x1, y1, x2, y2);
  if (!edge) return null;
  return findDoor(layer, edge.x, edge.y, edge.side);
}

/** The perpendicular edge a sweep door occupies while open (canonical n/w). */
export function sweepBlockEdge(door) {
  if (!isSweepDoor(door)) return null;
  const { x, y, side } = door;
  const swing = door.swing || (side === 'n' ? 's' : 'e');
  const hinge = door.hinge || 'a';
  if (side === 'n') {
    if (swing !== 'n') {
      return hinge === 'a' ? { x, y, side: 'w' } : { x: x + 1, y, side: 'w' };
    }
    return hinge === 'a' ? { x, y: y - 1, side: 'w' } : { x: x + 1, y: y - 1, side: 'w' };
  }
  if (side === 'w') {
    if (swing !== 'w') {
      return hinge === 'a' ? { x, y, side: 'n' } : { x, y: y + 1, side: 'n' };
    }
    return hinge === 'a' ? { x: x - 1, y, side: 'n' } : { x: x - 1, y: y + 1, side: 'n' };
  }
  return null;
}

function findOpenSweepBlocking(world, layer, edge) {
  if (!world || !edge) return null;
  for (const door of layer.doors) {
    if (!isSweepDoor(door) || !isDoorOpen(world, door)) continue;
    const block = sweepBlockEdge(door);
    if (block && block.x === edge.x && block.y === edge.y && block.side === edge.side) return door;
  }
  return null;
}

export function getDoorBetween(layer, x1, y1, x2, y2, world) {
  const stored = storedDoorBetween(layer, x1, y1, x2, y2);
  if (stored) return stored;
  return findOpenSweepBlocking(world, layer, edgeFromCells(x1, y1, x2, y2));
}

export function placeDoor(layer, x, y, side, extras = {}) {
  const n = normalizeEdge(x, y, side);
  if (n.side === 'n' && (n.y <= 0 || n.y >= layer.height)) return null;
  if (n.side === 'w' && (n.x <= 0 || n.x >= layer.width)) return null;
  const a = { x: n.x, y: n.y };
  const b = n.side === 'n' ? { x: n.x, y: n.y - 1 } : { x: n.x - 1, y: n.y };
  if (!isWalkable(layer, a.x, a.y) || !isWalkable(layer, b.x, b.y)) return null;
  layer.doors = layer.doors.filter((d) => !(d.x === n.x && d.y === n.y && d.side === n.side));
  const swing = extras.swing || (n.side === 'n' ? 's' : 'e');
  const door = {
    id: extras.id || uid('D'),
    x: n.x,
    y: n.y,
    side: n.side,
    appearance: extras.appearance || 'wood',
    swing,
    hinge: extras.hinge || 'a',
    defaultOpen: extras.defaultOpen || false,
    hidden: extras.hidden === true || extras.appearance === 'secret',
  };
  const num = parseDoorNum(extras.num);
  if (num !== null) door.num = num;
  layer.doors.push(door);
  return door;
}

export function parseGlyph(value) {
  const s = String(value ?? '').replace(/\s/g, '');
  if (!s) return '';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const it = new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(s)[Symbol.iterator]();
    const first = it.next().value;
    return first ? first.segment : '';
  }
  return [...s][0] || '';
}

export function markAt(layer, x, y) {
  if (!Array.isArray(layer.marks)) return null;
  return layer.marks.find((m) => m.x === x && m.y === y) || null;
}

export function setMark(layer, x, y, ch) {
  if (!inBounds(layer, x, y)) return null;
  layer.marks = Array.isArray(layer.marks) ? layer.marks.filter((m) => !(m.x === x && m.y === y)) : [];
  const text = parseGlyph(ch);
  if (!text) return null;
  const mark = { x, y, ch: text };
  layer.marks.push(mark);
  return mark;
}

export function stairsAt(layer, x, y) {
  return layer.stairs.find((s) => s.x === x && s.y === y) || null;
}

export function placeStairs(layer, x, y, extras = {}) {
  if (!isWalkable(layer, x, y)) return null;
  layer.stairs = layer.stairs.filter((s) => !(s.x === x && s.y === y));
  const st = {
    id: extras.id || uid('S'),
    x,
    y,
    style: extras.style || 'up',
    targetLayerId: extras.targetLayerId || null,
    targetX: extras.targetX ?? x,
    targetY: extras.targetY ?? y,
  };
  layer.stairs.push(st);
  return st;
}

export function edgeKey(x1, y1, x2, y2) {
  if (y2 < y1 || (y2 === y1 && x2 < x1)) return `${x2},${y2}|${x1},${y1}`;
  return `${x1},${y1}|${x2},${y2}`;
}

export function doorEdgeSet(layer) {
  const set = new Set();
  for (const d of layer.doors) {
    const b = d.side === 'n' ? { x: d.x, y: d.y - 1 } : { x: d.x - 1, y: d.y };
    set.add(edgeKey(d.x, d.y, b.x, b.y));
  }
  return set;
}

export function bakeRegions(layer) {
  const w = layer.width;
  const h = layer.height;
  const at = Array.from({ length: h }, () => Array(w).fill(null));
  const blocked = doorEdgeSet(layer);
  const seen = Array.from({ length: h }, () => Array(w).fill(false));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y][x] || !isWalkable(layer, x, y)) continue;
      const type = layer.cells[y][x];
      const cells = [];
      const stack = [[x, y]];
      seen[y][x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push({ x: cx, y: cy });
        for (const dir of Object.values(DIRS)) {
          const nx = cx + dir.x;
          const ny = cy + dir.y;
          if (!inBounds(layer, nx, ny) || seen[ny][nx]) continue;
          if (layer.cells[ny][nx] !== type) continue;
          if (blocked.has(edgeKey(cx, cy, nx, ny))) continue;
          seen[ny][nx] = true;
          stack.push([nx, ny]);
        }
      }
      let min = cells[0];
      for (const c of cells) {
        if (c.y < min.y || (c.y === min.y && c.x < min.x)) min = c;
      }
      const kind = type === CELL.ROOM ? 'room' : 'path';
      const id = `${kind}:${min.x},${min.y}`;
      for (const c of cells) at[c.y][c.x] = id;
    }
  }
  layer._regionAt = at;
  return at;
}

export function regionAt(layer, x, y) {
  if (!layer._regionAt) bakeRegions(layer);
  if (!inBounds(layer, x, y)) return null;
  return layer._regionAt[y][x];
}

export function revealAt(world, layer, x, y) {
  const rid = regionAt(layer, x, y);
  if (!rid) return false;
  const list = world.play.revealed[layer.id] || (world.play.revealed[layer.id] = []);
  if (!list.includes(rid)) {
    list.push(rid);
    return true;
  }
  return false;
}

export function isRegionRevealed(world, layer, x, y) {
  const rid = regionAt(layer, x, y);
  if (!rid) return false;
  return (world.play.revealed[layer.id] || []).includes(rid);
}

export function isDoorOpen(world, door) {
  const n = doorNum(door);
  if (n !== null) {
    const flipped = !!(world.play.doorNumsFlipped && world.play.doorNumsFlipped[n]);
    return flipped ? !door.defaultOpen : !!door.defaultOpen;
  }
  if (world.play.doorsOpen[door.id] !== undefined) return !!world.play.doorsOpen[door.id];
  return !!door.defaultOpen;
}

export function setDoorOpen(world, door, open) {
  const n = doorNum(door);
  if (n !== null) {
    if (!world.play.doorNumsFlipped) world.play.doorNumsFlipped = {};
    world.play.doorNumsFlipped[n] = !!open !== !!door.defaultOpen;
    return;
  }
  world.play.doorsOpen[door.id] = open;
}

export function canWalk(world, layer, x, y, dir) {
  const nx = x + DIRS[dir].x;
  const ny = y + DIRS[dir].y;
  if (!isWalkable(layer, nx, ny)) return false;
  const stored = storedDoorBetween(layer, x, y, nx, ny);
  if (stored && !isDoorOpen(world, stored)) return false;
  if (findOpenSweepBlocking(world, layer, edgeFromCells(x, y, nx, ny))) return false;
  return true;
}

export function doorInFront(layer, x, y, facing, world) {
  const d = DIRS[facing];
  return getDoorBetween(layer, x, y, x + d.x, y + d.y, world);
}

export function resizeLayer(layer, width, height) {
  const w = Math.max(4, Math.min(48, width | 0));
  const h = Math.max(4, Math.min(48, height | 0));
  const next = blankCells(w, h);
  for (let y = 0; y < Math.min(h, layer.height); y++) {
    for (let x = 0; x < Math.min(w, layer.width); x++) next[y][x] = layer.cells[y][x];
  }
  layer.cells = next;
  layer.width = w;
  layer.height = h;
  layer.doors = layer.doors.filter((d) => {
    if (d.side === 'n') return d.x >= 0 && d.x < w && d.y > 0 && d.y < h;
    return d.x > 0 && d.x < w && d.y >= 0 && d.y < h;
  });
  layer.stairs = layer.stairs.filter((s) => s.x >= 0 && s.y >= 0 && s.x < w && s.y < h);
  layer.marks = (layer.marks || []).filter((m) => m.x >= 0 && m.y >= 0 && m.x < w && m.y < h);
}

export function eraseCell(layer, x, y) {
  if (!inBounds(layer, x, y)) return;
  layer.cells[y][x] = CELL.VOID;
  layer.stairs = layer.stairs.filter((s) => !(s.x === x && s.y === y));
  layer.marks = (layer.marks || []).filter((m) => !(m.x === x && m.y === y));
  layer.doors = layer.doors.filter((d) => {
    if (d.x === x && d.y === y) return false;
    if (d.side === 'n' && d.x === x && d.y === y + 1) return false;
    if (d.side === 'w' && d.y === y && d.x === x + 1) return false;
    return true;
  });
}

export function nearestEdge(fx, fy) {
  const dist = { n: fy, s: 1 - fy, w: fx, e: 1 - fx };
  return Object.entries(dist).sort((a, b) => a[1] - b[1])[0][0];
}

export function bakeWorld(world) {
  for (const layer of world.layers) bakeRegions(layer);
}

export function ensurePlay(world) {
  if (!world.play) {
    world.play = freshPlay(world.start.layerId, world.start.x, world.start.y);
  }
  const layer = getLayer(world, world.play.layerId);
  if (!layer || !isWalkable(layer, world.play.x, world.play.y)) {
    const startL = getLayer(world, world.start.layerId);
    world.play.layerId = startL.id;
    world.play.x = world.start.x;
    world.play.y = world.start.y;
    world.play.facing = 'n';
    world.play.ignoreStairs = false;
  }
  const here = getLayer(world, world.play.layerId);
  bakeRegions(here);
  if (!isWalkable(here, world.play.x, world.play.y)) {
    const spawn = findFirstWalkable(here);
    if (spawn) {
      world.play.x = spawn.x;
      world.play.y = spawn.y;
    }
  }
  revealAt(world, here, world.play.x, world.play.y);
}

export function findFirstWalkable(layer) {
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      if (isWalkable(layer, x, y)) return { x, y };
    }
  }
  return null;
}

export function resetPlay(world) {
  world.play = freshPlay(world.start.layerId, world.start.x, world.start.y);
  ensurePlay(world);
}

export function createEmptyWorld() {
  const layer = createLayer({ id: 'L1F', name: '1階', kind: 'floor', width: 16, height: 12 });
  fillRect(layer, 6, 8, 4, 3, CELL.ROOM);
  const world = {
    version: 1,
    layers: [layer],
    start: { layerId: layer.id, x: 7, y: 9 },
    play: freshPlay(layer.id, 7, 9),
  };
  bakeWorld(world);
  ensurePlay(world);
  return world;
}

export function createDefaultWorld() {
  const f1 = createLayer({ id: 'L1F', name: '1階', kind: 'floor', width: 20, height: 16 });
  fillRect(f1, 7, 12, 6, 3, CELL.ROOM);
  f1.cells[9][9] = CELL.PATH;
  f1.cells[10][9] = CELL.PATH;
  f1.cells[11][9] = CELL.PATH;
  fillRect(f1, 5, 4, 10, 5, CELL.ROOM);
  f1.cells[6][3] = CELL.PATH;
  f1.cells[6][4] = CELL.PATH;
  fillRect(f1, 0, 5, 3, 3, CELL.ROOM);
  f1.cells[6][15] = CELL.PATH;
  f1.cells[6][16] = CELL.PATH;
  fillRect(f1, 17, 5, 3, 3, CELL.ROOM);
  f1.cells[2][9] = CELL.PATH;
  f1.cells[3][9] = CELL.PATH;
  fillRect(f1, 8, 0, 3, 2, CELL.ROOM);
  f1.cells[9][10] = CELL.PATH;
  f1.cells[10][10] = CELL.PATH;
  fillRect(f1, 11, 9, 3, 3, CELL.ROOM);

  setMark(f1, 9, 13, '1');
  setMark(f1, 9, 6, '2');
  setMark(f1, 1, 6, '3');
  setMark(f1, 18, 6, '4');
  setMark(f1, 9, 0, '5');
  setMark(f1, 12, 10, '6');

  placeDoor(f1, 9, 12, 'n', { id: 'D-ent', appearance: 'wood', swing: 's', hinge: 'a', num: 1 });
  placeDoor(f1, 3, 6, 'w', { id: 'D-west', appearance: 'iron', swing: 'w', hinge: 'a', num: 1, defaultOpen: true });
  placeDoor(f1, 17, 6, 'w', { id: 'D-east', appearance: 'ornate', swing: 'e', hinge: 'b' });
  placeDoor(f1, 9, 2, 'n', { id: 'D-north', appearance: 'secret', swing: 'n', hinge: 'a', hidden: true });
  placeDoor(f1, 10, 10, 'w', { id: 'D-sweep', appearance: 'sweep', swing: 'e', hinge: 'a' });

  const f2 = createLayer({ id: 'L2F', name: '2階', kind: 'floor', width: 16, height: 12 });
  fillRect(f2, 2, 2, 8, 7, CELL.ROOM);
  f2.cells[5][10] = CELL.PATH;
  fillRect(f2, 11, 3, 4, 5, CELL.ROOM);
  setMark(f2, 5, 5, '7');
  setMark(f2, 12, 5, '8');

  const cave = createLayer({ id: 'LCave', name: '地下祭壇', kind: 'place', width: 10, height: 10 });
  fillRect(cave, 2, 3, 6, 6, CELL.ROOM);
  cave.cells[2][4] = CELL.PATH;
  fillRect(cave, 3, 0, 3, 2, CELL.ROOM);
  setMark(cave, 4, 6, '9');
  placeDoor(cave, 4, 3, 'n', { id: 'D-cave', appearance: 'worn', swing: 's', hinge: 'a' });

  placeStairs(f1, 6, 5, {
    id: 'S-up',
    style: 'up',
    targetLayerId: f2.id,
    targetX: 3,
    targetY: 3,
  });
  placeStairs(f2, 3, 3, {
    id: 'S-down',
    style: 'down',
    targetLayerId: f1.id,
    targetX: 6,
    targetY: 5,
  });
  placeDoor(f2, 11, 5, 'w', { id: 'D-vault', appearance: 'steel', swing: 'e', hinge: 'a', num: 1 });
  placeStairs(f2, 8, 7, {
    id: 'S-portal',
    style: 'portal',
    targetLayerId: cave.id,
    targetX: 4,
    targetY: 5,
  });
  placeStairs(cave, 4, 5, {
    id: 'S-portal-back',
    style: 'portal',
    targetLayerId: f2.id,
    targetX: 8,
    targetY: 7,
  });

  const world = {
    version: 1,
    layers: [f1, f2, cave],
    start: { layerId: f1.id, x: 9, y: 13 },
    play: freshPlay(f1.id, 9, 13),
  };
  bakeWorld(world);
  ensurePlay(world);
  return world;
}

export function cloneWorld(world) {
  return JSON.parse(JSON.stringify(world, (k, v) => (k.startsWith('_') ? undefined : v)));
}

export function exportMapData(world, { includePlay = false } = {}) {
  const data = cloneWorld(world);
  data.version = 1;
  if (!includePlay) delete data.play;
  return data;
}

export function exportMapJson(world, { includePlay = false } = {}) {
  return JSON.stringify(exportMapData(world, { includePlay }), null, 2);
}

export function normalizeWorld(data) {
  if (!data || !Array.isArray(data.layers) || !data.layers.length) {
    throw new Error('layers がありません');
  }
  const world = cloneWorld(data);
  world.version = 1;
  for (const layer of world.layers) {
    layer.id = layer.id || uid('L');
    layer.width = Math.max(4, Math.min(48, layer.width | 0));
    layer.height = Math.max(4, Math.min(48, layer.height | 0));
    layer.kind = layer.kind === 'place' ? 'place' : 'floor';
    layer.name = layer.name || '無名';
    if (!Array.isArray(layer.cells) || layer.cells.length !== layer.height) {
      layer.cells = blankCells(layer.width, layer.height);
    } else {
      layer.cells = layer.cells.map((row) => {
        const next = Array.isArray(row) ? row.slice(0, layer.width) : [];
        while (next.length < layer.width) next.push(CELL.VOID);
        return next.map((v) => (v === CELL.PATH || v === CELL.ROOM ? v : CELL.VOID));
      });
    }
    layer.doors = Array.isArray(layer.doors) ? layer.doors : [];
    for (const d of layer.doors) {
      d.id = d.id || uid('D');
      d.hidden = d.hidden === true || d.appearance === 'secret';
      if (d.hidden && !d.appearance) d.appearance = 'secret';
      d.num = parseDoorNum(d.num);
    }
    layer.stairs = Array.isArray(layer.stairs) ? layer.stairs : [];
    const rawMarks = Array.isArray(layer.marks) ? layer.marks : [];
    const seen = new Set();
    layer.marks = [];
    for (const m of rawMarks) {
      const x = m.x | 0;
      const y = m.y | 0;
      const ch = parseGlyph(m.ch);
      const key = `${x},${y}`;
      if (!ch || seen.has(key) || x < 0 || y < 0 || x >= layer.width || y >= layer.height) continue;
      seen.add(key);
      layer.marks.push({ x, y, ch });
    }
  }
  const startLayer = getLayer(world, world.start?.layerId) || world.layers[0];
  world.start = {
    layerId: startLayer.id,
    x: world.start?.x | 0,
    y: world.start?.y | 0,
  };
  if (!world.play) world.play = freshPlay(world.start.layerId, world.start.x, world.start.y);
  else {
    world.play.revealed = world.play.revealed || {};
    world.play.doorsOpen = world.play.doorsOpen || {};
    world.play.doorNumsFlipped = world.play.doorNumsFlipped || {};
  }
  bakeWorld(world);
  ensurePlay(world);
  return world;
}

export function parseMapJson(text) {
  const data = JSON.parse(text);
  return normalizeWorld(data);
}

export function saveWorld(world) {
  const data = cloneWorld(world);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadWorld() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultWorld();
    return normalizeWorld(JSON.parse(raw));
  } catch {
    return createDefaultWorld();
  }
}

export function clearSave() {
  localStorage.removeItem(STORAGE_KEY);
}
