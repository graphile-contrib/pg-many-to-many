module.exports = {
  plugins: ["@babel/plugin-transform-modules-commonjs"],
  presets: [
    [
      "@babel/env",
      {
        targets: {
          node: "16.12",
        },
      },
    ],
    "@babel/preset-typescript",
  ],
};
