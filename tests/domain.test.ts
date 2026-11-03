import assert from "node:assert/strict";
import test from "node:test";
import {
  campusScope,
  membershipAccessChangeError,
  movementQuantity,
  normalizeEmail,
  slugify,
  toMilliUnits,
} from "../src/lib/domain";
import { assertSameOrigin, HttpError } from "../src/lib/http";
import { hashPassword, verifyPassword } from "../src/lib/password";

test("institution slugs are normalized and bounded", () => {
  assert.equal(slugify("Université North — Main Campus"), "universite-north-main-campus");
  assert.equal(slugify("!!!"), "");
  assert.equal(slugify("a".repeat(120)).length, 100);
});

test("email identity is normalized consistently", () => {
  assert.equal(normalizeEmail("  USER@Example.COM "), "user@example.com");
});

test("stock quantities are exact to three decimal places", () => {
  assert.equal(toMilliUnits("12.045"), 12045n);
  assert.equal(toMilliUnits("0.001"), 1n);
  assert.equal(toMilliUnits("0"), 0n);
  assert.equal(toMilliUnits("-1"), null);
  assert.equal(toMilliUnits("1.0001"), null);
  assert.equal(toMilliUnits("1000000000"), null);
});

test("movement signs match inventory ledger semantics", () => {
  assert.equal(movementQuantity("RECEIPT", "2.5"), "2.5");
  assert.equal(movementQuantity("ISSUE", "2.5"), "-2.5");
  assert.equal(movementQuantity("WASTE", "1"), "-1");
  assert.equal(movementQuantity("ISSUE", "-1"), null);
  assert.equal(movementQuantity("ADJUSTMENT", "-0.125"), "-0.125");
  assert.equal(movementQuantity("ADJUSTMENT", "0"), null);
});

test("campus-scoped memberships cannot select another campus", () => {
  assert.deepEqual(campusScope({ role: "CAMPUS_MANAGER", campusId: "c1" }), {
    campusId: "c1",
    forbidden: false,
  });
  assert.deepEqual(campusScope({ role: "CAMPUS_MANAGER", campusId: "c1" }, "c2"), {
    forbidden: true,
  });
  assert.deepEqual(campusScope({ role: "INSTITUTION_ADMIN", campusId: null }, "c2"), {
    campusId: "c2",
    forbidden: false,
  });
});

test("membership changes cannot modify the actor or remove the last administrator", () => {
  assert.equal(
    membershipAccessChangeError("u1", "u1", "INSTITUTION_ADMIN", "CAMPUS_MANAGER", 2),
    "You cannot change your own membership.",
  );
  assert.equal(
    membershipAccessChangeError("u1", "u2", "INSTITUTION_ADMIN", "CAMPUS_MANAGER", 1),
    "The institution must retain an administrator.",
  );
  assert.equal(
    membershipAccessChangeError("u1", "u2", "INSTITUTION_ADMIN", "CAMPUS_MANAGER", 2),
    null,
  );
  assert.equal(
    membershipAccessChangeError("u1", "u2", "CAMPUS_MANAGER", "STOREKEEPER", 1),
    null,
  );
});

test("state-changing requests must have the same origin as the host", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("http://127.0.0.1:3000/api/v1/auth/login", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
  );
  assert.throws(
    () =>
      assertSameOrigin(
        new Request("http://127.0.0.1:3000/api/v1/auth/login", {
          headers: { host: "127.0.0.1:3000", origin: "https://attacker.example" },
        }),
      ),
    HttpError,
  );
});

test("password hashes verify without storing plaintext", async () => {
  const hash = await hashPassword("Correct horse battery staple");
  assert.notEqual(hash, "Correct horse battery staple");
  assert.equal(await verifyPassword("Correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});
