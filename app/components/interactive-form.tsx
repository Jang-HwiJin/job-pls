"use client";

import { useActionState, useEffect, useState } from "react";
import type { ReactNode } from "react";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;
type ButtonAction = (state: ActionState) => Promise<ActionState>;

const initialState: ActionState = {
  status: "idle",
  message: "",
};

export function InteractiveForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  className,
}: {
  action: FormAction;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel: string;
  className?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [visibleMessage, setVisibleMessage] = useState("");

  useEffect(() => {
    if (state.status === "idle") return;

    setVisibleMessage(state.message);
    const timeout = window.setTimeout(() => setVisibleMessage(""), 3500);

    return () => window.clearTimeout(timeout);
  }, [state]);

  return (
    <form action={formAction} className={className}>
      {children}
      <button
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#e7aa35] px-5 py-3 font-black text-[#17130d] shadow-lg shadow-[#17130d]/10 transition duration-300 hover:-translate-y-0.5 hover:bg-[#f1b84d] disabled:cursor-wait disabled:opacity-70"
        type="submit"
        disabled={isPending}
      >
        {isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#17130d]/20 border-t-[#17130d]" /> : null}
        {isPending ? pendingLabel : submitLabel}
      </button>
      <StatusToast status={state.status} message={visibleMessage} />
    </form>
  );
}

export function ActionButton({
  action,
  label,
  pendingLabel,
}: {
  action: ButtonAction;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [visibleMessage, setVisibleMessage] = useState("");

  useEffect(() => {
    if (state.status === "idle") return;

    setVisibleMessage(state.message);
    const timeout = window.setTimeout(() => setVisibleMessage(""), 3500);

    return () => window.clearTimeout(timeout);
  }, [state]);

  return (
    <form action={formAction} className="relative">
      <button
        className="inline-flex items-center gap-2 rounded-full bg-[#17130d] px-4 py-2 text-sm font-bold text-[#fff8ea] transition duration-300 hover:-translate-y-0.5 hover:bg-[#342716] disabled:cursor-wait disabled:opacity-70"
        type="submit"
        disabled={isPending}
      >
        {isPending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : null}
        {isPending ? pendingLabel : label}
      </button>
      <StatusToast status={state.status} message={visibleMessage} compact />
    </form>
  );
}

function StatusToast({
  status,
  message,
  compact = false,
}: {
  status: ActionState["status"];
  message: string;
  compact?: boolean;
}) {
  if (!message) return null;

  return (
    <div
      className={[
        "animate-toast-in rounded-2xl border px-4 py-3 text-sm font-bold shadow-xl",
        compact ? "absolute right-0 top-12 z-20 min-w-56" : "mt-3",
        status === "error"
          ? "border-[#a6432b]/20 bg-[#ffe2d8] text-[#7b2d1b]"
          : "border-[#446f58]/20 bg-[#dbf4e6] text-[#173b27]",
      ].join(" ")}
    >
      {message}
    </div>
  );
}
