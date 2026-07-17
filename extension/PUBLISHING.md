# Publishing ProPhrase for Chrome and Firefox

This is the release runbook for the public ProPhrase browser extensions. Run
all commands from the repository root unless a step says otherwise.

## 1. Prerequisites

- Deploy the matching `prophrase.in` web/API release first.
- Confirm `https://prophrase.in/legal#privacy` is public and describes the
  extension permissions, selected text, extension tokens, AI processing, and
  Universal Copy.
- Create a Chrome Web Store developer account and enable two-step verification
  on its Google account.
- Create a Firefox Add-ons (AMO) account.
- Keep the Firefox extension ID in `wxt.config.ts` stable. Changing
  `extension@prophrase.in` creates a different Firefox extension identity.
- Never add a Chrome manifest `key` or a private signing key to this repository.

## 2. Prepare and verify a release

1. For every update after the first submission, increase `version` in
   `extension/package.json`. Use a version higher than every version already
   uploaded to either store. Keep `extension/package-lock.json` in sync.
2. Confirm `.env.example` still points to the production app:

   ```dotenv
   VITE_PROPHRASE_APP_URL=https://prophrase.in
   ```

3. Install the locked dependencies and create both store packages:

   ```bash
   npm --prefix extension ci
   npm run extension:release
   ```

4. Inspect the generated manifests and confirm that production packages contain
   `https://prophrase.in/*` but not `localhost`:

   ```bash
   cat extension/.output/chrome-mv3/manifest.json
   cat extension/.output/firefox-mv2/manifest.json
   ```

5. Test the unpacked builds before uploading:

   - Chrome: open `chrome://extensions`, enable **Developer mode**, choose
     **Load unpacked**, and select `extension/.output/chrome-mv3`.
   - Firefox: open `about:debugging#/runtime/this-firefox`, choose
     **Load Temporary Add-on**, and select
     `extension/.output/firefox-mv2/manifest.json`.
   - In each browser, connect an account, rephrase selected and typed text,
     replace editable text, exercise the context menu, share and claim a
     Universal Copy item, sign out, and reconnect.
   - Test Free, Plus, and Pro accounts. The popup must show/enforce 1,200,
     2,500, and 5,000 input characters respectively, and the displayed credits
     must match the web workspace.

6. Upload these artifacts; do not zip the output directories manually:

   - Chrome: `extension/.output/prophrase-ai-browser-extension-<version>-chrome.zip`
   - Firefox add-on: `extension/.output/prophrase-ai-browser-extension-<version>-firefox.zip`
   - Firefox source: `extension/.output/prophrase-ai-browser-extension-<version>-sources.zip`

## 3. Configure the production sign-in callback

The extension uses `browser.identity.getRedirectURL("connected")`. The server
accepts only exact origins from `EXTENSION_REDIRECT_ORIGINS`; wildcards are
intentionally rejected.

1. Install the exact build that will be submitted, or the store-signed build.
2. Open the extension's background/service-worker developer console and run:

   ```js
   chrome.identity.getRedirectURL("connected")
   ```

   In Firefox, run:

   ```js
   browser.identity.getRedirectURL("connected")
   ```

3. Copy only each URL's origin, without `/connected`. The result resembles:

   ```text
   https://<chrome-extension-id>.chromiumapp.org
   https://<firefox-extension-host>.extensions.allizom.org
   ```

4. Set the Vercel production environment variable to both exact origins:

   ```text
   EXTENSION_REDIRECT_ORIGINS=https://<chrome-extension-id>.chromiumapp.org,https://<firefox-extension-host>.extensions.allizom.org
   ```

5. Redeploy `prophrase.in`, then test **Connect ProPhrase** in both store builds.
   A locally unpacked Chrome build can have a different ID from the Web Store
   build, so do not use its temporary origin as the only production value.

For a first Chrome release, upload and save the item as a draft first so Chrome
assigns its permanent item ID. Configure the resulting callback origin before
submitting the draft for review.

## 4. Chrome Web Store submission

1. Sign in to the Chrome Web Store Developer Dashboard and pay the one-time
   developer registration fee if the account is new.
2. Choose **New item** and upload the Chrome ZIP from `.output`.
3. Complete the Store Listing:

   - Name: `ProPhrase AI`
   - Summary: `Rephrase selected text and copy content across your ProPhrase devices.`
   - Category: choose the closest writing/productivity category available.
   - Website/support URL: `https://prophrase.in`
   - Privacy policy: `https://prophrase.in/legal#privacy`
   - Upload the requested icon, screenshots, and promotional assets. Show the
     popup, selection assistant, rewrite result, and Universal Copy; never use
     real private messages in screenshots.

