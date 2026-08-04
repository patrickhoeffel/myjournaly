import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#37474F", // Blue Grey 800
    },
    secondary: {
      main: "#7E57C2", // Deep Purple 400
    },
    background: {
      default: "#FAFAFA",
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 8,
  },
});

export default theme;
