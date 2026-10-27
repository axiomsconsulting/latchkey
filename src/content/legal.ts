/**
 * The Terms of service (/terms) and Privacy policy (/privacy), in plain
 * English. Built per request from the operator's legal details
 * (src/lib/legal.ts) and the brand's name, so a white-labelled site names
 * its own operator. Describe only what the product really does: when a
 * feature that touches personal data, payments or retention changes, update
 * the matching section here and bump LEGAL_UPDATED.
 */
import { brandName } from "@/lib/brand";
import { privacyContact, type LegalDetails } from "@/lib/legal";

export type LegalSection = { id: string; title: string; body?: string[]; points?: string[] };
export type LegalDoc = { title: string; intro: string[]; sections: LegalSection[] };

function who(d: LegalDetails) {
  const name = brandName();
  const operator = d.companyName || name;
  const company = d.companyName
    ? `${d.companyName}${d.companyNumber ? `, a company registered in ${d.governingLaw} under number ${d.companyNumber}` : ""}${d.registeredAddress ? `, whose registered office is at ${d.registeredAddress}` : ""}`
    : name;
  const reach = d.contactEmail
    ? `email ${d.contactEmail}`
    : "use Send feedback in the dashboard menu";
  const privacy = privacyContact(d);
  const reachPrivacy = privacy ? `email ${privacy}` : reach;
  return { name, operator, company, reach, reachPrivacy };
}

