import { createTheme } from "@mui/material/styles";

export const ink = "#111111";
export const red = "#C8102E";
export const rule = "#D9D6CF";
export const muted = "#4A4A4A"; // 8.9:1 on white
export const wash = "#F4F3F0"; // the verdict cell and expanded rows

export const font = "'Archivo Variable', system-ui, sans-serif";
/** Condensed Archivo for headers: rank comes from width and weight, not size. */
export const condensed = { fontFamily: font, fontStretch: "75%", fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.01em" };
export const label = { fontFamily: font, fontStretch: "75%", fontWeight: 700, fontSize: 12, textTransform: "uppercase" as const, letterSpacing: "0.06em" };
export const figures = { fontVariantNumeric: "tabular-nums lining-nums" };

export const theme = createTheme({
  palette: {
    primary: { main: red, contrastText: "#fff" },
    secondary: { main: ink },
    text: { primary: ink, secondary: muted },
    background: { default: "#fff", paper: "#fff" },
    divider: rule,
    error: { main: red },
  },
  shape: { borderRadius: 0 },
  typography: { fontFamily: font, fontSize: 15, button: { textTransform: "none", fontWeight: 700 } },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 0, paddingInline: 16 } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 0, textTransform: "none", fontWeight: 600, color: ink, borderColor: ink, paddingBlock: 4,
          "&.Mui-selected, &.Mui-selected:hover": { backgroundColor: ink, color: "#fff" },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${rule}`, paddingBlock: 10, ...figures },
        head: { ...label, color: ink, borderBottom: `2px solid ${ink}`, paddingBlock: 8 },
      },
    },
    MuiCheckbox: { styleOverrides: { root: { color: ink, "&.Mui-checked": { color: ink } } } },
    MuiLinearProgress: { styleOverrides: { root: { height: 4 } } },
  },
});
