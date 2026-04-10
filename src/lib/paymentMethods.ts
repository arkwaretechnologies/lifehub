import { supabase } from "@/lib/supabaseClient";

export const PAYMENT_METHODS_TABLE = "payment_methods" as const;

export type PaymentMethodRow = {
  id: number;
  code: string;
  name: string;
  is_active: boolean | null;
  sort_order: number | null;
};

export async function fetchActivePaymentMethods(): Promise<{
  methods: PaymentMethodRow[];
  error: string | null;
}> {
  const res = await supabase
    .from(PAYMENT_METHODS_TABLE)
    .select("id, code, name, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (res.error) return { methods: [], error: res.error.message };
  const rows = (res.data ?? []) as PaymentMethodRow[];
  return { methods: rows, error: null };
}

