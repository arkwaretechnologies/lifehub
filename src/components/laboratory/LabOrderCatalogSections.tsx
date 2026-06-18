"use client";

import { useMemo, useState } from "react";
import SearchIcon from "@mui/icons-material/Search";
import {
  alpha,
  Box,
  Checkbox,
  FormControlLabel,
  InputBase,
  Typography,
  useTheme,
} from "@mui/material";
import { consultFormControlLabelSx } from "@/components/consultation/ConsultationSectionTitle";
import {
  getComponentTestIds,
  groupLabTestsByBloodChemTemplate,
  groupLabTestsByDescription,
  isPanelLabTestSelectedInUI,
  labCatalogTestMatchesSearch,
  labCategoryUsesBloodChemTemplateSubgroups,
  labCategoryUsesUaFecalSubgroups,
  testsForLabOrderSection,
  type LabCatalogSection,
  type LabTestCatalogItem,
} from "@/lib/labTests";

function money2(v: number): string {
  const n = Number(v);
  const out = Number.isFinite(n) ? n : 0;
  return out.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const labTestCheckboxLabelSx = {
  ...consultFormControlLabelSx,
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  ml: 0,
  mr: 0,
  gap: 0.5,
  width: "100%",
  "& .MuiFormControlLabel-label": {
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1.35,
    flex: 1,
    minWidth: 0,
  },
} as const;

const labTestMetaIndentSx = {
  display: "block",
  pl: 3.25,
  mt: 0.15,
} as const;

export type LabOrderCatalogSectionsProps = {
  sections: LabCatalogSection[];
  catalogTests: LabTestCatalogItem[];
  selectedTestIds: ReadonlySet<string>;
  onToggleTest: (testId: string) => void;
  priceByTestId: ReadonlyMap<string, number>;
  testsCoveredByPackages?: ReadonlySet<string>;
  requestedTestIds?: ReadonlySet<string>;
  /** Multi-column cards (consultation modal) vs single-column stack (reception triage). */
  layout?: "columns" | "stack";
  /** `amend` = full catalog editable (post-payment order change). */
  catalogMode?: "order" | "amend";
};

function sectionSubgroups(
  category: LabCatalogSection["category"],
  tests: LabTestCatalogItem[],
): { heading: string; tests: LabTestCatalogItem[] }[] {
  const orderable = testsForLabOrderSection(category, tests);
  if (labCategoryUsesBloodChemTemplateSubgroups(category)) {
    return groupLabTestsByBloodChemTemplate(orderable);
  }
  if (labCategoryUsesUaFecalSubgroups(category)) {
    return groupLabTestsByDescription(orderable);
  }
  return [{ heading: "", tests: orderable }];
}

export function LabOrderCatalogSections({
  sections,
  catalogTests,
  selectedTestIds,
  onToggleTest,
  priceByTestId,
  testsCoveredByPackages,
  requestedTestIds,
  layout = "columns",
  catalogMode = "order",
}: LabOrderCatalogSectionsProps) {
  const lockRequested = catalogMode === "order" ? requestedTestIds : undefined;
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const catalogSections = useMemo(
    () =>
      sections
        .map((s) => ({
          ...s,
          tests: testsForLabOrderSection(s.category, s.tests),
        }))
        .filter((s) => s.tests.length > 0),
    [sections],
  );

  const visibleSections = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return catalogSections;
    return catalogSections
      .map((s) => ({
        ...s,
        tests: s.tests.filter((t) => labCatalogTestMatchesSearch(q, t, s.category.name)),
      }))
      .filter((s) => s.tests.length > 0);
  }, [catalogSections, searchQuery]);

  const searchField = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 2,
        py: 1.15,
        mb: layout === "stack" ? 1.5 : 2,
        borderRadius: 999,
        border: "1px solid",
        borderColor: alpha(theme.palette.info.main, 0.4),
        bgcolor: "background.paper",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        "&:focus-within": {
          borderColor: "info.main",
          boxShadow: `0 0 0 3px ${alpha(theme.palette.info.main, 0.18)}`,
        },
      }}
    >
      <SearchIcon sx={{ color: "text.secondary", fontSize: 22, flexShrink: 0 }} />
      <InputBase
        fullWidth
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search tests…"
        inputProps={{
          "aria-label": "Search laboratory tests by name, code, or category",
        }}
        sx={{
          fontSize: "0.875rem",
          "& .MuiInputBase-input": { py: 0.5 },
          "& .MuiInputBase-input::placeholder": { opacity: 0.55 },
        }}
      />
    </Box>
  );

  if (catalogSections.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No lab tests found in the catalog.
      </Typography>
    );
  }

  if (visibleSections.length === 0) {
    return (
      <Box>
        {searchField}
        <Typography variant="body2" color="text.secondary">
          No tests match your search.
        </Typography>
      </Box>
    );
  }

  const sectionNodes = visibleSections.map((section) => (
    <Box
      key={String(section.category.id)}
      sx={{
        breakInside: "avoid",
        pageBreakInside: "avoid",
        mb: layout === "stack" ? 2 : 2.5,
        border: layout === "columns" ? "1px solid" : "none",
        borderColor: "divider",
        borderRadius: layout === "columns" ? 1 : 0,
        p: layout === "columns" ? 1.5 : 0,
        bgcolor: layout === "columns" ? "background.paper" : "transparent",
      }}
    >
      <Typography
        component="h3"
        variant={layout === "columns" ? "subtitle2" : "caption"}
        fontWeight={800}
        color={layout === "columns" ? "info.main" : "primary"}
        sx={{
          letterSpacing: layout === "columns" ? "0.06em" : undefined,
          textTransform: "uppercase",
          mb: layout === "columns" ? 1.25 : 0.5,
          display: "block",
        }}
      >
        {section.category.name}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {sectionSubgroups(section.category, section.tests)
          .filter(({ tests: subTests }) => subTests.length > 0)
          .map(({ heading, tests: subTests }) => (
          <Box key={`${String(section.category.id)}-${heading || "default"}`}>
            {heading ? (
              <Typography
                variant="caption"
                fontWeight={700}
                color="text.secondary"
                sx={{ display: "block", mb: 0.75, letterSpacing: "0.04em" }}
              >
                {heading}
              </Typography>
            ) : null}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
              {subTests.map((test) => {
                const panelComponentIds = getComponentTestIds(catalogTests, test.id);
                const isPanel = panelComponentIds.length > 0;
                const alreadyRequested =
                  lockRequested != null &&
                  (lockRequested.has(test.id) ||
                    (isPanel &&
                      panelComponentIds.length > 0 &&
                      panelComponentIds.every((cid) => lockRequested.has(cid))));
                const checked =
                  alreadyRequested ||
                  (isPanel
                    ? isPanelLabTestSelectedInUI(
                        test.id,
                        catalogTests,
                        selectedTestIds,
                        lockRequested,
                      )
                    : selectedTestIds.has(test.id));
                const coveredByPkg = testsCoveredByPackages?.has(test.id) ?? false;
                const metaLine =
                  !coveredByPkg &&
                  (test.specimen_type || test.unit || test.requires_fasting || test.reference_range)
                    ? [
                        test.specimen_type,
                        test.unit ? `Unit ${test.unit}` : null,
                        test.requires_fasting ? "Fasting required" : null,
                        test.reference_range ? `Ref ${test.reference_range}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : null;
                return (
                  <Box key={test.id}>
                    <FormControlLabel
                      sx={labTestCheckboxLabelSx}
                      control={
                        <Checkbox
                          size="small"
                          checked={checked}
                          disabled={alreadyRequested}
                          onChange={() => {
                            if (alreadyRequested) return;
                            onToggleTest(test.id);
                          }}
                        />
                      }
                      label={
                        <Box
                          component="span"
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1,
                            width: "100%",
                            minWidth: 0,
                          }}
                        >
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{
                              textTransform: layout === "columns" ? "uppercase" : "none",
                              minWidth: 0,
                            }}
                          >
                            {test.name}
                          </Typography>
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            {coveredByPkg ? "—" : money2(priceByTestId.get(test.id) ?? 0)}
                          </Typography>
                        </Box>
                      }
                    />
                    {coveredByPkg ? (
                      <Typography variant="caption" color="text.secondary" sx={labTestMetaIndentSx}>
                        Included in package (bundle price)
                      </Typography>
                    ) : null}
                    {alreadyRequested ? (
                      <Typography variant="caption" color="text.secondary" sx={labTestMetaIndentSx}>
                        Already ordered on this visit
                      </Typography>
                    ) : null}
                    {metaLine ? (
                      <Typography variant="caption" color="text.secondary" sx={labTestMetaIndentSx}>
                        {metaLine}
                      </Typography>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  ));

  if (layout === "stack") {
    return (
      <Box>
        {searchField}
        {sectionNodes}
      </Box>
    );
  }

  return (
    <Box>
      {searchField}
      <Box
        sx={{
          columnCount: { xs: 1, sm: 2, md: 3 },
          columnGap: 2.5,
        }}
      >
        {sectionNodes}
      </Box>
    </Box>
  );
}
