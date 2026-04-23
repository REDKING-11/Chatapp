import assert from "node:assert/strict";
import {
  resolveAnchoredPopoverPosition,
  resolvePointPopoverPosition
} from "../src/lib/popoverPosition.js";

const dockPosition = resolveAnchoredPopoverPosition({
  anchorRect: {
    left: 8,
    top: 650,
    right: 308,
    bottom: 712,
    width: 300,
    height: 62
  },
  popoverWidth: 404,
  popoverHeight: 900,
  viewportWidth: 390,
  viewportHeight: 720,
  preferredPlacement: "top-start"
});

assert.equal(dockPosition.left, 12);
assert.equal(dockPosition.top, 12);
assert.equal(dockPosition.width, 366);
assert.equal(dockPosition.maxHeight, 696);

const centeredDockPosition = resolveAnchoredPopoverPosition({
  anchorRect: {
    left: 300,
    top: 620,
    right: 520,
    bottom: 682,
    width: 220,
    height: 62
  },
  popoverWidth: 404,
  popoverHeight: 640,
  viewportWidth: 960,
  viewportHeight: 720,
  preferredPlacement: "top"
});

assert.equal(centeredDockPosition.left, 208);
assert.equal(centeredDockPosition.top, 12);
assert.equal(centeredDockPosition.width, 404);
assert.equal(centeredDockPosition.maxHeight, 696);

const narrowChatPosition = resolveAnchoredPopoverPosition({
  anchorRect: {
    left: 4,
    top: 100,
    right: 36,
    bottom: 132,
    width: 32,
    height: 32
  },
  popoverWidth: 340,
  popoverHeight: 280,
  viewportWidth: 320,
  viewportHeight: 580,
  preferredPlacement: "bottom-start"
});

assert.equal(narrowChatPosition.left, 12);
assert.equal(narrowChatPosition.top, 142);
assert.equal(narrowChatPosition.width, 296);
assert.equal(narrowChatPosition.placement, "bottom");

const tallPosition = resolveAnchoredPopoverPosition({
  anchorRect: {
    left: 120,
    top: 20,
    right: 160,
    bottom: 52,
    width: 40,
    height: 32
  },
  popoverWidth: 340,
  popoverHeight: 1000,
  viewportWidth: 500,
  viewportHeight: 500,
  preferredPlacement: "bottom-start"
});

assert.equal(tallPosition.top, 12);
assert.equal(tallPosition.maxHeight, 476);
assert.ok(tallPosition.top + tallPosition.maxHeight <= 500 - 12);

const pointPosition = resolvePointPopoverPosition({
  x: 780,
  y: 580,
  popoverWidth: 220,
  popoverHeight: 180,
  viewportWidth: 800,
  viewportHeight: 600
});

assert.equal(pointPosition.left, 568);
assert.equal(pointPosition.top, 408);

console.log("popover-position.test.mjs: ok");
