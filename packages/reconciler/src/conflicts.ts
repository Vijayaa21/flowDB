import { Parser } from "node-sql-parser";

import type { Conflict, Migration } from "./types";

const parser = new Parser();

type ColumnRef = {
  table: string;
  column: string;
};

type AstNode = null | boolean | number | string | AstNode[] | { [key: string]: AstNode };

function isRecord(value: unknown): value is Record<string, AstNode> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIdentifier(value: string): string {
  return value.replace(/^"|"$/g, "").toLowerCase();
}

function getTableName(tableNode: AstNode): string | undefined {
  if (Array.isArray(tableNode)) {
    const first = tableNode[0];
    if (isRecord(first) && typeof first.table === "string") {
      return normalizeIdentifier(first.table);
    }
    return undefined;
  }

  if (isRecord(tableNode) && typeof tableNode.table === "string") {
    return normalizeIdentifier(tableNode.table);
  }

  return undefined;
}

function extractColumnName(value: AstNode): string | undefined {
  if (typeof value === "string") {
    return normalizeIdentifier(value);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.column === "string") {
    return normalizeIdentifier(value.column);
  }

  if (isRecord(value.column) && isRecord(value.column.expr) && typeof value.column.expr.value === "string") {
    return normalizeIdentifier(value.column.expr.value);
  }

  if (isRecord(value.expr) && typeof value.expr.value === "string") {
    return normalizeIdentifier(value.expr.value);
  }

  return undefined;
}

function collectAlterColumns(statement: Record<string, AstNode>): Set<string> {
  const columns = new Set<string>();
  const expr = statement.expr;

  if (!Array.isArray(expr)) {
    return columns;
  }

  for (const entry of expr) {
    if (!isRecord(entry)) {
      continue;
    }

    const fromColumn = extractColumnName(entry.column);
    if (fromColumn) {
      columns.add(fromColumn);
    }

    const fromOldColumn = extractColumnName(entry.old_column);
    if (fromOldColumn) {
      columns.add(fromOldColumn);
    }

    const fromNewColumn = extractColumnName(entry.new_column);
    if (fromNewColumn) {
      columns.add(fromNewColumn);
    }
  }

  return columns;
}

function toStatementArray(ast: unknown): AstNode[] {
  if (Array.isArray(ast)) {
    return ast as AstNode[];
  }
  return [ast as AstNode];
}

export function getAlteredColumns(sql: string): ColumnRef[] {
  let ast: unknown;
  try {
    ast = parser.astify(sql, { database: "postgresql" });
  } catch {
    return [];
  }

  const refs: ColumnRef[] = [];
  const statements = toStatementArray(ast);

  for (const statement of statements) {
    if (!isRecord(statement) || statement.type !== "alter") {
      continue;
    }

    const table = getTableName(statement.table);
    if (!table) {
      continue;
    }

    const columns = collectAlterColumns(statement);

    for (const column of columns) {
      refs.push({ table, column });
    }
  }

  return refs;
}

export function detectConflicts(
  branchMigrations: Migration[],
  mainMigrations: Migration[]
): Conflict[] {
  const mainRefsByKey = new Map<string, Migration[]>();

  for (const migration of mainMigrations) {
    for (const ref of getAlteredColumns(migration.sql)) {
      const key = `${ref.table}.${ref.column}`;
      const existing = mainRefsByKey.get(key) ?? [];
      existing.push(migration);
      mainRefsByKey.set(key, existing);
    }
  }

  const conflicts: Conflict[] = [];
  const seen = new Set<string>();

  for (const branchMigration of branchMigrations) {
    for (const ref of getAlteredColumns(branchMigration.sql)) {
      const key = `${ref.table}.${ref.column}`;
      const mainForKey = mainRefsByKey.get(key) ?? [];
      for (const mainMigration of mainForKey) {
        const conflictKey = `${branchMigration.id}|${mainMigration.id}|${key}`;
        if (seen.has(conflictKey)) {
          continue;
        }
        seen.add(conflictKey);
        conflicts.push({
          table: ref.table,
          column: ref.column,
          branchMigration,
          mainMigration
        });
      }
    }
  }

  return conflicts;
}

export function extractCreatedTables(sql: string): Set<string> {
  let ast: unknown;
  try {
    ast = parser.astify(sql, { database: "postgresql" });
  } catch {
    return new Set<string>();
  }

  const created = new Set<string>();
  const statements = toStatementArray(ast);
  for (const statement of statements) {
    if (!isRecord(statement) || statement.type !== "create") {
      continue;
    }
    const table = getTableName(statement.table);
    if (table) {
      created.add(table);
    }
  }

  return created;
}

export function extractTouchedTables(sql: string): Set<string> {
  let ast: unknown;
  try {
    ast = parser.astify(sql, { database: "postgresql" });
  } catch {
    return new Set<string>();
  }

  const touched = new Set<string>();
  const statements = toStatementArray(ast);
  for (const statement of statements) {
    if (!isRecord(statement)) {
      continue;
    }
    const table = getTableName(statement.table);
    if (table) {
      touched.add(table);
    }
  }

  return touched;
}