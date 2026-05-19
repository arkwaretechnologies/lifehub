"use client";

import { useMemo } from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  Typography,
} from "@mui/material";
import { consultFormControlLabelSx } from "@/components/consultation/ConsultationSectionTitle";
import {
  getComponentTestIds,
  groupLabTestsByBloodChemTemplate,
  groupLabTestsByDescription,
  isPanelLabTestSelectedInUI,
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
}: LabOrderCatalogSectionsProps) {
  const visibleSections = useMemo(
    () =>
      sections
        .map((s) => ({
          ...s,
          tests: testsForLabOrderSection(s.category, s.tests),
        }))
        .filter((s) => s.tests.length > 0),
    [sections],
  );

  if (visibleSections.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No lab tests found in the catalog.
      </Typography>
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
        {sectionSubgroups(section.category, section.tests).map(({ heading, tests: subTests }) => (
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
                  requestedTestIds != null &&
                  (requestedTestIds.has(test.id) ||
                    (isPanel &&
                      panelComponentIds.length > 0 &&
                      panelComponentIds.every((cid) => requestedTestIds.has(cid))));
                const checked =
                  alreadyRequested ||
                  (isPanel
                    ? isPanelLabTestSelectedInUI(
                        test.id,
                        catalogTests,
                        selectedTestIds,
                        requestedTestIds,
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
    return <Box>{sectionNodes}</Box>;
  }

  return (
    <Box
      sx={{
        columnCount: { xs: 1, sm: 2, md: 3 },
        columnGap: 2.5,
      }}
    >
      {sectionNodes}
    </Box>
  );
}
