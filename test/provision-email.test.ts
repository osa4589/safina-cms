import assert from "node:assert/strict";
import test from "node:test";
import { buildInviteEmail } from "../lib/provision-email";

const INVITE_URL = "https://cms.safinastudio.com/sign-in/collaborator?token=abcdef";

test("escapes caller-supplied name in the HTML body", () => {
  const { html } = buildInviteEmail({
    name: '<a href="https://evil.example">x</a>',
    inviteUrl: INVITE_URL,
  });

  // No injected markup survives: no raw tag delimiters from the name, and no
  // second anchor beside our own invite link.
  assert.ok(!html.includes('<a href="https://evil.example">'));
  assert.ok(!html.includes("</a>x"));
  assert.equal(html.match(/<a /g)?.length, 1);
  assert.ok(
    html.includes(
      "Hi &lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt;,",
    ),
  );
});

test("escapes ampersands and single quotes without double-escaping", () => {
  const { html } = buildInviteEmail({ name: "A&B O'Neil", inviteUrl: INVITE_URL });
  assert.ok(html.includes("Hi A&amp;B O&#39;Neil,"));
});

test("leaves the plain-text body unescaped and keeps the invite link intact", () => {
  const { text, html } = buildInviteEmail({
    name: '<a href="https://evil.example">x</a>',
    inviteUrl: INVITE_URL,
  });
  assert.ok(text.startsWith('Hi <a href="https://evil.example">x</a>,'));
  assert.ok(text.includes(INVITE_URL));
  assert.ok(html.includes(`<a href="${INVITE_URL}">Open your website editor</a>`));
});

test("falls back to a bare greeting when no name is supplied", () => {
  const { html, text } = buildInviteEmail({ inviteUrl: INVITE_URL });
  assert.ok(html.startsWith("<p>Hi,</p>"));
  assert.ok(text.startsWith("Hi,"));
});
