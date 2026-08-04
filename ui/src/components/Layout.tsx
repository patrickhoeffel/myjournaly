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
  Home,
  Person,
  Book,
  Event,
  Timeline,
  Group,
  Place as PlaceIcon,
  LibraryBooks,
  Logout,
  Chat as ChatIcon,
} from "@mui/icons-material";
import { useAuth } from "../lib/AuthContext";
import ChatPanel from "./ChatPanel";

const DRAWER_WIDTH = 260;
const DRAWER_WIDTH_COLLAPSED = 64;

const navItems = [
  { label: "Home", path: "/", icon: <Home /> },
  { label: "Profile", path: "/profile", icon: <Person /> },
  { label: "Journal", path: "/journal", icon: <Book /> },
  { label: "Events", path: "/events", icon: <Event /> },
  { label: "People", path: "/people", icon: <Group /> },
  { label: "Places", path: "/places", icon: <PlaceIcon /> },
  { label: "Timeline", path: "/timeline", icon: <Timeline /> },
  { label: "Resources", path: "/resources", icon: <LibraryBooks /> },
];

export default function Layout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
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

  const drawerWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH;

  const drawer = (showCollapse: boolean) => (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Spacer to push nav below the fixed header bar */}
      <Toolbar />
      <Divider />
      <List>
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            selected={location.pathname === item.path}
            onClick={() => handleNav(item.path)}
            sx={{
              borderRadius: 2,
              mx: collapsed && showCollapse ? 0.5 : 1,
              mb: 0.5,
              justifyContent: collapsed && showCollapse ? "center" : "initial",
              px: collapsed && showCollapse ? 1.5 : 2,
            }}
            title={collapsed && showCollapse ? item.label : undefined}
          >
            <ListItemIcon
              sx={{
                minWidth: collapsed && showCollapse ? 0 : 40,
                justifyContent: "center",
              }}
            >
              {item.icon}
            </ListItemIcon>
            {!(collapsed && showCollapse) && <ListItemText primary={item.label} />}
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
          width: "100%",
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: "background.paper",
          color: "text.primary",
          boxShadow: 1,
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            onClick={() =>
              isMobile ? setMobileOpen(!mobileOpen) : setCollapsed(!collapsed)
            }
            sx={{ mr: 2 }}
            title={isMobile ? "Menu" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <MenuIcon />
          </IconButton>
          <Box>
            <Typography variant="h6" noWrap sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              My Journaly
            </Typography>
            <Typography variant="caption" noWrap sx={{ color: "text.secondary", lineHeight: 1, display: "block" }}>
              UI {uiVersion}{apiVersion ? ` / API ${apiVersion}` : ""}
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            onClick={() => setChatOpen(!chatOpen)}
            title="Chat"
            sx={{ mr: 1, color: chatOpen ? "primary.main" : "text.secondary" }}
          >
            <ChatIcon />
          </IconButton>
          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main" }}>
              {user?.displayName?.[0] || user?.email?.[0] || "?"}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            <MenuItem disabled>
              <Typography variant="body2">{user?.email}</Typography>
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                logout();
              }}
            >
              <ListItemIcon>
                <Logout fontSize="small" />
              </ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 }, transition: "width 0.2s" }}
      >
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{
              "& .MuiDrawer-paper": { boxSizing: "border-box", width: DRAWER_WIDTH },
            }}
          >
            {drawer(false)}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            sx={{
              "& .MuiDrawer-paper": {
                boxSizing: "border-box",
                width: drawerWidth,
                transition: "width 0.2s",
                overflowX: "hidden",
              },
            }}
            open
          >
            {drawer(true)}
          </Drawer>
        )}
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
          transition: "width 0.2s",
        }}
      >
        <Outlet />
      </Box>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </Box>
  );
}
