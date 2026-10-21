# Website Audit: cprmedia.org vs proreforms.uz
### A blind, evidence-based comparison — and what it teaches about AI-built websites

**Prepared for:** Jaloliddin Aka
**Date:** 21 October 2026
**Method:** Passive, non-intrusive external audit (the same requests any normal visitor's browser makes). Both sites belong to the same organization — *Center for Progressive Reforms* (CPR).

> **Important scope note — please read first.**
> This is an **audit of what can be observed from the outside**: speed, page weight, code quality, SEO, accessibility, and security *hygiene*. It is **not** a penetration test and **not** a load/stress test. Actively attacking or hammering a live website requires the owner's written permission and can take the site down — so those were deliberately **not** performed. The good news: everything below is enough to answer the real question without touching anything we aren't allowed to. What a passive audit *cannot* see is listed in the "Limits" section, and that blind spot is itself one of the most important lessons here.

---

## 1. Executive summary (for a non-technical reader)

Two websites for the same think tank were examined **blind** — without being told which one was built by a developer team and which was built with AI by a non-technical person. The goal was to let the evidence speak.

**The honest, uncomfortable headline:** on the things a normal person *can see and measure* — loading speed, clean code, SEO tags, accessibility basics — **the lighter site (cprmedia.org) clearly wins.** It is ~28× smaller and 2–4× faster. If you judge a website the way most people do ("does it look good and load fast?"), the leaner site looks better.

**But that is exactly the trap.** A website is not its homepage. The parts that make a site a *reliable, long-lived asset for an organization* — is it actually launched, who updates the content, who fixes it when it breaks, is the content accurate, is the backend secure — are **invisible in a surface audit and invisible to a non-technical owner.** And it is precisely in those invisible parts that the leaner site shows the classic warning signs of an AI/non-technical build:

- It is **still a private preview** — deliberately hidden from Google — and **was never actually launched to the public.**
- Its analytics is **still a leftover placeholder** (`TODO`), so nobody is measuring anything.
- It is **100% static with no visible content system** — meaning routine updates (a new news post, a new publication) appear to require a developer or re-running the AI, not a staff member clicking "publish."

So the lesson for a non-technical decision-maker is **not** "AI makes worse websites." The lesson is sharper and more useful:

> **AI makes the *visible, easy 80%* fast and cheap — often better than a rushed human build. The *invisible, hard 20%* — launching, maintaining, owning, fact-checking, and securing a real production system — is where AI + non-technical builds quietly fail, and it is the 20% that actually determines whether an organization can depend on the site for years.**

"It loads fast and looks clean" is the beginning of the job, not the end of it.

---

## 2. The scorecard

| Dimension | **cprmedia.org** | **proreforms.uz** | Winner |
|---|---|---|---|
| Technology | Lean static site, hand-written CSS | Nuxt.js 2 app (Vue) — real framework | — (different philosophies) |
| Homepage download size | **22 KB** | **617 KB** (~28× larger) | cprmedia |
| Time to first byte | **0.3–0.6 s** | 1.1–1.5 s | cprmedia |
| Every inner page | Small & fast, own metadata | Ships the **full 617 KB** no matter the page | cprmedia |
| Main heading (H1) | ✅ present, clean hierarchy | ❌ **no H1 at all** | cprmedia |
| Image alt text (accessibility) | ✅ **29 / 29** | ⚠️ 3 / 5 | cprmedia |
| Image optimization | ✅ modern WebP + lazy-loading | ❌ unoptimized JPG/PNG, no lazy-loading | cprmedia |
| SEO foundations | ✅ hreflang (EN/RU/UZ), structured data, **1,374-URL sitemap** | ❌ no sitemap, no robots.txt | cprmedia |
| Security headers | ⚠️ partial (2 present) | ❌ **none**, and leaks exact server version | cprmedia |
| Framework up-to-date? | N/A (no framework) | ❌ **Nuxt 2 — end-of-life since June 2024** | cprmedia |
| Server software | Behind Cloudflare (hidden, CDN-protected) | ❌ **nginx 1.18.0 (2020), version exposed** | cprmedia |
| **Actually launched & public?** | ❌ **No — still a hidden preview** | ✅ **Yes — live in production** | **proreforms** |
| Analytics configured? | ❌ **No — `TODO` placeholder** | ✅ Yes — Yandex Metrika wired up | **proreforms** |
| Content-update system for staff | ❌ none visible (static files) | ✅ likely a real backend/CMS | **proreforms** |
| Maintainable by a future developer? | ⚠️ unknown / possible lock-in | ✅ standard framework, known patterns | **proreforms** |

**Read this carefully:** cprmedia wins almost every *technical-craft* row, and loses every *is-it-a-real-operating-business-asset* row. That split is the whole story.

---

## 3. What each site did well, and badly (plain language)

### cprmedia.org — the lean site

**Genuinely good (credit where due):**
- **Extremely fast and light.** 22 KB vs 617 KB. On a slow phone or weak connection (common in Uzbekistan outside cities), this is a real, felt advantage.
- **Textbook-perfect best practices, applied everywhere.** Every image has descriptive alt text, headings are properly structured, modern image formats, lazy-loading, full SEO metadata, three languages (EN/RU/UZ) with proper language tags, and a complete 1,374-URL sitemap. This is the kind of uniform, checklist-complete polish that is cheap for a capable AI to produce.
- **Clean, tidy code.** Hand-written stylesheet of only 11 KB using a proper design-token system (brand colors defined once and reused).

**The warning signs:**
- **It was never actually launched.** Its own configuration file tells search engines "do not index — this is a preview." The public cannot find this site on Google. All that polish is sitting behind a locked door.
- **Analytics is a leftover `TODO`.** The tracking code still has a placeholder ID. Nobody is measuring visitors. This is the fingerprint of a build that was *made* but never *finished and operated.*
- **No visible way for staff to update it.** It appears to be fully static with no content-management system. That raises the critical question: when CPR wants to post next week's news, who does it, and how? If the answer is "ask a developer" or "re-run the AI," the organization is permanently dependent on technical help for routine work.
- **Security headers incomplete** (missing HSTS, Content-Security-Policy, and clickjacking protection).

### proreforms.uz — the framework site

**Genuinely good:**
- **It is actually live and serving the public** — the single most important thing a website must do.
- **Built on a real framework (Nuxt/Vue)** with a proper component structure and, almost certainly, a real backend/CMS — so staff can likely manage content and any future developer can understand and extend it.
- **Analytics is real and configured** (Yandex Metrika, a sensible choice for this region's audience).

**The problems (and they are real):**
- **Heavy and slower.** Every single page — even an error page — downloads 617 KB. That is wasteful and hurts users on slow connections.
- **Accessibility and SEO neglect:** no main H1 heading, some images missing alt text, no sitemap, no robots.txt, images not optimized, no lazy-loading.
- **Outdated and exposed infrastructure:** it runs **Nuxt 2, which reached end-of-life in June 2024** (no more security patches), on **nginx 1.18.0 from 2020**, and it *advertises that exact version to the world* — a gift to attackers.
- **No security headers at all.**

**The lesson hiding in proreforms:** "built by a developer team over months" is **no guarantee of quality either.** This site carries exactly the tech-debt scars of a real human project that was shipped and then under-maintained: old framework, old server, neglected basics. Both approaches need ongoing care — neither "humans did it" nor "AI did it" is a magic stamp of reliability.

---

## 4. Blind forensic attribution — which one is the AI build?

Without being told, the technical fingerprints point clearly to a conclusion. Here is the reasoning so you can judge it yourself.

**cprmedia.org shows the signature of an AI-assisted build driven by a non-technical owner:**
1. **Suspiciously *complete and uniform* best practices.** 100% of images captioned, perfect heading hierarchy, every SEO tag present, structured data, three-language setup — all executed flawlessly and consistently. Human developers under deadline almost always leave *some* gaps (as proreforms did). This rote, checklist-complete perfection is a hallmark of a model that "knows every rule" and applies them all at once.
2. **Lean, hand-rolled output, no heavyweight framework** — what you get when you describe a site to an AI and it writes clean static files, rather than a team standing up a full build pipeline.
3. **Classic "last-mile" gaps a non-technical owner wouldn't notice:** still in preview/noindex, analytics left as `TODO`. The *artifact* was built beautifully; the *launch and operation* were not — because AI builds the thing, not the business process around it.

**proreforms.uz shows the signature of a traditional developer team:**
1. **A real framework + build pipeline (Nuxt)** — a deliberate engineering investment that a non-technical person does not stand up alone.
2. **Actually deployed, launched, and instrumented** with real analytics — the operational follow-through a team provides.
3. **Real-world human tech debt** (EOL framework, outdated server, neglected SEO/accessibility) — the scars of a shipped, long-running, human-maintained project.

> **Forensic conclusion (high confidence, stated as inference not certainty):**
> **cprmedia.org is the AI / non-technical build; proreforms.uz is the developer-team build.**
> If this attribution is wrong, tell me and I will re-frame — but the evidence is consistent and one-directional.

---

## 5. The real disadvantages of an AI-built website (the point to understand)

On visual terms, AI "makes it faster and better" — and the audit *confirms* it really does make the visible parts faster and cleaner. That is exactly why this is dangerous: **the polish creates false confidence.** Here are the disadvantages that do **not** show up when you just look at the screen:

1. **"Looks done" is not "is done."** The AI site is gorgeous *and never went live.* The hardest, least glamorous 20% — launching, DNS, going public, turning on analytics, integrations, testing on real devices — is precisely where non-technical + AI builds stall, because the AI hands you a finished-*looking* artifact and stops.

2. **The content black hole.** A think tank lives by publishing. If the site has no system for non-technical staff to add articles, every update becomes a technical task forever. That recurring hidden cost is invisible on launch day and crippling by month three.

3. **No one owns it.** When it breaks, who fixes it? A dev team means continuity, documentation, and accountability. An AI-built site owned by a non-technical person has no one who understands the code, no support contract, no one to call at 2 a.m. "It worked when the AI made it" is not a maintenance plan.

4. **Content you cannot trust at face value.** AI writes fluent, confident text that can be subtly *wrong* — names, dates, figures, policy/legal claims. For an organization whose entire value is **credibility**, unverified AI content across 1,374 pages is a reputational landmine that a non-technical owner cannot fully fact-check.

5. **A false sense of security.** Clean headers on the surface can hide insecure patterns in any form or backend the owner can't read or audit. "I don't see any errors" is not the same as "it is secure."

6. **Lock-in and dead ends.** Bespoke AI output without a standard framework or documentation can be very hard for *any* future developer to extend — sometimes forcing a full rebuild. The cheap, fast start can become the expensive, slow finish.

**And the fair counterpoint, so this is honest:** the developer-built site proves humans aren't automatically better — it shipped with an end-of-life framework, an outdated exposed server, and neglected SEO/accessibility. **The real differentiator is not "AI vs human." It is whether someone takes ongoing, accountable ownership of the *whole lifecycle* — build, launch, measure, maintain, secure, and verify.** AI can do a lot of the build. It cannot do the ownership. That is the part a non-technical person must plan and pay for, whichever tool writes the code.

---

## 6. Limits of this audit (what was deliberately *not* done, and why it matters)

To be transparent, a passive external audit **cannot** see:
- **Load / stress behaviour** (how either site holds up under heavy traffic) — not tested, because that requires owner authorization and can take a site down.
- **Penetration / exploit testing** (actual vulnerabilities in forms, logins, databases) — not tested, for the same reason.
- **Real-user performance** on specific devices/networks (a Lighthouse-style lab test on-device would refine the speed numbers).
- **Content accuracy** — whether the text and data are factually correct.
- **Uptime and reliability over time.**
- **The backend** — the admin panel, database, and how content is actually managed and secured.

That blind spot is itself the moral of the story: **the most important risks of an AI-built site live exactly in the places a quick look cannot reach.** If you want, these can be assessed properly — but only on sites CPR owns and authorizes, with written permission.

---

## 7. Recommendations

**If CPR intends to adopt the AI-built site (cprmedia.org):**
1. Decide the **content-update workflow first.** If staff can't publish without a developer, it's not production-ready regardless of how it looks.
2. **Finish the last mile:** remove the `noindex`/preview block, configure real analytics, go live properly.
3. **Fact-check the content** — especially names, figures, and policy claims — with a human expert.
4. Add the missing **security headers** (HSTS, CSP, clickjacking protection).
5. Establish **who maintains it** and get the source code, documentation, and a support arrangement in writing.

**For the existing site (proreforms.uz), regardless:**
1. **Upgrade off the end-of-life Nuxt 2** and patch/upgrade nginx; stop exposing the version.
2. Add **security headers**, a **robots.txt** and **sitemap.xml**, a proper **H1**, missing **alt text**, and **optimize images** (WebP + lazy-loading) to cut that 617 KB weight.

**The overarching recommendation:** judge a website by its *whole lifecycle*, not its homepage. Budget for ownership — launch, maintenance, security, and content accuracy — as a permanent line item. That is the real cost AI hides, and the real question a non-technical decision-maker needs to answer before trusting any site, AI-made or not.

---

*This report reflects observations from a passive external audit on 21 October 2026. No site was attacked, overloaded, or modified. Attribution of which site is "AI-built" is a reasoned inference from technical evidence, not a confirmed fact — correct me if it is wrong and I will re-frame accordingly.*
