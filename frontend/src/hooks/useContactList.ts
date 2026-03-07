/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import {
  commitClipboard,
  parseClipboard,
  importRecruitersBulk,
} from "@/api/client";
import type { Contact } from "@/api/contacts";
import type { ClipboardPreviewRow, Paginated } from "@/api/client";
import { toast } from "sonner";
import { handleApiError } from "@/lib/errorUtils";

const emptyForm = {
  name: "",
  email: "",
  company: "",
  title: "",
  location: "",
  notes: "",
};

export type ContactForm = typeof emptyForm;

interface ContactApi<T extends Contact> {
  getAll: (
    params?: Record<string, string | number>,
    signal?: AbortSignal,
  ) => Promise<Paginated<T>>;
  create: (data: Partial<T>) => Promise<T>;
  update: (id: string, data: Partial<T>) => Promise<T>;
  delete: (id: string) => Promise<any>;
}

type ImportStrategy = "bulk" | "clipboard";

interface UseContactListOptions<T extends Contact> {
  /** Display name shown in toasts, e.g. "Recruiter" or "Referral" */
  entityName: string;
  /** CRUD API created via createContactApi */
  api: ContactApi<T>;
  /**
   * "bulk"     — uses importRecruitersBulk (FormData multipart)
   * "clipboard" — reads files as text → parseClipboard → commitClipboard
   */
  importStrategy: ImportStrategy;
  /** Clipboard commit target, e.g. "recruiters" or "referrals" */
  clipboardTarget: "recruiters" | "referrals";
}

export function useContactList<T extends Contact>({
  entityName,
  api,
  importStrategy,
  clipboardTarget,
}: UseContactListOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [showPaste, setShowPaste] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loading state for initial load
  const [loading, setLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const PER_PAGE = 100;

  // Request counter to prevent stale responses from overwriting fresh data
  const requestIdRef = useRef(0);
  // Abort controller to cancel in-flight requests on unmount or re-fetch
  const abortRef = useRef<AbortController | null>(null);

  // Debounce filter values
  const debouncedSearch = useDebounce(search, 300);
  const debouncedCompany = useDebounce(companyFilter, 300);
  const debouncedLocation = useDebounce(locationFilter, 300);
  const debouncedTitle = useDebounce(titleFilter, 300);

  const load = useCallback(async () => {
    // Cancel any in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const currentRequestId = ++requestIdRef.current;
    try {
      const params: Record<string, string> = {
        page: "1",
        per_page: String(PER_PAGE),
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (debouncedCompany) params.company = debouncedCompany;
      if (debouncedLocation) params.location = debouncedLocation;
      if (debouncedTitle) params.title = debouncedTitle;
      const { items: data, total: t } = await api.getAll(
        params,
        controller.signal,
      );
      // Only apply results if this is still the latest request
      if (currentRequestId !== requestIdRef.current) return;
      setItems(data);
      setTotal(t);
      setPage(1);
    } catch {
      if (currentRequestId !== requestIdRef.current) return;
      handleApiError(null, `Failed to load ${entityName.toLowerCase()}s`);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    debouncedSearch,
    debouncedCompany,
    debouncedLocation,
    debouncedTitle,
    api,
    entityName,
  ]);

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
      const { items: data } = await api.getAll(params);
      setItems((prev) => [...prev, ...data]);
      setPage(nextPage);
    } catch {
      handleApiError(null, `Failed to load more ${entityName.toLowerCase()}s`);
    } finally {
      setLoadingMore(false);
    }
  }, [
    page,
    debouncedSearch,
    debouncedCompany,
    debouncedLocation,
    debouncedTitle,
    api,
    entityName,
  ]);

  useEffect(() => {
    load();
    return () => {
      // Cancel any in-flight request when filters change or component unmounts
      abortRef.current?.abort();
    };
  }, [load]);

  const handleSave = async () => {
    try {
      if (editId) {
        await api.update(editId, form as unknown as Partial<T>);
        toast.success(`${entityName} updated`);
      } else {
        await api.create(form as unknown as Partial<T>);
        toast.success(`${entityName} added`);
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      load();
    } catch (err) {
      handleApiError(err, `Error saving ${entityName.toLowerCase()}`);
    }
  };

  const handleEdit = (r: T) => {
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
    try {
      await api.delete(deleteId);
      toast.success("Deleted");
      setDeleteId(null);
      load();
    } catch (err) {
      handleApiError(err, `Failed to delete ${entityName.toLowerCase()}`);
    }
  };

  const handleImportFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) =>
      /\.(xlsx|xls|csv)$/i.test(f.name),
    );
    if (arr.length === 0) {
      toast.error("No valid .xlsx/.xls/.csv files");
      return;
    }

    try {
      if (importStrategy === "bulk") {
        const result = await importRecruitersBulk(arr);
        toast.success(
          `Imported ${result.created} ${entityName.toLowerCase()}s (${result.skipped} skipped)`,
        );
      } else {
        // clipboard strategy
        let totalCreated = 0;
        let totalExisting = 0;
        for (const file of arr) {
          const text = await file.text();
          const parsed = await parseClipboard(text);
          if (parsed.preview.length > 0) {
            const result = await commitClipboard({
              rows: parsed.preview,
              target: clipboardTarget,
            });
            totalCreated += result.recruiters_created;
            totalExisting += result.recruiters_existing;
          }
        }
        toast.success(
          `Imported ${totalCreated} ${entityName.toLowerCase()}s (${totalExisting} already existed)`,
        );
      }
      load();
    } catch (err) {
      handleApiError(err, "Import failed");
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
      const result = await commitClipboard({ rows, target: clipboardTarget });
      toast.success(
        `Created ${result.recruiters_created} ${entityName.toLowerCase()}s (${result.recruiters_existing} already existed)`,
      );
      load();
    } catch (err) {
      handleApiError(err, "Import failed");
    }
  };

  const openAdd = () => {
    setShowForm(true);
    setEditId(null);
    setForm(emptyForm);
  };

  return {
    // Data
    items,
    total,
    // Loading
    loading,
    // Filters
    search,
    setSearch,
    companyFilter,
    setCompanyFilter,
    locationFilter,
    setLocationFilter,
    titleFilter,
    setTitleFilter,
    // Form / dialog state
    showForm,
    setShowForm,
    editId,
    form,
    setForm,
    // Paste modal
    showPaste,
    setShowPaste,
    // Drag state
    dragging,
    setDragging,
    // Delete confirmation
    deleteId,
    setDeleteId,
    // Refs
    fileInputRef,
    // Pagination
    loadingMore,
    loadMore,
    // Handlers
    handleSave,
    handleEdit,
    handleDelete,
    handleFileChange,
    handleDrop,
    handlePasteConfirm,
    openAdd,
  };
}
