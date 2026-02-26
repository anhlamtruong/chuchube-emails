import { useEffect, useState, useCallback } from "react";
import { getRecruiters } from "@/api/client";
import type { Recruiter } from "@/api/client";
import { Search } from "lucide-react";

interface Props {
  onSelectionChange: (ids: string[], recruiters: Recruiter[]) => void;
  initialSelection?: string[];
}

export default function RecruiterFilterPicker({
  onSelectionChange,
  initialSelection = [],
}: Props) {
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
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
      const data = await getRecruiters(params);
      setRecruiters(data.items);
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
      recruiters.filter((r) => next.has(r.id)),
    );
  };

  const toggleAll = () => {
    if (selected.size === recruiters.length) {
      setSelected(new Set());
      onSelectionChange([], []);
    } else {
      const all = new Set(recruiters.map((r) => r.id));
      setSelected(all);
      onSelectionChange(Array.from(all), recruiters);
    }
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-2.5 text-gray-400"
            size={14}
          />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <input
          type="text"
          placeholder="Company…"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Location…"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-auto max-h-64">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={
                    recruiters.length > 0 && selected.size === recruiters.length
                  }
                  onChange={toggleAll}
                  className="cursor-pointer"
                />
              </th>
              {["Name", "Email", "Company", "Title", "Location"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : recruiters.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                  No recruiters match filters
                </td>
              </tr>
            ) : (
              recruiters.map((r) => (
                <tr
                  key={r.id}
                  className={`cursor-pointer hover:bg-gray-50 ${selected.has(r.id) ? "bg-blue-50" : ""}`}
                  onClick={() => toggle(r.id)}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-blue-600">{r.email}</td>
                  <td className="px-3 py-2">{r.company}</td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2">{r.location}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-500">
        {selected.size} of {recruiters.length} selected
        {selected.size > 0 && (
          <button
            onClick={() => {
              setSelected(new Set());
              onSelectionChange([], []);
            }}
            className="ml-2 text-blue-600 hover:underline cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
