import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react";
import {
  Autocomplete,
  Box,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useUserSettings } from "../lib/UserSettingsContext";
import DegreePicker from "./DegreePicker";

// ── 1-5 ↔ 0.0-1.0 mapping (link_strength) ──
function strengthToDegree(s: number | null | undefined): number | null {
  if (s == null) return null;
  // Treat 0.5 (the server default for newly-created links) as "unset" so the
  // user sees an empty picker until they explicitly set a degree.
  if (s === 0.5) return null;
  return Math.max(1, Math.min(5, Math.round(s * 5)));
}
function degreeToStrength(d: number | null): number {
  if (d == null) return 0.5;
  return Math.max(0, Math.min(1, d / 5));
}

// ── Types ──

export interface LinkRecord {
  id: string;
  from_id: string;
  from_type: string;
  from_name: string;
  to_id: string;
  to_type: string;
  to_name: string;
  link_type: string;
  link_strength?: number;
}

interface PersonOption {
  id: string;
  name: string;
}
interface FeelingOption {
  id: string;
  name: string;
  valence: string;
}
interface BeliefOption {
  id: string;
  statement: string;
  category: string | null;
  valence: string | null;
}
interface JournalOption {
  id: string;
  title: string;
  created_at: string;
}
interface EventOption {
  id: string;
  title: string;
  began_at: string;
}

// ── Helpers ──

/** Given a link and the entity we queried for, return the "other" side. */
export function getOtherEntity(link: LinkRecord, entityId: string) {
  if (link.from_id === entityId) {
    return { id: link.to_id, type: link.to_type, name: link.to_name };
  }
  return { id: link.from_id, type: link.from_type, name: link.from_name };
}

// ── Labeled fieldset wrapper (matches Journal.tsx association field styling) ──

function LabeledFieldset({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 1,
        pt: 1.5,
        position: "relative",
        minHeight: 40,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          position: "absolute",
          top: -9,
          left: 8,
          bgcolor: "background.paper",
          px: 0.5,
          fontWeight: 600,
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
}

// ── Chip + DegreePicker as a single inline unit (wraps as one) ──

interface LinkChipProps {
  label: string;
  link: LinkRecord;
  onDelete: () => void;
  onDegreeChange: (next: number | null) => void;
  color: string;
  borderColor?: string;
  onDoubleClick?: () => void;
}

function LinkChip({ label, link, onDelete, onDegreeChange, color, borderColor, onDoubleClick }: LinkChipProps) {
  const degree = strengthToDegree(link.link_strength);
  const bColor = borderColor ?? color;
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        pl: 0.25,
        pr: 0.5,
        py: 0.25,
        border: `1px dashed ${bColor}40`,
        borderRadius: 1,
        bgcolor: "background.paper",
      }}
    >
      <Chip
        label={label}
        size="small"
        variant="outlined"
        onDelete={onDelete}
        onDoubleClick={onDoubleClick}
        sx={{
          color,
          borderColor: bColor,
          "& .MuiChip-deleteIcon": { color: `${bColor}80`, "&:hover": { color: bColor } },
        }}
      />
      <DegreePicker value={degree} onChange={onDegreeChange} color={color} />
    </Box>
  );
}

// ── Hook: manage links for a given entity ──

