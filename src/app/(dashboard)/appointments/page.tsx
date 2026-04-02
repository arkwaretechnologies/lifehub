"use client";

import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from "@mui/material";

type AppointmentStatus = "Scheduled" | "Completed" | "Cancelled";

interface Appointment {
  id: number;
  name: string;
  time: string;
  status: AppointmentStatus;
}

const appointments: Appointment[] = [
  { id: 1, name: "Juan Dela Cruz", time: "09:00 AM", status: "Scheduled" },
  { id: 2, name: "Maria Santos", time: "09:30 AM", status: "Completed" },
  { id: 3, name: "Pedro Reyes", time: "10:00 AM", status: "Scheduled" },
  { id: 4, name: "Ana Garcia", time: "10:30 AM", status: "Cancelled" },
  { id: 5, name: "Carlos Mendoza", time: "11:00 AM", status: "Scheduled" },
  { id: 6, name: "Rosa Lim", time: "11:30 AM", status: "Completed" },
  { id: 7, name: "Mark Tan", time: "01:00 PM", status: "Scheduled" },
];

const statusColor: Record<AppointmentStatus, "info" | "success" | "error"> = {
  Scheduled: "info",
  Completed: "success",
  Cancelled: "error",
};

export default function AppointmentsPage() {
  return (
    <>
      <Typography variant="h5" sx={{ mb: 3 }}>
        Appointments
      </Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {appointments.map((appt) => (
                  <TableRow key={appt.id}>
                    <TableCell>{appt.name}</TableCell>
                    <TableCell>{appt.time}</TableCell>
                    <TableCell>
                      <Chip
                        label={appt.status}
                        color={statusColor[appt.status]}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </>
  );
}
