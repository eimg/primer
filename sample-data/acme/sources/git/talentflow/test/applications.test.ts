import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_WITHDRAWN_TERMINAL,
  employerCanTransition,
} from "../src/applications/transitions.js";

test("employer cannot reopen a withdrawn application", () => {
  assert.deepEqual(employerCanTransition("withdrawn", "reviewing"), {
    allowed: false,
    reason: APPLICATION_WITHDRAWN_TERMINAL,
  });
});

