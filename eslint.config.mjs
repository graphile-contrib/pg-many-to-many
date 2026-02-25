// @ts-check
import babelParser from "@babel/eslint-parser";
import fs from "node:fs";
import path from "node:path";
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
import graphileExport from "eslint-plugin-graphile-export";
import jest from "eslint-plugin-jest";
import globals from "globals";

const __dirname = import.meta.dirname;

const globalIgnoresFromFile = fs
  .readFileSync(path.resolve(__dirname, ".lintignore"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    let text = line;
    text = text.startsWith("/") ? text.substring(1) : `**/${text}`;
    text = text.endsWith("/") ? text + "**" : text;
    return text;
  });

/** @type {import('@eslint/config-helpers').ConfigWithExtends} */
const config = {
  languageOptions: {
    parser: babelParser,
    ecmaVersion: 9,
    sourceType: "module",
    globals: {
      ...globals.es6,
      ...globals.node,
      ...globals.jest,
    },
  },

  plugins: {
    jest,
  },

  rules: {
    "jest/expect-expect": "off",
  },
};

export default defineConfig([
  // "eslint:recommended"
  js.configs.recommended,

  // "plugin:prettier/recommended"
  prettier, // not a plugin, just a config object

  // "plugin:graphile-export/recommended"
  graphileExport.configs.recommended,

  config,

  globalIgnores(globalIgnoresFromFile),
]);
