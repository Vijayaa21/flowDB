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
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save Settings"}
    </Button>
  );
}

export function SettingsForm({ defaultValues }: SettingsFormProps) {
  const [state, formAction] = useActionState(saveSettingsAction, initialState);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>External Integrations</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orchestratorUrl">ORCHESTRATOR_URL</Label>
            <Input
              id="orchestratorUrl"
              name="orchestratorUrl"
              defaultValue={defaultValues.orchestratorUrl}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="githubAppId">GITHUB_APP_ID</Label>
            <Input id="githubAppId" name="githubAppId" defaultValue={defaultValues.githubAppId} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vercelToken">VERCEL_TOKEN</Label>
            <Input id="vercelToken" name="vercelToken" defaultValue={defaultValues.vercelToken} required />
          </div>
          <SubmitButton />
          {state.message && (
            <p className={state.success ? "text-sm text-green-700" : "text-sm text-destructive"}>
              {state.message}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
