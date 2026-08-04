import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  FeelingsPicker,
  BeliefsPicker,
  PeoplePicker,
  NotesPicker,
} from "./LinkPickers";
import { type PickedPlace } from "./PlacesAutocompleteField";
import LocationsField from "./LocationsField";

// ── Types ──

type EventKind = "moment" | "span" | "ongoing";
type DurationUnit = "days" | "weeks" | "months" | "years";

interface TimelineLineOption {
  id: string;
  label: string;
}

export interface EventFormData {
  title: string;
  description: string;
  category: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm or ""
  kind: EventKind;
  duration: string;   // numeric string
  durationUnit: DurationUnit;
  endDate: string;    // YYYY-MM-DD or ""
  location: string;
  locationPlaces: PickedPlace[];
  timelineId: string; // user_timeline_id or ""
}

export const emptyEventForm: EventFormData = {
  title: "",
  description: "",
  category: "personal",
  date: "",
  time: "",
  kind: "moment",
  duration: "",
  durationUnit: "months",
  endDate: "",
  location: "",
  locationPlaces: [],
  timelineId: "",
};

const CATEGORY_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "relationship", label: "Relationship" },
  { value: "family", label: "Family" },
  { value: "educational", label: "Educational" },
  { value: "medical", label: "Medical" },
  { value: "spiritual", label: "Spiritual" },
  { value: "personal", label: "Personal" },
  { value: "financial", label: "Financial" },
  { value: "other", label: "Other" },
];

function computeEndDate(startDate: string, amount: string, unit: DurationUnit): string {
  if (!startDate || !amount) return "";
  const n = parseInt(amount, 10);
  if (isNaN(n) || n <= 0) return "";
  const d = new Date(startDate + "T00:00:00");
  switch (unit) {
    case "days": d.setDate(d.getDate() + n); break;
    case "weeks": d.setDate(d.getDate() + n * 7); break;
    case "months": d.setMonth(d.getMonth() + n); break;
    case "years": d.setFullYear(d.getFullYear() + n); break;
  }
  return d.toISOString().slice(0, 10);
}

// ── Props ──

interface EventDialogProps {
  open: boolean;
  mode: "add" | "edit";
  form: EventFormData;
  onChange: (form: EventFormData) => void;
  onSave: () => void;
  onClose: () => void;
  /** When provided, show the timeline line picker */
  timelineLines?: TimelineLineOption[];
  /** Event ID for edit mode (enables association pickers) */
  editId?: string | null;
  /** Show category/location/description fields (Events page uses these, Timeline may not) */
  showDetails?: boolean;
  /** What kind of entity is being edited. Seasons hide location/category/Moment. */
  entity?: "event" | "season";
}

