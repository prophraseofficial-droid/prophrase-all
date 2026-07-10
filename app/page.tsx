import Image from "next/image";
import { PublicHeader } from "@/components/PublicHeader";
import { getCurrentUser } from "@/lib/supabase/server";

const toneOptions = [
  { icon: "business_center", label: "Professional" },
  { icon: "sentiment_satisfied", label: "Human" },
  { icon: "bolt", label: "Short & Crisp" },
  { icon: "mail", label: "Email Focus" },
  { icon: "checklist", label: "Jira Style" },
];

const steps = [
  {
    icon: "content_paste",
    title: "1. Paste",
    copy: "Drop your brain-dump, quick notes, or messy draft into the box. No need to format or clean it up first.",
  },
  {
    icon: "tune",
    title: "2. Choose",
    copy: "Select your desired tone. Whether it's a Slack reply or a formal project update, we've got you covered.",
  },
  {
    icon: "done_all",
    title: "3. Copy",
    copy: "Get a perfectly phrased version instantly. Copy with one click and get back to what matters most.",
  },
];

const transformations = [
  {
    before: "I cant do that meeting today i have to finish this report first sry.",
    label: "After (Professional)",
    after:
      "I won't be able to attend today's meeting as I'm currently prioritizing a report that needs completion. Apologies for the late notice.",
  },
  {
    before: "Tell them the api is broke again and we dont know why yet.",
    label: "After (Jira Comment)",
    after:
      "We are currently experiencing an unexpected API outage. The team is investigating the root cause, and I will provide an update as soon as possible.",
  },
  {
    before: "Thanks for the info really cool see u later.",
    label: "After (Human)",
    after:
      "Thanks for sharing that info, I appreciate it! Looking forward to catching up with you later.",
  },
];

const iconPaths: Record<string, React.ReactNode> = {
  edit_note: (
    <>
      <path d="M4 6h10" />
      <path d="M4 10h7" />
      <path d="M4 14h5" />
      <path d="m14 18 5-5 2 2-5 5-3 .8Z" />
    </>
  ),
  auto_awesome: (
    <>
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z" />
      <path d="m5 13 .8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8Z" />
    </>
  ),
  spark: (
    <>
      <path d="m12 2 2.2 6.1L20 10l-5.8 1.9L12 18l-2.2-6.1L4 10l5.8-1.9Z" />
      <path d="m19 17 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />
    </>
  ),
  content_copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </>
  ),
  content_paste: (
    <>
      <path d="M9 4h6a2 2 0 0 1 2 2v1H7V6a2 2 0 0 1 2-2Z" />
      <path d="M8 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </>
  ),
  tune: (
    <>
      <path d="M4 6h9" />
      <path d="M17 6h3" />
      <circle cx="15" cy="6" r="2" />
      <path d="M4 12h4" />
      <path d="M12 12h8" />
      <circle cx="10" cy="12" r="2" />
      <path d="M4 18h11" />
      <path d="M19 18h1" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  done_all: (
    <>
      <path d="m2 13 4 4L16 7" />
      <path d="m10 17 2 2L22 9" />
    </>
  ),
  business_center: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </>
  ),
  sentiment_satisfied: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 10h.01" />
      <path d="M16 10h.01" />
      <path d="M8 15c1.2 1 2.5 1.5 4 1.5s2.8-.5 4-1.5" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  checklist: (
    <>
      <path d="m4 7 2 2 3-4" />
      <path d="M11 7h9" />
      <path d="m4 15 2 2 3-4" />
      <path d="M11 15h9" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
};

