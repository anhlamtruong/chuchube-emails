import path from "node:path";

import { MultiDirectedGraph } from "graphology";

import type {
  EdgeType,
  FileParseResult,
  GraphEdge,
  GraphExport,
  GraphNode,
  SymbolDefinition,
} from "../types/schema.js";

interface NodeAttrs {
  label: string;
  kind: string;
  language: string;
  filePath?: string;
  qualifiedName?: string;
  rangeStart?: { line: number; column: number };
  rangeEnd?: { line: number; column: number };
}

interface EdgeAttrs {
  type: EdgeType;
  weight: number;
  filePath: string;
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export class GraphStore {
  private readonly graph = new MultiDirectedGraph<NodeAttrs, EdgeAttrs>();

  private readonly fileToSymbolIds = new Map<string, Set<string>>();

  private readonly symbolByQualifiedName = new Map<string, string>();

  private readonly reverseImports = new Map<string, Set<string>>();

  private readonly importsByFile = new Map<string, Set<string>>();

  private readonly fileHashes = new Map<string, string>();

  hasFileHash(filePath: string, hash: string): boolean {
    return this.fileHashes.get(normalizePath(filePath)) === hash;
  }

  getFileHash(filePath: string): string | undefined {
    return this.fileHashes.get(normalizePath(filePath));
  }

  getDirectDependents(filePath: string): string[] {
    const dependents = this.reverseImports.get(normalizePath(filePath));
    return dependents ? [...dependents] : [];
  }

  upsertFileResult(result: FileParseResult): void {
    const filePath = normalizePath(result.filePath);
    this.removeFileData(filePath, false);

    this.fileHashes.set(filePath, result.hash);

    const fileNodeId = this.fileNodeId(filePath);
    this.upsertNode(fileNodeId, {
      label: path.basename(filePath),
      kind: "file",
      language: result.language,
      filePath,
      qualifiedName: filePath,
    });

    const symbolIds = new Set<string>();
    for (const symbol of result.symbols) {
      const symbolNodeId = this.symbolNodeId(symbol.id);
      this.upsertSymbolNode(symbolNodeId, symbol);
      symbolIds.add(symbolNodeId);
      this.symbolByQualifiedName.set(symbol.qualifiedName, symbolNodeId);
    }
    this.fileToSymbolIds.set(filePath, symbolIds);

    const resolvedImportSet = new Set(result.resolvedImports.map((entry) => normalizePath(entry)));
    this.importsByFile.set(filePath, resolvedImportSet);
    for (const importedFile of resolvedImportSet) {
      const importedNodeId = this.fileNodeId(importedFile);
      this.upsertNode(importedNodeId, {
        label: path.basename(importedFile),
        kind: "file",
        language: "python",
        filePath: importedFile,
        qualifiedName: importedFile,
      });
      this.graph.addDirectedEdgeWithKey(
        `edge:imports:${filePath}->${importedFile}`,
        fileNodeId,
        importedNodeId,
        {
          type: "imports",
          weight: 1,
          filePath,
        },
      );
      const existingDependents = this.reverseImports.get(importedFile) ?? new Set<string>();
      existingDependents.add(filePath);
      this.reverseImports.set(importedFile, existingDependents);
    }

    for (const relation of result.relations) {
      const sourceNodeId = relation.sourceSymbolId.startsWith("file:")
        ? this.fileNodeId(filePath)
        : this.symbolNodeId(relation.sourceSymbolId);

      if (!this.graph.hasNode(sourceNodeId)) {
        continue;
      }

      let targetNodeId: string;
      if (relation.targetSymbolId) {
        targetNodeId = this.symbolNodeId(relation.targetSymbolId);
      } else if (relation.targetQualifiedName) {
        targetNodeId =
          this.symbolByQualifiedName.get(relation.targetQualifiedName) ??
          this.externalSymbolNodeId(relation.targetQualifiedName);
        if (!this.graph.hasNode(targetNodeId)) {
          this.upsertNode(targetNodeId, {
            label: relation.targetQualifiedName,
            kind: "external",
            language: result.language,
            qualifiedName: relation.targetQualifiedName,
          });
        }
      } else {
        continue;
      }

      if (!this.graph.hasNode(targetNodeId)) {
        continue;
      }

      const edgeKey = `edge:${relation.type}:${sourceNodeId}->${targetNodeId}:${relation.filePath}:${Math.random().toString(36).slice(2, 8)}`;
      this.graph.addDirectedEdgeWithKey(edgeKey, sourceNodeId, targetNodeId, {
        type: relation.type,
        weight: relation.confidence,
        filePath: relation.filePath,
      });
    }
  }

  removeFile(filePath: string): void {
    this.removeFileData(normalizePath(filePath), true);
  }

  getFunctionContext(params: {
    functionName: string;
    filePath?: string;
    maxHops: number;
    includeEdgeTypes?: EdgeType[];
    maxNodes: number;
  }): {
    root: GraphNode | null;
    neighborhood: GraphExport;
    relatedFiles: string[];
    truncated: boolean;
  } {
    const nodes = this.graph
      .nodes()
      .filter((nodeId) => {
        const attrs = this.graph.getNodeAttributes(nodeId);
        if (attrs.kind !== "function") {
          return false;
        }
        if (attrs.label !== params.functionName) {
          return false;
        }
        if (!params.filePath) {
          return true;
        }
        return normalizePath(attrs.filePath ?? "") === normalizePath(params.filePath);
      });

    if (nodes.length === 0) {
      return {
        root: null,
        neighborhood: { nodes: [], edges: [] },
        relatedFiles: [],
        truncated: false,
      };
    }

    const root = nodes[0];
    const visited = new Set<string>([root]);
    let frontier = [root];
    for (let hop = 0; hop < params.maxHops; hop += 1) {
      const next: string[] = [];
      for (const current of frontier) {
        const outbound = this.graph.outboundEdges(current);
        const inbound = this.graph.inboundEdges(current);
        for (const edge of [...outbound, ...inbound]) {
          const attrs = this.graph.getEdgeAttributes(edge);
          if (params.includeEdgeTypes && !params.includeEdgeTypes.includes(attrs.type)) {
            continue;
          }
          const opposite = this.graph.opposite(current, edge);
          if (!visited.has(opposite)) {
            visited.add(opposite);
            next.push(opposite);
          }
          if (visited.size >= params.maxNodes) {
            break;
          }
        }
        if (visited.size >= params.maxNodes) {
          break;
        }
      }
      frontier = next;
      if (visited.size >= params.maxNodes || frontier.length === 0) {
        break;
      }
    }

    const exported = this.exportSubgraph(visited, params.includeEdgeTypes);
    const relatedFiles = Array.from(
      new Set(exported.nodes.map((node) => node.filePath).filter((entry): entry is string => Boolean(entry))),
    );

    return {
      root: this.toGraphNode(root),
      neighborhood: exported,
      relatedFiles,
      truncated: exported.nodes.length >= params.maxNodes,
    };
  }

  getFileDependents(params: {
    filePath: string;
    direction: "incoming" | "outgoing" | "both";
    depth: number;
    maxFiles: number;
  }): {
    file: string;
    dependents: Array<{ filePath: string; relationType: string; depth: number }>;
    summary: { incomingCount: number; outgoingCount: number; truncated: boolean };
  } {
    const filePath = normalizePath(params.filePath);
    const seen = new Set<string>([filePath]);
    const queue: Array<{ path: string; depth: number }> = [{ path: filePath, depth: 0 }];
    const dependents: Array<{ filePath: string; relationType: string; depth: number }> = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= params.depth) {
        continue;
      }

      const candidates: Array<{ path: string; relationType: string }> = [];
      if (params.direction === "incoming" || params.direction === "both") {
        const incoming = this.reverseImports.get(current.path) ?? new Set<string>();
        for (const item of incoming) {
          candidates.push({ path: item, relationType: "incoming" });
        }
      }
      if (params.direction === "outgoing" || params.direction === "both") {
        const outgoing = this.importsByFile.get(current.path) ?? new Set<string>();
        for (const item of outgoing) {
          candidates.push({ path: item, relationType: "outgoing" });
        }
      }

      for (const candidate of candidates) {
        if (seen.has(candidate.path)) {
          continue;
        }
        seen.add(candidate.path);
        dependents.push({ filePath: candidate.path, relationType: candidate.relationType, depth: current.depth + 1 });
        queue.push({ path: candidate.path, depth: current.depth + 1 });
        if (dependents.length >= params.maxFiles) {
          break;
        }
      }

      if (dependents.length >= params.maxFiles) {
        break;
      }
    }

