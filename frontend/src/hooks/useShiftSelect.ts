import { useState, useRef, useCallback } from "react";

/**
 * Reusable hook for enhanced bulk selection with shift-click range support,
 * select-by-filter, and invert.
 */
export function useShiftSelect(initialIds: string[] = []) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialIds),
  );
  const lastIdx = useRef<number | null>(null);

  /**
   * Toggle a single item. When `shiftKey` is true and an ordered list of ids
   * is provided, range-select between the last-clicked index and the current
   * index (inclusive).
   */
  const toggle = useCallback(
    (
      id: string,
      index: number,
      shiftKey: boolean,
      orderedIds: string[],
    ): Set<string> => {
      let next: Set<string>;

      if (shiftKey && lastIdx.current !== null) {
        next = new Set(selected);
        const start = Math.min(lastIdx.current, index);
        const end = Math.max(lastIdx.current, index);
        // Determine action: if the clicked item is already selected, deselect range; else select range
        const adding = !selected.has(id);
        for (let i = start; i <= end; i++) {
          if (adding) next.add(orderedIds[i]);
          else next.delete(orderedIds[i]);
        }
      } else {
        next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }

      lastIdx.current = index;
      setSelected(next);
      return next;
    },
    [selected],
  );

  /** Select all given ids. */
  const selectAll = useCallback((ids: string[]) => {
    const next = new Set(ids);
    setSelected(next);
    lastIdx.current = null;
    return next;
  }, []);

  /** Clear selection. */
  const deselectAll = useCallback(() => {
    const next = new Set<string>();
    setSelected(next);
    lastIdx.current = null;
    return next;
  }, []);

  /** Select items matching a predicate. */
  const selectByFilter = useCallback(
    <T extends { id: string }>(items: T[], predicate: (item: T) => boolean) => {
      const next = new Set(items.filter(predicate).map((i) => i.id));
      setSelected(next);
      lastIdx.current = null;
      return next;
    },
    [],
  );

  /** Invert selection relative to the given id list. */
  const invertSelection = useCallback(
    (allIds: string[]) => {
      const next = new Set<string>();
      for (const id of allIds) {
        if (!selected.has(id)) next.add(id);
      }
      setSelected(next);
      lastIdx.current = null;
      return next;
    },
    [selected],
  );

  /** Replace the selection directly (for parent-driven resets). */
  const replaceSelection = useCallback((ids: string[]) => {
    const next = new Set(ids);
    setSelected(next);
    lastIdx.current = null;
    return next;
  }, []);

  return {
    selected,
    toggle,
    selectAll,
    deselectAll,
    selectByFilter,
    invertSelection,
    replaceSelection,
  };
}
