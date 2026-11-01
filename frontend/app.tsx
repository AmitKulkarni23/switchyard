import { createRoot } from "react-dom/client";
import { Container, CssBaseline, Typography } from "@mui/material";

function App() {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <CssBaseline />
      <Typography variant="h3" component="h1" gutterBottom>
        SwitchYard
      </Typography>
      <Typography variant="h6" color="text.secondary">
        Upload a bill from any cloud, see what it costs on Railway.
      </Typography>
      <Typography sx={{ mt: 4 }}>Coming soon.</Typography>
    </Container>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
