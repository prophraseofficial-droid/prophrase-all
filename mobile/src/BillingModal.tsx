import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RazorpayCheckout from "react-native-razorpay";
import {
  createBillingCheckout,
  loadBillingPlans,
  verifyBillingPayment,
  type MobileBillingInterval,
  type MobileBillingPlan,
} from "./api";
import { colors, shadow, spacing } from "./theme";

type PaidPlanId = "plus" | "pro";

function formatPrice(paise: number | null) {
  if (paise === null) return "—";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function paymentErrorMessage(caught: unknown) {
  if (caught instanceof Error) return caught.message;
  if (!caught || typeof caught !== "object") return "Checkout could not be completed.";
  const record = caught as Record<string, unknown>;
  const description = typeof record.description === "string" ? record.description : "";
  if (/cancel|closed|dismiss/i.test(description)) return "Checkout was closed. No plan change was made.";
  return description || "Checkout could not be completed.";
}

export function BillingModal({
  visible,
  token,
  user,
  currentPlan,
  enabled,
  onClose,
  onCompleted,
}: {
  visible: boolean;
  token: string;
  user: { name: string; email: string };
  currentPlan: "free" | "plus" | "pro" | "pro_monthly" | "pro_yearly";
  enabled: boolean;
  onClose: () => void;
  onCompleted: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<MobileBillingPlan[]>([]);
  const [interval, setInterval] = useState<MobileBillingInterval>("monthly");
  const [busyPlan, setBusyPlan] = useState<PaidPlanId | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkoutEnabled, setCheckoutEnabled] = useState(false);
  const paidCurrentPlan = currentPlan !== "free";

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setError("");
    setLoading(true);
    void loadBillingPlans()
      .then((result) => {
        if (!active) return;
        setPlans(result.plans.filter((plan) => plan.id === "plus" || plan.id === "pro"));
        setCheckoutEnabled(result.checkoutEnabled);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load plans.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  async function startCheckout(plan: PaidPlanId) {
    if (busyPlan || paidCurrentPlan) return;
    if (!enabled) {
      setError("Native checkout is disabled for this distribution build.");
      return;
    }
    if (!checkoutEnabled) {
      setError("Paid checkout is not enabled on the ProPhrase server.");
      return;
    }

    setBusyPlan(plan);
    setError("");
    try {
      const checkout = await createBillingCheckout({
        token,
        plan,
        interval,
        idempotencyKey: Crypto.randomUUID(),
      });
      const payment = await RazorpayCheckout.open({
        key: checkout.razorpayKeyId,
        subscription_id: checkout.subscriptionId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "ProPhrase",
        description: `${plan === "plus" ? "Plus" : "Pro"} ${interval === "monthly" ? "Monthly" : "Annual"}`,
        image: "https://prophrase.in/prophrase-logo-transparent.png",
        prefill: {
          name: checkout.user?.name || user.name,
          email: checkout.user?.email || user.email,
        },
        readonly: { email: true },
        modal: { confirm_close: true, handleback: true },
        retry: { enabled: true, max_count: 4 },
        theme: { color: colors.accentDark },
      });
      if (
        !payment.razorpay_payment_id ||
        !payment.razorpay_subscription_id ||
        !payment.razorpay_signature
      ) {
        throw new Error("Razorpay returned an incomplete payment confirmation.");
      }
      const verified = await verifyBillingPayment({ token, payment });
      await onCompleted();
      onClose();
      setError("");
      if (verified.processing) {
        setTimeout(() => void onCompleted(), 2500);
      }
    } catch (caught) {
      setError(paymentErrorMessage(caught));
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={busyPlan ? undefined : onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.screen) }]}>
          <View style={styles.handle} />
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>PROPHRASE PLANS</Text>
              <Text style={styles.title}>{paidCurrentPlan ? "Your plan" : "Choose your plan"}</Text>
              <Text style={styles.subtitle}>
                {paidCurrentPlan
                  ? "Your paid plan is already active on this account."
                  : "Checkout opens securely inside the app. No second ProPhrase sign-in is required."}
              </Text>
            </View>
            <Pressable accessibilityLabel="Close plans" accessibilityRole="button" disabled={Boolean(busyPlan)} onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          {!paidCurrentPlan ? (
            <View style={styles.intervalRow}>
              {(["monthly", "annual"] as const).map((value) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: interval === value }}
                  disabled={Boolean(busyPlan)}
                  key={value}
                  onPress={() => setInterval(value)}
                  style={[styles.intervalButton, interval === value ? styles.intervalButtonActive : null]}
                >
                  <Text style={[styles.intervalText, interval === value ? styles.intervalTextActive : null]}>
                    {value === "monthly" ? "Monthly" : "Annual · Save more"}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {loading ? <ActivityIndicator color={colors.primary} size="large" style={styles.loader} /> : null}
          <ScrollView contentContainerStyle={styles.planList} showsVerticalScrollIndicator={false}>
            {paidCurrentPlan ? (
              <View style={styles.currentCard}>
                <Text style={styles.currentLabel}>CURRENT PLAN</Text>
                <Text style={styles.currentName}>{currentPlan.startsWith("pro") ? "Pro" : "Plus"}</Text>
                <Text style={styles.currentCopy}>Plan management is synced with your ProPhrase account.</Text>
              </View>
            ) : plans.map((plan) => {
              const paidPlan = plan.id as PaidPlanId;
              const price = interval === "monthly" ? plan.monthlyPricePaise : plan.annualPricePaise;
              const busy = busyPlan === paidPlan;
              return (
                <View key={plan.id} style={[styles.planCard, plan.id === "plus" ? styles.plusCard : null]}>
                  <View style={styles.planTopRow}>
                    <View style={styles.headingCopy}>
                      <Text style={styles.planName}>{plan.publicName}</Text>
                      <Text style={styles.planDescription}>{plan.description}</Text>
                    </View>
                    {plan.id === "plus" ? <Text style={styles.popular}>POPULAR</Text> : null}
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.price}>{formatPrice(price)}</Text>
                    <Text style={styles.pricePeriod}>{interval === "monthly" ? "/ month" : "/ year"}</Text>
                  </View>
                  <Text style={styles.credits}>{plan.monthlyCredits?.toLocaleString("en-IN")} credits refreshed monthly</Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(busyPlan)}
                    onPress={() => void startCheckout(paidPlan)}
                    style={({ pressed }) => [styles.payButton, pressed && !busyPlan ? styles.pressed : null, busyPlan ? styles.disabled : null]}
                  >
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.payButtonText}>Choose {plan.publicName}</Text>}
                  </Pressable>
                </View>
              );
            })}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {!paidCurrentPlan ? <Text style={styles.finePrint}>Live Razorpay checkout. Taxes may apply. Subscription renews automatically until cancelled.</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(17,17,17,0.48)", flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: "92%", paddingHorizontal: spacing.screen, paddingTop: 10 },
  handle: { alignSelf: "center", backgroundColor: colors.border, borderRadius: 999, height: 5, marginBottom: 18, width: 46 },
  headingRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.accentDark, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: colors.primary, fontSize: 29, fontWeight: "900", marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 7 },
  closeButton: { alignItems: "center", backgroundColor: colors.surfaceCard, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  closeText: { color: colors.primary, fontSize: 28, lineHeight: 30 },
  intervalRow: { backgroundColor: colors.surfaceLow, borderRadius: 18, flexDirection: "row", marginTop: 20, padding: 4 },
  intervalButton: { alignItems: "center", borderRadius: 14, flex: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 8 },
  intervalButtonActive: { backgroundColor: colors.primary },
  intervalText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  intervalTextActive: { color: "#FFFFFF" },
  loader: { marginVertical: 35 },
  planList: { gap: 14, paddingBottom: 10, paddingTop: 18 },
  planCard: { ...shadow, backgroundColor: colors.surfaceCard, borderColor: colors.border, borderRadius: 22, borderWidth: 1, padding: 18 },
  plusCard: { borderColor: colors.accent },
  planTopRow: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  planName: { color: colors.primary, fontSize: 24, fontWeight: "900" },
  planDescription: { color: colors.muted, fontSize: 13, marginTop: 4 },
  popular: { backgroundColor: colors.accent, borderRadius: 999, color: colors.primary, fontSize: 9, fontWeight: "900", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 6 },
  priceRow: { alignItems: "flex-end", flexDirection: "row", marginTop: 18 },
  price: { color: colors.primary, fontSize: 35, fontWeight: "900" },
  pricePeriod: { color: colors.muted, fontSize: 13, marginBottom: 6, marginLeft: 5 },
  credits: { color: colors.accentDark, fontSize: 13, fontWeight: "800", marginTop: 8 },
  payButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 16, justifyContent: "center", marginTop: 18, minHeight: 52 },
  payButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.6 },
  error: { backgroundColor: "#FFF0EE", borderRadius: 14, color: colors.danger, fontSize: 13, lineHeight: 19, padding: 14 },
  finePrint: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center" },
  currentCard: { backgroundColor: colors.surfaceCard, borderColor: colors.accent, borderRadius: 22, borderWidth: 1, padding: 22 },
  currentLabel: { color: colors.accentDark, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  currentName: { color: colors.primary, fontSize: 32, fontWeight: "900", marginTop: 7 },
  currentCopy: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 8 },
});
