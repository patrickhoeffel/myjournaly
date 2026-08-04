import { useState, useRef, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Typography,
} from "@mui/material";
import { CloudUpload, FolderZip, PhotoLibrary } from "@mui/icons-material";
import exifr from "exifr";
import JSZip from "jszip";
import { auth } from "../lib/firebase";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

interface PhotoDropzoneProps {
  open: boolean;
  onClose: () => void;
  onUploaded: (count: number) => void;
}

interface FileItem {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

const ACCEPTED = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"];
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
const ZIP_EXT_RE = /\.zip$/i;

// Downscale before upload: cap the long edge, re-encode as JPEG at 85%.
// Falls back to the original file if the browser can't decode it (e.g. HEIC on Chrome).
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

async function downscaleImage(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("decode failed"));
      im.src = url;
    });
    const longEdge = Math.max(img.width, img.height);
    const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
    // Already small enough and already a JPEG → don't re-encode (avoids a needless quality hit)
    if (scale === 1 && file.type === "image/jpeg") return file;

    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) return file;

    // Keep the base name, force .jpg since we re-encoded
    const baseName = file.name.replace(/\.(jpe?g|png|gif|webp|heic|heif)$/i, "");
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Extract image files from a zip. Skips folders, non-images, and hidden files (dotfiles).
async function extractImagesFromZip(zipFile: File): Promise<File[]> {
  const zip = await JSZip.loadAsync(zipFile);
  const results: File[] = [];
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const base = entry.name.split("/").pop() || entry.name;
    if (base.startsWith(".") || base.startsWith("__MACOSX")) continue;
    if (!IMAGE_EXT_RE.test(base)) continue;
    const blob = await entry.async("blob");
    const ext = (base.match(IMAGE_EXT_RE)?.[1] || "jpg").toLowerCase();
    const mime = ext.startsWith("jp") ? "image/jpeg" : `image/${ext === "heif" ? "heic" : ext}`;
    results.push(new File([blob], base, { type: mime, lastModified: entry.date.getTime() }));
  }
  return results;
}

/**
 * Modal that lets a user pick a folder (or many files) of photos.
 * For each file we extract EXIF client-side (date + GPS) and send it
 * alongside the multipart upload to /photos.
 */
