import assert from "node:assert/strict";
import test from "node:test";
import { mapOwner, UNKNOWN_OWNER_ERROR } from "../src/imports/mapOwner.js";

const users = [{ id: "user-1", email: "owner@acme.test", active: true }];

test("missing owner assigns importing user", () => {
  assert.deepEqual(mapOwner(undefined, "importer-9", users), {
    ok: true,
    ownerId: "importer-9",
  });
});

test("explicit unknown owner returns CC_IMPORT_017", () => {
  const result = mapOwner("missing@acme.test", "importer-9", users);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, UNKNOWN_OWNER_ERROR);
});

