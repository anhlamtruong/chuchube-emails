import { useState, useEffect, useCallback } from "react";
import {
  getCustomColumnDefinitions,
  createCustomColumnDefinition,
  updateCustomColumnDefinition,
  deleteCustomColumnDefinition,
  type CustomColumnDefinition,
} from "@/api/client";
import { toast } from "sonner";
import { Save, Loader2, Plus, Trash2, Pencil, Columns3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

export default function CustomColumnsSection() {
  const [customColumns, setCustomColumns] = useState<CustomColumnDefinition[]>(
    [],
  );
  const [customColumnsLoading, setCustomColumnsLoading] = useState(true);
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false);
  const [editingColumn, setEditingColumn] =
    useState<CustomColumnDefinition | null>(null);
  const [columnForm, setColumnForm] = useState({ name: "", default_value: "" });
  const [columnSaving, setColumnSaving] = useState(false);

  const loadCustomColumns = useCallback(async () => {
    setCustomColumnsLoading(true);
    try {
      const data = await getCustomColumnDefinitions();
      setCustomColumns(data);
    } catch {
      toast.error("Failed to load custom columns");
    } finally {
      setCustomColumnsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomColumns();
  }, [loadCustomColumns]);

  const resetColumnForm = () => {
    setColumnForm({ name: "", default_value: "" });
    setEditingColumn(null);
  };

  const openAddColumnDialog = () => {
    resetColumnForm();
    setShowAddColumnDialog(true);
  };

  const openEditColumnDialog = (col: CustomColumnDefinition) => {
    setEditingColumn(col);
    setColumnForm({ name: col.name, default_value: col.default_value });
    setShowAddColumnDialog(true);
  };

  const handleSaveColumn = async () => {
    if (!columnForm.name.trim()) {
      toast.error("Column name is required");
      return;
    }
    setColumnSaving(true);
    try {
      if (editingColumn) {
        await updateCustomColumnDefinition(editingColumn.id, {
          name: columnForm.name.trim(),
          default_value: columnForm.default_value,
        });
        toast.success("Column updated");
      } else {
        await createCustomColumnDefinition({
          name: columnForm.name.trim(),
          default_value: columnForm.default_value,
        });
        toast.success("Column created");
      }
      setShowAddColumnDialog(false);
      resetColumnForm();
      await loadCustomColumns();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to save column";
      toast.error(msg);
    } finally {
      setColumnSaving(false);
    }
  };

  const handleDeleteColumn = async (id: string) => {
    if (
      !confirm("Delete this custom column definition? This cannot be undone.")
    )
      return;
    try {
      await deleteCustomColumnDefinition(id);
      toast.success("Column deleted");
      await loadCustomColumns();
    } catch {
      toast.error("Failed to delete column");
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Columns3 size={16} />
            Custom Columns
          </CardTitle>
          <Button size="sm" onClick={openAddColumnDialog}>
            <Plus size={14} className="mr-1" /> Add Column
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 text-xs text-indigo-800">
            Define custom columns with default values. When generating or
            pasting campaign rows, these columns will be auto-populated with
            their defaults (unless overridden). Custom columns also appear as{" "}
            <code className="font-mono bg-indigo-100 px-1 rounded">
              {"{column_name}"}
            </code>{" "}
            placeholders in your email templates.
          </div>

          {customColumnsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : customColumns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No custom columns defined yet. Add one to extend your campaign
              data.
            </p>
          ) : (
            <div className="space-y-2">
              {customColumns.map((col) => (
                <div
                  key={col.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50 transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{col.name}</span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-mono px-1.5 py-0"
                      >
                        {`{${col.name}}`}
                      </Badge>
                    </div>
                    {col.default_value ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Default:{" "}
                        <span className="font-medium">{col.default_value}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">
                        No default value
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditColumnDialog(col)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteColumn(col.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Custom Column Dialog */}
      <Dialog open={showAddColumnDialog} onOpenChange={setShowAddColumnDialog}>
        <DialogContent
          className="max-w-md"
          onClose={() => {
            setShowAddColumnDialog(false);
            resetColumnForm();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editingColumn ? "Edit Custom Column" : "Add Custom Column"}
            </DialogTitle>
            <DialogDescription>
              {editingColumn
                ? "Update the column name or default value."
                : "Create a new custom column. It will appear in campaign generation dialogs and as a template placeholder."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="col-name">Column Name</Label>
              <Input
                id="col-name"
                placeholder="e.g. linkedin_url, referral_source"
                value={columnForm.name}
                onChange={(e) =>
                  setColumnForm((p) => ({ ...p, name: e.target.value }))
                }
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveColumn()}
              />
              <p className="text-[11px] text-muted-foreground">
                Use in templates as{" "}
                <code className="font-mono bg-muted px-1 rounded">{`{${columnForm.name || "column_name"}}`}</code>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="col-default">Default Value</Label>
              <Input
                id="col-default"
                placeholder="Leave empty for no default"
                value={columnForm.default_value}
                onChange={(e) =>
                  setColumnForm((p) => ({
                    ...p,
                    default_value: e.target.value,
                  }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Auto-populated when creating new campaign rows (can be
                overridden per-batch)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddColumnDialog(false);
                resetColumnForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveColumn} disabled={columnSaving}>
              {columnSaving ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Save size={14} className="mr-1" />
              )}
              {editingColumn ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
