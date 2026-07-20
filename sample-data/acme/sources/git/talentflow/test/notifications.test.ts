import assert from "node:assert/strict";
import test from "node:test";
import { retryNotification, type MailGateway } from "../src/notifications/retry.js";

test("TF-184 preserves idempotency key after a transient failure", async () => {
  const keys: string[] = [];
  const gateway: MailGateway = {
    async send(input) {
      keys.push(input.idempotencyKey);
      if (keys.length === 1) throw new Error("503 from gateway");
    },
  };

  await retryNotification(gateway, {
    id: "notification-42",
    recipient: "candidate@example.test",
    template: "interview-reminder",
  });

  assert.deepEqual(keys, ["notification-42", "notification-42"]);
});

