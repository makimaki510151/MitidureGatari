import {
  CELL,
  CELL_SIZE as CS,
  DIRS,
  DOOR_LOOKS,
  STAIR_STYLES,
  doorInFront,
  getLayer,
  isDoorOpen,
  isSecretDoor,
  isWalkable,
  isRegionRevealed,
  stairsAt,
} from './world.js';

function hash(x, y) {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function worldToScreen(cam, wx, wy, vw, vh) {
  return {
    x: (wx - cam.x) * cam.zoom + vw / 2,
    y: (wy - cam.y) * cam.zoom + vh / 2,
  };
}

export function screenToWorld(cam, sx, sy, vw, vh) {
  return {
    x: (sx - vw / 2) / cam.zoom + cam.x,
    y: (sy - vh / 2) / cam.zoom + cam.y,
  };
}

export function cellAtWorld(wx, wy) {
  return { x: Math.floor(wx / CS), y: Math.floor(wy / CS), fx: wx / CS - Math.floor(wx / CS), fy: wy / CS - Math.floor(wy / CS) };
}

function drawFloor(ctx, x, y, type) {
  const n = hash(x, y);
  const base = type === CELL.ROOM ? [132, 114, 90] : [102, 90, 74];
  const jitter = ((n % 17) - 8);
  ctx.fillStyle = `rgb(${base[0] + jitter}, ${base[1] + jitter}, ${base[2] + jitter})`;
  ctx.fillRect(x * CS, y * CS, CS, CS);

  ctx.strokeStyle = type === CELL.ROOM ? 'rgba(40, 30, 18, 0.28)' : 'rgba(20, 16, 10, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x * CS + 0.5, y * CS + 0.5, CS - 1, CS - 1);

  if (type === CELL.ROOM && n % 5 === 0) {
    ctx.fillStyle = 'rgba(90, 40, 36, 0.18)';
    ctx.fillRect(x * CS + 8, y * CS + 8, CS - 16, CS - 16);
  }
  if (type === CELL.PATH) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x * CS + 6, y * CS + 6, CS - 12, CS - 12);
  }
}

function wallOn(layer, x, y, dir, fogFn) {
  if (!isWalkable(layer, x, y)) return false;
  if (fogFn && !fogFn(x, y)) return false;
  const nx = x + DIRS[dir].x;
  const ny = y + DIRS[dir].y;
  if (isWalkable(layer, nx, ny)) return false;
  return true;
}

function drawWalls(ctx, layer, x, y, fogFn) {
  const px = x * CS;
  const py = y * CS;
  ctx.fillStyle = '#1a1612';
  ctx.strokeStyle = '#3d3428';
  const t = 5;
  if (wallOn(layer, x, y, 'n', fogFn)) ctx.fillRect(px - 1, py - t / 2, CS + 2, t);
  if (wallOn(layer, x, y, 's', fogFn)) ctx.fillRect(px - 1, py + CS - t / 2, CS + 2, t);
  if (wallOn(layer, x, y, 'w', fogFn)) ctx.fillRect(px - t / 2, py - 1, t, CS + 2);
  if (wallOn(layer, x, y, 'e', fogFn)) ctx.fillRect(px + CS - t / 2, py - 1, t, CS + 2);
}

