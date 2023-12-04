module.exports = {
  parser: "@babel/eslint-parser",
  env: {
    node: true,
    es6: true,
    "jest/globals": true,
  },
  parserOptions: {
    ecmaVersion: 9,
  },
  plugins: ["jest", "graphile-export"],
  extends: [
    "eslint:recommended",
    "plugin:jest/recommended",
    "plugin:prettier/recommended",
    "plugin:graphile-export/recommended",
  ],
  rules: {
    "jest/expect-expect": ["off"],
  },
};
