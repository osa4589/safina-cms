import assert from "node:assert/strict";
import test from "node:test";
import { parseProvisionBody } from "../lib/provision-request";

test("accepts a well-formed body", () => {
  const result = parseProvisionBody({
    repo: "osa4589/example-client",
    email: "client@example.com",
    name: "Client Name",
    branch: "draft",
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
    branch: null,
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

/* The branch is the boundary between "edits a draft" and "edits the live site".
   It used to be silently omitted, which meant silently unconfined. */
test("rejects a body that does not say which branch", () => {
  const result = parseProvisionBody({ repo: "osa4589/example-client", email: "a@example.com" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /branch is required/);
});

test("accepts an explicit null branch as a deliberate whole-repo grant", () => {
  const result = parseProvisionBody({ repo: "osa4589/example-client", email: "a@example.com", branch: null });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.branch, null);
});

test("accepts and trims a plain branch name", () => {
  const result = parseProvisionBody({ repo: "osa4589/example-client", email: "a@example.com", branch: "  draft " });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.branch, "draft");
});

test("rejects branch names git would refuse or that could traverse", () => {
  for (const bad of ["", "-x", ".hidden", "a b", "a..b", "refs/heads/../x", 42, true]) {
    const result = parseProvisionBody({ repo: "osa4589/example-client", email: "a@example.com", branch: bad });
    assert.equal(result.ok, false, `branch ${JSON.stringify(bad)} must be rejected`);
  }
});
