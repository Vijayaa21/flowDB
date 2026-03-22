"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchBranchDetail, fetchBranches, fetchOrchestratorHealth, teardownBranch } from "./api";

export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: fetchBranches,
    retry: 3,
    retryDelay: 1000,
    staleTime: 30_000,
    refetchInterval: 30_000
  });
}

export function useBranchDetail(name: string) {
  return useQuery({
    queryKey: ["branch-detail", name],
    queryFn: () => fetchBranchDetail(name),
    enabled: Boolean(name),
    refetchInterval: 30_000
  });
}

export function useTeardownBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: teardownBranch,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
    }
  });
}

export function useOrchestratorHealth() {
  return useQuery({
    queryKey: ["orchestrator-health"],
    queryFn: fetchOrchestratorHealth,
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 30_000
  });
}
