export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function formatDuration(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${(value / 1000).toFixed(1)} s`;
}

export function formatPercent(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }
  return `${value.toFixed(1)}%`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}