export function useEntityLinks(
  fromId: string | null,
  fromType: string,
  fromName: string,
  direction: "forward" | "both" = "forward",
) {
  const [links, setLinks] = useState<LinkRecord[]>([]);

  const loadLinks = useCallback(async () => {
    if (!fromId) {
      setLinks([]);
      return;
    }
    try {
      const param = direction === "both" ? `entity_id=${fromId}` : `from_id=${fromId}`;
      const data = await apiFetch(`/links?${param}`);
      setLinks(data);
    } catch {
      // silent
    }
  }, [fromId, direction]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const addLink = async (toId: string, toType: string, toName: string) => {
    if (!fromId) return;
    try {
      const newLink = await apiFetch("/links", {
        method: "POST",
        body: JSON.stringify({
          from_id: fromId,
          from_type: fromType,
          from_name: fromName,
          to_id: toId,
          to_type: toType,
          to_name: toName,
          link_type: "association",
        }),
      });
      setLinks((prev) => [...prev, newLink]);
    } catch {
      // silent
    }
  };

  const removeLink = async (linkId: string) => {
    try {
      await apiFetch(`/links/${linkId}`, { method: "DELETE" });
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch {
      // silent
    }
  };

  const updateLink = async (linkId: string, patch: Partial<LinkRecord>) => {
    setLinks((prev) => prev.map((l) => (l.id === linkId ? { ...l, ...patch } : l)));
    try {
      await apiFetch(`/links/${linkId}`, { method: "PUT", body: JSON.stringify(patch) });
    } catch {
      // revert on failure
      loadLinks();
    }
  };

  const setLinkDegree = (linkId: string, degree: number | null) =>
    updateLink(linkId, { link_strength: degreeToStrength(degree) });

  return { links, addLink, removeLink, updateLink, setLinkDegree, reload: loadLinks };
}

// ── Feelings Picker (word-cloud popover) ──

interface FeelingsPickerProps {
  fromId: string | null;
  fromType: string;
  fromName: string;
  label?: string;
}

export function FeelingsPicker({ fromId, fromType, fromName, label }: FeelingsPickerProps) {
  const { links, addLink, removeLink, setLinkDegree } = useEntityLinks(fromId, fromType, fromName);
  const [options, setOptions] = useState<FeelingOption[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { feelingsPosColor: posColor, feelingsNegColor: negColor } = useUserSettings();

  useEffect(() => {
    apiFetch("/feelings").then((data) =>
      setOptions(data.map((f: Record<string, string>) => ({ id: f.id, name: f.name, valence: f.valence })))
    ).catch(() => {});
  }, []);

  const feelingLinks = links.filter((l) => l.to_type === "feeling");
  const selectedIds = new Set(feelingLinks.map((l) => l.to_id));

  // Sort alphabetically within each group: positive first, then negative
  const sorted = useMemo(() => {
    const pos = options.filter((o) => o.valence === "positive").sort((a, b) => a.name.localeCompare(b.name));
    const neg = options.filter((o) => o.valence !== "positive").sort((a, b) => a.name.localeCompare(b.name));
    return { positive: pos, negative: neg };
  }, [options]);

  const toggleFeeling = (opt: FeelingOption) => {
    if (selectedIds.has(opt.id)) {
      const link = feelingLinks.find((l) => l.to_id === opt.id);
      if (link) removeLink(link.id);
    } else {
      addLink(opt.id, "feeling", opt.name);
    }
  };

  // Selected feelings for inline display
  const selectedOptions = options.filter((o) => selectedIds.has(o.id));

  const negColorBorder = `${negColor}80`;

  // Compute popover position anchored to parent dialog left edge
  const getAnchorPosition = () => {
    const el = containerRef.current;
    if (!el) return { top: 0, left: 0 };
    // Walk up to find the Dialog paper (MuiDialogContent -> MuiPaper)
    const dialogPaper = el.closest(".MuiDialog-paper");
    if (dialogPaper) {
      const rect = dialogPaper.getBoundingClientRect();
      const selfRect = el.getBoundingClientRect();
      return { top: selfRect.bottom, left: rect.left + 24 };
    }
    const selfRect = el.getBoundingClientRect();
    return { top: selfRect.bottom, left: selfRect.left };
  };

  const content = (
    <Box ref={containerRef}>
      {/* Inline: selected pills + trigger button */}
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75 }}>
        {selectedOptions.map((opt) => {
          const link = feelingLinks.find((l) => l.to_id === opt.id);
          if (!link) return null;
          const isPos = opt.valence === "positive";
          return (
            <LinkChip
              key={opt.id}
              label={opt.name}
              link={link}
              onDelete={() => removeLink(link.id)}
              onDegreeChange={(d) => setLinkDegree(link.id, d)}
              color={isPos ? posColor : negColor}
              borderColor={isPos ? posColor : negColorBorder}
            />
          );
        })}
        <IconButton size="small" onClick={() => setOpen(true)}>
          <Add fontSize="small" />
        </IconButton>
      </Box>

      {/* Word-cloud popover */}
      <Popover
        open={open}
        anchorReference="anchorPosition"
        anchorPosition={open ? getAnchorPosition() : undefined}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { maxWidth: 360, p: 2 } } }}
      >
        <IconButton
          size="small"
          onClick={() => setOpen(false)}
          sx={{ position: "absolute", top: 4, right: 4 }}
        >
          <Close fontSize="small" />
        </IconButton>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Positive
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
          {sorted.positive.map((opt) => {
            const selected = selectedIds.has(opt.id);
            return (
              <Chip
                key={opt.id}
                label={opt.name}
                size="small"
                variant="outlined"
                onClick={() => toggleFeeling(opt)}
                sx={{
                  cursor: "pointer",
                  color: selected ? "#fff" : posColor,
                  borderColor: posColor,
                  bgcolor: selected ? posColor : "transparent",
                  "&:hover": { bgcolor: `${posColor} !important`, color: "#fff" },
                }}
              />
            );
          })}
        </Box>

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Negative
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
          {sorted.negative.map((opt) => {
            const selected = selectedIds.has(opt.id);
            return (
              <Chip
                key={opt.id}
                label={opt.name}
                size="small"
                onClick={() => toggleFeeling(opt)}
                sx={{
                  cursor: "pointer",
                  color: selected ? "#fff" : negColor,
                  borderColor: negColorBorder,
                  bgcolor: selected ? negColor : "transparent",
                  "&:hover": { bgcolor: `${negColor} !important`, color: "#fff" },
                }}
                variant="outlined"
              />
            );
          })}
        </Box>
      </Popover>
    </Box>
  );

  return label ? <LabeledFieldset label={label}>{content}</LabeledFieldset> : content;
}

