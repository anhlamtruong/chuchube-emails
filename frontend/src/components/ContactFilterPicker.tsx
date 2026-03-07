import { useEffect, useState, useCallback, type MouseEvent } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import type { Contact } from "@/api/contacts";
import type { Paginated } from "@/api/client";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { hasOooNote, parseOooNote } from "@/lib/parseOoo";
import { useShiftSelect } from "@/hooks/useShiftSelect";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface Props<T extends Contact> {
  /** Function that fetches paginated contact data */
  fetchFn: (params?: Record<string, string | number>) => Promise<Paginated<T>>;
  /** Label shown in empty state, e.g. "recruiters" or "referrals" */
  entityLabel: string;
  onSelectionChange: (ids: string[], items: T[]) => void;
  initialSelection?: string[];
}

export default function ContactFilterPicker<T extends Contact>({
  fetchFn,
  entityLabel,
  onSelectionChange,
  initialSelection = [],
}: Props<T>) {
  const [items, setItems] = useState<T[]>([]);
  const {
    selected,
    toggle: shiftToggle,
    selectAll: hookSelectAll,
    deselectAll,
    selectByFilter,
    invertSelection,
  } = useShiftSelect(initialSelection);
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  // Debounce filter values to avoid API calls on every keystroke
  const debouncedSearch = useDebounce(search, 300);
  const debouncedCompany = useDebounce(company, 300);
  const debouncedLocation = useDebounce(location, 300);
  const debouncedTitle = useDebounce(title, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (debouncedCompany) params.company = debouncedCompany;
      if (debouncedLocation) params.location = debouncedLocation;
      if (debouncedTitle) params.title = debouncedTitle;
      params.per_page = "500";
      const data = await fetchFn(params);
      setItems(data.items);
    } catch {
      /* silently fail — filter picker stays empty */
    } finally {
      setLoading(false);
    }
  }, [
    debouncedSearch,
    debouncedCompany,
    debouncedLocation,
    debouncedTitle,
    fetchFn,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  // Notify parent whenever selection changes
  const notify = useCallback(
    (next: Set<string>) => {
      onSelectionChange(
        Array.from(next),
        items.filter((r) => next.has(r.id)),
      );
    },
    [onSelectionChange, items],
  );

  const handleRowClick = (e: MouseEvent, id: string, index: number) => {
    e.stopPropagation();
    const ids = items.map((r) => r.id);
    const next = shiftToggle(id, index, e.shiftKey, ids);
    notify(next);
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      const next = deselectAll();
      notify(next);
    } else {
      const next = hookSelectAll(items.map((r) => r.id));
      notify(next);
    }
  };

  const handleSelectValid = () => {
    const next = selectByFilter(
      items,
      (r) =>
        r.email_status !== "bounced" &&
        r.email_status !== "ooo" &&
        !hasOooNote(r.notes),
    );
    notify(next);
  };

  const handleExcludeBounced = () => {
    const next = selectByFilter(items, (r) => r.email_status !== "bounced");
    notify(next);
  };

  const handleInvert = () => {
    const next = invertSelection(items.map((r) => r.id));
    notify(next);
  };

  const handleClear = () => {
    const next = deselectAll();
    notify(next);
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-2.5 text-muted-foreground"
            size={14}
          />
          <Input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Input
          type="text"
          placeholder="Company…"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <Input
          type="text"
          placeholder="Location…"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <Input
          type="text"
          placeholder="Title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-auto max-h-64">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selected.size === items.length}
                  onChange={toggleAll}
                  className="cursor-pointer rounded"
                />
              </TableHead>
              {["Name", "Email", "Company", "Title", "Location", "Status"].map(
                (h) => (
                  <TableHead key={h}>{h}</TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                >
                  No {entityLabel} match filters
                </TableCell>
              </TableRow>
            ) : (
              items.map((r, idx) => (
                <TableRow
                  key={r.id}
                  className={`cursor-pointer ${selected.has(r.id) ? "bg-primary/5" : ""} ${r.email_status === "bounced" ? "opacity-50" : r.email_status === "ooo" ? "opacity-60" : ""}`}
                  onClick={(e) => handleRowClick(e, r.id, idx)}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={(e) =>
                        handleRowClick(e as unknown as MouseEvent, r.id, idx)
                      }
                      className="cursor-pointer rounded"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-primary">{r.email}</TableCell>
                  <TableCell>{r.company}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell>{r.location}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {r.email_status === "bounced" ? (
                        <span className="text-xs text-red-600 font-medium">
                          Bounced
                        </span>
                      ) : r.email_status === "risky" ? (
                        <span className="text-xs text-amber-600 font-medium">
                          Risky
                        </span>
                      ) : r.email_status === "ooo" ? (
                        <span className="text-xs text-blue-600 font-medium">
                          OOO
                        </span>
                      ) : null}
                      {hasOooNote(r.notes) &&
                        (() => {
                          const o = parseOooNote(r.notes);
                          return (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 cursor-help">
                                    OOO
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="max-w-xs bg-blue-900 text-white"
                                >
                                  <p className="font-semibold">
                                    OOO {o ? `since ${o.date}` : ""}
                                  </p>
                                  {o && (
                                    <p className="text-blue-200 text-[11px] mt-0.5">
                                      {o.message}
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })()}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {/* Quick-action toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[11px] px-2"
          onClick={handleSelectValid}
        >
          Select Valid
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[11px] px-2"
          onClick={handleExcludeBounced}
        >
          Exclude Bounced
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[11px] px-2"
          onClick={handleInvert}
        >
          Invert
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {selected.size} of {items.length} selected
          {selected.size > 0 && (
            <button
              onClick={handleClear}
              className="ml-2 text-primary hover:underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        💡 Hold{" "}
        <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Shift</kbd> +
        click to select a range
      </p>
    </div>
  );
}
