"use client";

import { useState } from "react";
import {
  Grid,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
  Box,
  Tooltip,
} from "@mui/material";
import PhoneInTalkIcon from "@mui/icons-material/PhoneInTalk";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

type QueueStatus = "waiting" | "serving" | "done";

interface QueueItem {
  id: number;
  name: string;
  status: QueueStatus;
}

const initialQueues = {
  consultation: [
    { id: 1, name: "Juan Dela Cruz", status: "waiting" as QueueStatus },
    { id: 2, name: "Maria Santos", status: "waiting" as QueueStatus },
    { id: 3, name: "Carlos Mendoza", status: "serving" as QueueStatus },
  ],
  priority: [
    { id: 4, name: "Elderly - Rosa Lim", status: "waiting" as QueueStatus },
    { id: 5, name: "PWD - Mark Tan", status: "serving" as QueueStatus },
  ],
  laboratory: [
    { id: 6, name: "Ana Garcia", status: "waiting" as QueueStatus },
    { id: 7, name: "Pedro Reyes", status: "waiting" as QueueStatus },
  ],
};

const statusColor: Record<QueueStatus, "default" | "primary" | "success"> = {
  waiting: "default",
  serving: "primary",
  done: "success",
};

function QueueColumn({
  title,
  items,
  onAction,
}: {
  title: string;
  items: QueueItem[];
  onAction: (id: number, action: QueueStatus) => void;
}) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} mb={2}>
          {title}
        </Typography>
        <List disablePadding>
          {items.map((item) => (
            <ListItem
              key={item.id}
              sx={{
                bgcolor: "background.default",
                borderRadius: 2,
                mb: 1,
                pr: 1,
              }}
              secondaryAction={
                <Box>
                  {item.status === "waiting" && (
                    <Tooltip title="Call Next">
                      <IconButton
                        size="small"
                        color="info"
                        onClick={() => onAction(item.id, "serving")}
                      >
                        <PhoneInTalkIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {item.status === "waiting" && (
                    <Tooltip title="Mark Serving">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onAction(item.id, "serving")}
                      >
                        <PlayCircleOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {item.status === "serving" && (
                    <Tooltip title="Mark Done">
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => onAction(item.id, "done")}
                      >
                        <CheckCircleOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              }
            >
              <ListItemText
                primary={item.name}
                secondary={
                  <Chip
                    label={item.status}
                    size="small"
                    color={statusColor[item.status]}
                    sx={{ mt: 0.5 }}
                  />
                }
                secondaryTypographyProps={{ component: "div" }}
              />
            </ListItem>
          ))}
          {items.length === 0 && (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
              Queue empty
            </Typography>
          )}
        </List>
      </CardContent>
    </Card>
  );
}

export default function ReceptionPage() {
  const [queues, setQueues] = useState(initialQueues);

  const handleAction = (queueKey: keyof typeof queues) => (id: number, newStatus: QueueStatus) => {
    setQueues((prev) => ({
      ...prev,
      [queueKey]: prev[queueKey].map((item) =>
        item.id === id ? { ...item, status: newStatus } : item
      ),
    }));
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Reception Queue
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <QueueColumn
            title="Consultation Queue"
            items={queues.consultation}
            onAction={handleAction("consultation")}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <QueueColumn
            title="Priority Queue"
            items={queues.priority}
            onAction={handleAction("priority")}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <QueueColumn
            title="Laboratory Queue"
            items={queues.laboratory}
            onAction={handleAction("laboratory")}
          />
        </Grid>
      </Grid>
    </>
  );
}
