import assert from "node:assert/strict";
import test from "node:test";
import { findDeclaredAction, resolveAllowedActions } from "../lib/actions";

/* This is the boundary the actions endpoint enforces: a request may only name
   an action, and it must be one the owner declared for that exact context. */
const config = {
  actions: [{ name: "publish", label: "Put it on my website", workflow: "publish.yml", ref: "main" }],
  content: [
    {
      name: "posts",
      actions: [
        { name: "rebuild", label: "Rebuild", workflow: "rebuild.yml", scope: "collection" },
        { name: "preview", label: "Preview", workflow: "preview.yml", scope: "entry" },
        { name: "lint", label: "Lint", workflow: "lint.yml" },
      ],
    },
  ],
  media: [{ name: "media", actions: [{ name: "optimize", label: "Optimize", workflow: "opt.yml" }] }],
};

test("a root action is dispatchable from the repo context only", () => {
  assert.equal(findDeclaredAction(config, "repo", null, "publish")?.workflow, "publish.yml");
  assert.equal(findDeclaredAction(config, "entry", "posts", "publish"), null);
});

test("the declared definition wins — the request cannot pick the workflow or ref", () => {
  const declared = findDeclaredAction(config, "repo", null, "publish");
  assert.equal(declared?.ref, "main");
  assert.equal(declared?.workflow, "publish.yml");
});

test("an action the owner never declared is refused, whatever the body claims", () => {
  assert.equal(findDeclaredAction(config, "repo", null, "deploy-prod"), null);
  assert.equal(findDeclaredAction(config, "entry", "posts", "rebuild"), null, "collection-scoped action must not run from an entry");
  assert.equal(findDeclaredAction(config, "collection", "posts", "preview"), null, "entry-scoped action must not run from a collection");
});

test("scope is honoured exactly as the UI renders it", () => {
  assert.deepEqual(resolveAllowedActions(config, "collection", "posts").map((a) => a.name), ["rebuild"]);
  assert.deepEqual(resolveAllowedActions(config, "entry", "posts").map((a) => a.name), ["preview"]);
  assert.deepEqual(resolveAllowedActions(config, "file", "posts").map((a) => a.name), ["lint"]);
  assert.deepEqual(resolveAllowedActions(config, "media", "media").map((a) => a.name), ["optimize"]);
});

test("nothing is allowed for an unknown schema, an unknown kind, or a missing config", () => {
  assert.deepEqual(resolveAllowedActions(config, "entry", "nope"), []);
  assert.deepEqual(resolveAllowedActions(config, "wat", "posts"), []);
  assert.deepEqual(resolveAllowedActions(null, "repo", null), []);
  assert.deepEqual(resolveAllowedActions(config, null, null), []);
  assert.equal(findDeclaredAction(config, "repo", null, ""), null);
});

test("a declaration without a workflow file can never be dispatched", () => {
  assert.equal(findDeclaredAction({ actions: [{ name: "x", label: "X" }] }, "repo", null, "x"), null);
});
