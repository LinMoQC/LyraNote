export interface LocatorLoaderConfig {
  loader: "@locator/webpack-loader";
  options: {
    env: "development";
  };
}

export interface LocatorWebpackRule {
  test: RegExp;
  exclude: RegExp;
  use: LocatorLoaderConfig[];
}

export interface LocatorTurbopackRule {
  loaders: LocatorLoaderConfig[];
}

export function createLocatorWebpackRule(args: {
  dev: boolean;
}): LocatorWebpackRule | null;

export function createLocatorTurbopackRules(args: {
  dev: boolean;
}): Record<"**/*.{ts,tsx,js,jsx}", LocatorTurbopackRule> | undefined;
