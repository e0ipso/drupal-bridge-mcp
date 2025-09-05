import { defineConfig, globalIgnores } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import prettier from "eslint-plugin-prettier";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([globalIgnores([
    "**/dist/",
    "**/node_modules/",
    "**/coverage/",
    "**/*.js",
    "!**/jest.config.js",
]), {
    extends: compat.extends(
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "prettier",
    ),

    plugins: {
        "@typescript-eslint": typescriptEslint,
        prettier,
    },

    languageOptions: {
        globals: {
            ...globals.node,
            ...globals.jest,
        },

        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",

        parserOptions: {
            project: ["./tsconfig.json", "./tsconfig.test.json"],
        },
    },

    rules: {
        "prettier/prettier": "error",

        "@typescript-eslint/no-unused-vars": ["error", {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
        }],

        "@typescript-eslint/explicit-function-return-type": ["error", {
            allowExpressions: true,
        }],

        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-non-null-assertion": "warn",
        "@typescript-eslint/prefer-nullish-coalescing": "error",
        "@typescript-eslint/prefer-optional-chain": "error",
        "@typescript-eslint/prefer-readonly": "error",
        "@typescript-eslint/prefer-string-starts-ends-with": "error",
        "@typescript-eslint/consistent-type-definitions": ["error", "interface"],

        "@typescript-eslint/consistent-type-imports": ["error", {
            prefer: "type-imports",
        }],

        "@typescript-eslint/no-import-type-side-effects": "error",

        "no-console": ["warn", {
            allow: ["warn", "error"],
        }],

        "no-debugger": "error",
        "prefer-const": "error",
        "no-var": "error",
        "object-shorthand": "error",
        "prefer-arrow-callback": "error",
        "prefer-template": "error",
        "no-duplicate-imports": "error",
        "no-useless-rename": "error",

        "prefer-destructuring": ["error", {
            array: true,
            object: true,
        }, {
            enforceForRenamedProperties: false,
        }],

        "no-throw-literal": "error",
        "prefer-promise-reject-errors": "error",
        "no-eval": "error",
        "no-implied-eval": "error",
        "no-new-func": "error",
        "no-await-in-loop": "warn",
    },
}, {
    files: ["**/*.test.ts", "**/*.spec.ts", "tests/**/*.ts"],

    rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        "no-console": "off",
    },
}, {
    files: ["**/*.config.js", "**/*.config.ts"],

    rules: {
        "@typescript-eslint/no-var-requires": "off",
        "no-console": "off",
    },
}]);