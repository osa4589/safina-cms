import assert from "node:assert/strict";
import test from "node:test";
import { parseProvisionBody } from "../lib/provision-request";

test("accepts a well-formed body", () => {
  const result = parseProvisionBody({
    repo: "osa4589/example-client",
    email: "client@example.com",
    name: "Client Name",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.owner, "osa4589");
  assert.equal(result.value.repo, "example-client");
  assert.equal(result.value.email, "client@example.com");
});

test("normalizes the email to lowercase", () => {
  const result = parseProvisionBody({
    repo: "osa4589/example-client",
    email: "  Client@Example.COM  ",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.email, "client@example.com");
});

test("rejects a repo without an owner", () => {
  const result = parseProvisionBody({ repo: "example-client", email: "a@example.com" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /repo/);
});

test("rejects a malformed email", () => {
  const result = parseProvisionBody({ repo: "osa4589/example-client", email: "not-an-email" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /email/);
});

test("rejects a non-object body", () => {
  const result = parseProvisionBody(null);
  assert.equal(result.ok, false);
});
