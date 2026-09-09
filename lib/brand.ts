/* Everything a CLIENT sees that names the product, in one place.
 *
 * This is a white-label fork. Upstream's name leaked into the sign-in page,
 * the browser tab, the one-time-code email subject, and the Terms/Privacy
 * links (which pointed at a third party's policies) — so the client's first
 * contact with "our" product was somebody else's brand. Every user-facing
 * string now reads from here; nothing else may hard-code a product name.
 *
 * Owner-only surfaces (Configuration, Cache, Actions log, Collaborators) still
 * link to pagescms.org/docs on purpose: those documents describe the config
 * format this fork actually runs, and a client can never reach those pages.
 * Attribution to the upstream project stays in the About dialog — it is MIT
 * licensed and we are not pretending otherwise.
 */
export const BRAND = {
  name: "Safina Studio",
  tagline: "Edit your website without touching code.",
  siteUrl: "https://safinastudio.com",
  termsUrl: "https://safinastudio.com/terms",
  privacyUrl: "https://safinastudio.com/privacy",
  supportEmail: "hello@safinastudio.com",
  upstream: { name: "Pages CMS", url: "https://pagescms.org" },
} as const;
