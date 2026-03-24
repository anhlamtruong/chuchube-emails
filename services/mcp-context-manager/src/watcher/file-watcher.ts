import path from "node:path";

import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";

import { IncrementalIndexer } from "../indexer/incremental-indexer.js";

interface WatcherOptions {
  workspaceRoot: string;
  indexer: IncrementalIndexer;
  onUpdate?: (stats: { reparsed: number; dependents: number; files: number }) => void;
}

export class LiveFileWatcher {
  private readonly workspaceRoot: string;

  private readonly indexer: IncrementalIndexer;

  private readonly onUpdate?: (stats: { reparsed: number; dependents: number; files: number }) => void;

  private readonly pendingByFile = new Map<string, NodeJS.Timeout>();

  private readonly pendingSet = new Set<string>();

  private flushTimer: NodeJS.Timeout | null = null;

  private watcher: FSWatcher | null = null;

  constructor(options: WatcherOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.indexer = options.indexer;
    this.onUpdate = options.onUpdate;
  }

  async start(): Promise<void> {
    const watchPaths = [
      path.join(this.workspaceRoot, "backend"),
      path.join(this.workspaceRoot, "frontend", "src"),
    ];

    this.watcher = chokidar.watch(watchPaths, {
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/venv/**",
        "**/__pycache__/**",
      ],
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 40,
      },
    });

    this.watcher.on("add", (filePath: string) => this.schedule(filePath));
    this.watcher.on("change", (filePath: string) => this.schedule(filePath));
    this.watcher.on("unlink", async (filePath: string) => {
      await this.indexer.removeFile(filePath);
      this.pendingSet.delete(this.normalize(filePath));
    });
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    for (const timer of this.pendingByFile.values()) {
      clearTimeout(timer);
    }
    this.pendingByFile.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private schedule(filePath: string): void {
    const normalized = this.normalize(filePath);
    const existing = this.pendingByFile.get(normalized);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.pendingByFile.delete(normalized);
      this.pendingSet.add(normalized);
      this.scheduleFlush();
    }, 200);

    this.pendingByFile.set(normalized, timer);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      const files = [...this.pendingSet];
      this.pendingSet.clear();
      if (files.length === 0) {
        return;
      }
      const stats = await this.indexer.processChanges(files);
      this.onUpdate?.({ ...stats, files: files.length });
    }, 500);
  }

  private normalize(filePath: string): string {
    return filePath.split(path.sep).join("/");
  }
}
