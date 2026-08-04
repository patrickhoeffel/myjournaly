import { useEffect, useState } from "react";
import { Box, Dialog, IconButton, Typography } from "@mui/material";
import { ChevronLeft, ChevronRight, Close } from "@mui/icons-material";
import type { TimelinePhoto } from "./TimelineViz";

interface PhotoLightboxProps {
  photos: TimelinePhoto[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * Full-screen lightbox. Accepts a list (single photo click → 1-item list;
 * cluster click → all photos in the cluster). Supports keyboard arrows.
 */
export default function PhotoLightbox({ photos, initialIndex = 0, onClose }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const open = photos.length > 0;

  useEffect(() => {
    setIndex(Math.min(initialIndex, Math.max(0, photos.length - 1)));
  }, [initialIndex, photos.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, photos.length - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, photos.length, onClose]);

  if (!open) return null;
  const photo = photos[index];
  if (!photo) return null;

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            bgcolor: "rgba(0,0,0,0.92)",
            m: 0,
            width: "100vw",
            height: "100vh",
            maxWidth: "none",
            maxHeight: "none",
            borderRadius: 0,
            position: "relative",
          },
        },
      }}
    >
      <IconButton
        onClick={onClose}
        sx={{ position: "absolute", top: 12, right: 12, color: "#fff", zIndex: 2, bgcolor: "rgba(0,0,0,0.4)" }}
      >
        <Close />
      </IconButton>

      {photos.length > 1 && (
        <>
          <IconButton
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            disabled={index === 0}
            sx={{ position: "absolute", top: "50%", left: 12, transform: "translateY(-50%)", color: "#fff", zIndex: 2, bgcolor: "rgba(0,0,0,0.4)", "&.Mui-disabled": { color: "rgba(255,255,255,0.3)" } }}
          >
            <ChevronLeft fontSize="large" />
          </IconButton>
          <IconButton
            onClick={() => setIndex((i) => Math.min(i + 1, photos.length - 1))}
            disabled={index === photos.length - 1}
            sx={{ position: "absolute", top: "50%", right: 12, transform: "translateY(-50%)", color: "#fff", zIndex: 2, bgcolor: "rgba(0,0,0,0.4)", "&.Mui-disabled": { color: "rgba(255,255,255,0.3)" } }}
          >
            <ChevronRight fontSize="large" />
          </IconButton>
        </>
      )}

      <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: 4 }}>
        <Box
          component="img"
          src={photo.url}
          alt={photo.caption || ""}
          sx={{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain", boxShadow: 4 }}
        />
        <Box sx={{ mt: 2, textAlign: "center", color: "#fff" }}>
          {photo.caption && (
            <Typography variant="body2" sx={{ mb: 0.5 }}>{photo.caption}</Typography>
          )}
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            {fmtDate(photo.taken_at)}
            {photos.length > 1 ? ` — ${index + 1} of ${photos.length}` : ""}
          </Typography>
        </Box>
      </Box>
    </Dialog>
  );
}
