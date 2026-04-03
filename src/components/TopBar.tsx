"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AppBar,
  Toolbar,
  IconButton,
  Box,
  Avatar,
  Badge,
  alpha,
  Menu,
  MenuItem,
  Typography,
  Divider,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  TextField,
  Alert,
  CircularProgress,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import CloseIcon from "@mui/icons-material/Close";
import { useAuth } from "@/components/AuthProvider";
import { DRAWER_WIDTH } from "@/components/Sidebar";

interface TopBarProps {
  onMenuToggle: () => void;
}

function ProfileField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.25 }}>
        {value || "—"}
      </Typography>
    </Box>
  );
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [fullProfile, setFullProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const fetchFullProfile = useCallback(async () => {
    const userId = profile?.user_id ?? user?.user_id;
    if (!userId) return;
    setProfileLoading(true);
    setProfileError("");
    try {
      const res = await fetch("/api/user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { profile?: any; error?: string }
        | null;
      if (!res.ok || !json || json.error) {
        setProfileError(json?.error || "Failed to load profile.");
        return;
      }
      if (json.profile) setFullProfile(json.profile);
    } finally {
      setProfileLoading(false);
    }
  }, [profile?.user_id, user?.user_id]);

  useEffect(() => {
    if (profileOpen) fetchFullProfile();
  }, [profileOpen, fetchFullProfile]);

  const handleLogout = () => {
    setAnchorEl(null);
    signOut();
    router.push("/login");
  };

  const openProfile = () => {
    setAnchorEl(null);
    setProfileError("");
    setPwError("");
    setPwSuccess("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setProfileOpen(true);
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (newPassword.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }

    setPwLoading(true);
    try {
      const { error } = await supabase.rpc("change_user_password", {
        p_user_id: profile?.user_id ?? user?.user_id,
        current_password: currentPassword,
        new_password: newPassword,
      });

      if (error) {
        setPwError(error.message);
      } else {
        setPwSuccess("Password changed successfully.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPwError("An unexpected error occurred.");
    } finally {
      setPwLoading(false);
    }
  };

  const initials = profile?.fullname
    ? profile.fullname
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "U";

  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Toolbar sx={{ px: { xs: 2, md: 3 } }}>
          <IconButton
            edge="start"
            onClick={onMenuToggle}
            sx={{ mr: 1, display: { md: "none" }, color: "text.primary" }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ flexGrow: 1 }} />

          {/* Right section */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <IconButton sx={{ color: "text.secondary" }}>
              <Badge
                badgeContent={3}
                color="error"
                sx={{
                  "& .MuiBadge-badge": {
                    fontSize: 10,
                    height: 18,
                    minWidth: 18,
                  },
                }}
              >
                <NotificationsNoneIcon />
              </Badge>
            </IconButton>

            <IconButton
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{ ml: 1, p: 0 }}
            >
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: "primary.main",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {initials}
              </Avatar>
            </IconButton>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    minWidth: 220,
                    borderRadius: 2,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
                  },
                },
              }}
            >
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {profile?.fullname || user?.username || "User"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {profile?.role || "Staff"}
                </Typography>
              </Box>
              <Divider />
              <MenuItem onClick={openProfile} sx={{ py: 1.5 }}>
                <ListItemIcon>
                  <PersonOutlineIcon fontSize="small" />
                </ListItemIcon>
                View Profile
              </MenuItem>
              <MenuItem onClick={handleLogout} sx={{ py: 1.5, color: "error.main" }}>
                <ListItemIcon sx={{ color: "error.main" }}>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Profile Dialog */}
      <Dialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Avatar sx={{ bgcolor: "primary.main", width: 44, height: 44, fontSize: 18, fontWeight: 700 }}>
              {initials}
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight={700} lineHeight={1.3}>
                {(fullProfile ?? profile)?.fullname || "User"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {(fullProfile ?? profile)?.role || "Staff"}
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={() => setProfileOpen(false)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <Divider />

        <DialogContent sx={{ pt: 3 }}>
          {profileLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {profileError ? (
                <Alert severity="warning" sx={{ mb: 2, borderRadius: 1.5 }}>
                  Could not load full profile: {profileError}
                </Alert>
              ) : null}
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
                Account Details
              </Typography>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ProfileField label="Username" value={(fullProfile ?? profile)?.username || user?.username} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ProfileField label="Full Name" value={(fullProfile ?? profile)?.fullname} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ProfileField label="Email" value={(fullProfile ?? profile)?.email_address} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ProfileField label="Phone" value={(fullProfile ?? profile)?.phone_no} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ProfileField label="Address" value={(fullProfile ?? profile)?.address} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ProfileField label="Branch" value={(fullProfile ?? profile)?.branch_code} />
            </Grid>
            {(fullProfile ?? profile)?.specialty && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <ProfileField label="Specialty" value={(fullProfile ?? profile).specialty} />
              </Grid>
            )}
            {(fullProfile ?? profile)?.license_no && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <ProfileField label="License No." value={(fullProfile ?? profile).license_no} />
              </Grid>
            )}
            {(fullProfile ?? profile)?.s2_no && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <ProfileField label="S2 No." value={(fullProfile ?? profile).s2_no} />
              </Grid>
            )}
            {(fullProfile ?? profile)?.ptr_no && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <ProfileField label="PTR No." value={(fullProfile ?? profile).ptr_no} />
              </Grid>
            )}
          </Grid>

          <Divider sx={{ mb: 3 }} />

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
            Change Password
          </Typography>

          {pwError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>
              {pwError}
            </Alert>
          )}
          {pwSuccess && (
            <Alert severity="success" sx={{ mb: 2, borderRadius: 1.5 }}>
              {pwSuccess}
            </Alert>
          )}

          <Box component="form" onSubmit={handlePasswordChange}>
            <TextField
              label="Current Password"
              type="password"
              fullWidth
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ mb: 2 }}
            />
            <TextField
              label="New Password"
              type="password"
              fullWidth
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ mb: 2 }}
            />
            <TextField
              label="Confirm New Password"
              type="password"
              fullWidth
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ mb: 2 }}
            />
            <DialogActions sx={{ px: 0, pt: 1 }}>
              <Button onClick={() => setProfileOpen(false)} color="inherit">
                Close
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={pwLoading}
                sx={{ minWidth: 140 }}
              >
                {pwLoading ? <CircularProgress size={20} color="inherit" /> : "Update Password"}
              </Button>
            </DialogActions>
          </Box>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
