/* The branch boundary.
 *
 * collaboratorTable.branch shipped in the schema and was never read, so access
 * was repo-scoped: a client invited to edit a draft could switch to the branch
 * behind their live site and edit it directly, with nothing in the UI marking
 * the difference. These pin the rule that now confines them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isBranchAllowed } from "../lib/branch-scope";

test("an unscoped collaborator is not confined", () => {
  assert.equal(isBranchAllowed(null, "main"), true);
  assert.equal(isBranchAllowed(undefined, "draft"), true);
  assert.equal(isBranchAllowed("", "main"), true);
});

test("a scoped collaborator may act on their own branch", () => {
  assert.equal(isBranchAllowed("draft", "draft"), true);
});

test("a scoped collaborator may NOT act on any other branch", () => {
  assert.equal(isBranchAllowed("draft", "main"), false);
  assert.equal(isBranchAllowed("draft", "production"), false);
  assert.equal(isBranchAllowed("draft", "Draft-2"), false);
});

test("the comparison is case-insensitive, because URLs are not git", () => {
  assert.equal(isBranchAllowed("draft", "DRAFT"), true);
  assert.equal(isBranchAllowed("Draft", "draft"), true);
});

/* Repo-level callers (listing repos, listing collaborators) pass no branch.
   Failing closed there would lock a scoped client out of the app entirely. */
test("a caller that is not branch-scoped is unaffected", () => {
  assert.equal(isBranchAllowed("draft", undefined), true);
  assert.equal(isBranchAllowed("draft", null), true);
});
