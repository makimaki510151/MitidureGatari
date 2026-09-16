export const APP_ID = 'mitidure-gatari-dungeon';
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
  const sendView = bindAction(room, 'view', (data, peerId) => handlers.onView?.(data, peerId));
  const sendHello = bindAction(room, 'hello', (data, peerId) => handlers.onHello?.(data, peerId));

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
