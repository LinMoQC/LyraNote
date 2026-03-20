export function parseCitations(content: string) {
  const matches = [...content.matchAll(/\[\[(\d+)\]\]/g)];
  return matches.map((match) => Number(match[1]));
}
