"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  resetFlowdbMetadataAction,
  saveSettingsAction,
  teardownAllBranchesAction
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SettingsFormValues } from "@/lib/settings-schema";
import { settingsFormSchema } from "@/lib/settings-schema";

type SettingsFormProps = {
  defaultValues: SettingsFormValues;
};

type ConnectionState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

function InlineError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-xs font-medium text-red-600">{message}</p>;
}

function DangerConfirm({
  open,
  title,
  warning,
  confirmText,
  inputValue,
  onInputChange,
  onRun,
  isRunning
}: {
  open: boolean;
  title: string;
  warning: string;
  confirmText: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-4">
      <div className="flex items-start gap-2 text-red-900">
        <TriangleAlert className="mt-0.5 h-4 w-4" />
        <p className="text-sm">{warning}</p>
      </div>
      <div className="mt-3 space-y-2">
        <Label htmlFor={title} className="text-sm text-red-900">
          Type <span className="font-mono">{confirmText}</span> to continue
        </Label>
        <Input
          id={title}
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          className="border-red-300 focus-visible:border-red-500 focus-visible:ring-red-500"
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="destructive"
          onClick={onRun}
          disabled={isRunning || inputValue.trim() !== confirmText}
        >
          {isRunning ? "Working..." : title}
        </Button>
      </div>
    </div>
  );
}

