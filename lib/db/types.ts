export type Plan = "free" | "plus" | "pro" | "pro_monthly" | "pro_yearly";
export type SubscriptionStatus =
  | "inactive"
  | "free"
  | "pending"
  | "active"
  | "cancelled"
  | "canceled"
  | "past_due"
  | "grace_period"
  | "expired"
  | "refunded"
  | "chargeback";
export type MessageRole = "user" | "assistant";
export type DevicePlatform = "web" | "desktop" | "android" | "ios" | "extension";
export type UniversalClipboardStatus = "available" | "claimed" | "expired";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  plan: Plan;
  subscription_status: SubscriptionStatus;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

export type Thread = {
  id: string;
  user_id: string;
  title: string;
  tone: string;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  thread_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  tone: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

export type UsageDaily = {
  id: string;
  user_id: string;
  usage_date: string;
  rewrite_count: number;
  thread_count: number;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  user_id: string;
  provider: "razorpay";
  plan: Exclude<Plan, "free">;
  status: string;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  raw_event: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type Device = {
  id: string;
  user_id: string;
  label: string;
  platform: DevicePlatform;
  capabilities: string[];
  last_seen_at: string;
  trusted_at: string;
  created_at: string;
  updated_at: string;
};

export type UniversalClipboardItem = {
  id: string;
  user_id: string;
  source_device_id: string;
  source_device_label: string;
  payload: string;
  preview: string;
  status: UniversalClipboardStatus;
  claimed_by_device_id: string | null;
  claimed_by_device_label: string | null;
  claimed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};
