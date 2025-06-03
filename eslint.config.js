const {
    defineConfig,
    globalIgnores,
} = require("eslint/config");

const tsParser = require("@typescript-eslint/parser");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const jest = require("eslint-plugin-jest");
const lodash = require("eslint-plugin-lodash");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});
const inCi = !!process.env["CI_PIPELINE_ID"];
const expensive = inCi || !!process.env["ESLINT_STRICT"];
const errLevel = expensive ? "error" : "warn";

module.exports = defineConfig([{
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2018,
        sourceType: "module",

        parserOptions: {
            project: expensive ? "./tsconfig-validate.json" : undefined,
            tsconfigRootDir: expensive ? "." : undefined,
        },
    },

    extends: compat.extends("prettier/@typescript-eslint"),

    plugins: {
        "@typescript-eslint": typescriptEslint,
        jest,
        lodash,
    },

    rules: {
        "no-return-await": "off",

        ...(expensive ? {
            "@typescript-eslint/no-floating-promises": errLevel,
            "@typescript-eslint/return-await": errLevel,
        } : {}),

        "no-console": [errLevel, {
            allow: [
                "time",
                "timeEnd",
                "trace",
                "warn",
                "error",
                "info",
                "groupEnd",
                "group",
                "groupCollapsed",
            ],
        }],

        "no-debugger": 2,
        "jest/no-focused-tests": errLevel,
        "lodash/import-scope": [errLevel, "member"],
    },
}, globalIgnores(["**/build", "**/*.min.js"])]);