4. Complete **Privacy practices** accurately:

   - The extension handles authentication information through its revocable
     ProPhrase token.
   - It handles user-provided/selected website content and personal
     communications only to perform the requested rewrite or Universal Copy.
   - Data is sent to `prophrase.in`; requested writing content is processed by
     the AI provider disclosed in the privacy policy.
   - It does not sell data, use it for advertising, or collect browsing history.

5. Justify each permission in plain language:

   - `activeTab` / `scripting`: read selected text and replace the result after
     a user action.
   - `contextMenus`: provide **Rephrase with ProPhrase** for a selection.
   - `identity`: complete the browser-owned ProPhrase sign-in redirect.
   - `storage`: save the revocable token, device ID, and pending selection.
   - `https://prophrase.in/*`: authenticate and call ProPhrase APIs.
   - Page content script access: display the selection assistant on ordinary
     HTTP/HTTPS pages; it does not collect browsing history.

6. Add reviewer instructions with a working test account if the reviewer cannot
   create one, plus exact steps: connect, select text on a normal page, click the
   wand/context menu, choose a tone, and submit.
7. Select visibility and regions, save the draft, verify the assigned extension
   ID and callback origin, then submit for review.
8. After approval, install the public listing in a clean Chrome profile and run
   the smoke tests from section 2 again.

## 5. Firefox Add-ons submission

1. Sign in to the Firefox Add-on Developer Hub and choose **Submit a New
   Add-on**.
2. Choose distribution:

   - **On this site** for a public AMO listing and automatic updates.
   - **On your own** only for a signed unlisted build distributed from another
     site. It is useful for pre-release testing but does not create a public AMO
     listing.

3. Upload the Firefox ZIP from `.output` and resolve every validation error.
4. Because WXT bundles/transpiles the source, upload the matching `sources.zip`
   when AMO requests source code. Use these reviewer build instructions:

   ```text
   Build environment used for this package: Node.js 22.9.0 and npm 11.12.1.
   Run: npm ci
   Run: npm run build:firefox
   The reviewable output is .output/firefox-mv2.
   No secret environment variables are required; production defaults to
   https://prophrase.in.
   ```

5. Complete the listing, privacy policy, support information, categories, and
   screenshots. Use the same truthful data-use description as Chrome. Select
   the desktop platforms only unless the extension has also been tested and
   configured for Firefox for Android.
6. Confirm the declared Firefox data categories:

   - `authenticationInfo` for the revocable extension credential.
   - `personalCommunications` for text a user asks ProPhrase to rewrite/copy.
   - `websiteContent` for text selected on a webpage.

   The manifest requires Firefox 140 or later so these categories appear in
   Firefox's built-in installation consent. Supporting older Firefox versions
   would require a separate custom data-collection consent experience.

7. Add reviewer notes and a test account/instructions. Explain that text is read
   only after selection/user interaction and that Universal Copy normally
   remains retrievable for 10 minutes or until claimed.
8. Submit for signing/review. Install the AMO-signed file in a clean Firefox
   profile, capture its identity callback URL, update the server allowlist if
   necessary, and repeat the smoke tests.

## 6. Publishing updates

1. Merge and deploy compatible server changes first.
2. Increment the extension version and run `npm run extension:release`.
3. Test both unpacked builds and inspect both manifests.
4. Upload the new Chrome and Firefox ZIPs to their existing store items. Never
   create a new item for a normal update.
5. Upload the matching Firefox source ZIP and update reviewer instructions when
   the build changes.
6. Submit release notes that describe user-visible behavior without exposing
   implementation secrets.
7. After rollout, install/update from each store and verify authentication,
   rephrasing, plan limits/credits, Universal Copy, and token revocation.

## 7. Release safety checklist

- Production API deployed and healthy.
- Extension version increased for an update.
- TypeScript compile and both builds pass.
- No localhost host permission in production manifests.
- No secrets, private keys, or real user content in ZIPs or screenshots.
- Privacy policy and store disclosures match actual data handling.
- Exact Chrome and Firefox callback origins are deployed.
- Chrome ZIP, Firefox ZIP, and matching Firefox source ZIP retained together.
- Clean-profile smoke tests pass after store signing/approval.
