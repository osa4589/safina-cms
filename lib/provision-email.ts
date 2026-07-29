// `name` is caller-supplied checkout data, and this email carries a passwordless
// sign-in link sent from our own domain, so it must never be able to inject
// markup into the HTML body.
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const buildInviteEmail = ({ name, inviteUrl }: { name?: string; inviteUrl: string }) => {
  const plainGreeting = name ? `Hi ${name},` : "Hi,";
  const htmlGreeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";

  return {
    subject: "Your website is ready to edit",
    html:
      `<p>${htmlGreeting}</p>` +
      "<p>Your website editor is ready. Use the link below to sign in — no account or password needed.</p>" +
      `<p><a href="${escapeHtml(inviteUrl)}">Open your website editor</a></p>`,
    text: `${plainGreeting}\n\nYour website editor is ready. Open this link to sign in:\n${inviteUrl}\n`,
  };
};
