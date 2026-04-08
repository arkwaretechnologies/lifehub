"use client";

import { useEffect, useRef, useState } from "react";
import { Autocomplete, TextField, type TextFieldProps } from "@mui/material";
import {
  formatProductOptionLabel,
  searchActiveProducts,
  type ProductCatalogRow,
} from "@/lib/pharmacyProducts";

const MIN_SEARCH_LEN = 2;
const SEARCH_DEBOUNCE_MS = 280;

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
      ListboxProps={{ sx: { maxHeight: 280 } }}
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
