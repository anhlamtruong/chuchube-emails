import { useEffect, useState, useCallback } from "react";
import { getReferrals } from "@/api/client";
import type { Referral } from "@/api/client";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface Props {
  onSelectionChange: (ids: string[], referrals: Referral[]) => void;
  initialSelection?: string[];
}

export default function ReferralFilterPicker({
  onSelectionChange,
  initialSelection = [],
}: Props) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSelection),
  );
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (company) params.company = company;
      if (location) params.location = location;
      if (title) params.title = title;
      params.per_page = "500";
      const data = await getReferrals(params);
      setReferrals(data.items);
    } finally {
      setLoading(false);
    }
  }, [search, company, location, title]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    onSelectionChange(
      Array.from(next),
      referrals.filter((r) => next.has(r.id)),
    );
  };

  const toggleAll = () => {
    if (selected.size === referrals.length) {
      setSelected(new Set());
      onSelectionChange([], []);
    } else {
      const all = new Set(referrals.map((r) => r.id));
      setSelected(all);
      onSelectionChange(Array.from(all), referrals);
    }
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
                  checked={
                    referrals.length > 0 && selected.size === referrals.length
                  }
                  onChange={toggleAll}
                  className="cursor-pointer rounded"
                />
              </TableHead>
              {["Name", "Email", "Company", "Title", "Location"].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : referrals.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  No referrals match filters
                </TableCell>
              </TableRow>
            ) : (
              referrals.map((r) => (
                <TableRow
                  key={r.id}
                  className={`cursor-pointer ${selected.has(r.id) ? "bg-primary/5" : ""}`}
                  onClick={() => toggle(r.id)}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="cursor-pointer rounded"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-primary">{r.email}</TableCell>
                  <TableCell>{r.company}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell>{r.location}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="text-xs text-muted-foreground">
        {selected.size} of {referrals.length} selected
        {selected.size > 0 && (
          <button
            onClick={() => {
              setSelected(new Set());
              onSelectionChange([], []);
            }}
            className="ml-2 text-primary hover:underline cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
