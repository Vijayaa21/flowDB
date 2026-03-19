import { detectConflicts, extractCreatedTables, extractTouchedTables } from "./conflicts";
import type { Migration, ReconcileResult } from "./types";

type MigrationNode = {
  migration: Migration;
  createdTables: Set<string>;
  touchedTables: Set<string>;
};

function topologicalSort(migrations: Migration[]): Migration[] {
  const nodes = migrations.map<MigrationNode>((migration) => ({
    migration,
    createdTables: extractCreatedTables(migration.sql),
    touchedTables: extractTouchedTables(migration.sql)
  }));

  const nodeById = new Map(nodes.map((node) => [node.migration.id, node]));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, Set<string>>();

  for (const node of nodes) {
    indegree.set(node.migration.id, 0);
    outgoing.set(node.migration.id, new Set<string>());
  }

  for (const source of nodes) {
    for (const target of nodes) {
      if (source.migration.id === target.migration.id) {
        continue;
      }

      const dependsOnSource = [...target.touchedTables].some((table) => source.createdTables.has(table));

      if (dependsOnSource && !outgoing.get(source.migration.id)?.has(target.migration.id)) {
        outgoing.get(source.migration.id)?.add(target.migration.id);
        indegree.set(target.migration.id, (indegree.get(target.migration.id) ?? 0) + 1);
      }
    }
  }

  const initialQueue = nodes
    .filter((node) => (indegree.get(node.migration.id) ?? 0) === 0)
    .map((node) => node.migration.id);

  const order: Migration[] = [];
  const queue = [...initialQueue];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    const currentNode = nodeById.get(currentId);
    if (!currentNode) {
      continue;
    }

    order.push(currentNode.migration);

    for (const nextId of outgoing.get(currentId) ?? []) {
      indegree.set(nextId, (indegree.get(nextId) ?? 1) - 1);
      if ((indegree.get(nextId) ?? 0) === 0) {
        queue.push(nextId);
      }
    }
  }

  if (order.length !== migrations.length) {
    return [...migrations];
  }

  return order;
}

export function reconcile(
  branchMigrations: Migration[],
  mainMigrations: Migration[]
): ReconcileResult {
  const conflicts = detectConflicts(branchMigrations, mainMigrations);
  const conflictingBranchIds = new Set(conflicts.map((conflict) => conflict.branchMigration.id));

  const safe = branchMigrations.filter((migration) => !conflictingBranchIds.has(migration.id));
  const order = topologicalSort([...mainMigrations, ...safe]);

  return {
    safe,
    conflicts,
    order
  };
}