function Icon({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`inline-flex h-[1em] w-[1em] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {iconPaths[children]}
    </svg>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  const isAuthenticated = Boolean(user);
  const appHref = isAuthenticated ? "/workspace" : "/login";
  const userName =
    typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user?.user_metadata?.name === "string"
        ? user.user_metadata.name
        : user?.email?.split("@")[0] || "";

  return (
    <main className="overflow-x-hidden">
      <PublicHeader
        active="product"
        ctaLabel={isAuthenticated ? "Workspace" : "Try free"}
        isAuthenticated={isAuthenticated}
        userEmail={user?.email ?? ""}
        userName={userName}
      />

      <div id="top" className="pt-32">
        <section className="mx-auto mb-16 max-w-container px-5 text-center md:px-10">
          <h1 className="mx-auto mb-6 max-w-[340px] text-balance text-[40px] font-bold leading-[44px] tracking-[-0.02em] text-text-primary sm:max-w-5xl sm:text-[44px] sm:leading-[48px] sm:tracking-[-0.03em] md:text-[72px] md:leading-[76px] md:tracking-[-0.04em]">
            Say it better at work.
          </h1>
          <p className="mx-auto mb-10 max-w-[330px] text-lg leading-7 text-text-muted sm:max-w-2xl">
            Turn rough updates, emails, Jira comments, and replies into clear
            professional messages in one click.
          </p>
          <div className="mb-8 flex flex-col items-center justify-center gap-4 md:flex-row">
            <a
              href={appHref}
              className="rounded-full bg-primary px-10 py-4 text-sm font-bold text-on-primary transition-transform hover:scale-105"
            >
              {isAuthenticated ? "Open Workspace" : "Try ProPhrase"}
            </a>
            <a
              href="#examples"
              className="rounded-full border border-border-subtle bg-white/50 px-10 py-4 text-sm font-semibold text-primary backdrop-blur-sm transition-colors hover:bg-surface-container"
            >
              See example
            </a>
          </div>
          <p className="mx-auto max-w-[330px] text-xs font-semibold uppercase leading-4 tracking-[0.18em] text-text-muted sm:max-w-none">
            No long prompts. No complicated editor. Just paste, polish, copy.
          </p>
        </section>

        <section
          id="try"
          className="mx-auto mb-16 max-w-[390px] px-5 sm:max-w-container md:px-10"
        >
          <div className="glass-card animate-floating relative flex flex-col gap-8 rounded-[32px] p-5 shadow-[0_32px_90px_rgba(17,17,17,0.12)] md:p-8 lg:flex-row">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="mb-2 flex items-center gap-2 text-text-muted">
                <Icon className="text-xl">edit_note</Icon>
                <span className="text-sm font-medium">Rough message</span>
              </div>
              <div className="h-40 overflow-hidden rounded-2xl border border-border-subtle/50 bg-surface-container-low p-6 text-base leading-6 text-text-muted">
                we checked this issue and no impact for our deployment, will
                discuss tomorrow
              </div>
            </div>

            <div className="flex min-w-0 flex-col items-center justify-center gap-6 px-0 lg:px-4">
              <div className="flex max-w-[240px] flex-wrap justify-center gap-2">
                {["Professional", "Human", "Short & Crisp", "Email", "Jira Comment"].map(
                  (tone, index) => (
                    <button
                      key={tone}
                      className={
                        index === 0
                          ? "rounded-full bg-primary px-4 py-2 text-xs font-semibold leading-4 text-on-primary"
                          : "rounded-full border border-border-subtle bg-white px-4 py-2 text-xs font-semibold leading-4 text-primary transition-colors hover:bg-surface-container"
                      }
                      type="button"
                    >
                      {tone}
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-bold text-on-primary shadow-lg shadow-primary/20"
              >
                Rewrite Message
                <Icon>auto_awesome</Icon>
              </button>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                  <Icon className="text-xl text-ai-purple">spark</Icon>
                  <span className="text-sm font-medium">ProPhrase output</span>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold leading-4 text-text-muted transition-colors hover:text-primary"
                >
                  <Icon className="text-base">content_copy</Icon>
                  Copy
                </button>
              </div>
              <div className="h-40 overflow-hidden rounded-2xl border border-[#d1fadf] bg-success-tint p-6 text-base leading-relaxed text-text-primary">
                We reviewed the issue and confirmed that there is no impact on
                our deployment. We can discuss this further in tomorrow&apos;s
                meeting.
              </div>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="mx-auto max-w-container px-5 py-16 md:px-10"
        >
          <div className="mb-16 text-center">
            <h2 className="text-[32px] font-semibold leading-[38px] tracking-[-0.02em] text-text-primary md:text-[40px] md:leading-[48px]">
              Focus on your work, not the wording.
            </h2>
          </div>
          <div className="grid gap-12 md:grid-cols-3">
            {steps.map((step) => (
              <div className="space-y-4" key={step.title}>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-subtle bg-white shadow-sm">
                  <Icon className="text-primary">{step.icon}</Icon>
                </div>
                <h3 className="text-2xl font-semibold leading-8 tracking-[-0.01em] text-text-primary">
                  {step.title}
                </h3>
                <p className="leading-relaxed text-text-muted">{step.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface-container-low py-16">
          <div className="mx-auto max-w-container px-5 md:px-10">
            <div className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
              <div>
                <h2 className="mb-2 text-[32px] font-semibold leading-[38px] tracking-[-0.02em] text-text-primary md:text-[40px] md:leading-[48px]">
                  A tone for every context.
                </h2>
                <p className="text-text-muted">
                  Communicate exactly how you intend, every single time.
                </p>
              </div>
              <span className="rounded-full bg-ai-purple/10 px-4 py-2 text-xs font-semibold leading-4 text-ai-purple">
                Powered by Fine-tuned Models
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {toneOptions.map((tone) => (
                <div
                  className="rounded-3xl border border-border-subtle bg-white p-6 text-center transition-all hover:shadow-lg"
                  key={tone.label}
                >
                  <Icon className="mb-4 text-[32px] text-primary">
                    {tone.icon}
                  </Icon>
                  <div className="text-sm font-medium text-primary">
                    {tone.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="examples"
          className="mx-auto max-w-container px-5 py-16 md:px-10"
        >
          <h2 className="mb-12 text-center text-[32px] font-semibold leading-[38px] tracking-[-0.02em] text-text-primary md:text-[40px] md:leading-[48px]">
            Real-world transformations.
          </h2>
          <div className="space-y-8">
            {transformations.map((item) => (
              <div
                className="grid overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle shadow-sm md:grid-cols-2 md:gap-px"
                key={item.before}
              >
                <div className="bg-white p-8">
                  <div className="mb-4 text-xs font-semibold uppercase leading-4 text-text-muted">
                    Before
                  </div>
                  <p className="italic text-text-muted">&quot;{item.before}&quot;</p>
                </div>
                <div className="bg-surface-container p-8">
                  <div className="mb-4 text-xs font-semibold uppercase leading-4 text-primary">
                    {item.label}
                  </div>
                  <p className="font-medium text-text-primary">
                    &quot;{item.after}&quot;
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-md px-5 py-8">
          <div className="glass-card rounded-3xl border border-border-subtle p-8 text-center">
            <Icon className="mb-4 text-[32px] text-ai-purple">lock</Icon>
            <h4 className="mb-2 text-sm font-medium text-primary">
              Privacy first by design
            </h4>
            <p className="text-xs leading-relaxed text-text-muted">
              Your messages are processed locally in your browser. We never
              store your text on our servers or use it to train public models.
              Purely ephemeral.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-container px-5 py-16 md:px-10">
          <div className="cta-gradient overflow-hidden rounded-[48px] p-8 text-center text-white md:p-16">
            <h2 className="mb-6 text-[32px] font-semibold leading-[38px] tracking-[-0.02em] md:text-[40px] md:leading-[48px]">
              Write less awkwardly.
              <br />
              Communicate more clearly.
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-lg leading-7 text-white/70">
              Join thousands of professionals who use ProPhrase to save time and
              look better at work.
            </p>
            <a
              href={appHref}
              className="inline-flex rounded-full bg-white px-12 py-5 text-sm font-bold text-primary transition-transform hover:scale-105"
            >
              {isAuthenticated ? "Open Workspace" : "Get Started for Free"}
            </a>
          </div>
        </section>
      </div>

      <footer className="border-t border-border-subtle bg-surface py-8">
        <div className="mx-auto flex max-w-container flex-col items-center justify-between gap-8 px-5 md:flex-row md:px-10">
          <div className="flex items-center gap-3 text-2xl font-bold tracking-[-0.01em] text-primary">
            <Image
              src="/prophrase-logo.png"
              alt=""
              width={36}
              height={40}
              className="h-10 w-9 rounded-md object-cover"
            />
            <span>ProPhrase</span>
          </div>
          <div className="flex gap-8 text-xs font-semibold leading-4 text-text-muted">
            <a className="transition-colors hover:text-primary" href="/legal">
              Terms
            </a>
            <a className="transition-colors hover:text-primary" href="/legal">
              Privacy
            </a>
            <a className="transition-colors hover:text-primary" href="/pricing">
              Pricing
            </a>
            <a className="transition-colors hover:text-primary" href={appHref}>
              Contact
            </a>
            <a className="transition-colors hover:text-primary" href="#">
              Twitter
            </a>
          </div>
          <div className="text-xs font-semibold leading-4 text-text-muted">
            &copy; 2024 ProPhrase. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}
