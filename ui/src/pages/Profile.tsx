import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "../lib/AuthContext";
import { apiFetch } from "../lib/api";
import Beliefs from "./Beliefs";
import Feelings from "./Feelings";
import Losses from "./Losses";
import Tags from "./Tags";
import Settings from "./Settings";

interface ProfileData {
  firebase_uid: string;
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  gender: string | null;
  ethnicity: string | null;
  religious_affiliation: string | null;
  account_status: string;
}

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
  { value: "other", label: "Other" },
];

export default function Profile() {
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });
  const [myStory, setMyStory] = useState("");
  const storyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const saveStory = useCallback((value: string) => {
    clearTimeout(storyTimerRef.current);
    storyTimerRef.current = setTimeout(async () => {
      try {
        await apiFetch("/users/me/data/system_preference/my_story", {
          method: "PUT",
          body: JSON.stringify({ value }),
        });
      } catch { /* silent */ }
    }, 500);
  }, []);

  const handleStoryChange = (value: string) => {
    setMyStory(value);
    saveStory(value);
  };

  // Form state
  const [form, setForm] = useState({
    display_name: "",
    first_name: "",
    last_name: "",
    date_of_birth: "",
    place_of_birth: "",
    gender: "",
    ethnicity: "",
    religious_affiliation: "",
  });

  // Keep a ref so the save function always sees current form values
  const formRef = useRef(form);
  formRef.current = form;
  const isNewRef = useRef(isNew);
  isNewRef.current = isNew;

  useEffect(() => {
    loadProfile();
    // Load my_story setting
    apiFetch("/users/me/data?category=system_preference")
      .then((items: { key: string; value: string }[]) => {
        const story = items.find((i) => i.key === "my_story");
        if (story) setMyStory(story.value);
      })
      .catch(() => {});
  }, []);

  const loadProfile = async () => {
    try {
      const data = await apiFetch("/users/me");
      setProfile(data);
      setForm({
        display_name: data.display_name || "",
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        date_of_birth: data.date_of_birth || "",
        place_of_birth: data.place_of_birth || "",
        gender: data.gender || "",
        ethnicity: data.ethnicity || "",
        religious_affiliation: data.religious_affiliation || "",
      });
    } catch {
      setIsNew(true);
      setForm((prev) => ({
        ...prev,
        display_name: user?.displayName || "",
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    const current = formRef.current;
    if (!current.display_name) return;
    try {
      if (isNewRef.current) {
        const payload = {
          firebase_uid: user!.uid,
          email: user!.email || "",
          display_name: current.display_name,
          first_name: current.first_name || null,
          last_name: current.last_name || null,
          date_of_birth: current.date_of_birth || null,
          place_of_birth: current.place_of_birth || null,
          gender: current.gender || null,
          ethnicity: current.ethnicity || null,
          religious_affiliation: current.religious_affiliation || null,
        };
        const data = await apiFetch("/users/me", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setProfile(data);
        setIsNew(false);
      } else {
        const updates: Record<string, string | null> = {};
        for (const [key, value] of Object.entries(current)) {
          updates[key] = value || null;
        }
        const data = await apiFetch("/users/me", {
          method: "PUT",
          body: JSON.stringify(updates),
        });
        setProfile(data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setSnackbar({ open: true, message, severity: "error" });
    }
  };

  // For Select fields, save immediately on change
  const handleSelectChange = (field: string, value: string) => {
    handleChange(field, value);
    // Use setTimeout so the state update is applied before save reads formRef
    setTimeout(save, 0);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        My Profile
      </Typography>

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="About Me" />
        <Tab label="Beliefs" />
        <Tab label="Feelings" />
        <Tab label="Losses" />
        <Tab label="Tags" />
        <Tab label="Settings" />
      </Tabs>

      {/* About Me tab */}
      {tab === 0 && (
        <Box>
          {isNew && (
            <Alert severity="info" sx={{ mb: 3 }}>
              Welcome! Please fill out your profile to get started.
            </Alert>
          )}

          <Card>
            <CardContent sx={{ p: 3 }}>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Display Name"
                    fullWidth
                    required
                    value={form.display_name}
                    onChange={(e) => handleChange("display_name", e.target.value)}
                    onBlur={save}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Email"
                    fullWidth
                    disabled
                    value={user?.email || ""}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="First Name"
                    fullWidth
                    value={form.first_name}
                    onChange={(e) => handleChange("first_name", e.target.value)}
                    onBlur={save}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Last Name"
                    fullWidth
                    value={form.last_name}
                    onChange={(e) => handleChange("last_name", e.target.value)}
                    onBlur={save}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Date of Birth"
                    type="date"
                    fullWidth
                    slotProps={{ inputLabel: { shrink: true } }}
                    value={form.date_of_birth}
                    onChange={(e) => handleChange("date_of_birth", e.target.value)}
                    onBlur={save}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Place of Birth"
                    fullWidth
                    value={form.place_of_birth}
                    onChange={(e) => handleChange("place_of_birth", e.target.value)}
                    onBlur={save}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Gender</InputLabel>
                    <Select
                      label="Gender"
                      value={form.gender}
                      onChange={(e) => handleSelectChange("gender", e.target.value)}
                    >
                      <MenuItem value="">
                        <em>Not specified</em>
                      </MenuItem>
                      {GENDER_OPTIONS.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Ethnicity"
                    fullWidth
                    value={form.ethnicity}
                    onChange={(e) => handleChange("ethnicity", e.target.value)}
                    onBlur={save}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Religious Affiliation"
                    fullWidth
                    value={form.religious_affiliation}
                    onChange={(e) => handleChange("religious_affiliation", e.target.value)}
                    onBlur={save}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {profile && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Account status: {profile.account_status}
            </Typography>
          )}

          <Card sx={{ mt: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                About Me
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Tell your assistant about yourself. This helps it understand your background, values,
                and what matters to you so conversations feel personal and relevant. Write as much
                or as little as you like.
              </Typography>

              <TextField
                multiline
                minRows={6}
                maxRows={20}
                fullWidth
                placeholder={"For example:\n- My name is... and I'd like you to call me...\n- I value...\n- I'm working through...\n- What matters most to me is..."}
                value={myStory}
                onChange={(e) => handleStoryChange(e.target.value)}
              />
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Beliefs tab */}
      {tab === 1 && <Beliefs />}

      {/* Feelings tab */}
      {tab === 2 && <Feelings />}

      {/* Losses tab */}
      {tab === 3 && <Losses />}

      {/* Tags tab */}
      {tab === 4 && <Tags />}

      {/* Settings tab */}
      {tab === 5 && <Settings />}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