export default function EventDialog({
  open,
  mode,
  form,
  onChange,
  onSave,
  onClose,
  timelineLines,
  editId,
  showDetails = true,
  entity = "event",
}: EventDialogProps) {
  const isSeason = entity === "season";
  const [durationMode, setDurationMode] = useState<"duration" | "endDate">("duration");

  // Sync computed end date when duration changes
  useEffect(() => {
    if (form.kind === "span" && durationMode === "duration" && form.duration && form.date) {
      const computed = computeEndDate(form.date, form.duration, form.durationUnit);
      if (computed && computed !== form.endDate) {
        onChange({ ...form, endDate: computed });
      }
    }
  }, [form.date, form.duration, form.durationUnit, durationMode, form.kind]);

  const update = useCallback(
    (patch: Partial<EventFormData>) => onChange({ ...form, ...patch }),
    [form, onChange],
  );

  const canSave = form.title && form.date && (
    form.kind === "moment" ||
    form.kind === "ongoing" ||
    (form.kind === "span" && form.endDate)
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {mode === "edit"
          ? (isSeason ? "Edit Season" : "Edit Event")
          : (isSeason ? "Add Season" : "Add Event")}
      </DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          // Keep each section at its natural height. DialogContent is also the
          // scroll container (overflow-y: auto + the Paper's max-height), so the
          // flex children's default flex-shrink:1 would squish tall sections
          // (e.g. the Feelings picker once it has several chips) below their
          // content. The chips then overflow and render on top of the fields
          // below. flex-shrink:0 makes DialogContent scroll instead of
          // collapsing the sections.
          "& > *": { flexShrink: 0 },
        }}
      >
        {/* Timeline picker (only when called from Timeline page) */}
        {timelineLines && (
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Timeline</InputLabel>
            <Select
              label="Timeline"
              value={form.timelineId}
              onChange={(e) => update({ timelineId: e.target.value })}
            >
              {timelineLines.map((l) => (
                <MenuItem key={l.id} value={l.id}>{l.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <TextField
          label="Title"
          value={form.title}
          onChange={(e) => update({ title: e.target.value })}
          fullWidth
          autoFocus
          sx={timelineLines ? undefined : { mt: 1 }}
        />

        {/* Date + optional time */}
        <Box sx={{ display: "flex", gap: 2 }}>
          <TextField
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => update({ date: e.target.value })}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          {!isSeason && (
            <TextField
              label="Time"
              type="time"
              value={form.time}
              onChange={(e) => update({ time: e.target.value })}
              sx={{ width: 160 }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )}
        </Box>

        {/* Kind toggle */}
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 600 }}>
            Type
          </Typography>
          <ToggleButtonGroup
            value={form.kind}
            exclusive
            onChange={(_e, val) => { if (val) update({ kind: val }); }}
            size="small"
            fullWidth
          >
            {!isSeason && <ToggleButton value="moment">Moment</ToggleButton>}
            <ToggleButton value="span">While</ToggleButton>
            <ToggleButton value="ongoing">Ongoing</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {form.kind === "span"
              ? "A while, with a beginning and an end — set an end date below."
              : form.kind === "ongoing"
              ? "Started on this date and still ongoing."
              : "A single point in time."}
          </Typography>
        </Box>

        {/* Span: duration or end date */}
        {form.kind === "span" && (
          <>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Button
                size="small"
                variant={durationMode === "duration" ? "contained" : "text"}
                onClick={() => setDurationMode("duration")}
                sx={{ textTransform: "none", minWidth: 0 }}
              >
                Duration
              </Button>
              <Typography variant="body2" color="text.secondary">or</Typography>
              <Button
                size="small"
                variant={durationMode === "endDate" ? "contained" : "text"}
                onClick={() => setDurationMode("endDate")}
                sx={{ textTransform: "none", minWidth: 0 }}
              >
                End Date
              </Button>
            </Box>

            {durationMode === "duration" ? (
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField
                  label="Duration"
                  type="number"
                  value={form.duration}
                  onChange={(e) => update({ duration: e.target.value })}
                  sx={{ width: 100 }}
                  slotProps={{ htmlInput: { min: 1 } }}
                />
                <FormControl sx={{ minWidth: 120 }}>
                  <InputLabel>Unit</InputLabel>
                  <Select
                    label="Unit"
                    value={form.durationUnit}
                    onChange={(e) => update({ durationUnit: e.target.value as DurationUnit })}
                  >
                    <MenuItem value="days">Days</MenuItem>
                    <MenuItem value="weeks">Weeks</MenuItem>
                    <MenuItem value="months">Months</MenuItem>
                    <MenuItem value="years">Years</MenuItem>
                  </Select>
                </FormControl>
                {form.endDate && (
                  <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
                    → {new Date(form.endDate + "T00:00:00").toLocaleDateString()}
                  </Typography>
                )}
              </Box>
            ) : (
              <TextField
                label="End Date"
                type="date"
                value={form.endDate}
                onChange={(e) => update({ endDate: e.target.value })}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          </>
        )}

        {/* Details section. Seasons skip category — category is event-specific. */}
        {showDetails && (
          <>
            {!isSeason && (
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  label="Category"
                  value={form.category}
                  onChange={(e) => update({ category: e.target.value })}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
            />
            <LocationsField
              value={form.locationPlaces}
              onChange={(places) => update({ locationPlaces: places })}
            />
          </>
        )}

        {/* Association pickers (only in edit mode for events — not seasons) */}
        {mode === "edit" && editId && !isSeason && (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1, mb: -1 }}>
              Associations
            </Typography>
            <FeelingsPicker fromId={editId} fromType="event" fromName={form.title} label="Feelings" />
            <BeliefsPicker fromId={editId} fromType="event" fromName={form.title} label="Beliefs" />
            <PeoplePicker fromId={editId} fromType="event" fromName={form.title} />
            <NotesPicker fromId={editId} fromType="event" fromName={form.title} />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave} disabled={!canSave}>
          {mode === "edit" ? "Save" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
