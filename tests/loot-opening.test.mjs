import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LootSystem } from '../js/systems/LootSystem.js';

globalThis.THREE = THREE;

test('solo chest pickup opens once, reveals its reward and releases owned GPU resources', () => {
  const scene = new THREE.Scene();
  const loot = new LootSystem(scene);
  const chest = loot.spawn(0, 0);
  let disposed = 0;
  let ownedGeometries = 0;
  chest.mesh.traverse(node => { if (node.geometry) { ownedGeometries++; node.geometry.addEventListener('dispose', () => disposed++); } });
  const picked = loot.update(1 / 60, { x: 0, y: 0, worldId: 0 }, 0, true);
  assert.equal(picked, chest);
  assert.equal(loot.chests.length, 0);
  assert.equal(loot.openings.length, 1);
  assert.equal(loot.update(1 / 60, { x: 0, y: 0 }, 0, true), null, 'one contact cannot grant two rewards');
  assert.equal(chest.mesh.parent, scene, 'the chest stays visible during its opening');
  loot.updateEffects(.3);
  assert.ok(chest.lid.rotation.x < -.5, 'the lid opens before the choice screen');
  assert.ok(loot.openings[0].reward.position.y > 20);
  loot.updateEffects(1);
  assert.equal(loot.isOpening(chest.id), false);
  assert.equal(chest.mesh.parent, null);
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, ownedGeometries, 'every owned chest geometry is released');
});

test('authoritative pickup survives snapshot ordering without replaying or resurrecting the chest', () => {
  const scene = new THREE.Scene();
  const loot = new LootSystem(scene);
  const state = { id: 'c_1', x: 120, y: -80, rare: true };
  loot.sync([state]);
  loot.sync([]);
  assert.equal(loot.openings.length, 0, 'interest and expiry changes do not invent pickups');
  const chest = loot.open(state);
  assert.ok(chest, 'an event arriving after removal can still play its confirmed pickup');
  assert.equal(chest.rare, true);
  assert.equal(loot.open(state), null, 'duplicate events cannot replay the reveal');
  loot.sync([state]);
  assert.equal(loot.chests.length, 0, 'an older snapshot cannot restore the collected chest');
  loot.updateEffects(loot.openingDuration);
  assert.equal(scene.children.length, 0);
  loot.reset();
  loot.sync([state]);
  assert.equal(loot.chests.length, 1, 'a new world can reuse its own authoritative chest IDs');
  loot.reset();
});

test('a multiplayer burst stays bounded and restart clears every active reveal', () => {
  const scene = new THREE.Scene();
  const loot = new LootSystem(scene);
  for (let i = 0; i < 100; i++) loot.open({ id: `c_${i}`, x: i, y: 0, rare: i % 2 === 0 });
  assert.equal(loot.openings.length, 8);
  assert.equal(scene.children.length, 16, 'only eight chest/effect pairs remain active');
  assert.equal(loot.openedIds.size, 64, 'event deduplication has a fixed memory budget');
  const active = loot.openings.map(opening => [opening.chest.mesh, opening.effect]).flat();
  loot.reset();
  assert.equal(loot.openings.length, 0);
  assert.equal(loot.openedIds.size, 0);
  assert.equal(scene.children.length, 0);
  assert.ok(active.every(mesh => mesh.parent === null));
});
