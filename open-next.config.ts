import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = {
  ...defineCloudflareConfig(),
  // OpenNext defaults to `npm run build`, which would also fire this repo's
  // `postbuild` hook (`npm run db:migrate`). Migrations need a live database and
  // must not run while bundling the Worker, so build Next directly instead.
  buildCommand: "npx next build",
};

export default config;