// ── Beliefs Picker (word-cloud popover, grouped by category, split by valence) ──

const BELIEF_CATEGORY_ORDER = ["self", "god", "others", "world"];
const BELIEF_CATEGORY_LABELS: Record<string, string> = {
  self: "About Myself",
  god: "About God",
  others: "About Others",
  world: "About the World",
};


interface BeliefsPickerProps {
  fromId: string | null;
  fromType: string;
  fromName: string;
  label?: string;
}

export function BeliefsPicker({ fromId, fromType, fromName, label }: BeliefsPickerProps) {
  const { links, addLink, removeLink, setLinkDegree } = useEntityLinks(fromId, fromType, fromName);
  const { beliefsPosColor: posColor, beliefsNegColor: negColor } = useUserSettings();
  const [options, setOptions] = useState<BeliefOption[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("/beliefs").then((data) =>
      setOptions(
        data
          .filter((b: Record<string, unknown>) => b.is_active)
          .map((b: Record<string, string | boolean | null>) => ({
            id: b.id as string,
            statement: b.statement as string,
            category: (b.category as string) || null,
            valence: (b.valence as string) || null,
          }))
      )
    ).catch(() => {});
  }, []);

  const beliefLinks = links.filter((l) => l.to_type === "belief");
  const selectedIds = new Set(beliefLinks.map((l) => l.to_id));
  const selectedOptions = options.filter((o) => selectedIds.has(o.id));

  const toggleBelief = (opt: BeliefOption) => {
    if (selectedIds.has(opt.id)) {
      const link = beliefLinks.find((l) => l.to_id === opt.id);
      if (link) removeLink(link.id);
    } else {
      addLink(opt.id, "belief", opt.statement);
    }
  };

  const grouped = useMemo(() => {
    return BELIEF_CATEGORY_ORDER.map((cat) => {
      const items = options.filter((b) => b.category === cat);
      const positive = items.filter((b) => b.valence === "positive").sort((a, b) => a.statement.localeCompare(b.statement));
      const negative = items.filter((b) => b.valence === "negative").sort((a, b) => a.statement.localeCompare(b.statement));
      return { category: cat, label: BELIEF_CATEGORY_LABELS[cat], positive, negative };
    }).filter((g) => g.positive.length > 0 || g.negative.length > 0);
  }, [options]);

  const getAnchorPosition = () => {
    const el = containerRef.current;
    if (!el) return { top: 0, left: 0 };
    const dialogPaper = el.closest(".MuiDialog-paper");
    if (dialogPaper) {
      const rect = dialogPaper.getBoundingClientRect();
      const selfRect = el.getBoundingClientRect();
      return { top: selfRect.bottom, left: rect.left + 24 };
    }
    const selfRect = el.getBoundingClientRect();
    return { top: selfRect.bottom, left: selfRect.left };
  };

  const content = (
    <Box ref={containerRef}>
      {/* Inline: selected pills + trigger button */}
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75 }}>
        {selectedOptions.map((opt) => {
          const link = beliefLinks.find((l) => l.to_id === opt.id);
          if (!link) return null;
          const isPos = opt.valence === "positive";
          return (
            <LinkChip
              key={opt.id}
              label={opt.statement}
              link={link}
              onDelete={() => removeLink(link.id)}
              onDegreeChange={(d) => setLinkDegree(link.id, d)}
              color={isPos ? posColor : negColor}
              borderColor={isPos ? posColor : `${negColor}80`}
            />
          );
        })}
        <IconButton size="small" onClick={() => setOpen(true)}>
          <Add fontSize="small" />
        </IconButton>
      </Box>

      {/* Word-cloud popover */}
      <Popover
        open={open}
        anchorReference="anchorPosition"
        anchorPosition={open ? getAnchorPosition() : undefined}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { maxWidth: 560, p: 2 } } }}
      >
        <IconButton
          size="small"
          onClick={() => setOpen(false)}
          sx={{ position: "absolute", top: 4, right: 4 }}
        >
          <Close fontSize="small" />
        </IconButton>

        {grouped.map((group, gi) => (
          <Box key={group.category}>
            {gi > 0 && <Divider sx={{ my: 1.5 }} />}
            <Typography variant="caption" fontWeight={700} sx={{ mb: 0.5, display: "block" }}>
              {group.label}
            </Typography>
            <Box sx={{ display: "flex", gap: 3 }}>
              {/* Positive column */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" fontWeight={600} sx={{ fontSize: "0.65rem", color: posColor }}>
                  Positive
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.25 }}>
                  {group.positive.map((opt) => {
                    const selected = selectedIds.has(opt.id);
                    return (
                      <Chip
                        key={opt.id}
                        label={opt.statement}
                        size="small"
                        variant="outlined"
                        onClick={() => toggleBelief(opt)}
                        sx={{
                          cursor: "pointer",
                          color: selected ? "#fff" : posColor,
                          borderColor: posColor,
                          bgcolor: selected ? posColor : "transparent",
                          "&:hover": { bgcolor: `${posColor} !important`, color: "#fff" },
                        }}
                      />
                    );
                  })}
                  {group.positive.length === 0 && (
                    <Typography variant="caption" color="text.disabled">--</Typography>
                  )}
                </Box>
              </Box>

              {/* Negative column */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: negColor, fontWeight: 600, fontSize: "0.65rem" }}>
                  Negative
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.25 }}>
                  {group.negative.map((opt) => {
                    const selected = selectedIds.has(opt.id);
                    return (
                      <Chip
                        key={opt.id}
                        label={opt.statement}
                        size="small"
                        variant="outlined"
                        onClick={() => toggleBelief(opt)}
                        sx={{
                          cursor: "pointer",
                          color: selected ? "#fff" : negColor,
                          borderColor: `${negColor}80`,
                          bgcolor: selected ? negColor : "transparent",
                          "&:hover": { bgcolor: `${negColor} !important`, color: "#fff" },
                        }}
                      />
                    );
                  })}
                  {group.negative.length === 0 && (
                    <Typography variant="caption" color="text.disabled">--</Typography>
                  )}
                </Box>
              </Box>
            </Box>
          </Box>
        ))}
      </Popover>
    </Box>
  );

  return label ? <LabeledFieldset label={label}>{content}</LabeledFieldset> : content;
}