export function privacyPolicy(d: LegalDetails): LegalDoc {
  const { name, operator, company, reach, reachPrivacy } = who(d);
  return {
    title: "Privacy policy",
    intro: [
      `${name} is software for people who run guest accommodation: check-in, stay guides, guest messages, housekeeping, direct stays and the records that go with them. This policy explains what personal data is involved, who is responsible for it, and the choices you have.`,
      `There are two kinds of data here. For our website, demos and hosts' accounts, ${operator} decides what's collected and why. For guests, the business you stay with decides, and ${name} looks after the data on its behalf.`,
    ],
    sections: [
      {
        id: "who",
        title: "Who we are",
        body: [
          `${name} is run by ${company}.`,
          ...(d.icoNumber
            ? [
                `We are registered with the UK Information Commissioner's Office (ICO) under number ${d.icoNumber}.`,
              ]
            : []),
          `For anything about your data, ${reachPrivacy}.`,
        ],
      },
      {
        id: "roles",
        title: "Who is responsible for which data",
        points: [
          `Visitors to this website, people trying our demos, and hosts and their team members: ${operator} is the controller of this data.`,
          `Guests of a business that uses ${name}: that business (the "host") is the controller. ${operator} is its processor: we store and process guests' details only to run the service for the host, under the data processing terms in our Terms of service, and never for our own marketing.`,
          "Card payments from guests are made in the host's own Stripe account. Stripe and the host are responsible for that payment data; we only see whether a payment succeeded.",
        ],
      },
      {
        id: "visitors",
        title: "Website visitors and demos",
        points: [
          "Page views and demo steps, counted as described under Website statistics below.",
          "If you start the guest tour or host demo, nothing you type in it is kept beyond the demo's daily reset, and sample ID checks never store photos.",
          "To stop misuse of the demo and our sign-up, we keep a scrambled version of your IP address that changes every day, never the address itself.",
          "If you arrive through a Commission Partner's link, we keep their referral code in a cookie for 60 days (see Cookies below), so the right partner is credited if you sign up.",
        ],
      },
      {
        id: "hosts",
        title: "Hosts and their team",
        points: [
          "Account details: name, email address, sign-in method (email, Google or Apple), and your role in the business.",
          "Business details: business and property names, addresses, contact phone and email, bank details you choose to show guests, tax settings, theme and logos.",
          "Billing: your plan and subscription status. Card details are collected and held by Stripe, never by us.",
          "Use of the service: activity in your business (who changed what, for your own audit trail), alerts and how you've chosen to receive them (email, text message, Telegram, app notifications), and feedback or support requests you send us.",
          "Our support team can see your business's data to help you and to keep the service running. They can only change it if you allow it, for up to 30 days at a time, and you can turn that off in Settings.",
          "If you sign up through a Commission Partner's link or code: to stop self-referral and fraud, we compare scrambled (hashed) versions of your email, phone, business and property details, card fingerprint, IP address and a random device code with the partner's and with other accounts (our legitimate interests). We never share these with the partner, who sees your business only as initials and a town. The scrambled IP address and device code are deleted after 180 days; the other scrambled details are kept while the referral can affect commission, and at most 6 years after the partner's agreement ends.",
        ],
      },
      {
        id: "guests",
        title: "Guests (handled for the host)",
        body: [`Depending on what the host turns on, ${name} may hold:`],
        points: [
          "Booking details: name, dates, room, number of guests, booking site and reference, email and phone number, and notes. Some arrive from the booking sites' calendars.",
          "Check-in details: who is staying (adults and children's ages), and for the UK guest register everyone 16 and over gives their full name and nationality; guests who aren't British, Irish or from a Commonwealth country also give their passport or ID number, where it was issued and their next destination, as the law requires.",
          "Photo ID checks: a photo of the ID document and, if the host asks, a face photo. The images are read automatically to fill in the guest's details and help the host check the document, and the host sees the result. A small copy is kept only if the host has turned this on and confirmed their ICO registration, and only for the days they've chosen. Kept copies are stored in a restricted folder for that business in our Google Drive, never shared, and shown to the host only through links that expire after 10 minutes.",
          "Messages between guest and host, requests (extras, breakfast, maintenance), invoices with the billing address the guest gives, and ratings.",
          "Direct enquiries and bookings made on the host's own page, how the guest chose to pay, and whether they agreed to hear from the host about future stays (only if they ticked that box).",
        ],
      },
      {
        id: "why",
        title: "Why we use it, and our legal basis",
        points: [
          "To provide the service to hosts and their guests (performing our contract with the host; for guest data, on the host's instructions).",
          "To bill for subscriptions and keep accounting records (contract and legal obligation).",
          "To keep the service secure, prevent fraud and misuse of trials and demos, and fix problems (our legitimate interests).",
          "To understand which pages and features help, using the website statistics below (our legitimate interests; you can switch it off).",
          "To answer support requests and send messages about your account and important changes (contract and legitimate interests). We don't send hosts marketing without their agreement, and we never send marketing to guests.",
          "Keeping the UK guest register and tax invoices is the host's legal obligation; we keep them for the periods below to support it.",
        ],
      },
      {
        id: "processors",
        title: "Services we use",
        body: ["We share only what each service needs to do its job:"],
        points: [
          "Lovable Cloud (built on Supabase): hosting, database, file storage, sign-in and the email we send. Private files (ID photos, signatures) only wait here briefly if Google Drive can't be reached, and are removed once they're safely in Google Drive.",
          "Lovable AI Gateway and the AI model provider behind it (currently OpenAI): reading photo ID during guests' check-in (when the host turns ID checks on) and Commission Partners' identity checks. Images are sent for that check only; we ask the service not to keep them, and we don't use them to train any AI model.",
          "Stripe: hosts' subscriptions, and guests' card payments in the host's own Stripe account.",
          "Twilio (text messages) and Telegram (messages to hosts who link it): alerts to hosts. App notifications go through the browser maker's push service and carry no content.",
          "Google: sign-in with Google, and Google Drive, where we store files hosts attach to their guides and, in restricted folders that are never shared, kept copies of guests' ID and face photos and Commission Partners' ID photos, drawn signatures and signed agreements. Apple: sign-in with Apple.",
          "Firecrawl: reading a host's public listing page when they import it. No guest data is sent.",
          "Frankfurter (exchange rates) and Cloudflare (checking a host's domain): no personal data is sent.",
        ],
      },
      {
        id: "transfers",
        title: "International transfers",
        body: [
          "Some of these services store or process data outside the UK. Where they do, we rely on the UK's adequacy regulations or on the UK International Data Transfer Agreement or Addendum, so your data has the same protection.",
        ],
      },
      {
        id: "retention",
        title: "How long data is kept",
        points: [
          "Website statistics: 13 months.",
          "Guests' names and contact details on a stay: cleared 30, 90, 180 or 365 days after check-out, as the host chooses (90 days unless changed). Messages: deleted after the period the host chooses, or kept with the stay.",
          "Copies of photo ID and face photos: 7, 14 or 30 days after check-out, as the host chooses, then deleted from Google Drive (deleted, not moved to the bin).",
          "UK guest register: 12 months from arrival, as the law requires, then deleted.",
          "Invoices: kept for the host's tax records. Direct enquiries: one year. Check-in attempts: 30 days. Team activity: one year.",
          "Host accounts: while the account is open. When a business closes its account, we delete or anonymise its data on request, except records we or the host must keep by law.",
          "Commission Partners: see the Commission Partners section below.",
        ],
      },
      {
        id: "statistics",
        title: "Website statistics",
        body: [
          `We record visits to this website to see what's useful, how people find and use ${name}, and to improve it. You can switch this off for your browser below.`,
        ],
        points: [
          "What we record: pages opened, how long they're looked at and the page you came from; campaign tags on the link you followed (like utm_source=linkedin); browser and device type, language, time zone, country and region; and steps in our demo and free trial. Your browser keeps a random visitor number so visits from the same browser can be put together.",
          `Visitor profiles: when you sign in, start a trial or give us your email, we link that browser's visits to a profile with your account and email address, and join visits from other browsers or devices where you sign in with the same account or email. ${operator} uses these profiles to understand which pages, campaigns and steps lead people to try and keep using ${name}, to improve the website and service, and to help you when you ask for support (our legitimate interests). We don't sell them, share them with advertisers or use advertising networks.`,
          "What we don't record: no IP addresses (only a scrambled code that changes every day, to spot automated traffic), and no town or exact location.",
          "Browsers that send Global Privacy Control or Do Not Track are never recorded, and the switch below turns it off for your browser.",
          "Kept for 13 months, then deleted.",
        ],
      },
      {
        id: "storage",
        title: "Cookies and storage on your device",
        points: [
          "We don't use advertising cookies or third-party trackers.",
          "Your browser's storage keeps you signed in, remembers settings (like your chosen property or layout), keeps the random visitor number for website statistics (see above), and keeps the campaign you arrived from for this visit.",
          "Cookies we set: lk_ref, only if you open a Commission Partner's link, holds their referral code for 60 days so they're credited if you sign up; lk_dev, a random device code for 60 days, used with it for the fraud checks described under Hosts (not set when Global Privacy Control, Do Not Track or the switch below is on); and on a guest's phone, lk_stay_ remembers their own stay until check-out, so scanning the room's QR code opens it.",
          "Installed apps and kiosks keep an offline copy of guest pages so they still open without a connection.",
          "Stripe's payment pages and Google's or Apple's sign-in pages set their own cookies under their own policies.",
        ],
      },
      {
        id: "security",
        title: "Keeping data safe",
        points: [
          "Data is encrypted in transit, and each business can only reach its own data; team members can be limited to particular properties.",
          "Photos of ID, signatures and signed agreements are kept in restricted Google Drive folders that are never shared (or, for a short time while Drive can't be reached, in private storage) and shown only through links that expire within minutes. Viewing a Commission Partner's ID photos is logged with a reason.",
          "Guest links and invoice links are long random codes, and we store only scrambled versions of guest link codes.",
          "If a breach puts personal data at risk, we tell the hosts affected without undue delay so they can meet their own duties, and the ICO where we must.",
        ],
      },
      {
        id: "partners",
        title: "Commission Partners",
        body: [
          `If you apply to be an independent ${name} Commission Partner, ${company} is the controller of your data. This section explains it; the Commission Partner agreement (clause 17) says the same.`,
        ],
        points: [
          "What we collect: your application (name, business details, country, email, phone, VAT number and address); the records of your signature (the agreement's version and fingerprint, date and time, your typed name and drawn signature, the boxes you ticked, your IP address and your device and browser details); for your identity check, photos of your ID document and a selfie, and the details read from the document (name, date of birth, expiry date, issuing country, document type, the last 4 characters of the document number) with the result; scrambled (hashed) fraud-check details; and your statements, payouts and tax records.",
          "Why, and our legal basis: to run the agreement with you (contract); to verify who we're paying and to prevent fraud and self-referral, and to be able to prove what was agreed (our legitimate interests); and to keep accounting and tax records (legal obligation).",
          "Automated reading of your ID: an AI service (through the Lovable AI Gateway, currently OpenAI models) reads your document and checks it isn't a copy, a printout or a screen. We ask the service not to keep the images, and we don't use them to train AI models. An automatic check never refuses you on its own: after two failed attempts a person at OMS reviews it, and you can ask for a person to review any decision.",
          "Where it's held: your application, the details read from your ID and your signing record are in our database (Lovable Cloud). Your ID photos, selfie, drawn signature and signed PDF are in restricted folders in our Google Drive, never shared, seen only by OMS's authorised administrators through links that expire after 10 minutes, and every view of your ID photos is logged. If Google Drive can't be reached, they wait in our private storage and are moved to Google Drive, then removed, as soon as it's back. Stripe collects its own identity and bank details from you as an independent controller when you set up payouts; we never see your bank details.",
          "International transfers: some of these services process data outside the UK, under UK adequacy regulations, the UK International Data Transfer Agreement or the UK Addendum.",
          "How long we keep it: ID and selfie photos are deleted 30 days after we approve or reject your identity check. The details read from your ID and the result, your application, and your signing records and signed PDF are kept while you're a Commission Partner and for 6 years after the agreement ends. Scrambled IP addresses and device codes: 180 days. Other scrambled fraud-check details: while you're a partner and up to 6 years after, reviewed at least once a year. Statements, payouts and tax records: 6 years after the end of the financial year they relate to.",
          "Your rights are the same as everyone's (below), and you can complain to the ICO.",
        ],
      },
      {
        id: "rights",
        title: "Your rights",
        points: [
          "You can ask to see, correct or delete your data, to restrict or object to how it's used, to receive it in a portable form, and to withdraw consent you gave.",
          `Hosts and visitors: ${reachPrivacy}. We reply within one month.`,
          `Guests: please ask the business you stayed with first, as they decide about your data. If you contact us, we'll pass your request on to them and help them answer it.`,
          "You can complain to the Information Commissioner's Office at ico.org.uk or on 0303 123 1113. We'd appreciate the chance to help first.",
        ],
      },
      {
        id: "children",
        title: "Children",
        body: [
          `Hosts must be 18 or over. Guests' children are recorded only by their age at check-in, and children don't give ID.`,
        ],
      },
      {
        id: "changes",
        title: "Changes to this policy",
        body: [
          `When we change this policy, we update the date at the top and tell hosts about important changes in the app. For questions, ${reach}.`,
        ],
      },
    ],
  };
}

