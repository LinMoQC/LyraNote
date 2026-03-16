"use client";

/**
 * @file 媒体查询 Hook
 * @description 响应式媒体查询监听，返回当前是否匹配指定的 CSS 媒体查询。
 */

import { useEffect, useState } from "react";

/**
 * 媒体查询监听 Hook
 * @param query - CSS 媒体查询字符串（如 "(min-width: 768px)"）
 * @returns 当前是否匹配该查询
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, [query]);

  return matches;
}
