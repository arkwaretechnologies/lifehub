"use client";

import { useEffect, useRef, useState } from "react";
import { Autocomplete, Box, TextField, Typography, type TextFieldProps } from "@mui/material";
import {
  formatMedicationProductOptionDescription,
  formatProductOptionLabel,
  searchActiveProducts,
  type ProductCatalogRow,
} from "@/lib/pharmacyProducts";
import { fetchOnHandQtyByProductIds } from "@/lib/pharmacyPosDb";

const MIN_SEARCH_LEN = 2;
const SEARCH_DEBOUNCE_MS = 280;

function formatOnHandStock(qty: number | undefined): string {
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return "0";
  return Number.isInteger(qty) ? String(qty) : qty.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function mergeWithSelected(list: ProductCatalogRow[], selected: ProductCatalogRow | null): ProductCatalogRow[] {
  if (selected == null) return list;
  if (list.some((p) => p.id === selected.id)) return list;
  return [selected, ...list];
}

export default function MedicationProductAutocomplete({
  previewProducts,
  previewLoading,
  value,
  onChange,
  textFieldSx,
}: {
  previewProducts: ProductCatalogRow[];
  previewLoading: boolean;
  value: ProductCatalogRow | null;
  onChange: (product: ProductCatalogRow | null) => void;
  textFieldSx?: TextFieldProps["sx"];
}) {
  const [inputValue, setInputValue] = useState(() => (value ? formatProductOptionLabel(value) : ""));
  const [options, setOptions] = useState<ProductCatalogRow[]>(() => mergeWithSelected(previewProducts, value));
  const [searchLoading, setSearchLoading] = useState(false);
  const [stockQtyByProductId, setStockQtyByProductId] = useState<Record<string, number>>({});

  const valueRef = useRef(value);
  valueRef.current = value;

  const prevSyncedValueId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const id = value?.id ?? "";
    if (id === prevSyncedValueId.current) return;
    prevSyncedValueId.current = id;
    setInputValue(value ? formatProductOptionLabel(value) : "");
  }, [value]);

  useEffect(() => {
    const q = inputValue.trim();
    if (q.length >= MIN_SEARCH_LEN) return;
    setOptions(mergeWithSelected(previewProducts, valueRef.current));
  }, [previewProducts, inputValue]);

  useEffect(() => {
    const q = inputValue.trim();
    if (q.length < MIN_SEARCH_LEN) {
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      void searchActiveProducts(q, 80).then((r) => {
        if (cancelled) return;
        setSearchLoading(false);
        const sel = valueRef.current;
        if (r.error) {
          setOptions(mergeWithSelected([], sel));
          return;
        }
        setOptions(mergeWithSelected(r.products, sel));
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [inputValue]);

  useEffect(() => {
    const ids = options.map((p) => p.id).filter(Boolean);
    if (ids.length === 0) {
      setStockQtyByProductId({});
      return;
    }
    let cancelled = false;
    void fetchOnHandQtyByProductIds(ids).then((r) => {
      if (cancelled) return;
      if (!r.error) setStockQtyByProductId(r.qtyByProductId);
      else setStockQtyByProductId({});
    });
    return () => {
      cancelled = true;
    };
  }, [options]);

  return (
    <Autocomplete
      size="small"
      options={options}
      loading={previewLoading || searchLoading}
      filterOptions={(opts) => opts}
      getOptionLabel={(p) => formatProductOptionLabel(p)}
      value={value}
      inputValue={inputValue}
      onInputChange={(_, v, reason) => {
        if (reason === "reset") return;
        setInputValue(v);
      }}
      onChange={(_, p) => {
        onChange(p);
        setInputValue(p ? formatProductOptionLabel(p) : "");
      }}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderOption={(props, option) => {
        const { key, ...optionProps } = props;
        return (
          <Box
            component="li"
            key={key}
            {...optionProps}
            sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, py: 1 }}
          >
            <Typography
              variant="body2"
              component="div"
              sx={{ flex: 1, minWidth: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.45 }}
            >
              {formatMedicationProductOptionDescription(option)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontWeight: 600, pt: 0.25 }}>
              Stock: {formatOnHandStock(stockQtyByProductId[option.id])}
            </Typography>
          </Box>
        );
      }}
      slotProps={{
        paper: { sx: { maxWidth: "none" } },
        listbox: { sx: { maxHeight: 360 } },
      }}
      noOptionsText={
        inputValue.trim().length > 0 && inputValue.trim().length < MIN_SEARCH_LEN
          ? `Type ${MIN_SEARCH_LEN}+ letters to search the catalog`
          : undefined
      }
      renderInput={(params) => (
        <TextField {...params} placeholder="Search product…" fullWidth sx={textFieldSx} />
      )}
    />
  );
}
