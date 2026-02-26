import { useState, useCallback, useRef } from "react";
import { parseClipboard } from "@/api/client";
import type { ClipboardPreviewRow } from "@/api/client";
import { X, ClipboardPaste, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && handleReset()}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={handleReset}
            className="text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {step === "input" && (
          <div className="p-4 flex-1 flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Paste CSV/TSV data below, or upload a .csv file. Headers like
              Name, Email, Title, Company, Location are auto-detected.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Name,Email,Title,Company\nJohn Doe,john@example.com,SWE,Google\nJane Smith,jane@acme.co,PM,Acme Inc`}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 resize-none"
              onPaste={(e) => {
                // Auto-parse on paste
                const pasted = e.clipboardData.getData("text");
                if (pasted.trim()) {
                  setTimeout(() => handleParse(pasted), 100);
                }
              }}
            />
            <div className="flex gap-2 justify-between">
              <div className="flex gap-2">
                <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                  <Upload size={16} /> Upload .csv
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <button
                onClick={() => handleParse(text)}
                disabled={parsing || !text.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                {parsing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ClipboardPaste size={16} />
                )}
                Parse & Preview
              </button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="p-4 flex-1 flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium text-gray-900">
                {preview.length} row(s) detected
              </span>
              {Object.keys(detectedCols).length > 0 && (
                <span className="text-gray-500">
                  Mapped: {Object.values(detectedCols).join(", ")}
                </span>
              )}
              {unmapped.length > 0 && (
                <span className="text-amber-600">
                  Unmapped: {unmapped.join(", ")}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    {["#", "Name", "Email", "Title", "Company", "Location"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2 text-blue-600">{row.email}</td>
                      <td className="px-3 py-2">{row.title}</td>
                      <td className="px-3 py-2">{row.company}</td>
                      <td className="px-3 py-2">{row.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep("input")}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 cursor-pointer"
              >
                Confirm {preview.length} row(s)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