// ── People Picker ──

interface PlaceOption {
  id: string;
  name: string;
  address: string;
}

interface PlacesPickerProps {
  fromId: string | null;
  fromType: string;
  fromName: string;
}

export function PlacesPicker({ fromId, fromType, fromName }: PlacesPickerProps) {
  const { links, addLink, removeLink } = useEntityLinks(fromId, fromType, fromName);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch("/places").then((data) =>
      setOptions(
        data.map((p: Record<string, string>) => ({
          id: p.id,
          name: p.name,
          address: p.formatted_address || "",
        }))
      )
    ).catch(() => {});
  }, []);

  const placeLinks = links.filter((l) => l.to_type === "place");
  const selectedIds = new Set(placeLinks.map((l) => l.to_id));
  const selectedOptions = options.filter((o) => selectedIds.has(o.id));
  const availableOptions = options.filter((o) => !selectedIds.has(o.id));

  return (
    <Autocomplete
      multiple
      size="small"
      options={availableOptions}
      getOptionLabel={(o) => o.name}
      value={selectedOptions}
      onChange={(_ev, _newVal, reason, details) => {
        if (reason === "selectOption" && details?.option) {
          addLink(details.option.id, "place", details.option.name);
        } else if (reason === "removeOption" && details?.option) {
          const link = placeLinks.find((l) => l.to_id === details.option.id);
          if (link) removeLink(link.id);
        } else if (reason === "clear") {
          placeLinks.forEach((l) => removeLink(l.id));
        }
      }}
      renderInput={(params) => <TextField {...params} label="Locations" placeholder="Link a place..." />}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <Box>
            <Typography variant="body2">{option.name}</Typography>
            {option.address && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {option.address}
              </Typography>
            )}
          </Box>
        </li>
      )}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option.id}
            label={option.name}
            size="small"
            variant="outlined"
            onDoubleClick={() => navigate(`/places?place=${option.id}`)}
          />
        ))
      }
      isOptionEqualToValue={(opt, val) => opt.id === val.id}
    />
  );
}

