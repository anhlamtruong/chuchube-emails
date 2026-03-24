import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import { emptyParseResult, hashContent, normalizePath } from "./common.js";
import type { FileParseResult } from "../types/schema.js";

export async function parseTypeScriptFile(filePath: string, workspaceRoot: string): Promise<FileParseResult> {
  const source = await fs.readFile(filePath, "utf8");
  const normalizedPath = normalizePath(filePath);
  const result = emptyParseResult(filePath, "typescript", source);

  const rel = normalizePath(path.relative(workspaceRoot, normalizedPath));
  const moduleName = rel.replace(/\.(tsx?|jsx?)$/, "").replace(/\//g, ".");

  const fileNodeId = `file:${normalizedPath}`;
  const moduleSymbolId = `symbol:${normalizedPath}:module:0:0`;
  result.symbols.push({
    id: moduleSymbolId,
    name: path.basename(filePath),
    qualifiedName: moduleName,
    kind: "module",
    language: "typescript",
    filePath: normalizedPath,
    rangeStart: { line: 1, column: 1 },
    rangeEnd: { line: 1, column: 1 },
  });
  result.relations.push({
    type: "defines",
    sourceSymbolId: fileNodeId,
    targetSymbolId: moduleSymbolId,
    filePath: normalizedPath,
    confidence: 1,
  });

  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const rawImport = node.moduleSpecifier.text;
      result.parsedImports.push({ raw: rawImport, isRelative: rawImport.startsWith(".") });
    }

    if (
      ts.isExportDeclaration(node) ||
      (ts.canHaveModifiers(node) &&
        ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    ) {
      result.relations.push({
        type: "exports",
        sourceSymbolId: moduleSymbolId,
        targetSymbolId: moduleSymbolId,
        filePath: normalizedPath,
        confidence: 1,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  result.hash = hashContent(source);
  return result;
}
