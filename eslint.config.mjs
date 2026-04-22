import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "lib/generated/**",
    ],
  },
  {
    // ── Hindsight house style ────────────────────────────────────────────
    // The rules below codify the patterns the team enforces by hand in
    // review. They fire as warnings so they show up in the editor and in
    // CI without blocking legitimate one-offs.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        // ── No arbitrary text sizes in className strings ─────────────
        // Tailwind's scale (text-xs/sm/base/lg/xl/2xl) covers every type
        // size the app should use. Arbitrary sizes like text-[10px] or
        // text-[11px] break visual consistency.
        {
          selector: "Literal[value=/text-\\[\\d+px\\]/]",
          message:
            "Use Tailwind's text scale (text-xs, text-sm, text-base, etc) instead of arbitrary pixel sizes like text-[10px].",
        },
        {
          selector: "TemplateElement[value.raw=/text-\\[\\d+px\\]/]",
          message:
            "Use Tailwind's text scale (text-xs, text-sm, text-base, etc) instead of arbitrary pixel sizes like text-[10px].",
        },
        // ── No font-mono ─────────────────────────────────────────────
        // For tickers/numbers use tabular-nums. For actual code blocks,
        // write a dedicated component. font-mono sneaks in from ShadCN
        // defaults and makes tickers look like code snippets.
        {
          selector: "Literal[value=/font-mono/]",
          message:
            "Don't use font-mono. For tickers/numbers use tabular-nums. For actual code blocks, write a dedicated component.",
        },
        {
          selector: "TemplateElement[value.raw=/font-mono/]",
          message:
            "Don't use font-mono. For tickers/numbers use tabular-nums. For actual code blocks, write a dedicated component.",
        },
        // ── No hardcoded hex colors in className strings ─────────────
        // Use CSS variables / Tailwind theme colors. Catches things
        // like text-[#ff0000] or bg-[#0085E6] that bypass the
        // --brand / --positive / --negative token system.
        {
          selector:
            "Literal[value=/(text|bg|border|ring|fill|stroke)-\\[#[0-9a-fA-F]{3,8}\\]/]",
          message:
            "Don't hardcode hex colors in className. Use the CSS variables defined in globals.css (--brand, --positive, --negative, etc).",
        },
        {
          selector:
            "TemplateElement[value.raw=/(text|bg|border|ring|fill|stroke)-\\[#[0-9a-fA-F]{3,8}\\]/]",
          message:
            "Don't hardcode hex colors in className. Use the CSS variables defined in globals.css (--brand, --positive, --negative, etc).",
        },
      ],
    },
  },
];

export default eslintConfig;
