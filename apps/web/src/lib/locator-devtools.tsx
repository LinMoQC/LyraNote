"use client";

import { useEffect } from "react";

/**
 * LocatorJS：开发环境下在页面中启用「点击组件跳转编辑器」浮层。
 * @see https://www.locatorjs.com/install/react
 */
export function LocatorDevtools() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    void import("@locator/runtime").then((m) => {
      const setup = m.default;
      if (typeof setup === "function") setup();
    });
  }, []);
  return null;
}
