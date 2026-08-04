import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CssBaseline } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { AuthProvider } from "./lib/AuthContext";
import { UserSettingsProvider } from "./lib/UserSettingsContext";
import RequireAuth from "./components/RequireAuth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Journal from "./pages/Journal";
import Events from "./pages/Events";
import Timeline from "./pages/Timeline";
import People from "./pages/People";
import Places from "./pages/Places";
import Resources from "./pages/Resources";

function App() {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <AuthProvider>
        <UserSettingsProvider>
          <CssBaseline />
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
                <Route path="/" element={<Home />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/events" element={<Events />} />
                <Route path="/people" element={<People />} />
                <Route path="/places" element={<Places />} />
                <Route path="/timeline" element={<Timeline />} />
                <Route path="/resources" element={<Resources />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </UserSettingsProvider>
      </AuthProvider>
    </LocalizationProvider>
  );
}

export default App;
