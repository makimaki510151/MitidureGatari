import assert from 'node:assert/strict';
import {
  HOST_RECONNECT_SNAP_DELAYS_MS,
  hostShareButtonLabel,
  SHARE_BTN_IDLE,
  SHARE_BTN_RECONNECT,
  shareWaitMessage,
} from '../js/share.js';

assert.equal(hostShareButtonLabel(false), SHARE_BTN_IDLE);
assert.equal(hostShareButtonLabel(true), SHARE_BTN_RECONNECT);
assert.equal(SHARE_BTN_IDLE, '画面を共有');
assert.equal(SHARE_BTN_RECONNECT, '受信側へ再接続');
assert.notEqual(SHARE_BTN_RECONNECT, '共有URLをコピー');

assert.deepEqual(HOST_RECONNECT_SNAP_DELAYS_MS, [400, 1200]);

assert.equal(shareWaitMessage(0, 'rejoin'), 'ホストが再接続しました。画面を待っています');
assert.match(shareWaitMessage(9000), /受信側へ再接続/);

console.log('share-reconnect tests ok');
