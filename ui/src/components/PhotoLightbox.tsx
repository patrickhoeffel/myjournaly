import { useEffect, useRef, useState } from "react";
import { Box, Dialog, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { ChevronLeft, ChevronRight, Close, DeleteOutline, Info, InfoOutlined } from "@mui/icons-material";
import type { TimelinePhoto } from "./TimelineViz";
import AssociationsPanel from "./AssociationsPanel";
import PhotoLocationsPicker from "./PhotoLocationsPicker";

interface PhotoLightboxProps {
  photos: TimelinePhoto[];
  initialIndex?: number;
  onClose: () => void;
  /** If provided, a trash icon appears; called with the photo id to delete. */
  onDelete?: (photoId: string) => Promise<void> | void;
  /** Save an edited caption. If omitted, caption field is read-only. */
  onCaptionChange?: (photoId: string, caption: string) => Promise<void> | void;
}

const DETAILS_MIN_WIDTH = 300;
const DETAILS_MAX_WIDTH = 900;
const DETAILS_DEFAULT_WIDTH = 420;
const DETAILS_STORAGE_KEY = "photoLightboxDetailsWidth";

/**
 * Full-screen lightbox with a Google-Photos-style Details side panel.
 * Toggle the (i) button to reveal caption editor + Associations for the current photo.
 */
export default function PhotoLightbox({ photos, initialIndex = 0, onClose, onDelete, onCaptionChange }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [deleting, setDeleting] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [captionDraft, setCaptionDraft] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);
  const [detailsWidth, setDetailsWidth] = useState<number>(() => {
    const stored = typeof window !== "undefined" ? Number(sessionStorage.getItem(DETAILS_STORAGE_KEY)) : NaN;
    return Number.isFinite(stored) && stored >= DETAILS_MIN_WIDTH && stored <= DETAILS_MAX_WIDTH
      ? stored
      : DETAILS_DEFAULT_WIDTH;
  });
  const draggingRef = useRef(false);
  const open = photos.length > 0;
  const photo = photos[index];

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const startX = e.clientX;
    const startWidth = detailsWidth;
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      // Drag handle sits on the LEFT edge of the panel; dragging LEFT widens it.
      const next = Math.max(
        DETAILS_MIN_WIDTH,
        Math.min(DETAILS_MAX_WIDTH, startWidth + (startX - ev.clientX)),
      );
      setDetailsWidth(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try { sessionStorage.setItem(DETAILS_STORAGE_KEY, String(detailsWidth)); } catch { /* ignore */ }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Persist width when it settles.
  useEffect(() => {
    try { sessionStorage.setItem(DETAILS_STORAGE_KEY, String(detailsWidth)); } catch { /* ignore */ }
  }, [detailsWidth]);

  const handleDelete = async () => {
    if (!photo || !onDelete) return;
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    try {
      setDeleting(true);
      await onDelete(photo.id);
      setIndex((i) => Math.min(i, Math.max(0, photos.length - 2)));
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    setIndex(Math.min(initialIndex, Math.max(0, photos.length - 1)));
  }, [initialIndex, photos.length]);

  // Sync the caption draft when the current photo changes.
  useEffect(() => {
    setCaptionDraft(photo?.caption ?? "");
  }, [photo?.id, photo?.caption]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, photos.length - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      else if (e.key === "Escape") onClose();
      else if (e.key === "i" || e.key === "I") setShowDetails((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, photos.length, onClose]);

  if (!open || !photo) return null;

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };
  const fmtDateOnly = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }); }
    catch { return iso; }
  };
  const fmtTimeOnly = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
    catch { return iso; }
  };

  const commitCaption = async () => {
    if (!onCaptionChange) return;
    const trimmed = captionDraft.trim();
    const current = (photo.caption ?? "").trim();
    if (trimmed === current) return;
    try {
      setSavingCaption(true);
      await onCaptionChange(photo.id, trimmed);
    } finally {
      setSavingCaption(false);
    }
  };

  const photoName = photo.caption?.trim() || `Photo ${fmtDate(photo.taken_at)}`;

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
            display: "flex",
            flexDirection: "row",
          },
        },
      }}
    >
      {/* Photo pane */}
      <Box sx={{ flex: 1, position: "relative", minWidth: 0 }}>
        {/* Top-right controls: Info, Close */}
        <Box sx={{ position: "absolute", top: 12, right: 12, zIndex: 2, display: "flex", gap: 1 }}>
          <Tooltip title={showDetails ? "Hide details (i)" : "Show details (i)"}>
            <IconButton
              onClick={() => setShowDetails((v) => !v)}
              sx={{ color: "#fff", bgcolor: "rgba(0,0,0,0.4)" }}
            >
              {showDetails ? <Info /> : <InfoOutlined />}
            </IconButton>
          </Tooltip>
          <IconButton onClick={onClose} sx={{ color: "#fff", bgcolor: "rgba(0,0,0,0.4)" }}>
            <Close />
          </IconButton>
        </Box>

        {onDelete && (
          <Tooltip title="Delete photo" placement="right">
            <span style={{ position: "absolute", top: 12, left: 12, zIndex: 2 }}>
              <IconButton
                onClick={handleDelete}
                disabled={deleting}
                sx={{ color: "#fff", bgcolor: "rgba(0,0,0,0.4)", "&.Mui-disabled": { color: "rgba(255,255,255,0.3)" } }}
              >
                <DeleteOutline />
              </IconButton>
            </span>
          </Tooltip>
        )}

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
            {photo.caption && !showDetails && (
              <Typography variant="body2" sx={{ mb: 0.5 }}>{photo.caption}</Typography>
            )}
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {fmtDate(photo.taken_at)}
              {photos.length > 1 ? ` — ${index + 1} of ${photos.length}` : ""}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Details side panel */}
      {showDetails && (
        <Box
          sx={{
            width: { xs: "100vw", sm: detailsWidth },
            maxWidth: "100vw",
            height: "100vh",
            bgcolor: "background.paper",
            color: "text.primary",
            borderLeft: 1,
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {/* Drag handle on the LEFT edge — grow/shrink the panel width */}
          <Box
            onMouseDown={startResize}
            sx={{
              display: { xs: "none", sm: "block" },
              position: "absolute",
              top: 0,
              left: -3,
              width: 6,
              height: "100%",
              cursor: "ew-resize",
              zIndex: 3,
              "&:hover": { bgcolor: "primary.main", opacity: 0.3 },
            }}
          />
          <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1 }}>Details</Typography>
            <IconButton size="small" onClick={() => setShowDetails(false)}>
              <Close fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ px: 2, py: 2, overflowY: "auto", flex: 1 }}>
            {/* When */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>When</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{fmtDateOnly(photo.taken_at)}</Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>{fmtTimeOnly(photo.taken_at)}</Typography>
            </Box>

            {/* Caption */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Caption {savingCaption && "(saving…)"}
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={12}
                placeholder="Add a caption, description, or your thoughts about this photo…"
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                onBlur={commitCaption}
                variant="outlined"
                disabled={!onCaptionChange}
                sx={{ mt: 0.5 }}
              />
            </Box>

            {/* Where — GPS */}
            {photo.gps_lat != null && photo.gps_lng != null && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Where</Typography>
                <Typography variant="body2" sx={{ mt: 0.5, fontFamily: "monospace", fontSize: "0.8rem" }}>
                  {photo.gps_lat.toFixed(5)}, {photo.gps_lng.toFixed(5)}
                </Typography>
              </Box>
            )}

            {/* Locations — nearby suggestions from Maps + biased search + linked chips */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 0.75 }}>
                Locations
              </Typography>
              <PhotoLocationsPicker
                photoId={photo.id}
                photoName={photoName}
                gpsLat={photo.gps_lat}
                gpsLng={photo.gps_lng}
              />
            </Box>

            {/* Associations — feelings, beliefs, losses, tags, people, events, notes (locations rendered above) */}
            {/* compact = single-column when the panel is narrow; two-cols otherwise */}
            <Box sx={{ mx: -2 }}>
              <AssociationsPanel
                entityId={photo.id}
                entityType="photo"
                entityName={photoName}
                heading="Associations"
                showLocationsPicker={false}
                compact={detailsWidth < 560}
              />
            </Box>
          </Box>
        </Box>
      )}
    </Dialog>
  );
}
