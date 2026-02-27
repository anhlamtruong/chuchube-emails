/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useMemo } from "react";
import Editor from "@monaco-editor/react";
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplate,
  getCustomColumnDefinitions,
} from "@/api/client";
import type { Template, CustomColumnDefinition } from "@/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Trash2, Eye, Save, Lock } from "lucide-react";
import { toast } from "sonner";

const BUILT_IN_PLACEHOLDERS = [
  "{first_name}",
  "{company}",
  "{position}",
  "{value_prop_sentence}",
  "{your_name}",
  "{your_phone_number}",
  "{your_email}",
  "{your_city_and_state}",
  "{dynamic_image_tag}",
  "{name}",
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [subjectLine, setSubjectLine] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [preview, setPreview] = useState<{
    subject: string;
    body: string;
  } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<Template | null>(null);
  const [customColDefs, setCustomColDefs] = useState<CustomColumnDefinition[]>([]);

  const myTemplates = templates.filter((t) => (t as any).user_id);
  const systemTemplates = templates.filter((t) => !(t as any).user_id);

  const load = async () => {
    const data = await getTemplates();
    setTemplates(data);
  };

  useEffect(() => {
    load();
    getCustomColumnDefinitions().then(setCustomColDefs).catch(() => {});
  }, []);

  const selectTemplate = async (t: Template) => {
    const full = await getTemplate(t.id);
    setSelected(full);
    setSubjectLine(full.subject_line);
    setBodyHtml(full.body_html);
    setHasChanges(false);
    setPreview(null);
  };

  const handleSelect = async (t: Template) => {
    if (hasChanges) {
      setDiscardTarget(t);
      return;
    }
    selectTemplate(t);
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      await updateTemplate(selected.id, {
        subject_line: subjectLine,
        body_html: bodyHtml,
      });
      toast.success("Template saved");
      setHasChanges(false);
      load();
    } catch {
      toast.error("Save failed");
    }
  };

  const handlePreview = async () => {
    if (!selected) return;
    try {
      const result = await previewTemplate(selected.id, {
        first_name: "John",
        company: "Acme Corp",
        position: "Software Engineer",
        value_prop_sentence: "I'm passionate about building great software.",
        your_name: "Your Name",
        your_phone_number: "(555) 555-5555",
        your_email: "you@example.com",
        your_city_and_state: "City, ST",
      });
      setPreview(result);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Preview failed");
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const t = await createTemplate({
        name: newName.trim(),
        subject_line: "Subject: New Template",
        body_html: "<p>Hello {first_name},</p>",
      });
      toast.success("Template created");
      setShowNew(false);
      setNewName("");
      await load();
      selectTemplate(t);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed");
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    await deleteTemplate(deleteId);
    toast.success("Deleted");
    if (selected?.id === deleteId) {
      setSelected(null);
      setSubjectLine("");
      setBodyHtml("");
    }
    setDeleteId(null);
    load();
  };

  const isSystem = (t: Template) => !(t as any).user_id;

  const placeholders = useMemo(() => {
    const custom = customColDefs.map((d) => `{${d.name}}`);
    const builtInSet = new Set(BUILT_IN_PLACEHOLDERS);
    const extras = custom.filter((p) => !builtInSet.has(p));
    return [...BUILT_IN_PLACEHOLDERS, ...extras];
  }, [customColDefs]);

  const renderTemplateItem = (t: Template) => (
    <div
      key={t.id}
      onClick={() => handleSelect(t)}
      className={`flex items-center justify-between px-3 py-2.5 cursor-pointer border-b border-border text-sm ${
        selected?.id === t.id
          ? "bg-accent text-accent-foreground font-medium"
          : "text-foreground hover:bg-muted"
      }`}
    >
      <span className="truncate flex items-center gap-1.5">
        {isSystem(t) && (
          <Lock size={12} className="text-muted-foreground shrink-0" />
        )}
        {t.name}
      </span>
      {!isSystem(t) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDeleteId(t.id);
          }}
          className="p-1 text-muted-foreground hover:text-destructive cursor-pointer"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );

  return (
    <div className="flex h-full gap-4">
      {/* Sidebar — template list */}
      <Card className="w-64 shrink-0 flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Templates</h3>
          <Button size="icon" variant="ghost" onClick={() => setShowNew(true)}>
            <Plus size={16} />
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          {myTemplates.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
                My Templates
              </div>
              {myTemplates.map(renderTemplateItem)}
            </>
          )}
          {systemTemplates.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/50">
                System Templates
              </div>
              {systemTemplates.map(renderTemplateItem)}
            </>
          )}
          {templates.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No templates yet
            </p>
          )}
        </div>
      </Card>

      {/* New Template Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Template Name</Label>
              <Input
                placeholder="e.g. Cold Outreach"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNew(false);
                setNewName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create</Button>
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
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the template. This action cannot be
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

      {/* Discard Changes Confirmation */}
      <AlertDialog
        open={discardTarget !== null}
        onOpenChange={(o) => !o && setDiscardTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Switching templates will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDiscardTarget(null)}>
              Stay
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = discardTarget!;
                setDiscardTarget(null);
                selectTemplate(target);
              }}
            >
              Discard
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-lg font-semibold truncate">
                {selected.name}
              </h3>
              {isSystem(selected) && (
                <Badge variant="secondary" className="gap-1 shrink-0">
                  <Lock size={10} /> System
                </Badge>
              )}
              <div className="flex-1" />
              {hasChanges && (
                <Badge
                  variant="outline"
                  className="text-amber-600 border-amber-300"
                >
                  Unsaved
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={handlePreview}>
                <Eye size={14} /> Preview
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSystem(selected)}
              >
                <Save size={14} /> Save
              </Button>
            </div>

            {/* Subject line */}
            <div className="mb-3">
              <Label className="text-xs mb-1">Subject Line</Label>
              <Input
                value={subjectLine}
                onChange={(e) => {
                  setSubjectLine(e.target.value);
                  setHasChanges(true);
                }}
                disabled={isSystem(selected)}
              />
            </div>

            {/* Placeholders reference */}
            <div className="mb-3 flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">
                Placeholders:
              </span>
              {placeholders.map((p) => (
                <Badge
                  key={p}
                  variant="secondary"
                  className="text-xs font-mono cursor-pointer hover:bg-primary/10"
                  onClick={() => {
                    navigator.clipboard.writeText(p);
                    toast.success(`Copied ${p}`);
                  }}
                >
                  {p}
                </Badge>
              ))}
            </div>

            {/* Editor + Preview split */}
            <div className="flex-1 flex gap-4 min-h-0">
              <Card className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  defaultLanguage="html"
                  value={bodyHtml}
                  onChange={(val) => {
                    setBodyHtml(val || "");
                    setHasChanges(true);
                  }}
                  theme="vs-light"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: "on",
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    readOnly: isSystem(selected),
                  }}
                />
              </Card>

              {preview && (
                <Card className="flex-1 overflow-auto">
                  <div className="p-4 border-b border-border bg-muted">
                    <p className="text-xs text-muted-foreground">
                      Subject preview:
                    </p>
                    <p className="text-sm font-medium">{preview.subject}</p>
                  </div>
                  <div
                    className="p-4"
                    dangerouslySetInnerHTML={{ __html: preview.body }}
                  />
                </Card>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a template from the sidebar to edit
          </div>
        )}
      </div>
    </div>
  );
}
