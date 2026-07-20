# ProPhrase LinkedIn marketing

This folder contains the initial organic LinkedIn campaign and the small
diagnostics workflow used to decide which themes should be repeated or retired.

## Workflow

1. Publish a post with one creative and a tagged ProPhrase link.
2. After at least 72 hours, add the post metrics to `metrics.csv`.
3. Run `npm run marketing:diagnose:linkedin`.
4. Use the report to choose the next post angle.

The diagnostics contain aggregate marketing numbers only. Do not add names,
email addresses, message content, or other personal data to `metrics.csv`.

## Metric definitions

- `impressions`: LinkedIn post impressions.
- `reactions`, `comments`, `reposts`: LinkedIn engagement counts.
- `link_clicks`: clicks on the tagged ProPhrase link.
- `signups`: attributed ProPhrase registrations.
- `activated_users`: attributed users who completed at least three successful
  generations within seven days.
- `paid_users`: attributed subscriptions.
- `spend_inr`: promotion or paid-distribution spend, otherwise zero.

The first creative is stored at `creatives/scope-changed-friday-didnt.png`.

The premium value-led campaign and its matching captions are documented in
`premium-campaign.md`. Use those three images as the visual-quality baseline for
future generated creatives.
