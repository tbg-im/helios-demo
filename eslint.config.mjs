import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Next.js's `basePath` config handles the /apps/<slug> prefix for routing
// primitives (`<Link>`, `useRouter`, `redirect`, `usePathname`) automatically,
// so apps can use them from `next/link` and `next/navigation` directly. The
// one exception is native `fetch`, which doesn't honor basePath — `tbFetch`
// from `@/lib/teambridge` prepends the prefix for same-origin requests.
const tbProxyRules = {
  "no-restricted-syntax": [
    "error",
    {
      selector: "CallExpression[callee.type='Identifier'][callee.name='fetch']",
      message:
        "Use tbFetch from '@/lib/teambridge/fetch' instead of bare fetch — it prepends the /apps/<slug> proxy prefix.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: tbProxyRules,
  },
  {
    // `tbFetch` itself wraps the original, and `lib/teambridge/client` talks
    // to external Teambridge URLs at absolute URLs. Both intentional.
    files: ["lib/teambridge/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);

export default eslintConfig;
