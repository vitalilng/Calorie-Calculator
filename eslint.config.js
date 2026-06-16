const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-console": "warn",
      "no-unused-vars": ["warn", {
        "args": "after-used",
        "caughtErrors": "none",
        "argsIgnorePattern": "^_"
      }],
      "eqeqeq": ["error", "always"],
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-constant-condition": "error",
      "no-self-assign": "error",
    },
  },
];