export function termsOfService(d: LegalDetails): LegalDoc {
  const { name, operator, company, reach } = who(d);
  return {
    title: "Terms of service",
    intro: [
      `These terms are an agreement between ${company} ("we", "us") and the business that opens a ${name} account ("you"). By starting a trial or using ${name} for your business, you accept them on your business's behalf. Our Privacy policy explains how personal data is handled.`,
      `${name} is business software for people who run guest accommodation. It is not a booking site, travel agent, channel manager or payment provider, and we are not a party to your agreements with your guests.`,
    ],
    sections: [
      {
        id: "account",
        title: "Your account",
        points: [
          "You must be 18 or over and use the service for a business. The details you give us must be accurate and kept up to date.",
          "Keep sign-in details safe. You're responsible for everything done in your account, including by team members you invite, and for removing access when someone leaves.",
          "Tell us straight away if you think someone has used your account without permission.",
        ],
      },
      {
        id: "trial",
        title: "Free trial and demos",
        points: [
          "New accounts start with a free trial for the period shown when you sign up. No card is needed to start.",
          "To keep using the service after the trial, add a subscription. If you don't, your account becomes read-only: you can still see and export your records, but you can't make changes.",
          "Demos are shared sample businesses, reset regularly. Don't enter real guests' details into a demo.",
        ],
      },
      {
        id: "billing",
        title: "Plans, prices and billing",
        points: [
          "Subscriptions are billed monthly in advance through Stripe, at the price shown on the Subscription page for your plan, rooms and properties, plus VAT or other tax where it applies.",
          "If you joined during a launch offer, its price applies as described when you signed up, then the standard price from the following month.",
          "We may change prices with at least 30 days' notice in the app or by email. If you don't agree, you can cancel before the change takes effect.",
          "If a payment fails, we'll ask you to update your card. If it still isn't paid, we may make the account read-only until it is.",
        ],
      },
      {
        id: "cancel",
        title: "Cancelling",
        points: [
          "You can cancel at any time on the Subscription page. Your subscription ends straight away and the account becomes read-only. We don't refund part months, except where the law requires it.",
          "Your records stay available to read and export. To have your business's data deleted, ask us as described in the Privacy policy.",
        ],
      },
      {
        id: "guest-payments",
        title: "Payments from your guests",
        points: [
          `If you take card payments, they are made in your own Stripe account, connected through Stripe Connect. Your use of Stripe is governed by Stripe's own agreements with you. ${operator} takes no fee from guest payments and never holds your money.`,
          "You're responsible for your prices, taxes, refunds, chargebacks and disputes, and for the bank details you show guests for transfers.",
          "Whether guests may pay at the property, by bank transfer or by card is your choice.",
        ],
      },
      {
        id: "direct",
        title: "Your own booking page",
        points: [
          "Enquiries and bookings made on your page are agreements between you and your guest. You set the rates, offers, cancellation terms and house rules, and you must honour them.",
          `Rooms show as available from the stays ${name} knows about. To avoid double bookings, add each room's ${name} calendar link to every booking site you use, and keep their calendars connected to ${name}. Calendars can take time to update, and booking sites decide how often they check.`,
          `${name} is not responsible for double bookings or lost bookings caused by calendar delays, settings on other sites, or rooms that aren't shared.`,
        ],
      },
      {
        id: "responsibilities",
        title: "Your responsibilities as a host",
        points: [
          "Follow the laws that apply to your business, including data protection (and registering with the ICO where required), keeping the UK guest register if your property is in the UK, tax invoicing, consumer law, licensing and fire and safety rules.",
          "Make sure what you show guests is correct: guides, door codes, Wi-Fi details, prices and times.",
          "Use photo ID checks only where you have a lawful reason, tell guests why, and keep ID copies no longer than you need.",
          "Decide whether a guest may stay. ID check results are an aid, not a guarantee.",
        ],
      },
      {
        id: "data-processing",
        title: "Guests' data: data processing terms",
        body: [
          `For guests' personal data, you are the controller and ${operator} is your processor. These terms form the contract required by Article 28 of the UK GDPR. We will:`,
        ],
        points: [
          "Process guests' data only to provide the service and on your documented instructions (these terms and your settings), unless the law requires otherwise, in which case we'll tell you if we can.",
          "Make sure everyone who handles it is bound by confidentiality, and keep appropriate security measures in place.",
          "Use only the services listed in the Privacy policy, tell you of changes to that list in the app or by email so you can object, and hold each of them to equivalent data protection terms.",
          "Help you answer guests' requests to use their rights, and with security, breach notifications and data protection impact assessments, as far as is reasonable given what we know.",
          "Tell you without undue delay after becoming aware of a personal data breach affecting your guests' data.",
          "Delete guests' data when you delete it, under the retention settings you choose, and at the end of the service when you ask, unless the law requires us to keep it.",
          "Give you the information you reasonably need to show these duties are met, and allow reasonable audits with notice.",
        ],
      },
      {
        id: "acceptable-use",
        title: "Acceptable use",
        points: [
          "Don't use the service for anything unlawful, to send spam or harass anyone, to collect data you have no right to, or to upload harmful code.",
          "Don't try to reach other businesses' data, get around limits, overload the service, or copy or resell it.",
          "Only send guests messages about their stay, or about future stays if they've agreed.",
        ],
      },
      {
        id: "third-parties",
        title: "Other services",
        body: [
          `${name} works with services we don't control, such as booking sites' calendars, Stripe, Google, Apple and Telegram. Their terms apply to your use of them, and we aren't responsible for their availability or changes.`,
        ],
      },
      {
        id: "content",
        title: "Your content and ours",
        points: [
          "You keep ownership of everything you add: text, photos, logos and your guests' records. You give us permission to store and show it only to provide the service to you and your guests.",
          `${name}, its software, design and content belong to ${operator}. You may use them only as part of the service.`,
          "If you send us ideas or feedback, we may use them without owing you anything.",
        ],
      },
      {
        id: "service",
        title: "Availability and changes to the service",
        points: [
          "We work to keep the service running and your data safe, but it's provided without a guaranteed uptime, and may sometimes be unavailable for maintenance or reasons outside our control.",
          "Features marked as experimental may change or be removed.",
          "We improve the service regularly. If we remove something important you rely on, we'll tell you in advance where we can.",
        ],
      },
      {
        id: "liability",
        title: "Liability",
        points: [
          "Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or anything else the law doesn't allow us to limit.",
          "We aren't liable for loss of profits, revenue, bookings, business or goodwill, or for indirect losses.",
          "Our total liability to you in any 12 months is limited to the subscription fees you paid us in those 12 months.",
          "You're responsible for claims arising from how you run your business and treat your guests.",
        ],
      },
      {
        id: "ending",
        title: "Suspending or ending the service",
        points: [
          "We may suspend or close an account that seriously or repeatedly breaks these terms, puts others at risk, or isn't paid, telling you why where we can.",
          "We may stop offering the service with at least 60 days' notice, giving you time to export your records.",
        ],
      },
      {
        id: "changes",
        title: "Changes to these terms",
        body: [
          "We may update these terms. We'll change the date at the top and tell you about important changes in the app or by email at least 30 days before they apply. If you keep using the service after that, the new terms apply.",
        ],
      },
      {
        id: "law",
        title: "Law and disputes",
        body: [
          `These terms are governed by the law of ${d.governingLaw}, and its courts have exclusive jurisdiction. If something goes wrong, please talk to us first: ${reach}.`,
        ],
      },
      {
        id: "guests-note",
        title: "If you're a guest",
        body: [
          `Your stay, and any booking or payment you make on a host's page, is with that host, under their terms. ${name} provides the software they use. For anything about your stay, contact the host; for how your data is handled, see our Privacy policy.`,
        ],
      },
      {
        id: "contact",
        title: "Contact",
        body: [
          `${company}. To reach us, ${reach}.${d.vatNumber ? ` VAT number ${d.vatNumber}.` : ""}`,
        ],
      },
    ],
  };
}
