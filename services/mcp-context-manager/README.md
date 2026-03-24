# Live Context Manager MCP Server

Standalone MCP server that maintains a live dependency graph for this repo.

## Features

- Deep Python AST parsing with Tree-sitter for:
  - function/class definitions
  - call edges
  - variable read/write edges
  - import extraction
- TypeScript import/export indexing for frontend context in v1
- Chokidar-based live watcher with debounced incremental reindexing
- Incremental updates: changed files plus direct dependents only
- MCP tools for function context, file dependents, symbol references, and graph export

## Run

```bash
cd services/mcp-context-manager
npm install
npm run build
node dist/server.js
```

Optional environment variable:

- `WORKSPACE_ROOT`: absolute path to repository root. If omitted, the server walks up from cwd to find folders named `backend` and `frontend`.

## MCP Tools

- `get_function_context`
- `get_file_dependents`
- `get_symbol_references`
- `export_dependency_graph`

All tools return JSON payloads in text content format, ready for downstream AI context packing or visualization adapters.
