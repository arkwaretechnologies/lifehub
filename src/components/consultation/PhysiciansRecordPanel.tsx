"use client";

import type { ReactNode } from "react";
import {
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

const tabPanelSx = { pt: 0, minHeight: 280 };

const headerBarSx = {
  bgcolor: "info.main",
  color: "info.contrastText",
  py: 1.25,
  px: 2,
  borderRadius: 1,
  mb: 2,
  textAlign: "center",
} as const;

function PeSectionTitle({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      variant="body2"
      fontWeight={700}
      color="info.main"
      sx={{ letterSpacing: "0.02em", display: "block", mb: 1, ...sx }}
    >
      {children}
    </Typography>
  );
}

const peColumnSx = {
  border: "1px solid",
  borderColor: "info.main",
  borderRadius: 1,
  p: { xs: 1.5, sm: 2 },
  bgcolor: "background.paper",
  height: "100%",
} as const;

const checkboxRowSx = {
  m: 0,
  alignItems: "center",
  gap: 0,
  columnGap: 0.25,
  "& .MuiCheckbox-root": { padding: "4px" },
  "& .MuiFormControlLabel-label": {
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "text.primary",
  },
} as const;

function CheckboxRow({ items }: { items: string[] }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: { xs: 1, sm: 1.5 },
        rowGap: 0.5,
        mb: 0.5,
      }}
    >
      {items.map((item) => (
        <FormControlLabel
          key={item}
          control={<Checkbox size="small" />}
          label={item}
          sx={checkboxRowSx}
        />
      ))}
    </Box>
  );
}

function PeBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <Box sx={{ mb: 2 }}>
      <PeSectionTitle>{title}</PeSectionTitle>
      <CheckboxRow items={items} />
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mt: 1, display: "block" }}>
        OTHERS
      </Typography>
      <Divider sx={{ borderColor: "info.light", my: 0.75 }} />
      <TextField variant="standard" fullWidth size="small" placeholder=" " hiddenLabel />
    </Box>
  );
}

const CNS_LINES = [
  { label: "I:", id: "cns-i" },
  { label: "II, III:", id: "cns-ii-iii" },
  { label: "III, IV VI:", id: "cns-iii-iv-vi" },
  { label: "V, VII:", id: "cns-v-vii" },
  { label: "VIII:", id: "cns-viii" },
  { label: "IX, X:", id: "cns-ix-x" },
  { label: "XI, XII:", id: "cns-xi-xii" },
];

export default function PhysiciansRecordPanel() {
  return (
    <Box sx={tabPanelSx}>
      <Box sx={headerBarSx}>
        <Typography variant="subtitle1" fontWeight={800} letterSpacing="0.1em">
          PHYSICIAN&apos;S RECORD
        </Typography>
      </Box>

      <Typography variant="body2" fontWeight={700} color="info.main" sx={{ mb: 1 }}>
        CHIEF COMPLAINT
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={4}
        placeholder=" "
        sx={{ mb: 3, "& .MuiOutlinedInput-root": { bgcolor: "background.paper" } }}
      />

      <Typography variant="body2" fontWeight={700} color="info.main" sx={{ mb: 1 }}>
        HISTORY OF PRESENT ILLNESS
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={6}
        placeholder=" "
        sx={{ mb: 3, "& .MuiOutlinedInput-root": { bgcolor: "background.paper" } }}
      />

      <Grid container spacing={2} alignItems="stretch">
        <Grid size={{ xs: 12, md: 8 }}>
          <Box sx={peColumnSx}>
            <Typography
              variant="subtitle2"
              fontWeight={800}
              color="info.main"
              sx={{ mb: 2, letterSpacing: "0.06em" }}
            >
              PHYSICAL EXAMINATION
            </Typography>

            <PeBlock title="GENERAL" items={["ALERT", "DISTRESS", "DROWSY", "COMA"]} />
            <PeBlock
              title="HEENT"
              items={["EYES", "LIDS/ CONJ NIL", "PERRLA", "TYM CANAL", "NASAL NL", "LIPS, TEETH, GUMS"]}
            />
            <PeBlock
              title="CHEST/LUNGS"
              items={["NL RESP EFFORT", "CBS", "NL PALPATION", "NL SYMMETRY & EXPANSION"]}
            />
            <PeBlock title="CVS" items={["RRR", "NO MURMUR/ GALLOP", "NL S1S2", "PULSES"]} />
            <PeBlock
              title="ABDOMEN/ GI"
              items={["NO TENDERNESS/MASS", "LIVER SPLEEN", "NO HERNIA", "+BS", "NO GUARDING"]}
            />
            <PeBlock
              title="GU"
              items={["MALE", "FEMALE", "NO CVA TENDERNESS", "SCROTAL CONTENT WNL", "PELVIC EXAM NL"]}
            />

            <Box sx={{ mb: 2 }}>
              <CheckboxRow
                items={[
                  "NL GAIT",
                  "NL STRENGTH",
                  "NL DIGITS/NAILS",
                  "NL CLUBBING NL TONE",
                ]}
              />
            </Box>

            <PeSectionTitle>EXTREMITIES / MSK</PeSectionTitle>
            <CheckboxRow items={["EDEMA", "ULCERS"]} />
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mt: 1, display: "block" }}>
              OTHERS
            </Typography>
            <Divider sx={{ borderColor: "info.light", my: 0.75 }} />
            <TextField variant="standard" fullWidth size="small" placeholder=" " hiddenLabel />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Box sx={peColumnSx}>
            <Typography
              variant="subtitle2"
              fontWeight={800}
              color="info.main"
              sx={{ mb: 2, letterSpacing: "0.06em" }}
            >
              NEUROLOGIC EXAMINATION
            </Typography>

            <PeSectionTitle>MMS</PeSectionTitle>
            <CheckboxRow
              items={[
                "ALERT",
                "ORIENTED",
                "JUDGMENT/INSIGHT",
                "MEMORY",
                "MOOD",
                "NO DELUSIONS",
              ]}
            />

            <PeSectionTitle sx={{ mt: 2 }}>CEREBRAL</PeSectionTitle>
            <TextField variant="standard" fullWidth size="small" placeholder=" " sx={{ mb: 2 }} hiddenLabel />

            <PeSectionTitle>CNS</PeSectionTitle>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
              {CNS_LINES.map((row) => (
                <Box
                  key={row.id}
                  sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}
                >
                  <Typography
                    component="label"
                    htmlFor={row.id}
                    variant="body2"
                    fontWeight={600}
                    sx={{ minWidth: 72, color: "text.primary" }}
                  >
                    {row.label}
                  </Typography>
                  <TextField id={row.id} variant="standard" size="small" fullWidth sx={{ flex: 1, minWidth: 120 }} />
                </Box>
              ))}
            </Box>

            <PeSectionTitle>CEREBELLAR</PeSectionTitle>
            <TextField variant="standard" fullWidth size="small" placeholder=" " sx={{ mb: 2 }} hiddenLabel />

            <PeSectionTitle>MOTOR STRENGTH</PeSectionTitle>
            <TextField variant="standard" fullWidth size="small" placeholder=" " sx={{ mb: 2 }} hiddenLabel />

            <PeSectionTitle>SENSORY/REFLEXES</PeSectionTitle>
            <TextField variant="standard" fullWidth size="small" placeholder=" " hiddenLabel />
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
