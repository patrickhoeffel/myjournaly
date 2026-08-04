import { createTheme, type PaletteMode } from "@mui/material/styles";

export function buildTheme(mode: PaletteMode, bgColor?: string) {
  const defaultBg = mode === "light" ? "#F5F5F5" : "#121212";
  const bg = bgColor || defaultBg;
  return createTheme({
    palette: {
      mode,
      primary: {
        main: mode === "light" ? "#5C6BC0" : "#9FA8DA", // Indigo 400 / Indigo 200
      },
      secondary: {
        main: mode === "light" ? "#26A69A" : "#80CBC4", // Teal 400 / Teal 200
      },
      background: {
        default: bg,
        paper: mode === "light" ? "#fff" : "#1E1E1E",
      },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: {
        fontWeight: 600,
      },
      h5: {
        fontWeight: 600,
      },
      h6: {
        fontWeight: 600,
      },
    },
    shape: {
      borderRadius: 12,
    },
  });
}

const theme = buildTheme("light");
export default theme;