export function SettingsForm({ defaultValues }: SettingsFormProps) {
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [showVercelToken, setShowVercelToken] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>({ status: "idle" });
  const [isSaving, setIsSaving] = useState(false);
  const [dangerMode, setDangerMode] = useState<"none" | "teardown" | "reset">("none");
  const [teardownConfirm, setTeardownConfirm] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [isTeardownRunning, setIsTeardownRunning] = useState(false);
  const [isResetRunning, setIsResetRunning] = useState(false);

  const {
    register,
    watch,
    formState: { errors },
    handleSubmit,
    reset
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues,
    mode: "onChange"
  });

  const orchestratorUrl = watch("orchestratorUrl");

  const connectionIndicator = useMemo(() => {
    if (connectionState.status === "testing") {
      return (
        <span className="inline-flex items-center gap-1 text-sm text-gray-500">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Testing...
        </span>
      );
    }

    if (connectionState.status === "ok") {
      return (
        <span className="inline-flex items-center gap-1 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" /> {connectionState.message}
        </span>
      );
    }

    if (connectionState.status === "error") {
      return (
        <span className="inline-flex items-center gap-1 text-sm text-red-600">
          <XCircle className="h-4 w-4" /> {connectionState.message}
        </span>
      );
    }

    return null;
  }, [connectionState]);

  const onSubmit = handleSubmit(async (values) => {
    const formData = new FormData();
    formData.set("orchestratorUrl", values.orchestratorUrl);
    formData.set("githubAppId", String(values.githubAppId));
    formData.set("githubWebhookSecret", values.githubWebhookSecret);
    formData.set("vercelApiToken", values.vercelApiToken);
    formData.set("forkTimeoutMs", String(values.forkTimeoutMs));
    formData.set("maxConcurrentBranches", String(values.maxConcurrentBranches));
    formData.set("autoTeardownDays", String(values.autoTeardownDays));
    formData.set("pgPoolSize", String(values.pgPoolSize));

    setIsSaving(true);
    try {
      const result = await saveSettingsAction(formData);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save settings";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  });

  const handleTestConnection = async () => {
    if (!orchestratorUrl) {
      setConnectionState({ status: "error", message: "Enter a URL first" });
      return;
    }

    setConnectionState({ status: "testing" });
    try {
      const response = await fetch(`${orchestratorUrl}/health`, { cache: "no-store" });
      if (!response.ok) {
        setConnectionState({ status: "error", message: `Health check failed (${response.status})` });
        return;
      }
      setConnectionState({ status: "ok", message: "Connected" });
    } catch {
      setConnectionState({ status: "error", message: "Unable to reach orchestrator" });
    }
  };

  const runTeardownAll = async () => {
    setIsTeardownRunning(true);
    try {
      const result = await teardownAllBranchesAction(teardownConfirm);
      if (result.success) {
        toast.success(result.message);
        setTeardownConfirm("");
        setDangerMode("none");
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsTeardownRunning(false);
    }
  };

  const runResetMetadata = async () => {
    setIsResetRunning(true);
    try {
      const result = await resetFlowdbMetadataAction(resetConfirm);
      if (result.success) {
        toast.success(result.message);
        setResetConfirm("");
        setDangerMode("none");
        reset({
          orchestratorUrl: defaultValues.orchestratorUrl,
          githubAppId: defaultValues.githubAppId,
          githubWebhookSecret: "",
          vercelApiToken: "",
          forkTimeoutMs: 500,
          maxConcurrentBranches: 10,
          autoTeardownDays: 7,
          pgPoolSize: 5
        });
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsResetRunning(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="border-gray-200 bg-white">
        <CardHeader className="border-b border-gray-200">
          <CardTitle className="text-lg">Connection Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 p-6">
          <div className="space-y-2">
            <Label htmlFor="orchestratorUrl" className="text-gray-700 font-medium">Orchestrator URL</Label>
            <div className="flex items-center gap-2">
              <Input id="orchestratorUrl" type="url" {...register("orchestratorUrl")} />
              <Button type="button" variant="outline" onClick={handleTestConnection}>
                Test connection
              </Button>
            </div>
            <InlineError message={errors.orchestratorUrl?.message} />
            <div>{connectionIndicator}</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="githubAppId" className="text-gray-700 font-medium">GitHub App ID</Label>
            <Input id="githubAppId" type="number" {...register("githubAppId", { valueAsNumber: true })} />
            <InlineError message={errors.githubAppId?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="githubWebhookSecret" className="text-gray-700 font-medium">GitHub Webhook Secret</Label>
            <div className="relative">
              <Input
                id="githubWebhookSecret"
                type={showWebhookSecret ? "text" : "password"}
                className="pr-10"
                {...register("githubWebhookSecret")}
              />
              <button
                type="button"
                className="absolute right-2 top-2 text-gray-500"
                onClick={() => setShowWebhookSecret((value) => !value)}
              >
                {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <InlineError message={errors.githubWebhookSecret?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vercelApiToken" className="text-gray-700 font-medium">Vercel API Token</Label>
            <div className="relative">
              <Input
                id="vercelApiToken"
                type={showVercelToken ? "text" : "password"}
                className="pr-10"
                {...register("vercelApiToken")}
              />
              <button
                type="button"
                className="absolute right-2 top-2 text-gray-500"
                onClick={() => setShowVercelToken((value) => !value)}
              >
                {showVercelToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <InlineError message={errors.vercelApiToken?.message} />
          </div>

          <div>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200 bg-white">
        <CardHeader className="border-b border-gray-200">
          <CardTitle className="text-lg">Database Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 p-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="forkTimeoutMs">Fork timeout in ms</Label>
            <Input id="forkTimeoutMs" type="number" {...register("forkTimeoutMs", { valueAsNumber: true })} />
            <p className="text-xs text-gray-500">Maximum time allowed for creating a branch fork.</p>
            <InlineError message={errors.forkTimeoutMs?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxConcurrentBranches">Max concurrent branches</Label>
            <Input
              id="maxConcurrentBranches"
              type="number"
              {...register("maxConcurrentBranches", { valueAsNumber: true })}
            />
            <p className="text-xs text-gray-500">Maximum branch databases that can be active at once.</p>
            <InlineError message={errors.maxConcurrentBranches?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="autoTeardownDays">Auto-teardown after days</Label>
            <Input
              id="autoTeardownDays"
              type="number"
              {...register("autoTeardownDays", { valueAsNumber: true })}
            />
            <p className="text-xs text-gray-500">Automatically teardown stale branches after this many days.</p>
            <InlineError message={errors.autoTeardownDays?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pgPoolSize">PostgreSQL connection pool size</Label>
            <Input id="pgPoolSize" type="number" {...register("pgPoolSize", { valueAsNumber: true })} />
            <p className="text-xs text-gray-500">Number of reusable DB connections maintained by FlowDB.</p>
            <InlineError message={errors.pgPoolSize?.message} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-red-300 bg-white">
        <CardHeader className="border-b border-red-200 bg-red-50">
          <CardTitle className="text-lg text-red-900">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="rounded-md border border-red-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-red-900">Teardown all branches</p>
                <p className="text-sm text-red-700">This removes every active branch database.</p>
              </div>
              <Button type="button" variant="destructive" onClick={() => setDangerMode("teardown")}>
                Teardown all branches
              </Button>
            </div>
            <DangerConfirm
              open={dangerMode === "teardown"}
              title="Teardown all branches"
              warning="This action will permanently tear down all branch databases and may result in data loss."
              confirmText="TEARDOWN ALL"
              inputValue={teardownConfirm}
              onInputChange={setTeardownConfirm}
              onRun={runTeardownAll}
              isRunning={isTeardownRunning}
            />
          </div>

          <div className="rounded-md border border-red-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-red-900">Reset FlowDB metadata</p>
                <p className="text-sm text-red-700">This clears saved FlowDB metadata from your local config.</p>
              </div>
              <Button type="button" variant="destructive" onClick={() => setDangerMode("reset")}>Reset FlowDB metadata</Button>
            </div>
            <DangerConfirm
              open={dangerMode === "reset"}
              title="Reset FlowDB metadata"
              warning="Resetting metadata removes saved local FlowDB configuration values."
              confirmText="RESET"
              inputValue={resetConfirm}
              onInputChange={setResetConfirm}
              onRun={runResetMetadata}
              isRunning={isResetRunning}
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
