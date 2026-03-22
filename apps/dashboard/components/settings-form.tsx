"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveSettingsAction, type SettingsActionState } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SettingsFormProps = {
  defaultValues: {
    orchestratorUrl: string;
    githubAppId: string;
    vercelToken: string;
  };
};

const initialState: SettingsActionState = {
  success: false,
  message: ""
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="gap-2">
      {pending ? "Saving..." : "Save Settings"}
    </Button>
  );
}

export function SettingsForm({ defaultValues }: SettingsFormProps) {
  const [state, formAction] = useActionState(saveSettingsAction, initialState);

  return (
    <Card className="max-w-2xl border-gray-200 bg-white">
      <CardHeader className="border-b border-gray-200">
        <CardTitle className="text-lg">External Integrations</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <form action={formAction} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="orchestratorUrl" className="text-gray-700 font-medium">ORCHESTRATOR_URL</Label>
            <Input
              id="orchestratorUrl"
              name="orchestratorUrl"
              type="url"
              placeholder="http://localhost:3000"
              defaultValue={defaultValues.orchestratorUrl}
              required
              className="border-gray-300 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="githubAppId" className="text-gray-700 font-medium">GITHUB_APP_ID</Label>
            <Input
              id="githubAppId"
              name="githubAppId"
              placeholder="Your GitHub App ID"
              defaultValue={defaultValues.githubAppId}
              required
              className="border-gray-300 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vercelToken" className="text-gray-700 font-medium">VERCEL_TOKEN</Label>
            <Input
              id="vercelToken"
              name="vercelToken"
              type="password"
              placeholder="Your Vercel token"
              defaultValue={defaultValues.vercelToken}
              required
              className="border-gray-300 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div className="flex items-center gap-4">
            <SubmitButton />
            {state.message && (
              <p className={state.success ? "text-sm text-green-700 font-medium" : "text-sm text-red-700 font-medium"}>
                {state.message}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
