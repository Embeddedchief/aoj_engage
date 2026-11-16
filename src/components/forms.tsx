"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Form bound to a server action: shows errors/success, follows redirectTo, optional reset. */
export function ActionForm({ action, children, className, resetOnSuccess, confirm, id }: { action: Action; children: React.ReactNode; className?: string; resetOnSuccess?: boolean; confirm?: string; id?: string }) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && state.redirectTo) router.push(state.redirectTo);
    else if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      router.refresh();
    }
  }, [state, router, resetOnSuccess]);
  return (
    <form
      id={id}
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionResult | null }) {
  if (!state || (state.ok && !state.message) || state.redirectTo) return null;
  return (
    <div role="status" className={cn("mt-3 rounded-lg px-3 py-2 text-sm", state.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900")}>
      {state.ok ? state.message : state.error}
    </div>
  );
}

export function Submit({ children, className = "btn-primary", name, value, disabled }: { children: React.ReactNode; className?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} className={className}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** A one-button form for simple actions (approve, pause, delete …). */
export function ActionButton({ action, fields, children, className = "btn-secondary", confirm }: { action: Action; fields?: Record<string, string>; children: React.ReactNode; className?: string; confirm?: string }) {
  return (
    <ActionForm action={action} confirm={confirm} className="inline-block">
      {Object.entries(fields ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Submit className={className}>{children}</Submit>
    </ActionForm>
  );
}
