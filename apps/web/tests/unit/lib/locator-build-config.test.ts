import {
  createLocatorTurbopackRules,
  createLocatorWebpackRule,
} from "../../../config/locator-build-config";
import { describe, expect, it } from "vitest";

describe("locator build config", () => {
  it("enables the same webpack loader configuration in development", () => {
    const serverRule = createLocatorWebpackRule({ dev: true });
    const clientRule = createLocatorWebpackRule({ dev: true });

    expect(serverRule).toEqual(clientRule);
    expect(serverRule).toMatchObject({
      exclude: /node_modules/,
      use: [
        {
          loader: "@locator/webpack-loader",
          options: { env: "development" },
        },
      ],
    });
  });

  it("skips locator webpack instrumentation outside development", () => {
    expect(createLocatorWebpackRule({ dev: false })).toBeNull();
  });

  it("only enables turbopack rules in development", () => {
    expect(createLocatorTurbopackRules({ dev: true })).toEqual({
      "**/*.{ts,tsx,js,jsx}": {
        loaders: [
          {
            loader: "@locator/webpack-loader",
            options: { env: "development" },
          },
        ],
      },
    });
    expect(createLocatorTurbopackRules({ dev: false })).toBeUndefined();
  });
});
