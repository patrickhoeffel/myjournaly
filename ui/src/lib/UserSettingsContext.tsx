import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import { ThemeProvider } from "@mui/material/styles";
import { type PaletteMode } from "@mui/material";
import { buildTheme } from "./theme";
import { apiFetch } from "./api";

// Defaults per mode
const DEFAULTS = {
  feelings_pos_color_light: "#2e7d32",
  feelings_neg_color_light: "#6A1B9A",
  beliefs_pos_color_light: "#2e7d32",
  beliefs_neg_color_light: "#6A1B9A",
  feelings_pos_color_dark: "#66bb6a",
  feelings_neg_color_dark: "#ce93d8",
  beliefs_pos_color_dark: "#66bb6a",
  beliefs_neg_color_dark: "#ce93d8",
  bg_color_light: "#F5F5F5",
  bg_color_dark: "#121212",
} as const;

type ColorKey = keyof typeof DEFAULTS;

interface UserSettingsContextType {
  themeMode: PaletteMode;
  setThemeMode: (mode: PaletteMode) => void;
  feelingsPosColor: string;
  feelingsNegColor: string;
  setFeelingsPosColor: (color: string) => void;
  setFeelingsNegColor: (color: string) => void;
  beliefsPosColor: string;
  beliefsNegColor: string;
  setBeliefsPosColor: (color: string) => void;
  setBeliefsNegColor: (color: string) => void;
  bgColorLight: string;
  bgColorDark: string;
  setBgColorLight: (color: string) => void;
  setBgColorDark: (color: string) => void;
}

const UserSettingsContext = createContext<UserSettingsContextType>({
  themeMode: "light",
  setThemeMode: () => {},
  feelingsPosColor: DEFAULTS.feelings_pos_color_light,
  feelingsNegColor: DEFAULTS.feelings_neg_color_light,
  setFeelingsPosColor: () => {},
  setFeelingsNegColor: () => {},
  beliefsPosColor: DEFAULTS.beliefs_pos_color_light,
  beliefsNegColor: DEFAULTS.beliefs_neg_color_light,
  setBeliefsPosColor: () => {},
  setBeliefsNegColor: () => {},
  bgColorLight: DEFAULTS.bg_color_light,
  bgColorDark: DEFAULTS.bg_color_dark,
  setBgColorLight: () => {},
  setBgColorDark: () => {},
});

export function useUserSettings() {
  return useContext(UserSettingsContext);
}

const ALL_COLOR_KEYS: ColorKey[] = [
  "feelings_pos_color_light", "feelings_neg_color_light",
  "beliefs_pos_color_light", "beliefs_neg_color_light",
  "feelings_pos_color_dark", "feelings_neg_color_dark",
  "beliefs_pos_color_dark", "beliefs_neg_color_dark",
  "bg_color_light", "bg_color_dark",
];

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<PaletteMode>("light");

  // Store all color prefs (both modes) in a single record
  const [colors, setColors] = useState<Record<ColorKey, string>>({ ...DEFAULTS });
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    apiFetch("/users/me/data?category=preferences")
      .then((items: { key: string; value: string }[]) => {
        const updates: Partial<Record<ColorKey, string>> = {};
        for (const item of items) {
          if (item.key === "theme_mode") {
            setThemeModeState(item.value as PaletteMode);
          } else if (ALL_COLOR_KEYS.includes(item.key as ColorKey)) {
            updates[item.key as ColorKey] = item.value;
          }
        }
        if (Object.keys(updates).length > 0) {
          setColors((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch(() => {});
  }, []);

  const savePreference = useCallback((key: string, value: string) => {
    clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      try {
        await apiFetch(`/users/me/data/preferences/${key}`, {
          method: "PUT",
          body: JSON.stringify({ value }),
        });
      } catch {
        // silent
      }
    }, 500);
  }, []);

  const setThemeMode = useCallback((mode: PaletteMode) => {
    setThemeModeState(mode);
    savePreference("theme_mode", mode);
  }, [savePreference]);

  const setColor = useCallback((key: ColorKey, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
    savePreference(key, value);
  }, [savePreference]);

  // Derive current-mode colors
  const suffix = themeMode === "dark" ? "_dark" : "_light";
  const feelingsPosColor = colors[`feelings_pos_color${suffix}` as ColorKey];
  const feelingsNegColor = colors[`feelings_neg_color${suffix}` as ColorKey];
  const beliefsPosColor = colors[`beliefs_pos_color${suffix}` as ColorKey];
  const beliefsNegColor = colors[`beliefs_neg_color${suffix}` as ColorKey];

  const setFeelingsPosColor = useCallback((c: string) => setColor(`feelings_pos_color${suffix}` as ColorKey, c), [setColor, suffix]);
  const setFeelingsNegColor = useCallback((c: string) => setColor(`feelings_neg_color${suffix}` as ColorKey, c), [setColor, suffix]);
  const setBeliefsPosColor = useCallback((c: string) => setColor(`beliefs_pos_color${suffix}` as ColorKey, c), [setColor, suffix]);
  const setBeliefsNegColor = useCallback((c: string) => setColor(`beliefs_neg_color${suffix}` as ColorKey, c), [setColor, suffix]);

  const bgColorLight = colors.bg_color_light;
  const bgColorDark = colors.bg_color_dark;
  const setBgColorLight = useCallback((c: string) => setColor("bg_color_light", c), [setColor]);
  const setBgColorDark = useCallback((c: string) => setColor("bg_color_dark", c), [setColor]);

  const activeBgColor = themeMode === "dark" ? bgColorDark : bgColorLight;
  const theme = useMemo(() => buildTheme(themeMode, activeBgColor), [themeMode, activeBgColor]);

  return (
    <UserSettingsContext.Provider
      value={{
        themeMode,
        setThemeMode,
        feelingsPosColor,
        feelingsNegColor,
        setFeelingsPosColor,
        setFeelingsNegColor,
        beliefsPosColor,
        beliefsNegColor,
        setBeliefsPosColor,
        setBeliefsNegColor,
        bgColorLight,
        bgColorDark,
        setBgColorLight,
        setBgColorDark,
      }}
    >
      <ThemeProvider theme={theme}>
        {children}
      </ThemeProvider>
    </UserSettingsContext.Provider>
  );
}
