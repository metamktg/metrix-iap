import { useState, useRef, useCallback } from "react";
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMetrixSeedQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MAX_BYTES = 8 * 1024 * 1024;

interface CellCreativeUploadDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: string;
  cellId: string;
}

export function CellCreativeUploadDialog({
  open,
  onOpenChange,
  accountId,
  cellId,
}: CellCreativeUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setStatus("idle");
    setErrorMsg(null);
  }, [previewUrl]);

  const handleClose = useCallback(
    (v: boolean) => {
      if (!v) reset();
      onOpenChange(v);
    },
    [onOpenChange, reset],
  );

  const handleFile = useCallback(
    (f: File) => {
      if (f.size > MAX_BYTES) {
        setErrorMsg("File is too large — the limit is 8 MB.");
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setErrorMsg(null);
      setStatus("idle");
    },
    [previewUrl],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
      e.target.value = "";
    },
    [handleFile],
  );

  const upload = useCallback(async () => {
    if (!file) return;
    setStatus("uploading");
    setErrorMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const uint8 = new Uint8Array(buf);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
      }
      const b64 = btoa(binary);
      const res = await fetch(`/api/metrix/accounts/${accountId}/cells/${cellId}/creative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content_base64: b64,
          filename: file.name,
          content_type: file.type || "application/octet-stream",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Upload failed (${res.status})`);
      }
      setStatus("success");
      void queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed.");
    }
  }, [file, accountId, cellId, queryClient]);

  const isVideo = file?.type.startsWith("video/") ?? false;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Upload creative · <span className="font-mono text-primary">{cellId}</span>
          </DialogTitle>
        </DialogHeader>

        {status === "success" ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
            <p className="text-body text-center text-muted-foreground">
              Creative uploaded — the library will refresh automatically.
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-1 text-caption text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !previewUrl && fileRef.current?.click()}
              className={cn(
                "relative border-2 border-dashed rounded-lg transition-colors overflow-hidden",
                "aspect-[4/5] flex flex-col items-center justify-center",
                previewUrl
                  ? "border-primary/30 cursor-default"
                  : "border-border/50 hover:border-primary/40 cursor-pointer",
              )}
            >
              {previewUrl ? (
                isVideo ? (
                  <video
                    src={previewUrl}
                    className="absolute inset-0 w-full h-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground/60 select-none">
                  <Upload className="w-6 h-6" />
                  <span className="text-caption text-center px-4">
                    Drop an image or video, or click to browse
                    <br />
                    <span className="text-[10px] opacity-70">Max 8 MB</span>
                  </span>
                </div>
              )}

              {previewUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reset();
                  }}
                  title="Remove file"
                  className="absolute top-1.5 right-1.5 z-10 p-0.5 rounded-full bg-black/60 text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {previewUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileRef.current?.click();
                  }}
                  title="Replace file"
                  className="absolute bottom-1.5 left-1.5 z-10 text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white/70 hover:text-white transition-colors"
                >
                  Replace
                </button>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={onPick}
            />

            {errorMsg && (
              <div className="flex items-start gap-1.5 text-destructive text-caption">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              disabled={!file || status === "uploading"}
              onClick={upload}
              className={cn(
                "w-full py-2 rounded-lg text-body font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2",
              )}
            >
              {status === "uploading" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading…
                </>
              ) : (
                "Upload creative"
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
