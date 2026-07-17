export type Mode = "rephrase" | "universal";

export type SelectionSnapshot = {
  text: string;
  replaceable: boolean;
};

export type CreditsResponse = {
  enabled: boolean;
  shadowMode?: boolean;
  balance?: {
    available: number;
    reserved: number;
    allowance: number;
    plan: "free" | "plus" | "pro";
    billingInterval: "none" | "monthly" | "annual";
    subscriptionStatus:
      | "free"
      | "pending"
      | "active"
      | "past_due"
      | "grace_period"
      | "canceled"
      | "expired"
      | "refunded"
      | "chargeback";
    maxInputCharacters: number;
    nextRefreshAt: string | null;
  };
};

export type UniversalClipboardItem = {
  id: string;
  sourceDeviceId: string;
  sourceDeviceLabel: string;
  preview: string;
  status: "available" | "claimed" | "expired";
  claimedByDeviceId: string | null;
  claimedByDeviceLabel: string | null;
  claimedAt: string | null;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
};

export type UniversalClipboardResponse = {
  item: UniversalClipboardItem | null;
  serverTime?: string;
};

export type UniversalClipboardClaimResponse = {
  item: UniversalClipboardItem;
  text: string;
};
