import { Box, Typography } from "@mui/material";
import {
  FeelingsPicker,
  BeliefsPicker,
  LossesPicker,
  TagsPicker,
  PeoplePicker,
  PlacesPicker,
  EventsPicker,
  NotesPicker,
} from "./LinkPickers";

interface AssociationsPanelProps {
  entityId: string | null;
  entityType: string;
  entityName: string;
  /** Optional override of the panel heading. Pass empty string to hide. */
  heading?: string;
  /** Optional message shown when entityId is null. */
  emptyMessage?: string;
  /** A key that, when changed, forces the pickers to re-fetch their links. */
  refreshKey?: number | string;
  /** Show the People picker. Off by default on the People page (you can't link a person to themselves usefully). */
  showPeoplePicker?: boolean;
  /** Show the Locations picker inside this panel. Off for the PhotoLightbox, which renders Locations as its own dedicated section. */
  showLocationsPicker?: boolean;
  /** Force a single-column stacked layout regardless of viewport (used inside narrow side panels). */
  compact?: boolean;
}

/**
 * The unified Associations panel — used by Journal entries, Events, Places, and People.
 *
 * Layout:
 *  - Row 1 (responsive 1/2/4 cols): Feelings | Beliefs | Losses | Tags
 *  - Row 2 (responsive 1/2/3/4 cols): People | Locations | Events | Notes
 */
export default function AssociationsPanel({
  entityId,
  entityType,
  entityName,
  heading = "Associations",
  emptyMessage = "Save first to add associations.",
  refreshKey,
  showPeoplePicker = true,
  showLocationsPicker = true,
  compact = false,
}: AssociationsPanelProps) {
  const labeledTiles = [
    { label: "Feelings", component: <FeelingsPicker fromId={entityId} fromType={entityType} fromName={entityName} /> },
    { label: "Beliefs", component: <BeliefsPicker fromId={entityId} fromType={entityType} fromName={entityName} /> },
    { label: "Losses", component: <LossesPicker fromId={entityId} fromType={entityType} fromName={entityName} /> },
    { label: "Tags", component: <TagsPicker fromId={entityId} fromType={entityType} fromName={entityName} /> },
  ];

  return (
    <Box sx={{ p: 2 }}>
      {heading && (
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          {heading}
        </Typography>
      )}
      {!entityId ? (
        <Typography variant="body2" color="text.secondary">
          {emptyMessage}
        </Typography>
      ) : (
        <Box key={refreshKey} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {/* Row 1: labeled tiles (Feelings, Beliefs, Losses, Tags) */}
          <Box sx={{ display: "grid", gridTemplateColumns: compact ? "1fr" : { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" }, gap: 1.5 }}>
            {labeledTiles.map(({ label, component }) => (
              <Box
                key={label}
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
                {component}
              </Box>
            ))}
          </Box>

          {/* Row 2: People, [Locations,] Events, Notes */}
          <Box sx={{ display: "grid", gridTemplateColumns: compact ? "1fr" : { xs: "1fr", sm: "1fr 1fr", md: ((showPeoplePicker ? 1 : 0) + (showLocationsPicker ? 1 : 0) + 2) === 4 ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr" }, gap: 1.5 }}>
            {showPeoplePicker && (
              <PeoplePicker fromId={entityId} fromType={entityType} fromName={entityName} />
            )}
            {showLocationsPicker && (
              <PlacesPicker fromId={entityId} fromType={entityType} fromName={entityName} />
            )}
            <EventsPicker fromId={entityId} fromType={entityType} fromName={entityName} />
            <NotesPicker fromId={entityId} fromType={entityType} fromName={entityName} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
