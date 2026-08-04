import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import theme from "./lib/theme";
import { AuthProvider } from "./lib/AuthContext";
import RequireAuth from "./components/RequireAuth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Agents from "./pages/Agents";
import Playbooks from "./pages/Playbooks";
import Guardrails from "./pages/Guardrails";
import Resources from "./pages/Resources";
import ResourceGroups from "./pages/ResourceGroups";
import ResourceAccess from "./pages/ResourceAccess";
import Surveys from "./pages/Surveys";
import Timelines from "./pages/Timelines";
import Feelings from "./pages/Feelings";
import Beliefs from "./pages/Beliefs";
import Losses from "./pages/Losses";
import Services from "./pages/Services";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/users" element={<Users />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/playbooks" element={<Playbooks />} />
              <Route path="/guardrails" element={<Guardrails />} />
              <Route path="/resources" element={<Resources />} />
              <Route path="/resource-groups" element={<ResourceGroups />} />
              <Route path="/resource-access" element={<ResourceAccess />} />
              <Route path="/surveys" element={<Surveys />} />
              <Route path="/timelines" element={<Timelines />} />
              <Route path="/feelings" element={<Feelings />} />
              <Route path="/beliefs" element={<Beliefs />} />
              <Route path="/losses" element={<Losses />} />
              <Route path="/services" element={<Services />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