interface PeoplePickerProps {
  fromId: string | null;
  fromType: string;
  fromName: string;
}

export function PeoplePicker({ fromId, fromType, fromName }: PeoplePickerProps) {
  const { links, addLink, removeLink } = useEntityLinks(fromId, fromType, fromName);
  const [options, setOptions] = useState<PersonOption[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch("/people").then((data) =>
      setOptions(
        data.map((p: Record<string, string>) => ({
          id: p.id,
          name: `${p.first_name}${p.last_name ? ` ${p.last_name}` : ""}`,
        }))
      )
    ).catch(() => {});
  }, []);

  const personLinks = links.filter((l) => l.to_type === "person");
  const selectedIds = new Set(personLinks.map((l) => l.to_id));
  const selectedOptions = options.filter((o) => selectedIds.has(o.id));
  const availableOptions = options.filter((o) => !selectedIds.has(o.id));

  return (
    <Autocomplete
      multiple
      size="small"
      options={availableOptions}
      getOptionLabel={(o) => o.name}
      value={selectedOptions}
      onChange={(_ev, _newVal, reason, details) => {
        if (reason === "selectOption" && details?.option) {
          addLink(details.option.id, "person", details.option.name);
        } else if (reason === "removeOption" && details?.option) {
          const link = personLinks.find((l) => l.to_id === details.option.id);
          if (link) removeLink(link.id);
        } else if (reason === "clear") {
          personLinks.forEach((l) => removeLink(l.id));
        }
      }}
      renderInput={(params) => <TextField {...params} label="People" placeholder="Tag people..." />}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option.id}
            label={option.name}
            size="small"
            color="secondary"
            variant="outlined"
            onDoubleClick={() => navigate(`/people?person=${option.id}`)}
          />
        ))
      }
      isOptionEqualToValue={(opt, val) => opt.id === val.id}
    />
  );
}

