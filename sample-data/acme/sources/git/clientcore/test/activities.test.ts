import assert from "node:assert/strict";
import test from "node:test";
import { activityDedupeKey } from "../src/activities/dedupe.js";

test("same timestamp does not collapse different source events", () => {
  const occurredAt = "2026-04-13T08:00:00Z";
  const first = activityDedupeKey({ tenantId: "t1", sourceEventId: "call-1", occurredAt });
  const second = activityDedupeKey({ tenantId: "t1", sourceEventId: "call-2", occurredAt });
  assert.notEqual(first, second);
});