function drawDoor(ctx, door, open, { createMark = false } = {}) {
  const secret = isSecretDoor(door);
  const x = door.x * CS;
  const y = door.y * CS;

  if (secret) {
    if (!open) {
      ctx.fillStyle = '#1a1612';
      const t = 5;
      if (door.side === 'n') ctx.fillRect(x - 1, y - t / 2, CS + 2, t);
      else ctx.fillRect(x - t / 2, y - 1, t, CS + 2);
    }
    if (createMark) {
      ctx.save();
      ctx.fillStyle = 'rgba(212, 180, 131, 0.92)';
      ctx.strokeStyle = '#1a1612';
      ctx.lineWidth = 1;
      const mx = door.side === 'n' ? x + CS / 2 : x;
      const my = door.side === 'n' ? y : y + CS / 2;
      ctx.beginPath();
      ctx.moveTo(mx, my - 5);
      ctx.lineTo(mx + 4, my);
      ctx.lineTo(mx, my + 5);
      ctx.lineTo(mx - 4, my);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  const pal = DOOR_LOOKS[door.appearance] || DOOR_LOOKS.wood;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const drawPlankH = (x0, y0, w, h) => {
    ctx.fillStyle = pal.fill;
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x0, y0, w, h, 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = pal.stroke;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(x0 + 4, y0 + h * 0.33);
    ctx.lineTo(x0 + w - 4, y0 + h * 0.33);
    ctx.moveTo(x0 + 4, y0 + h * 0.66);
    ctx.lineTo(x0 + w - 4, y0 + h * 0.66);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.metal;
    if (door.appearance === 'iron') {
      for (let i = 1; i <= 3; i++) {
        ctx.fillRect(x0 + (w * i) / 4 - 1, y0 + 2, 2, h - 4);
      }
    } else {
      ctx.beginPath();
      ctx.arc(x0 + w * 0.72, y0 + h / 2, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawPlankV = (x0, y0, w, h) => {
    ctx.fillStyle = pal.fill;
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x0, y0, w, h, 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = pal.stroke;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.33, y0 + 4);
    ctx.lineTo(x0 + w * 0.33, y0 + h - 4);
    ctx.moveTo(x0 + w * 0.66, y0 + 4);
    ctx.lineTo(x0 + w * 0.66, y0 + h - 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.metal;
    if (door.appearance === 'iron') {
      for (let i = 1; i <= 3; i++) {
        ctx.fillRect(x0 + 2, y0 + (h * i) / 4 - 1, w - 4, 2);
      }
    } else {
      ctx.beginPath();
      ctx.arc(x0 + w / 2, y0 + h * 0.72, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  if (door.side === 'n') {
    const x0 = x + 6;
    const w = CS - 12;
    if (!open) {
      drawPlankH(x0, y - 4, w, 8);
    } else {
      const hingeX = door.hinge === 'a' ? x + 5 : x + CS - 13;
      const intoSouth = door.swing !== 'n';
      if (intoSouth) drawPlankV(hingeX, y + 1, 8, CS - 10);
      else drawPlankV(hingeX, y - (CS - 10) - 1, 8, CS - 10);
    }
  } else {
    const y0 = y + 6;
    const h = CS - 12;
    if (!open) {
      drawPlankV(x - 4, y0, 8, h);
    } else {
      const hingeY = door.hinge === 'a' ? y + 5 : y + CS - 13;
      const intoEast = door.swing !== 'w';
      if (intoEast) drawPlankH(x + 1, hingeY, CS - 10, 8);
      else drawPlankH(x - (CS - 10) - 1, hingeY, CS - 10, 8);
    }
  }
  ctx.restore();
}

function drawStairs(ctx, st) {
  const x = st.x * CS;
  const y = st.y * CS;
  ctx.save();
  if (st.style === 'portal') {
    ctx.fillStyle = 'rgba(40, 24, 64, 0.85)';
    ctx.beginPath();
    ctx.ellipse(x + CS / 2, y + CS / 2, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4b483';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180, 140, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(x + CS / 2, y + CS / 2, 6, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (st.style === 'ladder') {
    ctx.strokeStyle = '#c4a574';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 6);
    ctx.lineTo(x + 12, y + CS - 6);
    ctx.moveTo(x + CS - 12, y + 6);
    ctx.lineTo(x + CS - 12, y + CS - 6);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      const ly = y + 10 + i * 5;
      ctx.beginPath();
      ctx.moveTo(x + 12, ly);
      ctx.lineTo(x + CS - 12, ly);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#2a241c';
    ctx.strokeStyle = '#d4b483';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x + 6, y + 6, CS - 12, CS - 12);
    ctx.strokeRect(x + 6.5, y + 6.5, CS - 13, CS - 13);
    const up = st.style === 'up';
    ctx.fillStyle = '#7a6d5a';
    for (let i = 0; i < 4; i++) {
      const inset = up ? i * 3.2 : (3 - i) * 3.2;
      ctx.fillRect(x + 10 + inset / 2, y + 11 + i * 5, CS - 20 - inset, 3.5);
    }
    ctx.fillStyle = '#efe7d8';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(up ? '上' : '下', x + CS / 2, y + CS / 2 + 8);
  }
  ctx.restore();
}

function drawSpawn(ctx, x, y) {
  const px = x * CS + CS / 2;
  const py = y * CS + CS / 2;
  ctx.save();
  ctx.fillStyle = '#7a1f1f';
  ctx.beginPath();
  ctx.moveTo(px - 2, py + 10);
  ctx.lineTo(px - 2, py - 10);
  ctx.lineTo(px + 10, py - 6);
  ctx.lineTo(px - 2, py - 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d4b483';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(ctx, x, y, facing) {
  const px = x * CS + CS / 2;
  const py = y * CS + CS / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(212, 180, 131, 0.18)';
  ctx.beginPath();
  ctx.arc(px, py, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#efe7d8';
  ctx.strokeStyle = '#3a2a14';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const d = DIRS[facing] || DIRS.n;
  ctx.fillStyle = '#8a1e1e';
  ctx.beginPath();
  ctx.moveTo(px + d.x * 14, py + d.y * 14);
  ctx.lineTo(px + d.y * 5 - d.x * 2, py - d.x * 5 - d.y * 2);
  ctx.lineTo(px - d.y * 5 - d.x * 2, py + d.x * 5 - d.y * 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function doorVisible(world, layer, door, useFog) {
  if (!useFog) return true;
  const a = { x: door.x, y: door.y };
  const b = door.side === 'n' ? { x: door.x, y: door.y - 1 } : { x: door.x - 1, y: door.y };
  return isRegionRevealed(world, layer, a.x, a.y) || isRegionRevealed(world, layer, b.x, b.y);
}

export function render(ctx, {
  world,
  layerId,
  mode,
  cam,
  vw,
  vh,
  hover,
  selection,
  dragRect,
  useFog,
  pendingLink,
}) {
  const layer = getLayer(world, layerId);
  ctx.save();
  ctx.clearRect(0, 0, vw, vh);
  ctx.fillStyle = mode === 'play' || useFog ? '#070605' : '#14110e';
  ctx.fillRect(0, 0, vw, vh);

  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const fogFn = (useFog || mode === 'play')
    ? (x, y) => isRegionRevealed(world, layer, x, y)
    : null;

  if (!fogFn) {
    ctx.fillStyle = '#1b1713';
    ctx.fillRect(-2, -2, layer.width * CS + 4, layer.height * CS + 4);
  }

  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      const t = layer.cells[y][x];
      if (t === CELL.VOID) continue;
      if (fogFn && !fogFn(x, y)) continue;
      drawFloor(ctx, x, y, t);
    }
  }

  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      if (layer.cells[y][x] === CELL.VOID) continue;
      drawWalls(ctx, layer, x, y, fogFn);
    }
  }

  if (mode === 'create' && !useFog) {
    ctx.strokeStyle = 'rgba(212, 180, 131, 0.08)';
    ctx.lineWidth = 1 / cam.zoom;
    ctx.beginPath();
    for (let x = 0; x <= layer.width; x++) {
      ctx.moveTo(x * CS, 0);
      ctx.lineTo(x * CS, layer.height * CS);
    }
    for (let y = 0; y <= layer.height; y++) {
      ctx.moveTo(0, y * CS);
      ctx.lineTo(layer.width * CS, y * CS);
    }
    ctx.stroke();
  }

  for (const door of layer.doors) {
    if (!doorVisible(world, layer, door, !!fogFn)) continue;
    drawDoor(ctx, door, isDoorOpen(world, door), { createMark: mode === 'create' && !useFog });
  }

  for (const st of layer.stairs) {
    if (fogFn && !fogFn(st.x, st.y)) continue;
    drawStairs(ctx, st);
  }

  if (mode === 'create' && world.start.layerId === layer.id) {
    drawSpawn(ctx, world.start.x, world.start.y);
  }

  if (hover && hover.x >= 0 && hover.y >= 0 && hover.x < layer.width && hover.y < layer.height) {
    ctx.strokeStyle = 'rgba(212, 180, 131, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hover.x * CS + 1, hover.y * CS + 1, CS - 2, CS - 2);
  }

  if (dragRect) {
    const x = Math.min(dragRect.x0, dragRect.x1);
    const y = Math.min(dragRect.y0, dragRect.y1);
    const w = Math.abs(dragRect.x1 - dragRect.x0) + 1;
    const h = Math.abs(dragRect.y1 - dragRect.y0) + 1;
    ctx.fillStyle = 'rgba(212, 180, 131, 0.16)';
    ctx.fillRect(x * CS, y * CS, w * CS, h * CS);
    ctx.strokeStyle = '#d4b483';
    ctx.strokeRect(x * CS + 0.5, y * CS + 0.5, w * CS - 1, h * CS - 1);
  }

  if (selection) {
    ctx.strokeStyle = '#efe7d8';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    if (selection.type === 'stairs') {
      ctx.strokeRect(selection.x * CS + 3, selection.y * CS + 3, CS - 6, CS - 6);
    } else if (selection.type === 'door') {
      const d = selection.door;
      if (d.side === 'n') ctx.strokeRect(d.x * CS + 2, d.y * CS - 7, CS - 4, 14);
      else ctx.strokeRect(d.x * CS - 7, d.y * CS + 2, 14, CS - 4);
    }
    ctx.setLineDash([]);
  }

  if (pendingLink) {
    ctx.fillStyle = 'rgba(212, 180, 131, 0.12)';
    ctx.fillRect(0, 0, layer.width * CS, layer.height * CS);
  }

  if (mode === 'play' && world.play.layerId === layer.id) {
    drawPlayer(ctx, world.play.x, world.play.y, world.play.facing);
    const faceDoor = doorInFront(layer, world.play.x, world.play.y, world.play.facing);
    if (faceDoor && (!isSecretDoor(faceDoor) || isDoorOpen(world, faceDoor))) {
      ctx.save();
      ctx.fillStyle = 'rgba(16, 14, 12, 0.86)';
      ctx.strokeStyle = '#d4b483';
      ctx.lineWidth = 1.2;
      const px = world.play.x * CS + CS / 2;
      const py = world.play.y * CS - 6;
      roundRect(ctx, px - 16, py - 14, 32, 16, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d4b483';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('F 開閉', px, py - 6);
      ctx.restore();
    }
  }

  ctx.restore();
}

export { CS, STAIR_STYLES };
