declare module "react-native-razorpay" {
  export type RazorpayCheckoutOptions = {
    key: string;
    amount: number | string;
    currency: string;
    name: string;
    description?: string;
    image?: string;
    subscription_id: string;
    prefill?: { name?: string; email?: string; contact?: string };
    theme?: { color?: string; hide_topbar?: boolean };
    modal?: { confirm_close?: boolean; handleback?: boolean };
    readonly?: { email?: boolean; name?: boolean; contact?: boolean };
    retry?: { enabled?: boolean; max_count?: number };
  };

  export type RazorpayPaymentSuccess = {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  };

  const RazorpayCheckout: {
    open(options: RazorpayCheckoutOptions): Promise<RazorpayPaymentSuccess>;
  };

  export default RazorpayCheckout;
}
