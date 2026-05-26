"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import { useAuth } from "@/components/AuthProvider";
import {
  CHAT_ATTACHMENT_ACCEPT,
  isChatImageMime,
  normalizeChatAttachmentFile,
  resolveChatAttachmentFilename,
} from "@/lib/chatAttachmentShared";
import {
  CHAT_CONVERSATION_TYPE_BRANCH,
  formatTeamChannelDisplayName,
  GLOBAL_TEAM_BRANCH_CODE,
} from "@/lib/chatServer";
import {
  CHAT_POLL_MS,
  fetchChatAttachmentUrl,
  fetchChatConversations,
  fetchChatMessages,
  fetchChatUsers,
  markChatConversationRead,
  openDirectChatApi,
  sendChatMessageApi,
  subscribeChatMessages,
  type ChatConversationSummary,
  type ChatMessageWithSender,
  type ChatUserOption,
} from "@/lib/chatClient";
import { createChatIncomingSoundTracker } from "@/lib/chatIncomingSound";
import {
  playChatMessageSound,
  primeNotificationSound,
  resumeNotificationAudio,
} from "@/lib/notificationSound";

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function previewText(summary: ChatConversationSummary): string {
  const m = summary.lastMessage;
  if (!m) return "No messages yet";
  if (m.body?.trim()) return m.body.trim();
  if (m.attachmentFileName) return `📎 ${m.attachmentFileName}`;
  return "Attachment";
}

function readReceiptLabel(msg: ChatMessageWithSender): string | null {
  const r = msg.readReceipt;
  if (!r) return null;
  if (r.kind === "direct") {
    return r.status === "read" ? "Read" : "Sent";
  }
  if (r.readByCount > 0) {
    return `Read by ${r.readByCount}`;
  }
  return "Sent";
}

function senderLabel(msg: ChatMessageWithSender): string {
  const name = String(msg.sender_fullname ?? msg.sender_username ?? "").trim();
  return name || `User ${msg.sender_user_id}`;
}

function truncateFileName(name: string, max = 48): string {
  if (name.length <= max) return name;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const stem = ext ? name.slice(0, name.length - ext.length) : name;
  const keep = max - ext.length - 1;
  return `${stem.slice(0, Math.max(8, keep))}…${ext}`;
}

function ChatFileAttachmentCard({
  fileName,
  url,
  sent,
}: {
  fileName: string;
  url: string;
  sent: boolean;
}) {
  const isPdf = /\.pdf$/i.test(fileName) || false;

  return (
    <Box
      component="a"
      href={url}
      download={fileName}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1,
        mt: 0.5,
        p: 1,
        borderRadius: 1,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        boxShadow: sent ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
        textDecoration: "none",
        color: "text.primary",
        minWidth: 0,
        maxWidth: "100%",
        "&:hover": { bgcolor: "grey.50" },
      }}
    >
      {isPdf ? (
        <PictureAsPdfOutlinedIcon sx={{ fontSize: 26, color: "error.main", flexShrink: 0 }} />
      ) : (
        <InsertDriveFileOutlinedIcon sx={{ fontSize: 26, color: "primary.main", flexShrink: 0 }} />
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            display: "block",
            lineHeight: 1.35,
            wordBreak: "break-word",
          }}
          title={fileName}
        >
          {truncateFileName(fileName, 52)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
          Tap to download
        </Typography>
      </Box>
      <DownloadIcon sx={{ fontSize: 18, color: "text.secondary", flexShrink: 0, mt: 0.25 }} />
    </Box>
  );
}

