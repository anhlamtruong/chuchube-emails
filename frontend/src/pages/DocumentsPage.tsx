import { useEffect, useState, useCallback, useRef } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  getDocuments,
  uploadDocument,
  uploadDocuments,
  deleteDocument,
  downloadDocument,
} from "@/api/client";
import type { DocumentItem } from "@/api/client";
import { Upload, Trash2, Download, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

type Scope = "global" | "sender" | "campaign_row";

const scopeMeta: Record<Scope, { label: string; description: string }> = {
  global: {
    label: "Global Attachments",
    description: "Attached to every email sent",
  },
  sender: {
    label: "Per-Sender Resumes",
    description: "Attached when sending from a specific sender email",
  },
  campaign_row: {
    label: "Campaign Row",
    description: "Attached to a specific campaign row",
  },
};

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DocumentsPage() {
  usePageTitle("Documents");
  const [activeScope, setActiveScope] = useState<Scope>("global");
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [scopeRef, setScopeRef] = useState("");
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const params: Record<string, string> = { scope: activeScope };
      if (scopeRef && activeScope !== "global") params.scope_ref = scopeRef;
      const data = await getDocuments(params);
      setDocs(data);
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [activeScope, scopeRef]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const ref = activeScope === "global" ? undefined : scopeRef || undefined;
    try {
      if (arr.length === 1) {
        await uploadDocument(arr[0], activeScope, ref);
      } else {
        await uploadDocuments(arr, activeScope, ref);
      }
      toast.success(`Uploaded ${arr.length} file(s)`);
      load();
    } catch {
      toast.error("Upload failed");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0)
      await handleUpload(e.target.files);
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0)
      await handleUpload(e.dataTransfer.files);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument(deleteTarget.id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleDownload = async (id: string, name: string) => {
    try {
      await downloadDocument(id, name);
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <div
      className="relative space-y-6"
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
            <p className="text-lg font-medium text-primary">
              Drop files here to upload
            </p>
            <p className="text-sm text-muted-foreground">
              as {scopeMeta[activeScope].label}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Documents & Attachments
          </h2>
          <p className="text-muted-foreground text-sm">
            Manage files attached to emails by scope
          </p>
        </div>
        <Button asChild>
          <label className="cursor-pointer">
            <Upload size={16} className="mr-2" /> Upload Files
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </Button>
      </div>

      {/* Scope Tabs */}
      <Tabs
        value={activeScope}
        onValueChange={(v) => {
          setActiveScope(v as Scope);
          setScopeRef("");
        }}
      >
        <TabsList>
          {(Object.keys(scopeMeta) as Scope[]).map((s) => (
            <TabsTrigger key={s} value={s}>
              {scopeMeta[s].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(scopeMeta) as Scope[]).map((s) => (
          <TabsContent key={s} value={s}>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {scopeMeta[s].description}
                </p>
                {s !== "global" && (
                  <div className="flex items-center gap-3">
                    <Label className="min-w-fit">
                      {s === "sender" ? "Sender email:" : "Campaign row ID:"}
                    </Label>
                    <Input
                      value={scopeRef}
                      onChange={(e) => setScopeRef(e.target.value)}
                      placeholder={
                        s === "sender" ? "e.g. john@company.com" : "e.g. 42"
                      }
                      className="max-w-sm"
                    />
                    <Button variant="secondary" onClick={load}>
                      Filter
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* File List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Scope Ref</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={`skel-${i}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : docs.length === 0 ? (
            <div className="p-12 text-center">
              <FileText
                size={48}
                className="mx-auto text-muted-foreground/40 mb-3"
              />
              <p className="text-muted-foreground text-sm">
                No documents uploaded for this scope yet.
              </p>
              <p className="text-muted-foreground/60 text-xs mt-1">
                Drag & drop files here or click Upload.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Scope Ref</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        <FileText size={16} className="text-muted-foreground" />
                        {doc.original_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{doc.mime_type}</Badge>
                    </TableCell>
                    <TableCell>{formatBytes(doc.size_bytes)}</TableCell>
                    <TableCell>{doc.scope_ref || "—"}</TableCell>
                    <TableCell>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleDownload(doc.id, doc.original_name)
                          }
                          title="Download"
                        >
                          <Download size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeleteTarget({
                              id: doc.id,
                              name: doc.original_name,
                            })
                          }
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
