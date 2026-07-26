import assert from "node:assert/strict";
import test from "node:test";

import {
  getMusicStep,
  getMusicTempo,
  MUSIC_LOOP_STEPS,
  QuantumMusic,
} from "../music.js";

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

test("the score gains subtle layers as reality is confirmed", () => {
  const early = Array.from({ length: MUSIC_LOOP_STEPS }, (_, step) =>
    getMusicStep(step, 0),
  );
  const complete = Array.from({ length: MUSIC_LOOP_STEPS }, (_, step) =>
    getMusicStep(step, 1),
  );

  assert.equal(
    early.filter((event) => event.kick).length,
    complete.filter((event) => event.kick).length,
  );
  assert.ok(
    early.filter((event) => event.hat).length <
      complete.filter((event) => event.hat).length,
  );
  assert.ok(
    early.filter((event) => event.bass).length <
      complete.filter((event) => event.bass).length,
  );
  assert.ok(
    early.filter((event) => event.chip).length <
      complete.filter((event) => event.chip).length,
  );
  assert.equal(getMusicTempo(0), 94);
  assert.equal(getMusicTempo(0.5), 97);
  assert.equal(getMusicTempo(1), 100);
});

test("music progress is clamped to the playable reality range", () => {
  const music = new QuantumMusic();
  music.setProgress(-2);
  assert.equal(music.progress, 0);
  music.setProgress(2);
  assert.equal(music.progress, 1);
});