// ── Events Picker ──

interface EventsPickerProps {
  fromId: string | null;
  fromType: string;
  fromName: string;
}

export function EventsPicker({ fromId, fromType, fromName }: EventsPickerProps) {
  const { links, addLink, removeLink } = useEntityLinks(fromId, fromType, fromName);
  const [options, setOptions] = useState<EventOption[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch("/events").then((data) =>
      setOptions(
        data.map((e: Record<string, string>) => ({
          id: e.id,
          title: e.title,
          began_at: e.began_at,
        }))
      )
    ).catch(() => {});
  }, []);

  const eventLinks = links.filter((l) => l.to_type === "event");
  const selectedIds = new Set(eventLinks.map((l) => l.to_id));
  const selectedOptions = options.filter((o) => selectedIds.has(o.id));
  const availableOptions = options.filter((o) => !selectedIds.has(o.id));

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return iso;
    }
  };

  const labelFor = (o: EventOption) =>
    o.began_at ? `${o.title} (${formatDate(o.began_at)})` : o.title;

  return (
    <Autocomplete
      multiple
      size="small"
      options={availableOptions}
      getOptionLabel={labelFor}
      value={selectedOptions}
      onChange={(_ev, _newVal, reason, details) => {
        if (reason === "selectOption" && details?.option) {
          addLink(details.option.id, "event", details.option.title);
        } else if (reason === "removeOption" && details?.option) {
          const link = eventLinks.find((l) => l.to_id === details.option.id);
          if (link) removeLink(link.id);
        } else if (reason === "clear") {
          eventLinks.forEach((l) => removeLink(l.id));
        }
      }}
      renderInput={(params) => <TextField {...params} label="Events" placeholder="Tag events..." />}
      renderTags={(value, getTagProps) =>
        value.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option.id}
            label={labelFor(option)}
            size="small"
            variant="outlined"
            onDoubleClick={() => navigate(`/events?event=${option.id}`)}
          />
        ))
      }
      isOptionEqualToValue={(opt, val) => opt.id === val.id}
    />
  );
}

// ── Notes Picker (Journal Entries) ──

interface NotesPickerProps {
  fromId: string | null;
  fromType: string;
  fromName: string;
}

