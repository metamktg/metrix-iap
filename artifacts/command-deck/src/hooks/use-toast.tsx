// ─── use-toast: the app's toast API, delivered by Sonner ─────────────────
//
// Every call site in the app speaks the shadcn shape:
//   toast({ title, description, variant: "destructive", duration })
// and the tests mock `useToast` from this path. The shape stays. What
// changed is what renders it: Sonner (already installed, already wrapped
// in components/ui/sonner.tsx, never mounted) instead of the Radix toast
// reducer that used to live here. Sonner stacks, swipes, pauses on hover,
// enters and leaves on the same edge, and pairs an icon with the type, so
// the product's status colour is never the only signal.
//
// `toasts` is kept on the hook's return for API compatibility; Sonner owns
// the list, so it is always empty here. Nothing in the app read it.

import * as React from "react"
import { toast as sonnerToast } from "sonner"

type ToastVariant = "default" | "destructive"

export type Toast = {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: ToastVariant
  /** Milliseconds on screen. Errors default longer than confirmations. */
  duration?: number
  /** A button on the toast. Closes the toast unless onClick prevents default. */
  action?: { label: string; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void }
}

type ToastHandle = {
  id: string | number
  dismiss: () => void
  update: (props: Toast) => void
}

const DEFAULT_DURATION_MS = 4000
const ERROR_DURATION_MS = 8000

function show(props: Toast, id?: string | number): string | number {
  const { title, description, variant, duration, action } = props
  const options = {
    id,
    description,
    duration: duration ?? (variant === "destructive" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS),
    action,
  }
  const message = title ?? description ?? ""
  return variant === "destructive"
    ? sonnerToast.error(message, options)
    : sonnerToast(message, options)
}

function toast(props: Toast): ToastHandle {
  const id = show(props)
  return {
    id,
    dismiss: () => sonnerToast.dismiss(id),
    update: (next: Toast) => { show({ ...props, ...next }, id) },
  }
}

function useToast() {
  return {
    toasts: [] as const,
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
  }
}

export { useToast, toast }
