export const APP_ID = 'mitidure-gatari-dungeon';
export const MAP_SNAP_QUIET_MS = 120;
export const MAP_SNAP_MAX_WAIT_MS = 400;
export const SHARE_HANDSHAKE_MS = 350;

export const NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://nostr.data.haus',
  'wss://yabu.me/v2',
];

export const TORRENT_TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
];

const TRYSTERO_NOSTR = [
  'https://esm.sh/trystero@0.21.8',
  'https://esm.run/trystero@0.21.8',
  'https://cdn.jsdelivr.net/npm/trystero@0.21.8/+esm',
];

const TRYSTERO_TORRENT = [
  'https://esm.sh/trystero@0.21.8/torrent',
  'https://esm.sh/trystero@0.21.8/src/torrent.js',
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

export const CAM_ZOOM_MIN = 0.4;
export const CAM_ZOOM_MAX = 2.8;

export function clampCamZoom(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z) || z <= 0) return 1;
  return Math.max(CAM_ZOOM_MIN, Math.min(CAM_ZOOM_MAX, z));
}

export function nextCamZoom(zoom, deltaY) {
  const factor = deltaY < 0 ? 1.1 : 0.9;
  return clampCamZoom(zoom * factor);
}

export function pickSharedCamZoom(localZoom, remoteZoom, { isViewer = false, viewerOwnZoom = false } = {}) {
  if (isViewer && viewerOwnZoom) return clampCamZoom(localZoom);
  if (remoteZoom != null && Number.isFinite(Number(remoteZoom))) return clampCamZoom(remoteZoom);
  return clampCamZoom(localZoom);
}

export function packPlay(play) {
  if (!play) return null;
  return {
    layerId: play.layerId,
    x: play.x | 0,
    y: play.y | 0,
    facing: play.facing || 'n',
    nodeId: play.nodeId || null,
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

export function shareWaitMessage(elapsedMs, phase = 'wait') {
  if (phase === 'load') return '接続モジュールを読み込み中';
  if (phase === 'join') return '部屋に接続しています';
  if (elapsedMs < 2500) return 'ホストの画面を待っています';
  if (elapsedMs < 8000) return 'ホストを探しています。もう少し待ってください';
  return 'まだ届きません。ホスト側で「画面を共有」を押しているか確認してください';
}

export function shouldRetryHandshake(now, lastAt, startedAt = 0) {
  if (!lastAt) return true;
  const gap = startedAt && now - startedAt > 4000 ? 1500 : SHARE_HANDSHAKE_MS;
  return now - lastAt >= gap;
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
  const queued = new Map();
  let scheduled = false;
  return (data, target) => {
    queued.set(target || '*', { data, target });
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const jobs = [...queued.values()];
      queued.clear();
      for (const job of jobs) send(job.data, job.target);
    });
  };
}

async function importJoinRoom(urls) {
  return Promise.any(
    urls.map(async (url) => {
      const mod = await import(url);
      if (typeof mod.joinRoom !== 'function') throw new Error(`no joinRoom: ${url}`);
      return mod.joinRoom;
    }),
  );
}

function peerIds(room) {
  try {
    return Object.keys(room.getPeers?.() || {});
  } catch {
    return [];
  }
}

function openSession(joinRoom, config, roomId, handlers) {
  const room = joinRoom(config, sanitizeRoom(roomId));
  const sendSnap = bindAction(room, 'snap', (data, peerId) => handlers.onSnap?.(data, peerId));
  const sendView = bindAction(room, 'view', (data, peerId) => handlers.onView?.(data, peerId));
  const sendHello = bindAction(room, 'hello', (data, peerId) => handlers.onHello?.(data, peerId));
  const sendWant = bindAction(room, 'want', (data, peerId) => handlers.onWant?.(data, peerId));
  const sendHave = bindAction(room, 'have', (data, peerId) => handlers.onHave?.(data, peerId));

  attachPeerHook(room, 'onPeerJoin', (peerId) => handlers.onPeerJoin?.(peerId));
  attachPeerHook(room, 'onPeerLeave', (peerId) => handlers.onPeerLeave?.(peerId));

  return {
    room,
    sendSnap,
    sendView,
    sendHello,
    sendWant,
    sendHave,
    getPeers: () => peerIds(room),
    hasPeer(id) {
      return peerIds(room).includes(id);
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

function fanout(sessions, method) {
  return (data, target) => {
    for (const sess of sessions) {
      if (target && !sess.hasPeer(target)) continue;
      try {
        const ret = sess[method](data, target);
        if (ret && typeof ret.catch === 'function') ret.catch(() => {});
      } catch {
        /* ignore a dead transport */
      }
    }
  };
}

export async function connectShareRoom(roomId, handlers = {}) {
  handlers.onStatus?.('load');
  const nostrJoin = await importJoinRoom(TRYSTERO_NOSTR);
  const torrentJoin = await importJoinRoom(TRYSTERO_TORRENT).catch(() => null);

  handlers.onStatus?.('join');
  const sessions = [];
  const wrapped = {
    ...handlers,
    onPeerLeave(peerId) {
      queueMicrotask(() => {
        const still = sessions.some((s) => s.hasPeer(peerId));
        if (!still) handlers.onPeerLeave?.(peerId);
      });
    },
  };

  sessions.push(openSession(nostrJoin, { appId: APP_ID, relayUrls: NOSTR_RELAYS }, roomId, wrapped));
  if (torrentJoin) {
    try {
      sessions.push(
        openSession(torrentJoin, { appId: `${APP_ID}-tor`, relayUrls: TORRENT_TRACKERS }, roomId, wrapped),
      );
    } catch {
      /* nostr-only is enough */
    }
  }

  return {
    sessions,
    sendSnap: fanout(sessions, 'sendSnap'),
    sendView: latestWinsSend(fanout(sessions, 'sendView')),
    sendHello: fanout(sessions, 'sendHello'),
    sendWant: fanout(sessions, 'sendWant'),
    sendHave: fanout(sessions, 'sendHave'),
    getPeers() {
      const ids = new Set();
      for (const sess of sessions) {
        for (const id of sess.getPeers()) ids.add(id);
      }
      return [...ids];
    },
    leave() {
      for (const sess of sessions) sess.leave();
    },
  };
}