export function NotesPicker({ fromId, fromType, fromName }: NotesPickerProps) {
  const { links, addLink, removeLink } = useEntityLinks(fromId, fromType, fromName);
  const [options, setOptions] = useState<JournalOption[]>([]);

  useEffect(() => {
    apiFetch("/journal").then((data) =>
      setOptions(
        data.map((j: Record<string, string>) => ({
          id: j.id,
          title: j.title || "Untitled",
          created_at: j.created_at,
        }))
      )
    ).catch(() => {});
  }, []);

  const noteLinks = links.filter((l) => l.to_type === "journal_entry");
  const linkedIds = new Set(noteLinks.map((l) => l.to_id));
  const availableOptions = options.filter((o) => !linkedIds.has(o.id));

  return (
    <Box>
      <Autocomplete
        size="small"
        options={availableOptions}
        getOptionLabel={(o) => o.title}
        value={null}
        onChange={(_ev, val) => {
          if (val) {
            addLink(val.id, "journal_entry", val.title);
          }
        }}
        renderInput={(params) => <TextField {...params} label="Notes" placeholder="Link journal entries..." />}
        isOptionEqualToValue={(opt, val) => opt.id === val.id}
        blurOnSelect
        clearOnBlur
      />
      {noteLinks.length > 0 && (
        <List dense disablePadding sx={{ mt: 0.5 }}>
          {noteLinks.map((link) => (
            <ListItem
              key={link.id}
              disableGutters
              secondaryAction={
                <IconButton edge="end" size="small" onClick={() => removeLink(link.id)}>
                  <Close fontSize="small" />
                </IconButton>
              }
              sx={{ py: 0.25 }}
            >
              <ListItemText
                primary={
                  <Typography variant="body2" noWrap>
                    {link.to_name || "Untitled"}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}

// ── Tags Picker (chip-cloud popover) ──

interface TagOption {
  id: string;
  name: string;
  color: string | null;
}

interface TagsPickerProps {
  fromId: string | null;
  fromType: string;
  fromName: string;
  label?: string;
}

export function TagsPicker({ fromId, fromType, fromName, label }: TagsPickerProps) {
  const { links, addLink, removeLink, setLinkDegree } = useEntityLinks(fromId, fromType, fromName);
  const [options, setOptions] = useState<TagOption[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("/tags")
      .then((data) =>
        setOptions(data.map((t: Record<string, string | null>) => ({ id: t.id as string, name: t.name as string, color: t.color })))
      )
      .catch(() => {});
  }, []);

  const tagLinks = links.filter((l) => l.to_type === "tag");
  const selectedIds = new Set(tagLinks.map((l) => l.to_id));
  const selectedOptions = options.filter((o) => selectedIds.has(o.id));

  const toggleTag = (opt: TagOption) => {
    if (selectedIds.has(opt.id)) {
      const link = tagLinks.find((l) => l.to_id === opt.id);
      if (link) removeLink(link.id);
    } else {
      addLink(opt.id, "tag", opt.name);
    }
  };

  const getAnchorPosition = () => {
    const el = containerRef.current;
    if (!el) return { top: 0, left: 0 };
    const selfRect = el.getBoundingClientRect();
    return { top: selfRect.bottom, left: selfRect.left };
  };

  const content = (
    <Box ref={containerRef}>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75 }}>
        {selectedOptions.map((opt) => {
          const link = tagLinks.find((l) => l.to_id === opt.id);
          if (!link) return null;
          const color = opt.color || "#1976d2";
          return (
            <LinkChip
              key={opt.id}
              label={opt.name}
              link={link}
              onDelete={() => removeLink(link.id)}
              onDegreeChange={(d) => setLinkDegree(link.id, d)}
              color={color}
            />
          );
        })}
        <IconButton size="small" onClick={() => setOpen(true)}>
          <Add fontSize="small" />
        </IconButton>
      </Box>

      <Popover
        open={open}
        anchorReference="anchorPosition"
        anchorPosition={open ? getAnchorPosition() : undefined}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { maxWidth: 360, p: 2 } } }}
      >
        <IconButton
          size="small"
          onClick={() => setOpen(false)}
          sx={{ position: "absolute", top: 4, right: 4 }}
        >
          <Close fontSize="small" />
        </IconButton>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5, mr: 3 }}>
          {options.map((opt) => {
            const selected = selectedIds.has(opt.id);
            const color = opt.color || "#1976d2";
            return (
              <Chip
                key={opt.id}
                label={opt.name}
                size="small"
                variant="outlined"
                onClick={() => toggleTag(opt)}
                sx={{
                  cursor: "pointer",
                  color: selected ? "#fff" : color,
                  borderColor: color,
                  bgcolor: selected ? color : "transparent",
                  "&:hover": { bgcolor: `${color} !important`, color: "#fff" },
                }}
              />
            );
          })}
          {options.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No tags yet. Create tags in your Profile.
            </Typography>
          )}
        </Box>
      </Popover>
    </Box>
  );

  return label ? <LabeledFieldset label={label}>{content}</LabeledFieldset> : content;
}

