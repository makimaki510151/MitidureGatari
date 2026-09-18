import assert from 'node:assert/strict';
import { clampCamZoom, nextCamZoom, pickSharedCamZoom } from '../js/share.js';

assert.equal(clampCamZoom(1), 1);
assert.equal(clampCamZoom(0.1), 0.4);
assert.equal(clampCamZoom(9), 2.8);

assert.ok(nextCamZoom(1, -100) > 1);
assert.ok(nextCamZoom(1, 100) < 1);
assert.equal(nextCamZoom(2.8, -100), 2.8);
assert.equal(nextCamZoom(0.4, 100), 0.4);

assert.equal(pickSharedCamZoom(1.2, 2, { isViewer: false, viewerOwnZoom: false }), 2);
assert.equal(pickSharedCamZoom(1.2, 2, { isViewer: true, viewerOwnZoom: false }), 2);
assert.equal(pickSharedCamZoom(1.2, 2, { isViewer: true, viewerOwnZoom: true }), 1.2);
assert.equal(pickSharedCamZoom(1.2, 2, { isViewer: false, viewerOwnZoom: true }), 2);

console.log('viewer-zoom tests ok');
