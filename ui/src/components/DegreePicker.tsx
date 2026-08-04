import { Box, IconButton, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import { Remove } from "@mui/icons-material";

interface DegreePickerProps {
  value: number | null | undefined;
  onChange: (next: number | null) => void;
  color?: string;
  size?: number;
  title?: string;
}

/**
 * 1–5 dot rating, gentle-feeling. Shows a clear (×) button when a value is set.
 * Used for Degree on Feelings, Beliefs, and Losses.
 */
export default function DegreePicker({
  value,
  onChange,
  color = "currentColor",
  size,
  title = "Degree (1-5)",
}: DegreePickerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const dotSize = size ?? (isMobile ? 14 : 10);
  const filled = value ?? 0;
  const hasValue = value != null;
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
      <Tooltip title="Clear degree" arrow>
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onChange(null); }}
          disabled={!hasValue}
          sx={{
            p: 0.25,
            color,
            opacity: hasValue ? 0.7 : 0,
            pointerEvents: hasValue ? "auto" : "none",
            transition: "opacity 0.15s",
            "&:hover": { opacity: 1, bgcolor: "transparent" },
          }}
        >
          <Remove sx={{ fontSize: dotSize + 4 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={title} arrow>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
          {[1, 2, 3, 4, 5].map((n) => {
            const isFilled = n <= filled;
            return (
              <Box
                key={n}
                role="button"
                aria-label={`Set degree ${n}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value === n ? null : n);
                }}
                sx={{
                  width: dotSize,
                  height: dotSize,
                  borderRadius: "50%",
                  cursor: "pointer",
                  bgcolor: isFilled ? color : "transparent",
                  border: `1.5px solid ${color}`,
                  transition: "transform 0.1s",
                  "&:hover": { transform: "scale(1.2)" },
                }}
              />
            );
          })}
        </Box>
      </Tooltip>
    </Box>
  );
}