// ── Losses Picker (word-cloud popover, single column) ──

interface LossOption {
  id: string;
  name: string;
}

interface LossesPickerProps {
  fromId: string | null;
  fromType: string;
  fromName: string;
  label?: string;
}

const LOSS_COLOR = "#7E57C2";

export function LossesPicker({ fromId, fromType, fromName, label }: LossesPickerProps) {
  const { links, addLink, removeLink, setLinkDegree } = useEntityLinks(fromId, fromType, fromName);
  const [options, setOptions] = useState<LossOption[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("/losses")
      .then((data) =>
        setOptions(data.map((l: Record<string, string>) => ({ id: l.id, name: l.name })))
      )
      .catch(() => {});
  }, []);

  const lossLinks = links.filter((l) => l.to_type === "loss");
  const selectedIds = new Set(lossLinks.map((l) => l.to_id));
  const selectedOptions = options.filter((o) => selectedIds.has(o.id));
  const sortedOptions = useMemo(() => [...options].sort((a, b) => a.name.localeCompare(b.name)), [options]);

  const toggleLoss = (opt: LossOption) => {
    if (selectedIds.has(opt.id)) {
      const link = lossLinks.find((l) => l.to_id === opt.id);
      if (link) removeLink(link.id);
    } else {
      addLink(opt.id, "loss", opt.name);
    }
  };

  const getAnchorPosition = () => {
    const el = containerRef.current;
    if (!el) return { top: 0, left: 0 };
    const dialogPaper = el.closest(".MuiDialog-paper");
    if (dialogPaper) {
      const rect = dialogPaper.getBoundingClientRect();
      const selfRect = el.getBoundingClientRect();
      return { top: selfRect.bottom, left: rect.left + 24 };
    }
    const selfRect = el.getBoundingClientRect();
    return { top: selfRect.bottom, left: selfRect.left };
  };

  const content = (
    <Box ref={containerRef}>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75 }}>
        {selectedOptions.map((opt) => {
          const link = lossLinks.find((l) => l.to_id === opt.id);
          if (!link) return null;
          return (
            <LinkChip
              key={opt.id}
              label={opt.name}
              link={link}
              onDelete={() => removeLink(link.id)}
              onDegreeChange={(d) => setLinkDegree(link.id, d)}
              color={LOSS_COLOR}
            />
          );
        })}
        <IconButton size="small" onClick={() => setOpen(true)}>
          <Add fontSize="small" />
        </IconButton>
      </Box>

      <Popover
        open={open}
        anchorReference="anchorPosition"
        anchorPosition={open ? getAnchorPosition() : undefined}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { maxWidth: 400, maxHeight: 420, p: 2 } } }}
      >
        <IconButton
          size="small"
          onClick={() => setOpen(false)}
          sx={{ position: "absolute", top: 4, right: 4 }}
        >
          <Close fontSize="small" />
        </IconButton>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Losses
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5, mr: 3 }}>
          {sortedOptions.map((opt) => {
            const selected = selectedIds.has(opt.id);
            return (
              <Chip
                key={opt.id}
                label={opt.name}
                size="small"
                variant="outlined"
                onClick={() => toggleLoss(opt)}
                sx={{
                  cursor: "pointer",
                  color: selected ? "#fff" : LOSS_COLOR,
                  borderColor: LOSS_COLOR,
                  bgcolor: selected ? LOSS_COLOR : "transparent",
                  "&:hover": { bgcolor: `${LOSS_COLOR} !important`, color: "#fff" },
                }}
              />
            );
          })}
          {options.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No losses in your list yet. Visit your Profile → Losses to set them up.
            </Typography>
          )}
        </Box>
      </Popover>
    </Box>
  );

  return label ? <LabeledFieldset label={label}>{content}</LabeledFieldset> : content;
}
