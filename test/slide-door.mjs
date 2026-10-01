import assert from 'node:assert/strict';
import {
  CELL_SIZE,
  createDefaultWorld,
  isSlideDoor,
  isSweepDoor,
  shouldShowDoorNum,
  slideOpenShift,
} from '../js/world.js';

assert.equal(shouldShowDoorNum(true), true);
assert.equal(shouldShowDoorNum(false), false);
assert.equal(shouldShowDoorNum(undefined), false);

const slideN = { appearance: 'slide', side: 'n', hinge: 'a' };
const slideNb = { appearance: 'slide', side: 'n', hinge: 'b' };
const slideW = { appearance: 'slide', side: 'w', hinge: 'a' };
const slideWb = { appearance: 'slide', side: 'w', hinge: 'b' };
const secretSlide = { appearance: 'slide', hidden: true, side: 'n', hinge: 'a' };

assert.equal(isSlideDoor(slideN), true);
assert.equal(isSlideDoor(secretSlide), false);
assert.equal(isSweepDoor(slideN), false);

const along = CELL_SIZE - 12;
assert.deepEqual(slideOpenShift(slideN), { x: -along, y: 0 });
assert.deepEqual(slideOpenShift(slideNb), { x: along, y: 0 });
assert.deepEqual(slideOpenShift(slideW), { x: 0, y: -along });
assert.deepEqual(slideOpenShift(slideWb), { x: 0, y: along });
assert.deepEqual(slideOpenShift({ appearance: 'wood', side: 'n', hinge: 'a' }), { x: 0, y: 0 });

const world = createDefaultWorld();
const f1 = world.layers.find((l) => l.id === 'L1F');
const slide = f1.doors.find((d) => d.id === 'D-slide');
assert.ok(slide);
assert.equal(slide.appearance, 'slide');
assert.equal(slide.x, 11);
assert.equal(slide.y, 10);
assert.equal(slide.side, 'w');
assert.equal(isSlideDoor(slide), true);

const sweep = f1.doors.find((d) => d.id === 'D-sweep');
assert.equal(isSweepDoor(sweep), true);
assert.equal(isSlideDoor(sweep), false);

console.log('slide-door tests ok');
