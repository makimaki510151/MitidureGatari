import {
  CELL,
  CELL_SIZE as CS,
  DIRS,
  DOOR_LOOKS,
  STAIR_STYLES,
  cellHasObjectKind,
  doorInFront,
  doorNum,
  getLayer,
  isDoorOpen,
  isSecretDoor,
  isSweepDoor,
  isWalkable,
  isRegionRevealed,
  objectZ,
  revealedCellBounds,
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

function drawDoorNum(ctx, door) {
  const n = doorNum(door);
  if (n === null) return;
  const x = door.x * CS;
  const y = door.y * CS;
  const mx = door.side === 'n' ? x + CS / 2 : x;
  const my = door.side === 'n' ? y : y + CS / 2;
  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(16, 14, 12, 0.9)';
  ctx.fillStyle = '#efe7d8';
  const label = String(n);
  const ty = my + 7;
  ctx.strokeText(label, mx, ty);
  ctx.fillText(label, mx, ty);
  ctx.restore();
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
      const mx = door.side === 'n' ? x + CS / 2 : x;
      const my = door.side === 'n' ? y : y + CS / 2;
      ctx.fillStyle = '#d4b483';
      ctx.strokeStyle = '#efe7d8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx, my - 8);
      ctx.lineTo(mx + 7, my);
      ctx.lineTo(mx, my + 8);
      ctx.lineTo(mx - 7, my);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#efe7d8';
      ctx.fillText('隠', mx, my - 10);
      ctx.restore();
    }
    if (createMark || open) drawDoorNum(ctx, door);
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
    if (door.appearance === 'sweep') {
      ctx.strokeStyle = pal.metal;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x0 + w * 0.2, y0 + 1.5);
      ctx.lineTo(x0 + w * 0.8, y0 + h - 1.5);
      ctx.stroke();
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
    if (door.appearance === 'sweep') {
      ctx.strokeStyle = pal.metal;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x0 + 1.5, y0 + h * 0.2);
      ctx.lineTo(x0 + w - 1.5, y0 + h * 0.8);
      ctx.stroke();
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

  if (createMark && isSweepDoor(door)) {
    const mx = door.side === 'n' ? x + CS / 2 : x;
    const my = door.side === 'n' ? y : y + CS / 2;
    ctx.save();
    ctx.fillStyle = '#c9a44a';
    ctx.strokeStyle = '#efe7d8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(mx, my - 8);
    ctx.lineTo(mx + 7, my);
    ctx.lineTo(mx, my + 8);
    ctx.lineTo(mx - 7, my);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#efe7d8';
    ctx.fillText('振', mx, my - 10);
    ctx.restore();
  }
  drawDoorNum(ctx, door);
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

function drawMark(ctx, mark) {
  const x = mark.x * CS + CS / 2;
  const y = mark.y * CS + CS / 2;
  ctx.save();
  ctx.font = 'bold 18px "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(16, 14, 12, 0.8)';
  ctx.fillStyle = '#efe7d8';
  ctx.strokeText(mark.ch, x, y);
  ctx.fillText(mark.ch, x, y);
  ctx.restore();
}

function drawHole(ctx, x, y) {
  const px = x * CS;
  const py = y * CS;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 6, 4, 0.92)';
  ctx.fillRect(px + 2, py + 2, CS - 4, CS - 4);
  ctx.fillStyle = '#050403';
  ctx.beginPath();
  ctx.ellipse(px + CS / 2, py + CS / 2 + 1, 14, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#110c08';
  ctx.beginPath();
  ctx.ellipse(px + CS / 2 + 1, py + CS / 2 + 4, 8, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(212, 180, 131, 0.18)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(px + CS / 2, py + CS / 2, 14.5, 13.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function bridgeAxis(obj, x, y) {
  const has = (dx, dy) => obj.cells.some((c) => c.x === x + dx && c.y === y + dy);
  const ns = has(0, -1) || has(0, 1);
  const ew = has(-1, 0) || has(1, 0);
  if (ns && !ew) return 'ns';
  if (ew && !ns) return 'ew';
  return 'ns';
}

function drawBridge(ctx, obj, x, y) {
  const px = x * CS;
  const py = y * CS;
  const axis = bridgeAxis(obj, x, y);
  ctx.save();
  ctx.fillStyle = '#3a2a1c';
  if (axis === 'ns') ctx.fillRect(px + 7, py + 1, CS - 14, CS - 2);
  else ctx.fillRect(px + 1, py + 7, CS - 2, CS - 14);
  ctx.strokeStyle = '#2a1c12';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#8a6a48';
  if (axis === 'ns') {
    for (let i = 0; i < 4; i++) {
      const by = py + 3 + i * 9;
      roundRect(ctx, px + 8, by, CS - 16, 7, 1.5);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const bx = px + 3 + i * 9;
      roundRect(ctx, bx, py + 8, 7, CS - 16, 1.5);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawObjects(ctx, layer, fogFn) {
  const objects = [...(layer.objects || [])].sort((a, b) => {
    const z = objectZ(a) - objectZ(b);
    return z !== 0 ? z : 0;
  });
  for (const obj of objects) {
    if (obj.kind !== 'hole') continue;
    for (const c of obj.cells) {
      if (!isWalkable(layer, c.x, c.y)) continue;
      if (fogFn && !fogFn(c.x, c.y)) continue;
      drawHole(ctx, c.x, c.y);
    }
  }
  for (const obj of objects) {
    if (obj.kind !== 'bridge') continue;
    for (const c of obj.cells) {
      if (!isWalkable(layer, c.x, c.y)) continue;
      if (fogFn && !fogFn(c.x, c.y)) continue;
      drawBridge(ctx, obj, c.x, c.y);
    }
  }
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
  objectPaint,
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

  drawObjects(ctx, layer, fogFn);

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

  for (const mark of layer.marks || []) {
    if (fogFn && !fogFn(mark.x, mark.y)) continue;
    if (layer.cells[mark.y]?.[mark.x] === CELL.VOID) continue;
    drawMark(ctx, mark);
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
    const hole = dragRect.fill === 'hole';
    const bridge = dragRect.fill === 'bridge';
    ctx.fillStyle = hole
      ? 'rgba(20, 10, 6, 0.45)'
      : bridge
        ? 'rgba(138, 106, 72, 0.35)'
        : 'rgba(212, 180, 131, 0.16)';
    ctx.fillRect(x * CS, y * CS, w * CS, h * CS);
    ctx.strokeStyle = hole ? '#6a4030' : bridge ? '#c4a574' : '#d4b483';
    ctx.strokeRect(x * CS + 0.5, y * CS + 0.5, w * CS - 1, h * CS - 1);
  }

  if (objectPaint?.cells?.length) {
    const hole = objectPaint.kind === 'hole';
    ctx.fillStyle = hole ? 'rgba(20, 10, 6, 0.5)' : 'rgba(138, 106, 72, 0.4)';
    ctx.strokeStyle = hole ? '#6a4030' : '#c4a574';
    for (const c of objectPaint.cells) {
      ctx.fillRect(c.x * CS, c.y * CS, CS, CS);
      ctx.strokeRect(c.x * CS + 0.5, c.y * CS + 0.5, CS - 1, CS - 1);
    }
  }

  if (selection) {
    ctx.strokeStyle = '#efe7d8';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    if (selection.type === 'stairs') {
      ctx.strokeRect(selection.x * CS + 3, selection.y * CS + 3, CS - 6, CS - 6);
    } else if (selection.type === 'mark') {
      ctx.strokeRect(selection.x * CS + 3, selection.y * CS + 3, CS - 6, CS - 6);
    } else if (selection.type === 'object') {
      for (const c of selection.object.cells || []) {
        ctx.strokeRect(c.x * CS + 3, c.y * CS + 3, CS - 6, CS - 6);
      }
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
    const faceDoor = doorInFront(layer, world.play.x, world.play.y, world.play.facing, world);
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

export function minimapBoxSize(vw, vh) {
  return Math.round(Math.max(128, Math.min(208, vw * 0.24, vh * 0.34)));
}

export function drawMinimap(ctx, { world, layer, play, cam, vw, vh, size }) {
  const s = size | 0;
  if (!ctx || s < 24 || !layer) return;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(10, 8, 6, 0.92)';
  ctx.fillRect(0, 0, s, s);

  const bounds = revealedCellBounds(world, layer);
  if (!bounds) {
    ctx.fillStyle = 'rgba(239, 231, 216, 0.4)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('未探索', s / 2, s / 2);
    return;
  }

  const pad = 8;
  const inner = s - pad * 2;
  const cols = bounds.maxX - bounds.minX + 1;
  const rows = bounds.maxY - bounds.minY + 1;
  const cell = Math.max(2, Math.min(14, inner / Math.max(cols, rows)));
  const mapW = cols * cell;
  const mapH = rows * cell;
  const ox = (s - mapW) / 2;
  const oy = (s - mapH) / 2;
  const px = (x) => ox + (x - bounds.minX) * cell;
  const py = (y) => oy + (y - bounds.minY) * cell;
  const revealed = (x, y) => isWalkable(layer, x, y) && isRegionRevealed(world, layer, x, y);

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (!revealed(x, y)) continue;
      const room = layer.cells[y][x] === CELL.ROOM;
      const hole = cellHasObjectKind(layer, x, y, 'hole') && !cellHasObjectKind(layer, x, y, 'bridge');
      ctx.fillStyle = hole
        ? '#1a100c'
        : room
          ? '#7d6b54'
          : '#5a4e40';
      ctx.fillRect(px(x), py(y), cell + 0.4, cell + 0.4);
      if (cellHasObjectKind(layer, x, y, 'bridge')) {
        ctx.fillStyle = 'rgba(196, 165, 116, 0.45)';
        ctx.fillRect(px(x) + cell * 0.18, py(y) + cell * 0.38, cell * 0.64, cell * 0.24);
      }
    }
  }

  ctx.strokeStyle = '#2a241c';
  ctx.lineWidth = Math.max(1, cell * 0.14);
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (!revealed(x, y)) continue;
      const x0 = px(x);
      const y0 = py(y);
      if (!revealed(x, y - 1)) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + cell, y0);
      }
      if (!revealed(x, y + 1)) {
        ctx.moveTo(x0, y0 + cell);
        ctx.lineTo(x0 + cell, y0 + cell);
      }
      if (!revealed(x - 1, y)) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y0 + cell);
      }
      if (!revealed(x + 1, y)) {
        ctx.moveTo(x0 + cell, y0);
        ctx.lineTo(x0 + cell, y0 + cell);
      }
    }
  }
  ctx.stroke();

  for (const door of layer.doors || []) {
    const a = { x: door.x, y: door.y };
    const b = door.side === 'n' ? { x: door.x, y: door.y - 1 } : { x: door.x - 1, y: door.y };
    if (!revealed(a.x, a.y) && !revealed(b.x, b.y)) continue;
    if (isSecretDoor(door) && !isDoorOpen(world, door)) continue;
    const open = isDoorOpen(world, door);
    ctx.strokeStyle = open ? '#c4a574' : '#6b5340';
    ctx.lineWidth = Math.max(1.2, cell * 0.22);
    ctx.beginPath();
    if (door.side === 'n') {
      ctx.moveTo(px(door.x) + cell * 0.2, py(door.y));
      ctx.lineTo(px(door.x) + cell * 0.8, py(door.y));
    } else {
      ctx.moveTo(px(door.x), py(door.y) + cell * 0.2);
      ctx.lineTo(px(door.x), py(door.y) + cell * 0.8);
    }
    ctx.stroke();
  }

  if (cell >= 5) {
    ctx.fillStyle = '#d4b483';
    ctx.font = `bold ${Math.max(6, Math.floor(cell * 0.72))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const mark of layer.marks || []) {
      if (!revealed(mark.x, mark.y) || !mark.ch) continue;
      ctx.fillText(String(mark.ch).slice(0, 1), px(mark.x) + cell / 2, py(mark.y) + cell / 2 + 0.5);
    }
    for (const st of layer.stairs || []) {
      if (!revealed(st.x, st.y)) continue;
      ctx.fillStyle = '#efe7d8';
      ctx.fillText(STAIR_STYLES[st.style]?.mark?.[0] || '階', px(st.x) + cell / 2, py(st.y) + cell / 2 + 0.5);
      ctx.fillStyle = '#d4b483';
    }
  }

  if (cam && vw > 0 && vh > 0) {
    const viewW = vw / cam.zoom / CS;
    const viewH = vh / cam.zoom / CS;
    const vx = cam.x / CS - viewW / 2;
    const vy = cam.y / CS - viewH / 2;
    ctx.strokeStyle = 'rgba(239, 231, 216, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px(vx), py(vy), viewW * cell, viewH * cell);
  }

  if (play && play.layerId === layer.id) {
    const cx = px(play.x) + cell / 2;
    const cy = py(play.y) + cell / 2;
    const r = Math.max(2.2, cell * 0.32);
    ctx.fillStyle = '#efe7d8';
    ctx.strokeStyle = '#3a2a14';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const d = DIRS[play.facing] || DIRS.n;
    ctx.fillStyle = '#8a1e1e';
    ctx.beginPath();
    ctx.moveTo(cx + d.x * r * 1.55, cy + d.y * r * 1.55);
    ctx.lineTo(cx + d.y * r * 0.7 - d.x * r * 0.2, cy - d.x * r * 0.7 - d.y * r * 0.2);
    ctx.lineTo(cx - d.y * r * 0.7 - d.x * r * 0.2, cy + d.x * r * 0.7 - d.y * r * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(180, 150, 100, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
}

export { CS, STAIR_STYLES };
