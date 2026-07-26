import assert from "node:assert/strict";
import test from "node:test";

import { getMusicStep, MUSIC_LOOP_STEPS } from "../music.js";

test("the procedural score forms a sparse two-bar loop", () => {
  const events = Array.from({ length: MUSIC_LOOP_STEPS }, (_, step) =>
    getMusicStep(step),
  );

  assert.equal(MUSIC_LOOP_STEPS, 32);
  assert.equal(events.filter((event) => event.kick).length, 8);
  assert.equal(events.filter((event) => event.hat).length, 8);
  assert.ok(events.filter((event) => event.bass).length < MUSIC_LOOP_STEPS / 2);
  assert.ok(events.filter((event) => event.chip).length <= MUSIC_LOOP_STEPS / 4);
  assert.deepEqual(getMusicStep(MUSIC_LOOP_STEPS), getMusicStep(0));
});
