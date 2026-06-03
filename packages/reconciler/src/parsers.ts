import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { Migration, MigrationOrm } from "./types";

function normalizeRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function toMigrationId(orm: MigrationOrm, relativePath: string): string {
  return `${orm}:${relativePath}`;
}

async function parseSqlFile(
  projectRoot: string,
  absolutePath: string,
  orm: MigrationOrm
): Promise<Migration> {
  const [sql, fileStat] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
  const filename = normalizeRelativePath(projectRoot, absolutePath);
  return {
    id: toMigrationId(orm, filename),
    filename,
    appliedAt: fileStat.mtime,
    sql,
    orm,
  };
}

async function parsePrismaMigrations(projectRoot: string): Promise<Migration[]> {
  const prismaRoot = path.join(projectRoot, "prisma", "migrations");

  let entries;
  try {
    entries = await readdir(prismaRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const migrations: Migration[] = [];
  for (const folder of folders) {
    const sqlPath = path.join(prismaRoot, folder, "migration.sql");
    try {
      migrations.push(await parseSqlFile(projectRoot, sqlPath, "prisma"));
    } catch {
      continue;
    }
  }

  return migrations;
}

async function parseFlatSqlDirectory(
  projectRoot: string,
  dirPath: string,
  orm: MigrationOrm
): Promise<Migration[]> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const migrations: Migration[] = [];
  for (const file of files) {
    const sqlPath = path.join(dirPath, file);
    migrations.push(await parseSqlFile(projectRoot, sqlPath, orm));
  }

  return migrations;
}

export async function parseMigrations(projectRoot: string): Promise<Migration[]> {
  const [prisma, drizzle, raw] = await Promise.all([
    parsePrismaMigrations(projectRoot),
    parseFlatSqlDirectory(projectRoot, path.join(projectRoot, "drizzle"), "drizzle"),
    parseFlatSqlDirectory(projectRoot, path.join(projectRoot, "migrations"), "raw"),
  ]);

  return [...prisma, ...drizzle, ...raw].sort((a, b) => a.filename.localeCompare(b.filename));
}
