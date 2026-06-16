<<<<<<< Updated upstream
﻿const js = require("@eslint/js");
=======
const js = require("@eslint/js");
>>>>>>> Stashed changes
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
<<<<<<< Updated upstream
    languageOptions: {
      ecmaVersion: "latest",
=======
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: 2020,
>>>>>>> Stashed changes
      sourceType: "script",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
<<<<<<< Updated upstream
      "no-console": "warn",
=======
      // Warn on leftover debug output
      "no-console": "warn",

      // Unused catch-clause variables are fine; only warn on truly dead vars
>>>>>>> Stashed changes
      "no-unused-vars": ["warn", {
        "args": "after-used",
        "caughtErrors": "none",
        "argsIgnorePattern": "^_"
      }],
<<<<<<< Updated upstream
      "eqeqeq": ["error", "always"],
=======

      // Enforce strict equality everywhere
      "eqeqeq": ["error", "always"],

      // Catch likely mistakes
>>>>>>> Stashed changes
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-constant-condition": "error",
      "no-self-assign": "error",
    },
  },
<<<<<<< Updated upstream
];
=======
];
>>>>>>> Stashed changes
