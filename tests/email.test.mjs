import { test } from "node:test";
import assert from "node:assert/strict";
import { emailConfigured, resetEmail, sendEmail } from "../shared/email.js";

test("email is only considered configured when both settings are present", () => {
  assert.equal(emailConfigured({}), false);
  assert.equal(emailConfigured({ RESEND_API_KEY: "re_x" }), false, "a key without a from address cannot send");
  assert.equal(emailConfigured({ RESET_FROM_EMAIL: "a@b.com" }), false);
  assert.equal(emailConfigured({ RESEND_API_KEY: "re_x", RESET_FROM_EMAIL: "a@b.com" }), true);
});

test("sending fails closed when nothing is configured", async () => {
  await assert.rejects(
    sendEmail({}, { to: "a@b.com", subject: "s", text: "t", html: "<p>t</p>" }),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, "email_unconfigured");
      // A reset that silently does nothing is worse than one that is off.
      assert.match(err.message, /not set up/i);
      return true;
    }
  );
});

test("the reset email carries the link, the expiry and a way out", () => {
  const { text, html } = resetEmail({ name: "Ana", link: "https://econib.org/reset?token=abc", minutes: 60 });
  assert.match(text, /Hi Ana,/);
  assert.match(text, /https:\/\/econib\.org\/reset\?token=abc/);
  assert.match(text, /expires in 60 minutes/);
  assert.match(text, /If this was not you, ignore this email/i,
    "someone who did not request it must be told they need do nothing");
  assert.match(html, /href="https:\/\/econib\.org\/reset\?token=abc"/);
});

test("a name is optional and does not produce a broken greeting", () => {
  const { text } = resetEmail({ name: "", link: "https://x/y", minutes: 60 });
  assert.match(text, /^Hi,/);
  assert.doesNotMatch(text, /Hi ,/);
  assert.doesNotMatch(text, /undefined/);
});

test("a hostile name cannot inject markup into the HTML email", () => {
  const { html } = resetEmail({
    name: '<img src=x onerror=alert(1)>',
    link: 'https://econib.org/reset?token=a"><script>alert(1)</script>',
    minutes: 60,
  });
  assert.ok(!html.includes("<img src=x"), "the name must be escaped");
  assert.ok(!html.includes("<script>"), "the link must be escaped");
  assert.match(html, /&lt;img/);
});
