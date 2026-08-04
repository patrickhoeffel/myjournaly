import { useState, useRef } from "react";
import { Box, Popover, useTheme } from "@mui/material";

// Dark, saturated colors for light backgrounds
const LIGHT_MODE_COLORS = [
  "#2e7d32", // green
  "#1565c0", // blue
  "#00838f", // teal
  "#00695c", // dark teal
  "#6A1B9A", // purple
  "#4527a0", // deep purple
  "#c62828", // red
  "#ad1457", // pink
  "#c2185b", // rose
  "#e65100", // orange
  "#bf360c", // deep orange
  "#283593", // indigo
  "#558b2f", // light green
  "#4e342e", // brown
  "#37474f", // blue grey
  "#455a64", // slate
];

// Bright, vivid colors for dark backgrounds
const DARK_MODE_COLORS = [
  "#66bb6a", // green
  "#42a5f5", // blue
  "#26c6da", // teal
  "#26a69a", // dark teal
  "#ce93d8", // purple
  "#b39ddb", // deep purple
  "#ef5350", // red
  "#f06292", // pink
  "#ec407a", // rose
  "#ffa726", // orange
  "#ff7043", // deep orange
  "#7986cb", // indigo
  "#9ccc65", // light green
  "#a1887f", // brown
  "#90a4ae", // blue grey
  "#78909c", // slate
];

interface ColorPaletteProps {
  value: string;
  onChange: (color: string) => void;
  title?: string;
}

export default function ColorPalette({ value, onChange, title }: ColorPaletteProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const colors = theme.palette.mode === "dark" ? DARK_MODE_COLORS : LIGHT_MODE_COLORS;

  return (
    <>
      <Box
        ref={anchorRef}
        onClick={() => setOpen(true)}
        title={title}
        sx={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          bgcolor: value,
          cursor: "pointer",
          border: "2px solid",
          borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
          flexShrink: 0,
          "&:hover": { borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)" },
        }}
      />
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { p: 1.5, maxWidth: 180 } } }}
      >
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center" }}>
          {colors.map((color) => (
            <Box
              key={color}
              onClick={() => { onChange(color); setOpen(false); }}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                bgcolor: color,
                cursor: "pointer",
                border: "2px solid",
                borderColor: value === color ? "text.primary" : "transparent",
                outline: value === color ? "2px solid" : "none",
                outlineColor: value === color ? color : undefined,
                outlineOffset: 1,
                "&:hover": { transform: "scale(1.15)" },
                transition: "transform 0.1s",
              }}
            />
          ))}
        </Box>
      </Popover>
    </>
  );
}
