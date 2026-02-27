import { useState, useCallback, useRef } from "react";
import { parseClipboard } from "@/api/client";
import type { ClipboardPreviewRow } from "@/api/client";
import { ClipboardPaste, Upload, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (rows: ClipboardPreviewRow[]) => void;
  title?: string;
}

export default function ClipboardPasteModal({
  open,
  onClose,
  onConfirm,
  title = "Paste Data",
}: Props) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ClipboardPreviewRow[]>([]);
  const [detectedCols, setDetectedCols] = useState<Record<string, string>>({});
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [step, setStep] = useState<"input" | "preview">("input");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParse = useCallback(async (rawText: string) => {
    if (!rawText.trim()) {
      toast.error("Please paste or type some data");
      return;
    }
    setParsing(true);
    try {
      const result = await parseClipboard(rawText);
      if (result.preview.length === 0) {
        toast.error("Could not parse any rows from the input");
        return;
      }
      setPreview(result.preview);
      setDetectedCols(result.detected_columns);
      setUnmapped(result.unmapped_columns);
      setStep("preview");
    } catch {
      toast.error("Failed to parse data");
    } finally {
      setParsing(false);
    }
  }, []);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const content = await file.text();
      setText(content);
      handleParse(content);
      e.target.value = "";
    },
    [handleParse],
  );

  const handleConfirm = () => {
    onConfirm(preview);
    handleReset();
  };

  const handleReset = () => {
    setText("");
    setPreview([]);
    setDetectedCols({});
    setUnmapped([]);
    setStep("input");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleReset()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step === "input"
              ? "Paste CSV/TSV data below, or upload a .csv file. Headers like Name, Email, Title, Company, Location are auto-detected."
              : `${preview.length} row(s) detected — review and confirm.`}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Name,Email,Title,Company\nJohn Doe,john@example.com,SWE,Google\nJane Smith,jane@acme.co,PM,Acme Inc`}
              rows={12}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring flex-1 resize-none"
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (pasted.trim()) {
                  setTimeout(() => handleParse(pasted), 100);
                }
              }}
            />
            <DialogFooter className="sm:justify-between">
              <Button variant="outline" asChild>
                <label className="cursor-pointer">
                  <Upload size={16} /> Upload .csv
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </Button>
              <Button
                onClick={() => handleParse(text)}
                disabled={parsing || !text.trim()}
              >
                {parsing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ClipboardPaste size={16} />
                )}
                Parse & Preview
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="flex-1 flex flex-col gap-3 overflow-hidden min-h-0">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">
                {preview.length} row(s) detected
              </span>
              {Object.keys(detectedCols).length > 0 && (
                <span className="text-muted-foreground">
                  Mapped: {Object.values(detectedCols).join(", ")}
                </span>
              )}
              {unmapped.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-amber-600 border-amber-300"
                >
                  Unmapped: {unmapped.join(", ")}
                </Badge>
              )}
            </div>
            <div className="flex-1 overflow-auto border border-border rounded-lg min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["#", "Name", "Email", "Title", "Company", "Location"].map(
                      (h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ),
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-primary">
                        {row.email}
                      </TableCell>
                      <TableCell>{row.title}</TableCell>
                      <TableCell>{row.company}</TableCell>
                      <TableCell>{row.location}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter className="sm:justify-between">
              <Button variant="outline" onClick={() => setStep("input")}>
                Back
              </Button>
              <Button onClick={handleConfirm}>
                <CheckCircle size={16} />
                Confirm {preview.length} row(s)
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
