"use client";

import { useState } from "react";
import { LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignInFormProps {
  nextPath: string;
}

export function SignInForm({ nextPath }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [website, setWebsite] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsPending(true);

    const response = await fetch("/api/auth/request-magic-link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        next: nextPath,
        website,
      }),
    });

    const result = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;

    if (!response.ok) {
      setError(result?.error ?? "Unable to send a magic link right now.");
      setIsPending(false);
      return;
    }

    setStatus(
      result?.message ??
        "If this email is approved for FamPlan, a magic link will arrive shortly.",
    );
    setIsPending(false);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">Email address</span>
        <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Mail className="mr-3 size-4 text-slate-400" />
          <input
            className="w-full bg-transparent outline-none"
            type="email"
            value={email}
            onChange={(inputEvent) => setEmail(inputEvent.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
      </label>

      <label className="hidden" aria-hidden="true">
        <span>Website</span>
        <input
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(inputEvent) => setWebsite(inputEvent.target.value)}
        />
      </label>

      <Button className="w-full" disabled={isPending}>
        {isPending ? (
          <>
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            Sending magic link
          </>
        ) : (
          "Send magic link"
        )}
      </Button>

      {status ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {status}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}
    </form>
  );
}
