export const APP_ID = 'mitidure-gatari-dungeon';
export const MAP_SNAP_QUIET_MS = 120;
export const MAP_SNAP_MAX_WAIT_MS = 400;

const TRYSTERO_MODS = [
  'https://esm.sh/trystero@0.21.8',
  'https://esm.run/trystero@0.21.8',
];

export function sanitizeRoom(value) {
  const t = String(value || 'default')
    .slice(0, 48)
    .replace(/[^\w\-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return t || 'default';
}

export function parseShareRoute(loc = location) {
  const path = String(loc.pathname || '').replace(/\/index\.html$/i, '');
  const segs = path.split('/').filter(Boolean);
  const idx = segs.findIndex((s) => s.toLowerCase() === 'playview');
  const params = new URLSearchParams(loc.search || '');
  const hash = decodeURIComponent(String(loc.hash || '').replace(/^#/, '')).trim();
  const queryRoom = (params.get('room') || '').trim();
  if (idx >= 0) {
    const extra = segs.slice(idx + 1).join('/');
    return { isPlayView: true, room: sanitizeRoom(extra || queryRoom || hash || 'default') };
  }
  if (params.get('share') === '1' || params.get('view') === 'PlayView') {
    return { isPlayView: true, room: sanitizeRoom(queryRoom || hash || 'default') };
  }
  return { isPlayView: false, room: sanitizeRoom(queryRoom || hash || 'default') };
}

export function appRootUrl(loc = location) {
  const path = String(loc.pathname || '').replace(/\/index\.html$/i, '');
  const segs = path.split('/').filter(Boolean);
  const idx = segs.findIndex((s) => s.toLowerCase() === 'playview');
  const root = idx >= 0 ? segs.slice(0, idx) : segs;
  const prefix = root.length ? `/${root.join('/')}/` : '/';
  return `${loc.origin}${prefix}`;
}

export function playViewUrl(room = 'default', loc = location) {
  const root = appRootUrl(loc);
  const r = sanitizeRoom(room);
  if (r === 'default') return `${root}PlayView/`;
  return `${root}PlayView/#${encodeURIComponent(r)}`;
}

export function packPlay(play) {
  if (!play) return null;
  return {
    layerId: play.layerId,
    x: play.x | 0,
    y: play.y | 0,
    facing: play.facing || 'n',
    revealed: play.revealed || {},
    doorsOpen: play.doorsOpen || {},
    doorNumsFlipped: play.doorNumsFlipped || {},
    ignoreStairs: !!play.ignoreStairs,
  };
}

export function viewFingerprint(payload) {
  if (!payload) return '';
  return JSON.stringify({
    layerId: payload.layerId,
    mode: payload.mode,
    cam: payload.cam || null,
    play: payload.play || null,
    maskPreview: !!payload.maskPreview,
    hover: payload.hover || null,
  });
}

export function shareSeqShouldApply(incoming, applied) {
  const seq = incoming | 0;
  if (!seq) return true;
  return seq >= (applied | 0);
}

export function shouldFlushMapSnap(now, { dirty, touchedAt, lastSnapAt }) {
  if (!dirty) return false;
  if (now - touchedAt >= MAP_SNAP_QUIET_MS) return true;
  return lastSnapAt > 0 && now - lastSnapAt >= MAP_SNAP_MAX_WAIT_MS;
}

function attachPeerHook(room, name, fn) {
  const current = room[name];
  if (typeof current === 'function') {
    try {
      current.call(room, fn);
      if (room[name] === current) return;
    } catch {
      /* fall through to assignment */
    }
  }
  room[name] = fn;
}

function bindAction(room, name, handler) {
  const action = room.makeAction(name);
  if (Array.isArray(action)) {
    const [send, get] = action;
    get((data, peerId) => handler(data, peerId));
    return (data, target) => (target ? send(data, target) : send(data));
  }
  action.onMessage = (data, info) => handler(data, info?.peerId);
  return (data, target) => action.send(data, target ? { target } : undefined);
}

function latestWinsSend(send) {
  let queued = null;
  let scheduled = false;
  return (data, target) => {
    queued = { data, target };
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const job = queued;
      queued = null;
      if (job) send(job.data, job.target);
    });
  };
}

async function loadJoinRoom() {
  let lastErr;
  for (const url of TRYSTERO_MODS) {
    try {
      const mod = await import(url);
      if (typeof mod.joinRoom === 'function') return mod.joinRoom;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('trystero を読み込めません');
}

export async function connectShareRoom(roomId, handlers = {}) {
  const joinRoom = await loadJoinRoom();
  const room = joinRoom({ appId: APP_ID }, sanitizeRoom(roomId));
  const sendSnap = bindAction(room, 'snap', (data, peerId) => handlers.onSnap?.(data, peerId));
  const sendViewRaw = bindAction(room, 'view', (data, peerId) => handlers.onView?.(data, peerId));
  const sendHello = bindAction(room, 'hello', (data, peerId) => handlers.onHello?.(data, peerId));
  const sendView = latestWinsSend(sendViewRaw);

  attachPeerHook(room, 'onPeerJoin', (peerId) => handlers.onPeerJoin?.(peerId));
  attachPeerHook(room, 'onPeerLeave', (peerId) => handlers.onPeerLeave?.(peerId));

  return {
    room,
    sendSnap,
    sendView,
    sendHello,
    getPeers() {
      try {
        return Object.keys(room.getPeers?.() || {});
      } catch {
        return [];
      }
    },
    leave() {
      try {
        room.leave();
      } catch {
        /* ignore */
      }
    },
  };
}