    const incomingCount = dependents.filter((item) => item.relationType === "incoming").length;
    const outgoingCount = dependents.filter((item) => item.relationType === "outgoing").length;

    return {
      file: filePath,
      dependents,
      summary: {
        incomingCount,
        outgoingCount,
        truncated: dependents.length >= params.maxFiles,
      },
    };
  }

  getSymbolReferences(params: {
    symbolQualifiedName: string;
    includeReads: boolean;
    includeWrites: boolean;
    includeCalls: boolean;
    maxResults: number;
  }): {
    symbol: GraphNode | null;
    references: Array<{ filePath: string; range: string; edgeType: string; contextSnippet: string }>;
    truncated: boolean;
  } {
    const symbolNodeId = this.symbolByQualifiedName.get(params.symbolQualifiedName);
    if (!symbolNodeId || !this.graph.hasNode(symbolNodeId)) {
      return { symbol: null, references: [], truncated: false };
    }

    const edges = this.graph.inboundEdges(symbolNodeId);
    const allowed = new Set<EdgeType>();
    if (params.includeReads) {
      allowed.add("reads");
      allowed.add("references");
    }
    if (params.includeWrites) {
      allowed.add("writes");
    }
    if (params.includeCalls) {
      allowed.add("calls");
      allowed.add("instantiates");
    }

    const references: Array<{ filePath: string; range: string; edgeType: string; contextSnippet: string }> = [];
    for (const edge of edges) {
      const attrs = this.graph.getEdgeAttributes(edge);
      if (!allowed.has(attrs.type)) {
        continue;
      }
      const sourceNodeId = this.graph.source(edge);
      const sourceAttrs = this.graph.getNodeAttributes(sourceNodeId);
      references.push({
        filePath: attrs.filePath,
        range: `${sourceAttrs.rangeStart?.line ?? 1}:${sourceAttrs.rangeStart?.column ?? 1}-${sourceAttrs.rangeEnd?.line ?? 1}:${sourceAttrs.rangeEnd?.column ?? 1}`,
        edgeType: attrs.type,
        contextSnippet: sourceAttrs.label,
      });
      if (references.length >= params.maxResults) {
        break;
      }
    }

    return {
      symbol: this.toGraphNode(symbolNodeId),
      references,
      truncated: references.length >= params.maxResults,
    };
  }

  exportDependencyGraph(params: {
    scope: "repo" | "file" | "symbol";
    filePath?: string;
    symbolQualifiedName?: string;
    maxNodes: number;
    maxEdges: number;
  }): { graph: GraphExport; meta: Record<string, unknown> } {
    let nodeSet: Set<string>;

    if (params.scope === "repo") {
      nodeSet = new Set(this.graph.nodes().slice(0, params.maxNodes));
    } else if (params.scope === "file") {
      const filePath = normalizePath(params.filePath ?? "");
      nodeSet = new Set<string>();
      const fileNodeId = this.fileNodeId(filePath);
      if (this.graph.hasNode(fileNodeId)) {
        nodeSet.add(fileNodeId);
      }
      const symbols = this.fileToSymbolIds.get(filePath) ?? new Set<string>();
      for (const symbolId of symbols) {
        nodeSet.add(symbolId);
      }
      for (const importedFile of this.importsByFile.get(filePath) ?? new Set<string>()) {
        nodeSet.add(this.fileNodeId(importedFile));
      }
      for (const dependent of this.reverseImports.get(filePath) ?? new Set<string>()) {
        nodeSet.add(this.fileNodeId(dependent));
      }
    } else {
      const symbolNodeId = this.symbolByQualifiedName.get(params.symbolQualifiedName ?? "") ?? "";
      nodeSet = new Set<string>();
      if (symbolNodeId && this.graph.hasNode(symbolNodeId)) {
        nodeSet.add(symbolNodeId);
        for (const edge of this.graph.inboundEdges(symbolNodeId)) {
          nodeSet.add(this.graph.source(edge));
        }
        for (const edge of this.graph.outboundEdges(symbolNodeId)) {
          nodeSet.add(this.graph.target(edge));
        }
      }
    }

    const graph = this.exportSubgraph(nodeSet);
    const cappedGraph: GraphExport = {
      nodes: graph.nodes.slice(0, params.maxNodes),
      edges: graph.edges.slice(0, params.maxEdges),
    };

    return {
      graph: cappedGraph,
      meta: {
        generatedAt: new Date().toISOString(),
        scope: params.scope,
        truncated: graph.nodes.length > params.maxNodes || graph.edges.length > params.maxEdges,
        nodeCount: cappedGraph.nodes.length,
        edgeCount: cappedGraph.edges.length,
      },
    };
  }

  private removeFileData(filePath: string, removeFileHash: boolean): void {
    const normalizedPath = normalizePath(filePath);
    const fileNodeId = this.fileNodeId(normalizedPath);

    const symbols = this.fileToSymbolIds.get(normalizedPath) ?? new Set<string>();
    for (const symbolNodeId of symbols) {
      if (this.graph.hasNode(symbolNodeId)) {
        const attrs = this.graph.getNodeAttributes(symbolNodeId);
        if (attrs.qualifiedName) {
          this.symbolByQualifiedName.delete(attrs.qualifiedName);
        }
        this.graph.dropNode(symbolNodeId);
      }
    }
    this.fileToSymbolIds.delete(normalizedPath);

    const previousImports = this.importsByFile.get(normalizedPath) ?? new Set<string>();
    for (const importedFile of previousImports) {
      const dependents = this.reverseImports.get(importedFile);
      if (!dependents) {
        continue;
      }
      dependents.delete(normalizedPath);
      if (dependents.size === 0) {
        this.reverseImports.delete(importedFile);
      }
    }
    this.importsByFile.delete(normalizedPath);

    if (this.graph.hasNode(fileNodeId)) {
      this.graph.dropNode(fileNodeId);
    }

    if (removeFileHash) {
      this.fileHashes.delete(normalizedPath);
    }
  }

  private upsertSymbolNode(nodeId: string, symbol: SymbolDefinition): void {
    this.upsertNode(nodeId, {
      label: symbol.name,
      kind: symbol.kind,
      language: symbol.language,
      filePath: symbol.filePath,
      qualifiedName: symbol.qualifiedName,
      rangeStart: symbol.rangeStart,
      rangeEnd: symbol.rangeEnd,
    });
  }

  private upsertNode(nodeId: string, attrs: NodeAttrs): void {
    if (this.graph.hasNode(nodeId)) {
      this.graph.mergeNodeAttributes(nodeId, attrs);
    } else {
      this.graph.addNode(nodeId, attrs);
    }
  }

  private exportSubgraph(nodeSet: Set<string>, includeEdgeTypes?: EdgeType[]): GraphExport {
    const nodes: GraphNode[] = [];
    for (const nodeId of nodeSet) {
      if (this.graph.hasNode(nodeId)) {
        nodes.push(this.toGraphNode(nodeId));
      }
    }

    const edges: GraphEdge[] = [];
    for (const edgeKey of this.graph.edges()) {
      const source = this.graph.source(edgeKey);
      const target = this.graph.target(edgeKey);
      if (!nodeSet.has(source) || !nodeSet.has(target)) {
        continue;
      }
      const attrs = this.graph.getEdgeAttributes(edgeKey);
      if (includeEdgeTypes && !includeEdgeTypes.includes(attrs.type)) {
        continue;
      }
      edges.push({
        id: edgeKey,
        source,
        target,
        type: attrs.type,
        weight: attrs.weight,
        filePath: attrs.filePath,
      });
    }

    return { nodes, edges };
  }

  private toGraphNode(nodeId: string): GraphNode {
    const attrs = this.graph.getNodeAttributes(nodeId);
    return {
      id: nodeId,
      label: attrs.label,
      kind: attrs.kind as GraphNode["kind"],
      language: attrs.language as GraphNode["language"],
      filePath: attrs.filePath,
      qualifiedName: attrs.qualifiedName,
      rangeStart: attrs.rangeStart,
      rangeEnd: attrs.rangeEnd,
    };
  }

  private fileNodeId(filePath: string): string {
    return `file:${normalizePath(filePath)}`;
  }

  private symbolNodeId(symbolId: string): string {
    return symbolId.startsWith("symbol:") ? symbolId : `symbol:${symbolId}`;
  }

  private externalSymbolNodeId(qualifiedName: string): string {
    return `symbol:external:${qualifiedName}`;
  }
}
