import fs from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import { GraphStore } from "../graph/graph-store.js";
import { parsePythonFile } from "../parsers/python-parser.js";
import { parseTypeScriptFile } from "../parsers/typescript-parser.js";
import { detectLanguage } from "../parsers/common.js";
import type { FileParseResult } from "../types/schema.js";

const PYTHON_PATTERNS = ["backend/**/*.py"];
const TYPESCRIPT_PATTERNS = ["frontend/src/**/*.{ts,tsx,js,jsx}"];

const TS_IMPORT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".d.ts"];

function normalize(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export class IncrementalIndexer {
  private readonly workspaceRoot: string;

  private readonly graphStore: GraphStore;

  private readonly fileExistsCache = new Map<string, boolean>();

  constructor(workspaceRoot: string, graphStore: GraphStore) {
    this.workspaceRoot = normalize(workspaceRoot);
    this.graphStore = graphStore;
  }

  async buildInitialGraph(): Promise<{ indexedFiles: number }> {
    const files = await fg([...PYTHON_PATTERNS, ...TYPESCRIPT_PATTERNS], {
      cwd: this.workspaceRoot,
      absolute: true,
      onlyFiles: true,
      ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/venv/**", "**/__pycache__/**"],
    });

    let count = 0;
    for (const filePath of files) {
      const ok = await this.reindexSingleFile(filePath);
      if (ok) {
        count += 1;
      }
    }

    return { indexedFiles: count };
  }

  async processChanges(changedFiles: string[]): Promise<{ reparsed: number; dependents: number }> {
    const normalized = Array.from(new Set(changedFiles.map((item) => normalize(item))));
    let reparsed = 0;
    const dependentCandidates = new Set<string>();

    for (const filePath of normalized) {
      for (const dependent of this.graphStore.getDirectDependents(filePath)) {
        dependentCandidates.add(dependent);
      }

      const ok = await this.reindexSingleFile(filePath);
      if (ok) {
        reparsed += 1;
      }

      for (const dependent of this.graphStore.getDirectDependents(filePath)) {
        dependentCandidates.add(dependent);
      }
    }

    let dependentCount = 0;
    for (const dependent of dependentCandidates) {
      if (normalized.includes(dependent)) {
        continue;
      }
      const ok = await this.reindexSingleFile(dependent);
      if (ok) {
        dependentCount += 1;
      }
    }

    return { reparsed, dependents: dependentCount };
  }

  async removeFile(filePath: string): Promise<void> {
    this.graphStore.removeFile(normalize(filePath));
  }

  private async reindexSingleFile(filePath: string): Promise<boolean> {
    const normalized = normalize(filePath);
    const language = detectLanguage(normalized);
    if (!language) {
      return false;
    }

    const exists = await this.exists(normalized);
    if (!exists) {
      this.graphStore.removeFile(normalized);
      return false;
    }

    let parseResult: FileParseResult;
    if (language === "python") {
      parseResult = await parsePythonFile(normalized, this.workspaceRoot);
    } else {
      parseResult = await parseTypeScriptFile(normalized, this.workspaceRoot);
    }

    if (this.graphStore.hasFileHash(normalized, parseResult.hash)) {
      return false;
    }

    parseResult.resolvedImports = await this.resolveImports(normalized, parseResult.parsedImports.map((item) => item.raw), language);
    this.graphStore.upsertFileResult(parseResult);
    return true;
  }

  private async resolveImports(
    currentFile: string,
    imports: string[],
    language: "python" | "typescript",
  ): Promise<string[]> {
    const resolved = new Set<string>();

    for (const importValue of imports) {
      if (language === "python") {
        const pythonResolved = await this.resolvePythonModule(importValue);
        if (pythonResolved) {
          resolved.add(pythonResolved);
        }
      } else {
        const tsResolved = await this.resolveTypeScriptImport(currentFile, importValue);
        if (tsResolved) {
          resolved.add(tsResolved);
        }
      }
    }

    return [...resolved];
  }

  private async resolvePythonModule(moduleName: string): Promise<string | null> {
    if (!moduleName || moduleName.startsWith(".")) {
      return null;
    }

    const modulePath = moduleName.replace(/\./g, "/");
    const candidates = [
      path.join(this.workspaceRoot, `${modulePath}.py`),
      path.join(this.workspaceRoot, modulePath, "__init__.py"),
      path.join(this.workspaceRoot, "backend", `${modulePath}.py`),
      path.join(this.workspaceRoot, "backend", modulePath, "__init__.py"),
    ].map((item) => normalize(item));

    for (const candidate of candidates) {
      if (await this.exists(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async resolveTypeScriptImport(currentFile: string, importValue: string): Promise<string | null> {
    if (!importValue) {
      return null;
    }

    if (!importValue.startsWith(".") && !importValue.startsWith("@/")) {
      return null;
    }

    let basePath: string;
    if (importValue.startsWith("@/")) {
      basePath = path.join(this.workspaceRoot, "frontend", "src", importValue.slice(2));
    } else {
      basePath = path.resolve(path.dirname(currentFile), importValue);
    }

    const candidates: string[] = [normalize(basePath)];
    for (const ext of TS_IMPORT_EXTENSIONS) {
      candidates.push(`${normalize(basePath)}${ext}`);
    }
    for (const ext of TS_IMPORT_EXTENSIONS) {
      candidates.push(normalize(path.join(basePath, `index${ext}`)));
    }

    for (const candidate of candidates) {
      if (await this.exists(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async exists(filePath: string): Promise<boolean> {
    if (this.fileExistsCache.get(filePath) === true) {
      return true;
    }

    try {
      await fs.access(filePath);
      this.fileExistsCache.set(filePath, true);
      return true;
    } catch {
      this.fileExistsCache.delete(filePath);
      return false;
    }
  }
}
