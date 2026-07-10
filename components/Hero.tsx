export function Hero() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8 px-5 pb-10 pt-10 sm:px-8 sm:pb-14 lg:grid-cols-[1.02fr_0.98fr] lg:items-end">
      <div>
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-muted">
          ProPhrase
        </p>
        <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
          Say it better at work.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
          Turn rough updates, emails, Jira comments, and replies into clear
          professional messages in one click.
        </p>
        <a
          href="#try-now"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-sm font-semibold text-white transition hover:bg-black"
        >
          Try ProPhrase
        </a>
      </div>
      <div className="rounded-lg border border-border bg-card p-5 shadow-[0_24px_80px_rgba(17,17,17,0.07)]">
        <p className="text-sm font-medium text-muted">Rough message</p>
        <p className="mt-3 text-lg leading-8 text-foreground">
          we checked this issue and no impact for our deployment, will discuss
          tomorrow
        </p>
        <div className="my-5 h-px bg-border" />
        <p className="text-sm font-medium text-muted">ProPhrase output</p>
        <p className="mt-3 text-lg leading-8 text-foreground">
          We reviewed the issue and confirmed that there is no impact on our
          deployment. We can discuss this further in tomorrow&apos;s meeting.
        </p>
      </div>
    </section>
  );
}
