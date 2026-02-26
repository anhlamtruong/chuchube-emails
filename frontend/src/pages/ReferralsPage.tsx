/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import {
  getReferrals,
  createReferral,
  updateReferral,
  deleteReferral,
  commitClipboard,
} from "@/api/client";
import type { Referral, ClipboardPreviewRow } from "@/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Plus,
  Trash2,
  Edit2,
  Upload,
  ClipboardPaste,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import ClipboardPasteModal from "@/components/ClipboardPasteModal";

const emptyForm = {
  name: "",
  email: "",
  company: "",
  title: "",
  location: "",
  notes: "",
};

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showPaste, setShowPaste] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const PER_PAGE = 100;

  // Debounce filter values
  const debouncedSearch = useDebounce(search, 300);
  const debouncedCompany = useDebounce(companyFilter, 300);
  const debouncedLocation = useDebounce(locationFilter, 300);
  const debouncedTitle = useDebounce(titleFilter, 300);

  const load = useCallback(async () => {
    const params: Record<string, string> = {
      page: "1",
      per_page: String(PER_PAGE),
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (debouncedCompany) params.company = debouncedCompany;
    if (debouncedLocation) params.location = debouncedLocation;
    if (debouncedTitle) params.title = debouncedTitle;
    const { items, total: t } = await getReferrals(params);
    setReferrals(items);
    setTotal(t);
    setPage(1);
  }, [debouncedSearch, debouncedCompany, debouncedLocation, debouncedTitle]);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const params: Record<string, string> = {
        page: String(nextPage),
        per_page: String(PER_PAGE),
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (debouncedCompany) params.company = debouncedCompany;
      if (debouncedLocation) params.location = debouncedLocation;
      if (debouncedTitle) params.title = debouncedTitle;
      const { items } = await getReferrals(params);
      setReferrals((prev) => [...prev, ...items]);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  }, [
    page,
    debouncedSearch,
    debouncedCompany,
    debouncedLocation,
    debouncedTitle,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    try {
      if (editId) {
        await updateReferral(editId, form);
        toast.success("Referral updated");
      } else {
        await createReferral(form);
        toast.success("Referral added");
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error saving referral");
    }
  };

  const handleEdit = (r: Referral) => {
    setForm({
      name: r.name,
      email: r.email,
      company: r.company,
      title: r.title,
      location: r.location,
      notes: r.notes,
    });
    setEditId(r.id);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    await deleteReferral(deleteId);
    toast.success("Deleted");
    setDeleteId(null);
    load();
  };

  const handleImportFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) =>
      /\.(xlsx|xls|csv)$/i.test(f.name),
    );
    if (arr.length === 0) {
      toast.error("No valid .xlsx/.xls/.csv files");
      return;
    }
    // Parse each CSV file via clipboard parser, commit as referrals
    try {
      let totalCreated = 0;
      let totalExisting = 0;
      for (const file of arr) {
        const text = await file.text();
        const { parseClipboard } = await import("@/api/client");
        const parsed = await parseClipboard(text);
        if (parsed.preview.length > 0) {
          const result = await commitClipboard({
            rows: parsed.preview,
            target: "referrals",
          });
          totalCreated += result.recruiters_created;
          totalExisting += result.recruiters_existing;
        }
      }
      toast.success(
        `Imported ${totalCreated} referrals (${totalExisting} already existed)`,
      );
      load();
    } catch {
      toast.error("Import failed");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0)
      await handleImportFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0)
      await handleImportFiles(e.dataTransfer.files);
  };

  const handlePasteConfirm = async (rows: ClipboardPreviewRow[]) => {
    try {
      const result = await commitClipboard({ rows, target: "referrals" });
      toast.success(
        `Created ${result.recruiters_created} referrals (${result.recruiters_existing} already existed)`,
      );
      load();
    } catch {
      toast.error("Import failed");
    }
  };

  return (
    <div
      className="relative space-y-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 bg-primary/5 border-2 border-dashed border-primary rounded-xl z-40 flex items-center justify-center">
          <div className="text-center">
            <Upload size={48} className="mx-auto text-primary mb-2" />
            <p className="text-lg font-medium">Drop Excel/CSV files here</p>
            <p className="text-sm text-muted-foreground">
              Supports .xlsx, .xls, .csv — multiple files OK
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Referrals</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPaste(true)}
          >
            <ClipboardPaste size={14} /> Paste CSV
          </Button>
          <Button size="sm" variant="outline" asChild>
            <label className="cursor-pointer">
              <Upload size={14} /> Import
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setShowForm(true);
              setEditId(null);
              setForm(emptyForm);
            }}
          >
            <Plus size={14} /> Add Referral
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-2.5 text-muted-foreground"
              size={16}
            />
            <Input
              placeholder="Search all fields..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Input
            placeholder="Filter by company..."
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          />
          <Input
            placeholder="Filter by location..."
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          />
          <Input
            placeholder="Filter by title..."
            value={titleFilter}
            onChange={(e) => setTitleFilter(e.target.value)}
          />
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "Add"} Referral</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(["name", "email", "company", "title", "location"] as const).map(
              (field) => (
                <div key={field}>
                  <Label className="capitalize">{field}</Label>
                  <Input
                    type={field === "email" ? "email" : "text"}
                    placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                    value={form[field]}
                    onChange={(e) =>
                      setForm({ ...form, [field]: e.target.value })
                    }
                  />
                </div>
              ),
            )}
            <div>
              <Label>Notes</Label>
              <Textarea
                placeholder="Notes"
                value={form.notes}
                rows={3}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!form.name || !form.email}>
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Referral</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the referral. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "#",
                  "Name",
                  "Email",
                  "Company",
                  "Title",
                  "Location",
                  "Actions",
                ].map((h) => (
                  <TableHead key={h} className={h === "#" ? "w-12" : ""}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No referrals found. Add one, import files, or paste CSV
                    data.
                  </TableCell>
                </TableRow>
              ) : (
                referrals.map((r, idx) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.company}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell>{r.location}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEdit(r)}
                          className="h-7 w-7"
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteId(r.id)}
                          className="h-7 w-7 text-destructive hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Load More */}
      {referrals.length < total && (
        <div className="flex items-center justify-center gap-3 py-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Loading…
              </>
            ) : (
              `Load More (${referrals.length} / ${total})`
            )}
          </Button>
        </div>
      )}

      {/* Clipboard Paste Modal */}
      <ClipboardPasteModal
        open={showPaste}
        onClose={() => setShowPaste(false)}
        onConfirm={handlePasteConfirm}
        title="Paste Referrals from CSV"
      />
    </div>
  );
}
