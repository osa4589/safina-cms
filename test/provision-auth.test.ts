import assert from "node:assert/strict";
import test from "node:test";
import { verifyServiceToken } from "../lib/provision-auth";

const requestWith = (authorization?: string) =>
  new Request("https://cms.safinastudio.com/api/provision", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

// Each test captures the original value of PROVISION_SERVICE_TOKEN and restores
// it afterwards (including "was undefined"), so the suite passes regardless of
// test order or whether a developer already has this variable exported in their
// shell. See Task 2's review for why this matters.
const withServiceToken = async (value: string | undefined, fn: () => Promise<void> | void) => {
  const original = process.env.PROVISION_SERVICE_TOKEN;
  const hadOriginal = Object.prototype.hasOwnProperty.call(process.env, "PROVISION_SERVICE_TOKEN");
  try {
    if (value === undefined) {
      delete process.env.PROVISION_SERVICE_TOKEN;
    } else {
      process.env.PROVISION_SERVICE_TOKEN = value;
    }
    await fn();
  } finally {
    if (hadOriginal) {
      process.env.PROVISION_SERVICE_TOKEN = original;
    } else {
      delete process.env.PROVISION_SERVICE_TOKEN;
    }
  }
};

test("accepts the correct bearer token", async () => {
  await withServiceToken("correct-horse-battery-staple", async () => {
    assert.equal(
      await verifyServiceToken(requestWith("Bearer correct-horse-battery-staple")),
      true,
    );
  });
});

test("rejects an incorrect token", async () => {
  await withServiceToken("correct-horse-battery-staple", async () => {
    assert.equal(await verifyServiceToken(requestWith("Bearer wrong")), false);
  });
});

test("rejects a missing header", async () => {
  await withServiceToken("correct-horse-battery-staple", async () => {
    assert.equal(await verifyServiceToken(requestWith()), false);
  });
});

test("rejects a non-bearer scheme", async () => {
  await withServiceToken("correct-horse-battery-staple", async () => {
    assert.equal(
      await verifyServiceToken(requestWith("Basic correct-horse-battery-staple")),
      false,
    );
  });
});

test("rejects everything when the server token is unset", async () => {
  await withServiceToken(undefined, async () => {
    assert.equal(await verifyServiceToken(requestWith("Bearer anything")), false);
  });
});

test("rejects everything when the server token is an empty string", async () => {
  await withServiceToken("", async () => {
    assert.equal(await verifyServiceToken(requestWith("Bearer ")), false);
    assert.equal(await verifyServiceToken(requestWith()), false);
  });
});
