import type { QuickStyleId, UserPreferences } from "./registry.ts";

export function reorderQuickStyles(
  styles: QuickStyleId[],
  index: number,
  direction: -1 | 1,
) {
  const target = index + direction;
  if (index < 0 || target < 0 || index >= styles.length || target >= styles.length) {
    return [...styles];
  }
  const next = [...styles];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function addQuickStyle(styles: QuickStyleId[], style: QuickStyleId) {
  if (styles.includes(style)) return { status: "unchanged" as const, styles: [...styles] };
  if (styles.length >= 5) return { status: "replace_required" as const, styles: [...styles] };
  return { status: "added" as const, styles: [...styles, style] };
}

export function removeQuickStyle(styles: QuickStyleId[], style: QuickStyleId) {
  if (!styles.includes(style) || styles.length === 1) return [...styles];
  return styles.filter((item) => item !== style);
}

export function replaceQuickStyle(
  preferences: UserPreferences,
  existing: QuickStyleId,
  replacement: QuickStyleId,
) {
  if (!preferences.rephrase.quickStyles.includes(existing)) return preferences;
  return {
    ...preferences,
    rephrase: {
      quickStyles: preferences.rephrase.quickStyles.map((style) =>
        style === existing ? replacement : style),
      defaultStyle: preferences.rephrase.defaultStyle === existing
        ? replacement
        : preferences.rephrase.defaultStyle,
    },
  };
}

export function toggleFavorite<T extends string>(values: T[], value: T, maximum: number) {
  if (values.includes(value)) return values.filter((item) => item !== value);
  if (values.length >= maximum) return [...values];
  return [...values, value];
}
