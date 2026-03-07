import type { Contact } from "@/api/contacts";
import type { ContactForm } from "@/hooks/useContactList";
import type { ClipboardPreviewRow } from "@/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  MessageSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ClipboardPasteModal from "@/components/ClipboardPasteModal";
import { parseOooNote } from "@/lib/parseOoo";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ContactListPageProps<T extends Contact> {
  /** Page heading, e.g. "Recruiters" or "Referrals" */
  heading: string;
  /** Singular entity name, e.g. "Recruiter" or "Referral" */
  entityName: string;

  // Data from useContactList
  items: T[];
  total: number;

  // Loading state for initial load
  loading: boolean;

  // Filters
  search: string;
  setSearch: (v: string) => void;
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  locationFilter: string;
  setLocationFilter: (v: string) => void;
  titleFilter: string;
  setTitleFilter: (v: string) => void;

  // Form / dialog
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  editId: string | null;
  form: ContactForm;
  setForm: (v: ContactForm) => void;

  // Paste modal
  showPaste: boolean;
  setShowPaste: (v: boolean) => void;

  // Drag state
  dragging: boolean;
  setDragging: (v: boolean) => void;

  // Delete confirmation
  deleteId: string | null;
  setDeleteId: (v: string | null) => void;

  // Refs
  fileInputRef: React.RefObject<HTMLInputElement | null>;

  // Pagination
  loadingMore: boolean;
  loadMore: () => void;

  // Handlers
  handleSave: () => void;
  handleEdit: (r: T) => void;
  handleDelete: () => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (e: React.DragEvent) => void;
  handlePasteConfirm: (rows: ClipboardPreviewRow[]) => void;
  openAdd: () => void;
}

export default function ContactListPage<T extends Contact>({
  heading,
  entityName,
  items,
  total,
  loading,
  search,
  setSearch,
  companyFilter,
  setCompanyFilter,
  locationFilter,
  setLocationFilter,
  titleFilter,
  setTitleFilter,
  showForm,
  setShowForm,
  editId,
  form,
  setForm,
  showPaste,
  setShowPaste,
  dragging,
  setDragging,
  deleteId,
  setDeleteId,
  fileInputRef,
  loadingMore,
  loadMore,
  handleSave,
  handleEdit,
  handleDelete,
  handleFileChange,
  handleDrop,
  handlePasteConfirm,
  openAdd,
}: ContactListPageProps<T>) {
  const entityLower = entityName.toLowerCase();

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
        <h2 className="text-2xl font-bold tracking-tight">{heading}</h2>
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
          <Button size="sm" onClick={openAdd}>
            <Plus size={14} /> Add {entityName}
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
            <DialogTitle>
              {editId ? "Edit" : "Add"} {entityName}
            </DialogTitle>
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
            <AlertDialogTitle>Delete {entityName}</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the {entityLower}. This cannot be
              undone.
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
                  "Status",
                  "Actions",
                ].map((h) => (
                  <TableHead key={h} className={h === "#" ? "w-12" : ""}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                // Skeleton rows during initial load
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-6" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No {entityLower}s found. Add one, import files, or paste CSV
                    data.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((r, idx) => (
                  <TableRow
                    key={r.id}
                    className={
                      r.email_status === "bounced"
                        ? "opacity-60"
                        : r.email_status === "ooo"
                          ? "opacity-75"
                          : ""
                    }
                  >
                    <TableCell className="text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.company}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell>{r.location}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {r.email_status === "bounced" ? (
                          <Badge variant="destructive" className="text-xs">
                            Bounced
                          </Badge>
                        ) : r.email_status === "risky" ? (
                          <Badge
                            variant="secondary"
                            className="text-xs bg-amber-100 text-amber-800"
                          >
                            Risky
                          </Badge>
                        ) : r.email_status === "ooo" ? (
                          <Badge
                            variant="secondary"
                            className="text-xs bg-blue-100 text-blue-700"
                          >
                            OOO
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs text-green-700"
                          >
                            Valid
                          </Badge>
                        )}
                        {(() => {
                          const ooo = parseOooNote(r.notes);
                          return ooo ? (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-blue-500 cursor-help">
                                    <MessageSquare size={13} />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="max-w-xs bg-blue-900 text-white"
                                >
                                  <p className="font-semibold">
                                    OOO since {ooo.date}
                                  </p>
                                  <p className="text-blue-200 text-[11px] mt-0.5">
                                    {ooo.message}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null;
                        })()}
                      </div>
                    </TableCell>
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
      {items.length < total && (
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
              `Load More (${items.length} / ${total})`
            )}
          </Button>
        </div>
      )}

      {/* Clipboard Paste Modal */}
      <ClipboardPasteModal
        open={showPaste}
        onClose={() => setShowPaste(false)}
        onConfirm={handlePasteConfirm}
        title={`Paste ${heading} from CSV`}
      />
    </div>
  );
}
