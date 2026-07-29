import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  // Generated Cloudflare Worker build output — never lint it (it is large
  // enough to exhaust ESLint's heap).
  { ignores: [".open-next/**", ".wrangler/**"] },
  ...nextCoreWebVitals,
  {
    rules: {
      "react/display-name": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
];

export default config;
