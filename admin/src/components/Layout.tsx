import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Dashboard,
  People,
  SmartToy,
  MenuBook,
  Shield,
  LibraryBooks,
  FolderSpecial,
  VpnKey,
  Quiz,
  Timeline,
  Favorite,
  Logout,
  Dns,
  Psychology,
  HeartBroken,
} from "@mui/icons-material";
import { useAuth } from "../lib/AuthContext";

const DRAWER_WIDTH = 240;

const navItems = [
  { label: "Dashboard", path: "/", icon: <Dashboard /> },
  { label: "Users", path: "/users", icon: <People /> },
  { label: "Agents", path: "/agents", icon: <SmartToy /> },
  { label: "Playbooks", path: "/playbooks", icon: <MenuBook /> },
  { label: "Guardrails", path: "/guardrails", icon: <Shield /> },
  { label: "Resources", path: "/resources", icon: <LibraryBooks /> },
  { label: "Groups", path: "/resource-groups", icon: <FolderSpecial /> },
  { label: "Access", path: "/resource-access", icon: <VpnKey /> },
  { label: "Surveys", path: "/surveys", icon: <Quiz /> },
  { label: "Timelines", path: "/timelines", icon: <Timeline /> },
  { label: "Feelings", path: "/feelings", icon: <Favorite /> },
  { label: "Beliefs", path: "/beliefs", icon: <Psychology /> },
  { label: "Losses", path: "/losses", icon: <HeartBroken /> },
  { label: "Services", path: "/services", icon: <Dns /> },
];

export default function Layout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const uiVersion = __APP_VERSION__;
  const [apiVersion, setApiVersion] = useState("");
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8080";
    fetch(`${apiBase}/health`).then((r) => r.json()).then((d) => setApiVersion(d.version || "")).catch(() => {});
  }, []);

  const handleNav = (path: string) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const drawer = (
    <Box>
      <Toolbar>
        <Box>
          <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
            Journaly Admin
          </Typography>
          <Typography variant="caption" noWrap sx={{ color: "text.secondary", lineHeight: 1 }}>
            UI {uiVersion}{apiVersion ? ` / API ${apiVersion}` : ""}
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List>
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            selected={location.pathname === item.path}
            onClick={() => handleNav(item.path)}
            sx={{ borderRadius: 1, mx: 1, mb: 0.5 }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            Admin Console
          </Typography>
          <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)}>
            <Avatar sx={{ width: 32, height: 32 }}>
              {user?.email?.[0]?.toUpperCase() || "A"}
            </Avatar>
          </IconButton>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
            <MenuItem disabled>
              <Typography variant="body2">{user?.email}</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setAnchorEl(null); logout(); }}>
              <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ "& .MuiDrawer-paper": { width: DRAWER_WIDTH } }}
          >
            {drawer}
          </Drawer>
        ) : (
          <Drawer variant="permanent" sx={{ "& .MuiDrawer-paper": { width: DRAWER_WIDTH } }} open>
            {drawer}
          </Drawer>
        )}
      </Box>

      <Box component="main" sx={{ flexGrow: 1, p: 3, width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, mt: 8 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
