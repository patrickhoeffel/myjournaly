import { useRef, useState } from "react";
import {
  Avatar,
  Box,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { AddAPhoto, Delete } from "@mui/icons-material";
import { auth } from "../lib/firebase";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

interface ImageUploadProps {
  /** Current image URL (if any) */
  value: string | null | undefined;
  /** Called with the new URL after upload, or null after delete */
  onChange: (url: string | null) => void;
  /** Entity type for storage path organization */
  entityType: "profile" | "event" | "person" | "journal";
  /** Optional entity ID */
  entityId?: string;
  /** Display variant */
  variant?: "avatar" | "card";
  /** Size in px (for avatar variant) */
  size?: number;
}

export default function ImageUpload({
  value,
  onChange,
  entityType,
  entityId = "",
  variant = "card",
  size = 80,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }

    setUploading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entity_type", entityType);
      formData.append("entity_id", entityId);

      const res = await fetch(`${API_BASE}/api/v1/images/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setStoragePath(data.path);
      onChange(data.url);
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!storagePath && !value) return;
    try {
      if (storagePath) {
        const token = await auth.currentUser?.getIdToken();
        await fetch(`${API_BASE}/api/v1/images?path=${encodeURIComponent(storagePath)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      setStoragePath(null);
      onChange(null);
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  if (variant === "avatar") {
    return (
      <Box sx={{ position: "relative", display: "inline-block" }}>
        <Avatar
          src={value || undefined}
          sx={{ width: size, height: size, cursor: "pointer" }}
          onClick={() => inputRef.current?.click()}
        >
          {!value && !uploading && <AddAPhoto />}
          {uploading && <CircularProgress size={size * 0.4} />}
        </Avatar>
        {value && (
          <Tooltip title="Remove photo">
            <IconButton
              size="small"
              onClick={handleDelete}
              sx={{
                position: "absolute",
                bottom: -4,
                right: -4,
                bgcolor: "background.paper",
                boxShadow: 1,
                "&:hover": { bgcolor: "error.light", color: "#fff" },
              }}
            >
              <Delete sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFileSelect} />
      </Box>
    );
  }

  // Card variant
  return (
    <Box
      sx={{
        border: "1px dashed",
        borderColor: value ? "transparent" : "grey.400",
        borderRadius: 1,
        overflow: "hidden",
        position: "relative",
        cursor: "pointer",
        "&:hover .upload-overlay": { opacity: 1 },
      }}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      {value ? (
        <Box sx={{ position: "relative" }}>
          <Box
            component="img"
            src={value}
            sx={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }}
          />
          <Box
            className="upload-overlay"
            sx={{
              position: "absolute",
              inset: 0,
              bgcolor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              opacity: 0,
              transition: "opacity 0.2s",
            }}
          >
            <Tooltip title="Change image">
              <IconButton sx={{ color: "#fff" }}>
                <AddAPhoto />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove image">
              <IconButton
                sx={{ color: "#fff" }}
                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              >
                <Delete />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      ) : (
        <Box sx={{ p: 3, textAlign: "center" }}>
          {uploading ? (
            <CircularProgress size={24} />
          ) : (
            <>
              <AddAPhoto sx={{ fontSize: 32, color: "grey.500", mb: 0.5 }} />
              <Typography variant="caption" color="text.secondary" display="block">
                Click to upload image
              </Typography>
            </>
          )}
        </Box>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFileSelect} />
    </Box>
  );
}
