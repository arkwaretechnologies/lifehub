"use client";

import { createContext, useContext } from "react";

/** Active consultation workspace tab index (matches `PRIMARY_TABS` order). */
export const ConsultationActiveTabContext = createContext<number>(0);

export function useConsultationActiveTab() {
  return useContext(ConsultationActiveTabContext);
}
