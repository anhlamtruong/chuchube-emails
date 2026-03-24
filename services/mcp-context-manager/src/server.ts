import path from "node:path";
import fs from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { GraphStore } from "./graph/graph-store.js";
import { IncrementalIndexer } from "./indexer/incremental-indexer.js";
import { registerContextTools } from "./tools/context-tools.js";
import { LiveFileWatcher } from "./watcher/file-watcher.js";

function resolveWorkspaceRoot(): string {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }

  let current = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const hasBackend = fs.existsSync(path.join(current, "backend"));
    const hasFrontend = fs.existsSync(path.join(current, "frontend"));
    if (hasBackend && hasFrontend) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return process.cwd();
}

async function bootstrap(): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot();

  const graphStore = new GraphStore();
  const indexer = new IncrementalIndexer(workspaceRoot, graphStore);

  const initial = await indexer.buildInitialGraph();
  console.error(`[live-context-manager] indexed ${initial.indexedFiles} files`);

  const watcher = new LiveFileWatcher({
    workspaceRoot,
    indexer,
    onUpdate: (stats) => {
      console.error(
        `[live-context-manager] update files=${stats.files} reparsed=${stats.reparsed} dependents=${stats.dependents}`,
      );
    },
  });
  await watcher.start();

  const server = new McpServer({
    name: "live-context-manager",
    version: "0.1.0",
  });

  registerContextTools(server as any, graphStore);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await watcher.stop();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  console.error("[live-context-manager] fatal error", error);
  process.exit(1);
});
