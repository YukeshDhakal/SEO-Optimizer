// Real legal copy, ported verbatim from the Quillrun Claude Design handoff
// (Quillrun Marketing Site.dc.html's LEGAL object). Static/hardcoded rather
// than CMS-driven: the BaseHub repo connected via BASEHUB_TOKEN turned out
// to have no matching content schema (see PRD.md §2, commit ab5d441) - two
// consecutive schema mismatches made "wait for BaseHub" a worse bet than
// just shipping the real text directly. Revisit a CMS-backed version later
// if these pages need to change without a redeploy.
//
// The design file's own footer note applies here too: this is placeholder
// copy written to the right length and structure for design review - have
// counsel review the wording before a real launch.

export interface LegalSection {
  readonly n: string;
  readonly h: string;
  readonly p: string;
}

export interface LegalDoc {
  readonly slug: "terms" | "privacy" | "aup";
  readonly title: string;
  readonly date: string;
  readonly intro: string;
  readonly body: readonly LegalSection[];
}

export const legalDocs: Record<LegalDoc["slug"], LegalDoc> = {
  terms: {
    slug: "terms",
    title: "Terms of Service",
    date: "12 August 2026",
    intro:
      "These terms cover your use of Quillrun, an automated content service that writes and publishes to websites you control. Read section 4 carefully. It is the part about the agent acting without you.",
    body: [
      {
        n: "1",
        h: "Who these terms are between",
        p: 'Quillrun Ltd, a company registered in England, and the organization named on the account. If you accept these terms on behalf of an employer or a client, you confirm you are allowed to do so, and "you" means that organization.',
      },
      {
        n: "2",
        h: "What the service does",
        p: "Quillrun researches topics, drafts posts, checks them against quality and policy gates, and publishes them to sites you connect. You may connect a WordPress site you control, or use a blog we host on your behalf. The service is provided as it stands and we do not promise any particular ranking, traffic level, or commercial result.",
      },
      {
        n: "3",
        h: "Your account and your sites",
        p: "You are responsible for keeping account credentials secure and for every action taken under your account, including actions by teammates you invite. When you connect a WordPress site you grant us permission to publish to it using the credentials you supply. You confirm you have the right to publish to every site you connect. You can disconnect a site at any time and publishing stops immediately.",
      },
      {
        n: "4",
        h: "Automated publishing and your responsibility",
        p: "This is the heart of the service. When approval is not required, the agent publishes without a person reading the post first. You choose that setting and you own the result. Content published to your site is your content, published under your name, and you are responsible for it in the same way you would be for something you typed yourself.\n\nWe give you controls to manage that risk: an approval gate that is on by default, per site pause, a global stop, posting limits, and an audit log of everything the agent did. You agree to review those controls before turning approval off.",
      },
      {
        n: "5",
        h: "Acceptable use",
        p: "You may not use the service to produce content that is unlawful, that infringes someone else's rights, that impersonates a real person or business you do not represent, or that is designed to manipulate search results through deception. The Acceptable Use Policy sets this out in full and forms part of these terms.",
      },
      {
        n: "6",
        h: "Fees, billing and trials",
        p: "Plans are billed monthly or annually per connected site, in advance. Trial posts are free and no card is required to start. Fees are non refundable except where the law requires otherwise. We will give at least thirty days notice before any price change takes effect on your account.",
      },
      {
        n: "7",
        h: "Suspension and termination",
        p: "You may cancel at any time from Settings and the service runs until the end of the paid period. We may suspend an account that breaches the Acceptable Use Policy, that fails to pay, or that puts our systems or a third party at risk. Where the situation allows, we will contact you before suspending.",
      },
      {
        n: "8",
        h: "Intellectual property",
        p: "You own the content the agent produces for you, including drafts that never publish. We own the software, the models we operate, the pipeline design, and everything about the platform itself. You grant us a limited licence to process your content in order to run the service.",
      },
      {
        n: "9",
        h: "Liability",
        p: "To the extent the law allows, our total liability in any twelve month period is limited to the fees you paid in that period. We are not liable for lost profit, lost traffic, lost rankings, reputational harm, or content that you or your settings allowed to publish. Nothing here limits liability for death, personal injury, or fraud.",
      },
      {
        n: "10",
        h: "Changes to these terms",
        p: "We may update these terms. Material changes will be announced in the product and by email at least thirty days before they take effect. Continuing to use the service after that date means you accept the updated terms.",
      },
      {
        n: "11",
        h: "Governing law",
        p: "These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.",
      },
    ],
  },
  privacy: {
    slug: "privacy",
    title: "Privacy Policy",
    date: "12 August 2026",
    intro:
      "What we collect, why we collect it, how long we keep it, and what you can ask us to do about it. We are the data controller for account data and a processor for the content you run through the service.",
    body: [
      {
        n: "1",
        h: "What we collect",
        p: "Account data: name, work email, organization name, billing details handled by our payment provider. Site data: the site names, URLs, and CMS credentials you enter so we can publish. Content data: topics, drafts, published posts, and the results of every quality and policy check. Usage data: sign in times, screens visited, actions taken, and technical logs from our servers.",
      },
      {
        n: "2",
        h: "Why we use it",
        p: "To run the service you asked for, to publish to sites you connect, to bill you, to keep the platform secure, to investigate problems you report, and to improve reliability. We do not sell personal data and we do not use your content to train third party models.",
      },
      {
        n: "3",
        h: "Credentials for your sites",
        p: "WordPress application passwords are encrypted at rest and used only to publish or verify a connection. They are never shown back to you in full and never included in logs. Deleting a site deletes its stored credentials within twenty four hours.",
      },
      {
        n: "4",
        h: "Sub processors",
        p: "We use a cloud host for infrastructure, a payment provider for billing, an email provider for notifications, and model providers to generate and check content. Each is bound by a data processing agreement. The current list is available on request and is updated when it changes.",
      },
      {
        n: "5",
        h: "How long we keep things",
        p: "Account data is kept while the account is open and for six years after closure where tax law requires it. Drafts, runs and audit records are kept for twenty four months so the audit log remains meaningful, then deleted. You can request earlier deletion of drafts and runs.",
      },
      {
        n: "6",
        h: "Your rights",
        p: "If you are in the UK or the EEA you can ask for a copy of your data, ask us to correct or delete it, object to certain processing, or ask us to move it elsewhere. Write to privacy@quillrun.com and we will answer within thirty days. You can also complain to your local supervisory authority.",
      },
      {
        n: "7",
        h: "International transfers",
        p: "Data is stored in the United Kingdom and the European Union. Where a sub processor operates outside those regions, transfers rely on the UK International Data Transfer Agreement or the EU Standard Contractual Clauses.",
      },
      {
        n: "8",
        h: "Cookies",
        p: "We use a session cookie so you stay signed in and a small number of first party analytics cookies to count page views. No advertising cookies and no cross site trackers.",
      },
      {
        n: "9",
        h: "Security",
        p: "Encryption in transit and at rest, least privilege access for staff, audit logging on internal access to customer data, and annual penetration testing. If a breach affects you we will tell you and the regulator within seventy two hours of becoming aware.",
      },
    ],
  },
  aup: {
    slug: "aup",
    title: "Acceptable Use Policy",
    date: "12 August 2026",
    intro:
      "The agent publishes without a person reading every post, so the boundaries have to be explicit. This policy applies to every account and forms part of the Terms of Service.",
    body: [
      {
        n: "1",
        h: "Content you may not generate or publish",
        p: "Content that is unlawful in the country the site serves. Content that infringes copyright, trade marks, or database rights. Content that impersonates a real person, business, or public body you do not represent. Sexual content involving minors, in any form, ever. Content that incites violence or hatred against a group.",
      },
      {
        n: "2",
        h: "Regulated claims",
        p: "Medical, legal, financial and safety claims must be supported by a cited source. The policy gate blocks unsourced claims in these categories and that block cannot be turned off. If your business operates in a regulated field, keep approval required and have a qualified person read every post.",
      },
      {
        n: "3",
        h: "Search manipulation",
        p: "No doorway pages, no cloaking, no hidden text, no scraped or spun content passed off as original, no automated link schemes, and no publishing to sites you do not control. Quillrun writes for search engines by being useful to readers, not by deceiving crawlers.",
      },
      {
        n: "4",
        h: "Volume and platform limits",
        p: "Respect the posting limits on your plan and do not attempt to bypass them with duplicate organizations. Do not use the service to publish to more than the number of sites your plan allows. Do not attempt to extract model weights, reverse engineer the pipeline, or probe our infrastructure.",
      },
      {
        n: "5",
        h: "What happens if you breach this policy",
        p: "A single blocked run is not a breach, it is the system working. Repeated attempts to publish content this policy prohibits will pause your organization and trigger a human review. Serious breaches, in particular anything unlawful, end the account immediately and may be reported to the relevant authority.",
      },
      {
        n: "6",
        h: "Reporting a problem",
        p: "If you find content published through Quillrun that breaks this policy, write to abuse@quillrun.com with the URL. We investigate every report and respond within two working days.",
      },
    ],
  },
};

export const legalSlugs = Object.keys(legalDocs) as LegalDoc["slug"][];

export const getLegalDoc = (slug: string): LegalDoc | null =>
  legalDocs[slug as LegalDoc["slug"]] ?? null;
