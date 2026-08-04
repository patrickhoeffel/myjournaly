import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { LightMode, DarkMode, Visibility, VisibilityOff } from "@mui/icons-material";
import { useUserSettings } from "../lib/UserSettingsContext";
import { apiFetch } from "../lib/api";

const LIGHT_BG_COLORS = [
  "#F5F5F5", "#FAFAFA", "#FFF8E1", "#F3E5F5", "#E8EAF6",
  "#E0F2F1", "#FBE9E7", "#F1F8E9", "#FCE4EC", "#E3F2FD",
];

const DARK_BG_COLORS = [
  "#121212", "#1A1A2E", "#0D1B2A", "#1B1B1B", "#1E1E2E",
  "#102027", "#1A0A2E", "#0A1929", "#1C1C1C", "#212121",
];

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (ChatGPT)" },
  { value: "google", label: "Google (Gemini)" },
  { value: "xai", label: "xAI (Grok)" },
];

const MODELS: Record<string, { value: string; label: string }[]> = {
  anthropic: [
    { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "o3", label: "o3" },
    { value: "o3-mini", label: "o3-mini" },
  ],
  google: [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  xai: [
    { value: "grok-3", label: "Grok 3" },
    { value: "grok-2", label: "Grok 2" },
  ],
};

const SETTING_KEYS = ["chatbot_name", "model_provider", "model_api_key", "model_id"] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

export default function Settings() {
  const { themeMode, setThemeMode, bgColorLight, bgColorDark, setBgColorLight, setBgColorDark } = useUserSettings();
  const [showApiKey, setShowApiKey] = useState(false);
  const [settings, setSettings] = useState<Record<SettingKey, string>>({
    chatbot_name: "",
    model_provider: "",
    model_api_key: "",
    model_id: "",
  });
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load settings on mount
  useEffect(() => {
    apiFetch("/users/me/data?category=system_preference")
      .then((items: { key: string; value: string }[]) => {
        const updates: Partial<Record<SettingKey, string>> = {};
        for (const item of items) {
          if (SETTING_KEYS.includes(item.key as SettingKey)) {
            updates[item.key as SettingKey] = item.value;
          }
        }
        if (Object.keys(updates).length > 0) {
          setSettings((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch(() => {});
  }, []);

  const saveSetting = useCallback((key: SettingKey, value: string) => {
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      try {
        await apiFetch(`/users/me/data/system_preference/${key}`, {
          method: "PUT",
          body: JSON.stringify({ value }),
        });
      } catch {
        // silent
      }
    }, 500);
  }, []);

  const updateSetting = (key: SettingKey, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    saveSetting(key, value);
  };

  const handleProviderChange = (provider: string) => {
    setSettings((prev) => ({ ...prev, model_provider: provider, model_id: "" }));
    saveSetting("model_provider", provider);
    saveSetting("model_id", "");
  };

  const availableModels = MODELS[settings.model_provider] || [];

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography variant="h5">Settings</Typography>

      {/* Appearance */}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Appearance
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose how My Journaly looks to you.
          </Typography>

          <ToggleButtonGroup
            value={themeMode}
            exclusive
            onChange={(_e, val) => { if (val) setThemeMode(val); }}
            size="small"
          >
            <ToggleButton value="light" sx={{ textTransform: "none", px: 3, gap: 1 }}>
              <LightMode fontSize="small" />
              Light
            </ToggleButton>
            <ToggleButton value="dark" sx={{ textTransform: "none", px: 3, gap: 1 }}>
              <DarkMode fontSize="small" />
              Dark
            </ToggleButton>
          </ToggleButtonGroup>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 3, mb: 1 }}>
            Light Mode Background
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {LIGHT_BG_COLORS.map((color) => (
              <Box
                key={color}
                onClick={() => setBgColorLight(color)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  bgcolor: color,
                  cursor: "pointer",
                  border: bgColorLight === color ? "2px solid" : "1px solid",
                  borderColor: bgColorLight === color ? "primary.main" : "divider",
                  transition: "border-color 0.15s",
                  "&:hover": { borderColor: "primary.main" },
                }}
              />
            ))}
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
            Dark Mode Background
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {DARK_BG_COLORS.map((color) => (
              <Box
                key={color}
                onClick={() => setBgColorDark(color)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  bgcolor: color,
                  cursor: "pointer",
                  border: bgColorDark === color ? "2px solid" : "1px solid",
                  borderColor: bgColorDark === color ? "primary.main" : "rgba(255,255,255,0.2)",
                  transition: "border-color 0.15s",
                  "&:hover": { borderColor: "primary.main" },
                }}
              />
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Chat Assistant */}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Chat Assistant
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Give your assistant a name it will use when talking to you.
          </Typography>

          <TextField
            label="Assistant Name"
            placeholder="e.g. Grace, Journaly, Coach"
            fullWidth
            size="small"
            value={settings.chatbot_name}
            onChange={(e) => updateSetting("chatbot_name", e.target.value)}
          />
        </CardContent>
      </Card>

      {/* AI Model */}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            AI Model
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose which AI provider and model powers your assistant. You can bring your own API key.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Provider</InputLabel>
              <Select
                label="Provider"
                value={settings.model_provider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {PROVIDERS.map((p) => (
                  <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="API Key"
              fullWidth
              size="small"
              type={showApiKey ? "text" : "password"}
              value={settings.model_api_key}
              onChange={(e) => updateSetting("model_api_key", e.target.value)}
              placeholder="sk-..."
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowApiKey((v) => !v)}
                        edge="end"
                      >
                        {showApiKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <FormControl fullWidth size="small" disabled={!settings.model_provider}>
              <InputLabel>Model</InputLabel>
              <Select
                label="Model"
                value={settings.model_id}
                onChange={(e) => updateSetting("model_id", e.target.value)}
              >
                {availableModels.map((m) => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