function ChatAttachmentPreview({
  message,
  sent,
}: {
  message: ChatMessageWithSender;
  sent: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const mime = message.attachment_mime_type;
  const fileName = message.attachment_file_name ?? "Attachment";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchChatAttachmentUrl(message.id).then(({ url: signed, error }) => {
      if (cancelled) return;
      if (!error && signed) setUrl(signed);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [message.id]);

  if (loading) {
    return (
      <Box
        sx={{
          py: 0.75,
          px: 1,
          mt: 0.5,
          borderRadius: 1,
          bgcolor: sent ? "rgba(255,255,255,0.2)" : "action.selected",
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <CircularProgress size={14} sx={{ color: sent ? "primary.contrastText" : "primary.main" }} />
        <Typography variant="caption" sx={{ color: sent ? "primary.contrastText" : "text.secondary" }}>
          Loading attachment…
        </Typography>
      </Box>
    );
  }

  if (!url) {
    return (
      <Typography
        variant="caption"
        sx={{ color: sent ? "primary.contrastText" : "text.secondary", display: "block", mt: 0.5 }}
      >
        {truncateFileName(fileName)}
      </Typography>
    );
  }

  if (isChatImageMime(mime)) {
    return (
      <>
        <Box
          component="button"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setViewerOpen(true);
          }}
          aria-label={`View image ${fileName}`}
          sx={{
            display: "block",
            mt: 0.5,
            p: 0,
            border: 0,
            background: "none",
            cursor: "pointer",
            borderRadius: 1,
            overflow: "hidden",
            maxWidth: "100%",
          }}
        >
          <Box
            component="img"
            src={url}
            alt={fileName}
            sx={{
              maxWidth: "100%",
              maxHeight: 140,
              borderRadius: 1,
              display: "block",
              verticalAlign: "middle",
              bgcolor: "background.paper",
              border: sent ? "2px solid rgba(255,255,255,0.85)" : "1px solid",
              borderColor: sent ? "rgba(255,255,255,0.85)" : "divider",
            }}
          />
        </Box>
        <Dialog
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          maxWidth="md"
          fullWidth
          slotProps={{
            backdrop: { sx: { bgcolor: "rgba(0,0,0,0.85)" } },
          }}
        >
          <DialogContent
            sx={{
              position: "relative",
              p: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "grey.900",
              minHeight: 200,
            }}
          >
            <IconButton
              aria-label="Close preview"
              onClick={() => setViewerOpen(false)}
              sx={{ position: "absolute", right: 8, top: 8, color: "common.white" }}
            >
              <CloseIcon />
            </IconButton>
            <Box
              component="img"
              src={url}
              alt={fileName}
              sx={{
                maxWidth: "100%",
                maxHeight: "min(70vh, 640px)",
                objectFit: "contain",
                borderRadius: 1,
              }}
            />
          </DialogContent>
          <DialogActions sx={{ justifyContent: "flex-end", px: 2, py: 1 }}>
            <Button
              size="small"
              startIcon={<DownloadIcon />}
              href={url}
              download={fileName}
              component="a"
            >
              Download
            </Button>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  return <ChatFileAttachmentCard fileName={fileName} url={url} sent={sent} />;
}

export default function ChatDropdown() {
  const { profile } = useAuth();
  const userId =
    profile != null && typeof profile.user_id === "number" ? profile.user_id : null;
  const branchCode = String(profile?.branch_code ?? "").trim() || null;
  const teamLabel = formatTeamChannelDisplayName(branchCode ?? GLOBAL_TEAM_BRANCH_CODE);
  const chatEnabled = userId != null;

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chatUsers, setChatUsers] = useState<ChatUserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  const messagesRequestRef = useRef(0);
  const lastOpenedConversationRef = useRef<string | null>(null);
  const soundTrackerRef = useRef<ReturnType<typeof createChatIncomingSoundTracker> | null>(null);
  const conversationsRef = useRef<ChatConversationSummary[]>([]);
  const messagesRef = useRef<ChatMessageWithSender[]>([]);
  const open = Boolean(anchorEl);

  selectedIdRef.current = selectedId;
  conversationsRef.current = conversations;
  messagesRef.current = messages;

  const maybePlayIncomingSound = useCallback(
    (list: ChatConversationSummary[], msgs: ChatMessageWithSender[]) => {
      if (!soundTrackerRef.current) return;
      if (soundTrackerRef.current.ingest(list, msgs)) {
        void playChatMessageSound();
      }
    },
    [],
  );

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const loadConversations = useCallback(async (options?: { silent?: boolean }) => {
    if (!chatEnabled) return;
    if (!options?.silent) setLoadingConversations(true);
    const { conversations: list, totalUnread: unread, error } = await fetchChatConversations();
    if (!options?.silent) setLoadingConversations(false);
    if (error) {
      setErrorText(error);
      return;
    }
    setConversations(list);
    setTotalUnread(unread);
    maybePlayIncomingSound(list, messagesRef.current);
    setSelectedId((prev) => {
      if (prev && list.some((c) => c.id === prev)) return prev;
      const team = list.find((c) => c.type === CHAT_CONVERSATION_TYPE_BRANCH);
      return team?.id ?? list[0]?.id ?? null;
    });
  }, [chatEnabled, maybePlayIncomingSound]);

  const refreshMessages = useCallback(
    async (conversationId: string, options?: { showSpinner?: boolean }) => {
      const requestId = ++messagesRequestRef.current;
      if (options?.showSpinner) setLoadingMessages(true);

      const { messages: list, error } = await fetchChatMessages(conversationId);

      if (requestId !== messagesRequestRef.current) return;
      if (options?.showSpinner) setLoadingMessages(false);

      if (error) {
        setErrorText(error);
        return;
      }
      setMessages(list);
      maybePlayIncomingSound(conversationsRef.current, list);
    },
    [maybePlayIncomingSound],
  );

  useEffect(() => {
    if (userId == null) {
      soundTrackerRef.current = null;
      return;
    }
    soundTrackerRef.current = createChatIncomingSoundTracker(userId);
    primeNotificationSound();
  }, [userId]);

  useEffect(() => {
    if (!chatEnabled || userId == null) return;

    const tick = () => {
      void loadConversations({ silent: true });
      const id = selectedIdRef.current;
      if (id) void refreshMessages(id);
    };

    void loadConversations({ silent: true });

    const poll = setInterval(tick, CHAT_POLL_MS);
    const unsub = subscribeChatMessages(tick);

    return () => {
      clearInterval(poll);
      unsub();
    };
  }, [chatEnabled, userId, loadConversations, refreshMessages]);

  useEffect(() => {
    if (!open) {
      lastOpenedConversationRef.current = null;
      return;
    }
    if (!selectedId) return;
    if (lastOpenedConversationRef.current === selectedId) return;
    lastOpenedConversationRef.current = selectedId;

    let cancelled = false;
    void (async () => {
      setMessages([]);
      await refreshMessages(selectedId, { showSpinner: true });
      if (cancelled) return;
      await markChatConversationRead(selectedId);
      if (cancelled) return;
      void loadConversations({ silent: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, open, refreshMessages, loadConversations]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const handleOpenPicker = async () => {
    setPickerOpen(true);
    setLoadingUsers(true);
    const { users, error } = await fetchChatUsers();
    setLoadingUsers(false);
    if (error) setErrorText(error);
    setChatUsers(users);
  };

  const handleStartDirect = async (otherUserId: number) => {
    const { conversation, error } = await openDirectChatApi(otherUserId);
    if (error || !conversation) {
      setErrorText(error ?? "Failed to start conversation.");
      return;
    }
    setPickerOpen(false);
    await loadConversations();
    setSelectedId(conversation.id);
  };

  const handleSend = async () => {
    if (!selectedId || sending) return;
    const text = draft.trim();
    if (!text && !pendingFile) return;

    setSending(true);
    setErrorText(null);
    const { error } = await sendChatMessageApi({
      conversationId: selectedId,
      body: text || undefined,
      file: pendingFile,
    });
    setSending(false);

    if (error) {
      setErrorText(error);
      return;
    }

    setDraft("");
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await refreshMessages(selectedId, { showSpinner: false });
    void loadConversations({ silent: true });
  };

  if (!chatEnabled) {
    return null;
  }

  return (
    <>
      <IconButton
        sx={{ color: "text.secondary" }}
        aria-label="Team chat"
        onClick={(e) => {
          primeNotificationSound();
          void resumeNotificationAudio();
          setAnchorEl(e.currentTarget);
          setErrorText(null);
          void loadConversations();
        }}
      >
        <Badge
          badgeContent={totalUnread > 0 ? totalUnread : undefined}
          color="error"
          sx={{
            "& .MuiBadge-badge": {
              fontSize: 10,
              height: 18,
              minWidth: 18,
            },
          }}
        >
          <ChatBubbleOutlineIcon fontSize="small" />
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => {
          setAnchorEl(null);
          setPickerOpen(false);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              width: 420,
              maxWidth: "calc(100vw - 16px)",
              height: 520,
              maxHeight: "calc(100vh - 80px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Team chat
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {teamLabel}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Click the page once to enable message sounds.
          </Typography>
        </Box>

        {errorText && (
          <Typography variant="caption" color="error" sx={{ px: 2, py: 0.75, display: "block" }}>
            {errorText}
          </Typography>
        )}

        <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Conversation list */}
          <Box
            sx={{
              width: 140,
              flexShrink: 0,
              borderRight: 1,
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            {pickerOpen ? (
              <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                <ListItemButton dense onClick={() => setPickerOpen(false)} sx={{ py: 0.75 }}>
                  <ArrowBackIcon fontSize="small" sx={{ mr: 0.5 }} />
                  <Typography variant="caption">Back</Typography>
                </ListItemButton>
                {loadingUsers ? (
                  <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
                    <CircularProgress size={22} />
                  </Box>
                ) : chatUsers.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ p: 1.5 }}>
                    No other users to message.
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {chatUsers.map((u) => (
                      <ListItemButton
                        key={u.user_id}
                        dense
                        onClick={() => void handleStartDirect(u.user_id)}
                        sx={{ py: 0.75 }}
                      >
                        <ListItemText
                          primary={u.displayName}
                          primaryTypographyProps={{ variant: "caption", noWrap: true }}
                          secondary={u.role ?? undefined}
                          secondaryTypographyProps={{ variant: "caption", noWrap: true }}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Box>
            ) : (
              <>
                <List dense disablePadding sx={{ flex: 1, overflow: "auto" }}>
                  {loadingConversations && conversations.length === 0 ? (
                    <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
                      <CircularProgress size={22} />
                    </Box>
                  ) : (
                    conversations.map((c) => (
                      <ListItemButton
                        key={c.id}
                        selected={c.id === selectedId}
                        onClick={() => {
                          setSelectedId(c.id);
                          setErrorText(null);
                        }}
                        sx={{ py: 0.75, alignItems: "flex-start" }}
                      >
                        <ListItemText
                          primary={
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography variant="caption" fontWeight={600} noWrap sx={{ maxWidth: 90 }}>
                                {c.type === CHAT_CONVERSATION_TYPE_BRANCH ? "Team" : c.displayName}
                              </Typography>
                              {c.unreadCount > 0 && (
                                <Box
                                  sx={{
                                    bgcolor: "error.main",
                                    color: "error.contrastText",
                                    borderRadius: 10,
                                    px: 0.75,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    minWidth: 18,
                                    textAlign: "center",
                                  }}
                                >
                                  {c.unreadCount}
                                </Box>
                              )}
                            </Stack>
                          }
                          secondary={previewText(c)}
                          secondaryTypographyProps={{
                            variant: "caption",
                            noWrap: true,
                            color: "text.secondary",
                          }}
                        />
                      </ListItemButton>
                    ))
                  )}
                </List>
                <Divider />
                <Button
                  size="small"
                  fullWidth
                  sx={{ borderRadius: 0, py: 1, fontSize: 12 }}
                  onClick={() => void handleOpenPicker()}
                >
                  Direct message
                </Button>
              </>
            )}
          </Box>

          {/* Message thread */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
              <Typography variant="caption" fontWeight={700} noWrap>
                {selected?.displayName ?? "Select a conversation"}
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: "auto", px: 1.5, py: 1 }}>
              {!selectedId ? (
                <Typography variant="caption" color="text.secondary">
                  Choose a conversation.
                </Typography>
              ) : loadingMessages ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : messages.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  No messages yet. Say hello!
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {messages.map((m) => {
                    const mine = m.sender_user_id === userId;
                    const receipt = mine ? readReceiptLabel(m) : null;
                    const showSender =
                      selected?.type === CHAT_CONVERSATION_TYPE_BRANCH && !mine;

                    return (
                      <Box
                        key={m.id}
                        sx={{
                          alignSelf: mine ? "flex-end" : "flex-start",
                          maxWidth: "92%",
                          bgcolor: mine ? "primary.main" : "action.hover",
                          color: mine ? "primary.contrastText" : "text.primary",
                          px: 1.25,
                          py: 0.75,
                          borderRadius: 2,
                        }}
                      >
                        {showSender && (
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 700, display: "block", opacity: 0.85, mb: 0.25 }}
                          >
                            {senderLabel(m)}
                          </Typography>
                        )}
                        {m.body?.trim() && (
                          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
                            {m.body}
                          </Typography>
                        )}
                        {m.attachment_storage_path && (
                          <ChatAttachmentPreview message={m} sent={mine} />
                        )}
                        <Stack
                          direction="row"
                          spacing={0.75}
                          justifyContent="flex-end"
                          sx={{ mt: 0.25, opacity: 0.8 }}
                        >
                          <Typography variant="caption" sx={{ fontSize: 10 }}>
                            {formatMessageTime(m.created_at)}
                          </Typography>
                          {receipt && (
                            <Typography variant="caption" sx={{ fontSize: 10 }}>
                              · {receipt}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </Stack>
              )}
            </Box>

            <Box sx={{ px: 1, py: 1, borderTop: 1, borderColor: "divider" }}>
              {pendingFile && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }} noWrap>
                  Attached:{" "}
                  {resolveChatAttachmentFilename(pendingFile.name, pendingFile.type) || pendingFile.name}
                  <Button
                    size="small"
                    sx={{ ml: 0.5, minWidth: 0, p: 0, fontSize: 11 }}
                    onClick={() => {
                      setPendingFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    Remove
                  </Button>
                </Typography>
              )}
              <Stack direction="row" spacing={0.5} alignItems="flex-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={`image/*,${CHAT_ATTACHMENT_ACCEPT}`}
                  hidden
                  onChange={(e) => {
                    const raw = e.target.files?.[0];
                    setPendingFile(raw ? normalizeChatAttachmentFile(raw) : null);
                    setErrorText(null);
                  }}
                />
                <IconButton
                  size="small"
                  aria-label="Attach file"
                  disabled={!selectedId || sending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <AttachFileIcon fontSize="small" />
                </IconButton>
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  maxRows={3}
                  placeholder="Type a message…"
                  value={draft}
                  disabled={!selectedId || sending}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  sx={{ "& .MuiInputBase-root": { fontSize: 13 } }}
                />
                <IconButton
                  size="small"
                  color="primary"
                  aria-label="Send"
                  disabled={!selectedId || sending || (!draft.trim() && !pendingFile)}
                  onClick={() => void handleSend()}
                >
                  {sending ? <CircularProgress size={18} /> : <SendIcon fontSize="small" />}
                </IconButton>
              </Stack>
            </Box>
          </Box>
        </Box>
      </Popover>
    </>
  );
}
