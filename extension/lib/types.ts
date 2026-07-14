export type Mode = "rephrase" | "outcome";

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
    plan: string;
  };
};

export type OutcomeVersion = {
  id: "safe" | "balanced" | "firm";
  label?: string;
  message: string;
  howItMayBeReceived?: string;
};

export type OutcomeResponse = {
  variants: OutcomeVersion[];
  credits?: unknown;
};
