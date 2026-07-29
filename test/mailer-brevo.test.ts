import assert from "node:assert/strict";
import test from "node:test";
import { buildBrevoPayload, sendWithBrevo } from "../lib/mailer-brevo";

test("buildBrevoPayload maps a single recipient", () => {
  const payload = buildBrevoPayload({
    to: "client@example.com",
    subject: "Your site is ready",
    html: "<p>Hello</p>",
    from: "hello@safinastudio.com",
    fromName: "Safina Studio",
  });
  assert.deepEqual(payload.sender, { email: "hello@safinastudio.com", name: "Safina Studio" });
  assert.deepEqual(payload.to, [{ email: "client@example.com" }]);
  assert.equal(payload.subject, "Your site is ready");
  assert.equal(payload.htmlContent, "<p>Hello</p>");
  assert.equal("textContent" in payload, false);
});

test("buildBrevoPayload maps multiple recipients and text", () => {
  const payload = buildBrevoPayload({
    to: ["a@example.com", "b@example.com"],
    subject: "S",
    html: "<p>H</p>",
    text: "H",
    from: "hello@safinastudio.com",
    fromName: "Safina Studio",
  });
  assert.deepEqual(payload.to, [{ email: "a@example.com" }, { email: "b@example.com" }]);
  assert.equal(payload.textContent, "H");
});

test("sendWithBrevo throws a redacted error on failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("upstream rejected", { status: 400 })) as typeof fetch;
  process.env.BREVO_API_KEY = "test-key";
  try {
    await assert.rejects(
      () =>
        sendWithBrevo({
          to: "a@example.com",
          subject: "S",
          html: "<p>H</p>",
          from: "hello@safinastudio.com",
          fromName: "Safina Studio",
        }),
      (error: Error) => {
        assert.match(error.message, /Brevo send failed \(400\)/);
        assert.equal(error.message.includes("test-key"), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendWithBrevo throws when the API key is missing", async () => {
  delete process.env.BREVO_API_KEY;
  await assert.rejects(
    () =>
      sendWithBrevo({
        to: "a@example.com",
        subject: "S",
        html: "<p>H</p>",
        from: "hello@safinastudio.com",
        fromName: "Safina Studio",
      }),
    /BREVO_API_KEY/,
  );
});
