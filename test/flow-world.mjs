import assert from 'node:assert/strict';
import {
  createDefaultFlowWorld,
  createDefaultWorld,
  createEmptyFlowWorld,
  isFlowEdgeRevealed,
  isFlowNodeRevealed,
  isFlowWorld,
  normalizeWorld,
  outgoingFlowEdges,
  playFlowChoices,
  resetPlay,
  travelFlowEdge,
} from '../js/world.js';
import { packPlay } from '../js/share.js';

const grid = createDefaultWorld();
assert.equal(grid.kind, 'grid');
assert.equal(isFlowWorld(grid), false);
assert.ok(grid.layers[0].cells.length > 0);

const empty = createEmptyFlowWorld();
assert.equal(empty.kind, 'flow');
assert.equal(empty.layers[0].nodes.length, 1);
assert.equal(empty.start.nodeId, empty.layers[0].nodes[0].id);
assert.ok(isFlowNodeRevealed(empty, empty.layers[0], empty.start.nodeId));

const world = createDefaultFlowWorld();
const f1 = world.layers[0];
const cave = world.layers[1];
const start = f1.nodes.find((n) => n.id === world.start.nodeId);
assert.equal(start.name, '入口');
assert.ok(isFlowNodeRevealed(world, f1, start.id));

const out = outgoingFlowEdges(f1, start.id);
assert.equal(out.length, 1);
assert.ok(isFlowEdgeRevealed(world, f1, out[0]));

const dest = f1.nodes.find((n) => n.id === out[0].to);
assert.equal(dest.name, '衛兵詰所');
assert.equal(isFlowNodeRevealed(world, f1, dest.id), false);

assert.deepEqual(playFlowChoices(world).map((e) => e.id), [out[0].id]);
assert.equal(travelFlowEdge(world, out[0]), true);
assert.equal(world.play.nodeId, dest.id);
assert.ok(isFlowNodeRevealed(world, f1, dest.id));

const nextOut = outgoingFlowEdges(f1, dest.id);
assert.ok(nextOut.length >= 1);
assert.ok(isFlowEdgeRevealed(world, f1, nextOut[0]));
const hall = f1.nodes.find((n) => n.id === nextOut[0].to);
assert.equal(isFlowNodeRevealed(world, f1, hall.id), false);

assert.equal(travelFlowEdge(world, nextOut[0]), true);
const down = outgoingFlowEdges(f1, world.play.nodeId).find((e) => e.toLayerId === cave.id);
assert.ok(down);
assert.ok(isFlowEdgeRevealed(world, f1, down));
assert.equal(isFlowNodeRevealed(world, cave, down.to), false);
assert.equal(travelFlowEdge(world, down), true);
assert.equal(world.play.layerId, cave.id);
assert.ok(isFlowNodeRevealed(world, cave, world.play.nodeId));

resetPlay(world);
assert.equal(world.play.nodeId, start.id);
assert.equal(isFlowNodeRevealed(world, f1, dest.id), false);
assert.ok(isFlowNodeRevealed(world, f1, start.id));

const packed = packPlay(world.play);
assert.equal(packed.nodeId, start.id);

const round = normalizeWorld(JSON.parse(JSON.stringify(world, (k, v) => (k.startsWith('_') ? undefined : v))));
assert.equal(round.kind, 'flow');
assert.equal(round.layers[0].nodes.length, f1.nodes.length);
assert.equal(round.start.nodeId, start.id);

const oldGrid = normalizeWorld({
  layers: [{
    id: 'L1',
    name: '1階',
    width: 8,
    height: 8,
    cells: Array.from({ length: 8 }, () => Array(8).fill(0)),
    doors: [],
    stairs: [],
  }],
  start: { layerId: 'L1', x: 1, y: 1 },
});
assert.equal(oldGrid.kind, 'grid');

console.log('flow-world tests ok');
