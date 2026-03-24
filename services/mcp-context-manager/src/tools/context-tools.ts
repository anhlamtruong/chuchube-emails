import { z } from "zod";

import { GraphStore } from "../graph/graph-store.js";

const edgeTypeEnum = z.enum([
  "imports",
  "defines",
  "calls",
  "instantiates",
  "reads",
  "writes",
  "references",
  "exports",
]);

export function registerContextTools(server: {
  tool: (
    name: string,
    description: string,
    schema: z.ZodRawShape,
    handler: (args: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  ) => void;
}, graphStore: GraphStore): void {
  server.tool(
    "get_function_context",
    "Get graph neighborhood around a function symbol.",
    {
      function_name: z.string().min(1),
      file_path: z.string().optional(),
      max_hops: z.number().int().min(1).max(4).default(2),
      include_edge_types: z.array(edgeTypeEnum).optional(),
      max_nodes: z.number().int().min(1).max(500).default(150),
    },
    async (args) => {
      const result = graphStore.getFunctionContext({
        functionName: args.function_name,
        filePath: args.file_path,
        maxHops: args.max_hops,
        includeEdgeTypes: args.include_edge_types,
        maxNodes: args.max_nodes,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "get_file_dependents",
    "Find direct or transitive dependents/dependencies for a file.",
    {
      file_path: z.string().min(1),
      direction: z.enum(["incoming", "outgoing", "both"]).default("incoming"),
      depth: z.number().int().min(1).max(3).default(1),
      max_files: z.number().int().min(1).max(1000).default(200),
    },
    async (args) => {
      const result = graphStore.getFileDependents({
        filePath: args.file_path,
        direction: args.direction,
        depth: args.depth,
        maxFiles: args.max_files,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "get_symbol_references",
    "Resolve references to a qualified symbol.",
    {
      symbol_qualified_name: z.string().min(1),
      include_reads: z.boolean().default(true),
      include_writes: z.boolean().default(true),
      include_calls: z.boolean().default(true),
      max_results: z.number().int().min(1).max(2000).default(300),
    },
    async (args) => {
      const result = graphStore.getSymbolReferences({
        symbolQualifiedName: args.symbol_qualified_name,
        includeReads: args.include_reads,
        includeWrites: args.include_writes,
        includeCalls: args.include_calls,
        maxResults: args.max_results,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "export_dependency_graph",
    "Export graph slice for visualization libraries such as D3.js or React Flow.",
    {
      scope: z.enum(["repo", "file", "symbol"]),
      file_path: z.string().optional(),
      symbol_qualified_name: z.string().optional(),
      max_nodes: z.number().int().min(1).max(10000).default(2000),
      max_edges: z.number().int().min(1).max(20000).default(4000),
    },
    async (args) => {
      const result = graphStore.exportDependencyGraph({
        scope: args.scope,
        filePath: args.file_path,
        symbolQualifiedName: args.symbol_qualified_name,
        maxNodes: args.max_nodes,
        maxEdges: args.max_edges,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
