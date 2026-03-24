export type Language = "python" | "typescript";

export type SymbolKind = "file" | "module" | "function" | "class" | "variable" | "external";

export type EdgeType =
  | "imports"
  | "defines"
  | "calls"
  | "instantiates"
  | "reads"
  | "writes"
  | "references"
  | "exports";

export interface RangePosition {
  line: number;
  column: number;
}

export interface SymbolDefinition {
  id: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  language: Language;
  filePath: string;
  rangeStart: RangePosition;
  rangeEnd: RangePosition;
}

export interface SymbolRelation {
  type: EdgeType;
  sourceSymbolId: string;
  targetSymbolId?: string;
  targetQualifiedName?: string;
  filePath: string;
  confidence: number;
}

export interface ParsedImport {
  raw: string;
  isRelative: boolean;
}

export interface FileParseResult {
  filePath: string;
  language: Language;
  hash: string;
  symbols: SymbolDefinition[];
  relations: SymbolRelation[];
  parsedImports: ParsedImport[];
  resolvedImports: string[];
  parseErrors: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  kind: SymbolKind;
  language: Language;
  filePath?: string;
  qualifiedName?: string;
  rangeStart?: RangePosition;
  rangeEnd?: RangePosition;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
  filePath: string;
}

export interface GraphExport {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
