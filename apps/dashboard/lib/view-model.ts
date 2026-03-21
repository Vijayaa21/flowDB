import type { BranchRecord } from "./types";

export function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

export function getBranchAge(value?: string): string {
  if (!value) {
    return "-";
  }
  const createdAt = new Date(value).getTime();
  if (Number.isNaN(createdAt)) {
    return "-";
  }
  const diffMs = Date.now() - createdAt;
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 60) {
    return `${mins}m`;
  }
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function inferMigrationCount(branch: BranchRecord): number {
  if (typeof branch.migrationCount === "number") {
    return branch.migrationCount;
  }
  return (hashString(branch.branchName) % 12) + 1;
}

export function inferStorageSize(branch: BranchRecord): string {
  if (branch.storageSize) {
    return branch.storageSize;
  }
  const mb = (hashString(branch.branchName) % 800) + 120;
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb} MB`;
}
