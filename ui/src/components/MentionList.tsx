import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Box, Chip, Divider, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import { useUserSettings } from "../lib/UserSettingsContext";

export interface MentionItem {
  id: string;
  label: string;
  mentionType: "person" | "feeling" | "belief" | "tag" | "loss";
  extra?: string;   // relationship for people, valence for feelings, category for beliefs
  valence?: string;  // for beliefs (separate from extra which holds category)
  color?: string;    // for tags
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
  mode: string;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const BELIEF_CATEGORY_ORDER = ["self", "god", "others", "world"];
const BELIEF_CATEGORY_LABELS: Record<string, string> = {
  self: "About Myself",
  god: "About God",
  others: "About Others",
  world: "About the World",
};

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command, mode }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { feelingsPosColor, feelingsNegColor, beliefsPosColor, beliefsNegColor } = useUserSettings();

    useEffect(() => setSelectedIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          if (items[selectedIndex]) command(items[selectedIndex]);
          return true;
        }
        return false;
      },
    }));

    const containerSx = {
      bgcolor: "background.paper",
      border: "1px solid",
      borderColor: "divider",
      borderRadius: 1,
      boxShadow: 3,
      overflow: "auto",
      minWidth: 200,
    };

    if (items.length === 0) {
      // For people mode, just hide the popup — don't block typing
      if (mode === "People") return null;
      return (
        <Box sx={{ ...containerSx, p: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            No {mode.toLowerCase()} found
          </Typography>
        </Box>
      );
    }

    // ── Feelings mode: positive/negative chip cloud ──
    if (mode === "Feelings") {
      const positive = items.filter((i) => i.extra === "positive");
      const negative = items.filter((i) => i.extra !== "positive");

      const renderChip = (item: MentionItem, isPositive: boolean) => {
        const idx = items.indexOf(item);
        const color = isPositive ? feelingsPosColor : feelingsNegColor;
        return (
          <Chip
            key={item.id}
            label={item.label}
            size="small"
            variant="outlined"
            onClick={() => command(item)}
            sx={{
              cursor: "pointer",
              color: idx === selectedIndex ? "#fff" : color,
              borderColor: isPositive ? color : `${color}80`,
              bgcolor: idx === selectedIndex ? color : "transparent",
              "&:hover": { bgcolor: `${color} !important`, color: "#fff" },
            }}
          />
        );
      };

      return (
        <Box sx={{ ...containerSx, p: 2, maxWidth: 360, maxHeight: 400 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Positive
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
            {positive.length > 0
              ? positive.map((item) => renderChip(item, true))
              : <Typography variant="caption" color="text.disabled">--</Typography>}
          </Box>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Negative
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
            {negative.length > 0
              ? negative.map((item) => renderChip(item, false))
              : <Typography variant="caption" color="text.disabled">--</Typography>}
          </Box>
        </Box>
      );
    }

    // ── Beliefs mode: categorized chip cloud with positive/negative columns ──
    if (mode === "Beliefs") {
      const grouped = BELIEF_CATEGORY_ORDER.map((cat) => {
          const catItems = items.filter((i) => i.extra === cat);
          return {
            category: cat,
            label: BELIEF_CATEGORY_LABELS[cat],
            positive: catItems.filter((i) => i.valence === "positive"),
            negative: catItems.filter((i) => i.valence !== "positive"),
          };
        }).filter((g) => g.positive.length > 0 || g.negative.length > 0);

      const renderChip = (item: MentionItem, isPositive: boolean) => {
        const idx = items.indexOf(item);
        const color = isPositive ? beliefsPosColor : beliefsNegColor;
        return (
          <Chip
            key={item.id}
            label={item.label}
            size="small"
            variant="outlined"
            onClick={() => command(item)}
            sx={{
              cursor: "pointer",
              color: idx === selectedIndex ? "#fff" : color,
              borderColor: isPositive ? color : `${color}80`,
              bgcolor: idx === selectedIndex ? color : "transparent",
              "&:hover": { bgcolor: `${color} !important`, color: "#fff" },
            }}
          />
        );
      };

      return (
        <Box sx={{ ...containerSx, p: 2, maxWidth: 560, maxHeight: 400 }}>
          {grouped.map((group, gi) => (
            <Box key={group.category}>
              {gi > 0 && <Divider sx={{ my: 1.5 }} />}
              <Typography variant="caption" fontWeight={700} sx={{ mb: 0.5, display: "block" }}>
                {group.label}
              </Typography>
              <Box sx={{ display: "flex", gap: 3 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ fontSize: "0.65rem", color: beliefsPosColor }}>
                    Positive
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.25 }}>
                    {group.positive.length > 0
                      ? group.positive.map((item) => renderChip(item, true))
                      : <Typography variant="caption" color="text.disabled">--</Typography>}
                  </Box>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: beliefsNegColor, fontWeight: 600, fontSize: "0.65rem" }}>
                    Negative
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.25 }}>
                    {group.negative.length > 0
                      ? group.negative.map((item) => renderChip(item, false))
                      : <Typography variant="caption" color="text.disabled">--</Typography>}
                  </Box>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      );
    }

    // ── Tags mode: colored chip cloud ──
    if (mode === "Tags") {
      const existing = items.filter((i) => i.extra !== "__create__");
      const createItem = items.find((i) => i.extra === "__create__");

      return (
        <Box sx={{ ...containerSx, p: 2, maxWidth: 360, maxHeight: 320 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {existing.map((item) => {
              const idx = items.indexOf(item);
              const color = item.color || "#1976d2";
              return (
                <Chip
                  key={item.id}
                  label={item.label}
                  size="small"
                  variant="outlined"
                  onClick={() => command(item)}
                  sx={{
                    cursor: "pointer",
                    color: idx === selectedIndex ? "#fff" : color,
                    borderColor: color,
                    bgcolor: idx === selectedIndex ? color : "transparent",
                    "&:hover": { bgcolor: `${color} !important`, color: "#fff" },
                  }}
                />
              );
            })}
          </Box>
          {createItem && (
            <>
              {existing.length > 0 && <Divider sx={{ my: 1 }} />}
              <Chip
                label={`Create "${createItem.label}"`}
                size="small"
                variant="outlined"
                onClick={() => command(createItem)}
                sx={{
                  cursor: "pointer",
                  fontStyle: "italic",
                  color: items.indexOf(createItem) === selectedIndex ? "#fff" : "text.secondary",
                  borderColor: "divider",
                  borderStyle: "dashed",
                  bgcolor: items.indexOf(createItem) === selectedIndex ? "action.selected" : "transparent",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              />
            </>
          )}
        </Box>
      );
    }

    // ── People mode: list (default) ──
    return (
      <Box sx={{ ...containerSx, maxWidth: 320, maxHeight: 240 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ px: 1.5, pt: 1, pb: 0.5, display: "block", fontWeight: 600 }}
        >
          {mode}
        </Typography>
        <List dense disablePadding>
          {items.map((item, index) => (
            <ListItemButton
              key={item.id}
              selected={index === selectedIndex}
              onClick={() => command(item)}
              sx={{ py: 0.25, px: 1.5 }}
            >
              <ListItemText
                primary={item.label}
                secondary={item.extra}
                primaryTypographyProps={{ variant: "body2", noWrap: true }}
                secondaryTypographyProps={{ variant: "caption" }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>
    );
  }
);

MentionList.displayName = "MentionList";

export default MentionList;