export default function PhotoDropzone({ open, onClose, onUploaded }: PhotoDropzoneProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFiles([]);
    setUploading(false);
    setUploadedCount(0);
    setFailedCount(0);
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const all = Array.from(incoming);
    const images = all.filter((f) => ACCEPTED.includes(f.type) || IMAGE_EXT_RE.test(f.name));
    const zips = all.filter((f) => f.type === "application/zip" || ZIP_EXT_RE.test(f.name));

    // Extract any zips first so they land in the same batch as loose files.
    const extracted: File[] = [];
    for (const zip of zips) {
      try {
        setExtracting(zip.name);
        const found = await extractImagesFromZip(zip);
        extracted.push(...found);
      } catch (e) {
        console.error("Failed to extract zip", zip.name, e);
      }
    }
    setExtracting(null);

    const combined = [...images, ...extracted];
    if (combined.length === 0) return;

    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.file.name}:${f.file.size}`));
      const next = [...prev];
      combined.forEach((file) => {
        const key = `${file.name}:${file.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push({ file, status: "pending" });
        }
      });
      return next;
    });
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const extractExif = async (file: File) => {
    try {
      const data = await exifr.parse(file, { gps: true, translateValues: true, reviveValues: true }) as Record<string, unknown> | undefined;
      if (!data) return { taken_at: null, gps_lat: null, gps_lng: null, gps_altitude: null, width: null, height: null, exif: null };
      const dt = (data.DateTimeOriginal || data.CreateDate || data.DateTime) as Date | undefined;
      return {
        taken_at: dt instanceof Date ? dt.toISOString() : null,
        gps_lat: typeof data.latitude === "number" ? data.latitude : null,
        gps_lng: typeof data.longitude === "number" ? data.longitude : null,
        gps_altitude: typeof data.altitude === "number" ? data.altitude : null,
        width: (data.ExifImageWidth || data.ImageWidth || null) as number | null,
        height: (data.ExifImageHeight || data.ImageHeight || null) as number | null,
        exif: data,
      };
    } catch {
      return { taken_at: null, gps_lat: null, gps_lng: null, gps_altitude: null, width: null, height: null, exif: null };
    }
  };

  const uploadOne = async (fi: FileItem, index: number) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, status: "uploading" } : f)));
    try {
      // Extract EXIF from the ORIGINAL (downscaled JPEG loses metadata).
      const meta = await extractExif(fi.file);
      const toUpload = await downscaleImage(fi.file);
      const fd = new FormData();
      fd.append("file", toUpload);
      fd.append("original_filename", fi.file.name);
      if (meta.taken_at) fd.append("taken_at", meta.taken_at);
      if (meta.gps_lat != null) fd.append("gps_lat", String(meta.gps_lat));
      if (meta.gps_lng != null) fd.append("gps_lng", String(meta.gps_lng));
      if (meta.gps_altitude != null) fd.append("gps_altitude", String(meta.gps_altitude));
      if (meta.width != null) fd.append("width", String(meta.width));
      if (meta.height != null) fd.append("height", String(meta.height));
      if (meta.exif) {
        // Trim exif to primitives to keep payload manageable
        const slim: Record<string, unknown> = {};
        Object.entries(meta.exif).forEach(([k, v]) => {
          if (v == null) return;
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") slim[k] = v;
          else if (v instanceof Date) slim[k] = v.toISOString();
        });
        fd.append("exif_json", JSON.stringify(slim));
      }

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(`${API_BASE}/api/v1/photos`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, status: "done" } : f)));
      setUploadedCount((c) => c + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, status: "error", error: msg } : f)));
      setFailedCount((c) => c + 1);
    }
  };

  const startUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setUploadedCount(0);
    setFailedCount(0);
    // Upload with a small concurrency cap so we don't slam the API/Storage
    const CONCURRENCY = 4;
    const queue = files.map((_, i) => i);
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const idx = queue.shift();
        if (idx == null) return;
        await uploadOne(files[idx], idx);
      }
    });
    await Promise.all(workers);
    setUploading(false);
    onUploaded(files.length);
  };

  const done = files.length > 0 && uploadedCount + failedCount === files.length;
  const progress = files.length ? Math.round(((uploadedCount + failedCount) / files.length) * 100) : 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload photos</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          sx={{
            border: "2px dashed",
            borderColor: dragOver ? "primary.main" : "divider",
            borderRadius: 2,
            p: 3,
            textAlign: "center",
            bgcolor: dragOver ? "action.hover" : "background.paper",
            transition: "background-color 0.15s, border-color 0.15s",
          }}
        >
          <CloudUpload sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Drag & drop photos, a folder, or a .zip here — or pick from disk.
            <Box component="span" sx={{ display: "block", fontSize: "0.75rem", mt: 0.5, color: "text.disabled" }}>
              Uploads are downscaled to ~2000 px and saved as JPEG. EXIF (date, GPS) is preserved as metadata.
            </Box>
          </Typography>
          <Box sx={{ display: "flex", gap: 1, justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PhotoLibrary />}
              onClick={() => filesInput.current?.click()}
              disabled={uploading}
              sx={{ textTransform: "none" }}
            >
              Choose files
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => folderInput.current?.click()}
              disabled={uploading}
              sx={{ textTransform: "none" }}
            >
              Choose folder
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FolderZip />}
              onClick={() => zipInput.current?.click()}
              disabled={uploading}
              sx={{ textTransform: "none" }}
            >
              Choose zip
            </Button>
          </Box>
          {extracting && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              Extracting {extracting}…
            </Typography>
          )}
          <input
            ref={filesInput}
            type="file"
            multiple
            accept={ACCEPTED.join(",")}
            style={{ display: "none" }}
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
            style={{ display: "none" }}
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <input
            ref={zipInput}
            type="file"
            accept=".zip,application/zip"
            style={{ display: "none" }}
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </Box>

        {files.length > 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {uploading
                ? `Uploading… ${uploadedCount + failedCount} / ${files.length}`
                : done
                  ? `Done. ${uploadedCount} uploaded${failedCount ? `, ${failedCount} failed` : ""}.`
                  : `${files.length} photo${files.length === 1 ? "" : "s"} ready`}
            </Typography>
            {uploading && <LinearProgress variant="determinate" value={progress} sx={{ mb: 1 }} />}
            <Box sx={{ maxHeight: 200, overflowY: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
              {files.map((f, i) => (
                <Box
                  key={`${f.file.name}-${i}`}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    px: 1,
                    py: 0.5,
                    borderBottom: 1,
                    borderColor: "divider",
                    "&:last-child": { borderBottom: 0 },
                  }}
                >
                  <Typography variant="caption" noWrap sx={{ flex: 1, mr: 1 }}>
                    {f.file.name}
                  </Typography>
                  {f.status === "pending" && <Typography variant="caption" color="text.disabled">pending</Typography>}
                  {f.status === "uploading" && <CircularProgress size={12} />}
                  {f.status === "done" && <Typography variant="caption" color="success.main">✓</Typography>}
                  {f.status === "error" && <Typography variant="caption" color="error" title={f.error}>failed</Typography>}
                </Box>
              ))}
            </Box>
            {failedCount > 0 && !uploading && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {failedCount} photo{failedCount === 1 ? "" : "s"} failed to upload.
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={uploading} sx={{ textTransform: "none" }}>
          {done ? "Close" : "Cancel"}
        </Button>
        {!done && (
          <Button
            variant="contained"
            onClick={startUpload}
            disabled={files.length === 0 || uploading}
            sx={{ textTransform: "none" }}
          >
            {uploading ? "Uploading…" : `Upload ${files.length || ""}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
