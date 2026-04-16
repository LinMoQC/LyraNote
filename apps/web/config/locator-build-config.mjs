const LOCATOR_LOADER = "@locator/webpack-loader";

export function createLocatorWebpackRule({ dev }) {
  if (!dev) {
    return null;
  }

  return {
    test: /\.(tsx|ts|jsx|js)$/,
    exclude: /node_modules/,
    use: [
      {
        loader: LOCATOR_LOADER,
        options: { env: "development" },
      },
    ],
  };
}

export function createLocatorTurbopackRules({ dev }) {
  if (!dev) {
    return undefined;
  }

  return {
    "**/*.{ts,tsx,js,jsx}": {
      loaders: [
        {
          loader: LOCATOR_LOADER,
          options: { env: "development" },
        },
      ],
    },
  };
}
