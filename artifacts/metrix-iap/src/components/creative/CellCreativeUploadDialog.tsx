import { useState, useRef, useCallback } from "react";
import { Upload, X, CheckCircle, AlertCircle, AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMetrixSeedQueryKey } from "@workspace/api-client-react";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/command-deck/components/ui/dialog";
import { DIALOG } from "@/pages/metrix/typography";

const MAX_BYTES = 8 * 1024 * 1024;

interface DetectedVariable {
  family: string;
  code: string;
  confidence: number;
}

interface DnaValidation {
  overall_confidence: number | null;
  variables: DetectedVariable[];
  expected: DetectedVariable[];
  missing: string[];
  conflicting: string[];
}

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
  const [status, setStatus] = useState<
    "idle" | "validating" | "confirm" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validation, setValidation] = useState<DnaValidation | null>(null);
  const [matched, setMatched] = useState<boolean>(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setStatus("idle");
    setErrorMsg(null);
    setValidation(null);
    setMatched(false);
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

  const upload = useCallback(
    async (override = false) => {
      if (!file) return;
      setStatus("validating");
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
            ...(override ? { override: true } : {}),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.status === 409 && (body as { status?: string }).status === "needs_confirmation") {
          setValidation((body as { validation: DnaValidation }).validation);
          setMatched(false);
          setStatus("confirm");
          return;
        }
        if (!res.ok) {
          throw new Error((body as { message?: string }).message ?? `Upload failed (${res.status})`);
        }
        const fileValidation = (body as { validation?: DnaValidation | null }).validation ?? null;
        setValidation(fileValidation);
        setMatched(!override);
        setStatus("success");
        void queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Upload failed.");
      }
    },
    [file, accountId, cellId, queryClient],
  );

  const isVideo = file?.type.startsWith("video/") ?? false;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className={DIALOG.title}>
            Upload creative · <span className="font-mono text-interactive">{cellId}</span>
          </DialogTitle>
        </DialogHeader>

        {status === "success" ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle className="w-8 h-8 text-status-success" />
            <p className="text-body text-center text-muted-foreground">
              Creative filed to <span className="font-mono text-interactive">{cellId}</span> — the library will refresh automatically.
            </p>
            {validation && (
              <div className="w-full flex items-center gap-1.5 justify-center text-caption text-muted-foreground/75">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                {matched
                  ? `Matched the cell's DNA${validation.overall_confidence != null ? ` · ${Math.round(validation.overall_confidence * 100)}% confidence` : ""}`
                  : "Filed with an explicit override — mismatch was confirmed."}
              </div>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-1 text-caption text-muted-foreground/75 hover:text-muted-foreground transition-colors underline underline-offset-2"
            >
              Close
            </button>
          </div>
        ) : status === "confirm" && validation ? (
          <div className="space-y-3 py-1">
            <div className="flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
              <div className="space-y-1.5 text-caption text-status-warning/90">
                <p className="font-medium text-status-warning">Doesn't match this cell's recorded DNA</p>
                {validation.missing.length > 0 && (
                  <p>Missing: <span className="font-mono">{validation.missing.join(", ")}</span></p>
                )}
                {validation.conflicting.length > 0 && (
                  <p>Conflicts: <span className="font-mono">{validation.conflicting.join(", ")}</span></p>
                )}
                {validation.overall_confidence != null && (
                  <p>Detection confidence: {Math.round(validation.overall_confidence * 100)}%</p>
                )}
                <p className="opacity-80">
                  Detected: {validation.variables.map((v) => v.code).join(", ") || "(nothing registry-valid)"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setStatus("idle"); setValidation(null); }}
                className="flex-1 py-2 rounded-lg text-body font-medium border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void upload(true)}
                className="flex-1 py-2 rounded-lg text-body font-medium bg-status-warning/90 text-background hover:bg-status-warning transition-colors"
              >
                Upload anyway
              </button>
            </div>
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
                <div className="flex flex-col items-center gap-2 text-muted-foreground/75 select-none">
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
                  className="absolute top-1.5 right-1.5 z-10 p-0.5 rounded-full bg-background/60 text-foreground/80 hover:text-foreground transition-colors"
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
                  className="absolute bottom-1.5 left-1.5 z-10 text-[9px] font-medium px-1.5 py-0.5 rounded bg-background/60 text-foreground/70 hover:text-foreground transition-colors"
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
              disabled={!file || status === "validating"}
              onClick={() => void upload(false)}
              className={cn(
                "w-full py-2 rounded-lg text-body font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2",
              )}
            >
              {status === "validating" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Validating against IAP DNA…
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
