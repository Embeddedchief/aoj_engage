// Launch catalogue (spec §20): templates, Nigerian + international calendar, default automations, segments.
import type { Audience, ContactCategory, EventCategory, EventRule, TriggerType } from "@prisma/client";
import type { EmailBlock } from "./blocks";
import type { SegmentRules } from "./segments";

let i = 0;
const id = () => `s${(i++).toString(36)}`;

type Tone = "brand" | "navy" | "festive" | "soft";
function tpl(o: { title: string; subtitle?: string; tone?: Tone; heading?: string; body: string[]; cta?: { label: string; url: string }; sign: string }): EmailBlock[] {
  const b: EmailBlock[] = [{ id: id(), type: "logo" }, { id: id(), type: "banner", title: o.title, subtitle: o.subtitle ?? "", tone: o.tone ?? "brand" }];
  if (o.heading) b.push({ id: id(), type: "heading", text: o.heading });
  b.push({ id: id(), type: "paragraph", text: o.body.join("\n\n") });
  if (o.cta) b.push({ id: id(), type: "button", label: o.cta.label, url: o.cta.url });
  b.push({ id: id(), type: "signature", text: o.sign }, { id: id(), type: "divider" }, { id: id(), type: "contact" });
  return b;
}

const SIGN_HR = "Warm regards,\n**Human Resources**\n{{company_name}}";
const SIGN_MGMT = "Best regards,\n**Management**\n{{company_name}}";
const SIGN_CR = "Warm regards,\n**Customer Relations Team**\n{{company_name}}";
const SIGN_CO = "Best regards,\n**{{company_name}}**";
const BOTH_CLOSE = "{{#if staff}}Thank you for your contribution to our team's success.{{else}}We look forward to supporting your next project.{{/if}}";

export type CatalogTemplate = { key: string; name: string; category: string; audience: Audience; department: string; subject: string; preheader: string; blocks: EmailBlock[] };

export const TEMPLATE_CATALOG: CatalogTemplate[] = [
  {
    key: "new-week-staff", name: "Happy New Week – Staff", category: "New Week", audience: "INTERNAL", department: "Management",
    subject: "A New Week, New Opportunities – Let's Make It Count!", preheader: "Welcome to a new week at AOJ Global.",
    blocks: tpl({ title: "Happy New Week", subtitle: "Speed · Quality · Innovation · Excellence", heading: "Dear {{first_name}},", sign: SIGN_MGMT, body: [
      "Welcome to a new week!",
      "As we begin another week at AOJ Global, we want to appreciate your commitment, hard work and contributions to our continued progress.",
      "Every task completed, every challenge overcome and every effort made contributes to the bigger picture.",
      "This week, let us continue to uphold the values that define us: **speed, quality, innovation and excellence.** We encourage you to remain focused, proactive and committed to delivering your best — together, as one team.",
      "Wishing you a productive and successful week ahead.",
    ] }),
  },
  {
    key: "new-week-customers", name: "Happy New Week – Customers", category: "New Week", audience: "EXTERNAL", department: "Customer Relations",
    subject: "Wishing You a Productive New Week!", preheader: "Warm wishes from everyone at AOJ Global.",
    blocks: tpl({ title: "Wishing you a productive week", tone: "navy", heading: "Dear {{first_name}},", sign: SIGN_CO, body: [
      "A new week brings new opportunities to make progress and achieve more.",
      "Everyone at AOJ Global wishes you and your team a successful and productive week ahead.",
      "As always, we remain available to support your Mechanical, Electrical and Piping engineering requirements.",
      "Thank you for keeping AOJ Global in mind. We look forward to continuing to serve you.",
    ] }),
  },
  {
    key: "new-month-staff", name: "Happy New Month – Staff", category: "New Month", audience: "INTERNAL", department: "Management",
    subject: "Happy New Month, {{first_name}}! Welcome to {{current_month}}", preheader: "A fresh month of progress at AOJ Global.",
    blocks: tpl({ title: "Happy New Month", subtitle: "Welcome to {{current_month}} {{current_year}}", heading: "Dear {{first_name}},", sign: SIGN_MGMT, body: [
      "Welcome to {{current_month}}!",
      "Thank you for everything you contributed last month. Your dedication continues to move AOJ Global forward, project by project.",
      "As we step into {{current_month}} {{current_year}}, let us set clear goals, support one another and keep raising the standard of quality our clients rely on.",
      "Here's to a month of growth, achievement and new milestones.",
    ] }),
  },
  {
    key: "new-month-customers", name: "Happy New Month – Customers", category: "New Month", audience: "EXTERNAL", department: "Customer Relations",
    subject: "Happy New Month from AOJ Global", preheader: "Wishing you a successful {{current_month}}.",
    blocks: tpl({ title: "Happy New Month", subtitle: "Welcome to {{current_month}} {{current_year}}", tone: "navy", heading: "Dear {{first_name}},", sign: SIGN_CR, cta: { label: "Speak with our team", url: "{{company_website}}" }, body: [
      "Welcome to {{current_month}}!",
      "AOJ Global appreciates your continued relationship with us. We wish you a month filled with progress and new opportunities.",
      "Our commitment to quality, speed and cost efficiency remains the same — and whenever you need dependable MEP engineering support, we are only a message away.",
    ] }),
  },
  {
    key: "birthday-staff", name: "Happy Birthday – Staff", category: "Birthday", audience: "INTERNAL", department: "Human Resources",
    subject: "Happy Birthday, {{first_name}}!", preheader: "Today, we celebrate you!",
    blocks: tpl({ title: "Happy Birthday, {{first_name}}!", subtitle: "Today, we celebrate you", tone: "festive", sign: SIGN_HR, body: [
      "Dear {{first_name}},",
      "Today, we celebrate you!",
      "On behalf of the entire AOJ Global family, we wish you a wonderful birthday filled with happiness, good health and continued success.",
      "We appreciate your dedication, commitment and the contributions you make to our team.",
      "May this new chapter bring you greater achievements and exciting opportunities.",
      "**Happy Birthday!**",
    ] }),
  },
  {
    key: "birthday-customers", name: "Happy Birthday – Customers", category: "Birthday", audience: "EXTERNAL", department: "Customer Relations",
    subject: "Happy Birthday, {{first_name}}", preheader: "Warm birthday wishes from AOJ Global.",
    blocks: tpl({ title: "Happy Birthday", subtitle: "Warm wishes from all of us at AOJ Global", tone: "festive", heading: "Dear {{first_name}},", sign: SIGN_CR, body: [
      "Everyone at AOJ Global joins in wishing you a very happy birthday.",
      "We value the relationship we share and wish you good health, joy and continued success in the year ahead.",
      "Have a wonderful celebration.",
    ] }),
  },
  {
    key: "work-anniversary", name: "Employment Anniversary", category: "Anniversary", audience: "INTERNAL", department: "Human Resources",
    subject: "Happy Work Anniversary, {{first_name}} — {{years_of_service}} year(s) at AOJ Global", preheader: "Thank you for your years of service.",
    blocks: tpl({ title: "{{years_of_service}} year(s) at AOJ Global", subtitle: "Happy Work Anniversary, {{first_name}}", tone: "navy", heading: "Dear {{first_name}},", sign: SIGN_HR, body: [
      "Today marks **{{years_of_service}} year(s)** since you joined AOJ Global.",
      "{{#if milestone}}This is a major milestone, and we are proud to celebrate it with you. Your loyalty, expertise and leadership have helped shape who we are today.{{else}}Thank you for the energy, skill and commitment you bring to every project and every team you work with.{{/if}}",
      "We look forward to achieving even more together.",
    ] }),
  },
  {
    key: "customer-appreciation", name: "Customer Appreciation", category: "Appreciation", audience: "EXTERNAL", department: "Customer Relations",
    subject: "Thank You for Choosing AOJ Global", preheader: "We value the confidence you place in us.",
    blocks: tpl({ title: "Thank you", subtitle: "For your trust and partnership", tone: "navy", heading: "Dear {{first_name}},", sign: SIGN_CR, body: [
      "At AOJ Global, we understand that trust is earned through consistency, quality and commitment.",
      "We sincerely appreciate the opportunity to work with you and value the confidence you continue to place in our services.",
      "Whether it is a new project, a maintenance requirement or an opportunity to collaborate, we remain committed to delivering solutions that meet your expectations.",
      "Thank you for being part of our journey. We look forward to building an even stronger relationship with you.",
    ] }),
  },
  ...festive("christmas", "Christmas Greetings", "Merry Christmas from AOJ Global", "Merry Christmas", "Peace, joy and goodwill this season", [
    "As we celebrate Christmas, we pause to appreciate the people who make our work meaningful.",
    "{{#if staff}}Thank you for the dedication and teamwork you brought to every project this year. Enjoy a restful season with your loved ones.{{else}}Thank you for your trust and partnership this year. We wish you and your loved ones a joyful and peaceful Christmas.{{/if}}",
  ]),
  ...festive("new-year", "New Year Greetings", "Happy New Year from AOJ Global", "Happy New Year {{current_year}}", "A fresh start, new milestones", [
    "Happy New Year! We step into {{current_year}} grateful for the year behind us and excited for what lies ahead.",
    "{{#if staff}}Together, let us make this year one of growth, excellence and innovation.{{else}}We look forward to supporting your plans and projects in the year ahead with the same commitment to quality and speed.{{/if}}",
  ]),
  ...festive("eid-fitr", "Eid al-Fitr Greetings", "Eid Mubarak from AOJ Global", "Eid Mubarak", "Warm wishes on Eid al-Fitr", [
    "As the holy month of Ramadan comes to a close, we join you in celebrating Eid al-Fitr.",
    "May this season bring peace, happiness and prosperity to you and your family. " + BOTH_CLOSE,
  ]),
  ...festive("eid-adha", "Eid al-Adha Greetings", "Eid Mubarak — Happy Eid al-Adha", "Eid al-Adha Mubarak", "Celebrating sacrifice, faith and generosity", [
    "On this Eid al-Adha, we celebrate the values of faith, sacrifice and generosity.",
    "We wish you and your loved ones a blessed and joyful celebration. " + BOTH_CLOSE,
  ]),
  ...festive("eid-maulud", "Eid al-Maulud Greetings", "Happy Eid al-Maulud", "Happy Eid al-Maulud", "Peace and blessings", [
    "We send our warm wishes as you celebrate Eid al-Maulud.",
    "May the season bring you peace, love and many blessings.",
  ]),
  ...festive("easter", "Easter Greetings", "Happy Easter from AOJ Global", "Happy Easter", "A season of hope and renewal", [
    "Easter reminds us of hope, renewal and new beginnings.",
    "We wish you and your family a joyful and peaceful Easter celebration. " + BOTH_CLOSE,
  ]),
  ...festive("independence-day", "Independence Day", "Happy Independence Day, Nigeria!", "Happy Independence Day", "Celebrating Nigeria", [
    "Today we celebrate Nigeria's independence and the resilience, creativity and spirit of our nation.",
    "At AOJ Global, we are proud to contribute to Nigeria's infrastructure through quality engineering. " + BOTH_CLOSE,
  ], "navy"),
  ...festive("workers-day", "Workers' Day", "Happy Workers' Day", "Happy Workers' Day", "Celebrating the people who build", [
    "Today we honour the dedication of workers everywhere — the people whose skill and effort build the nation.",
    "{{#if staff}}To every member of the AOJ Global team: thank you. Your work powers everything we deliver.{{else}}We celebrate you and your team, and thank you for working alongside us.{{/if}}",
  ], "navy"),
  ...festive("democracy-day", "Democracy Day", "Happy Democracy Day", "Happy Democracy Day", "June 12", [
    "On this Democracy Day, we celebrate freedom, unity and the shared hope of a better Nigeria.",
    "We wish you a peaceful and reflective holiday.",
  ], "navy"),
  ...festive("womens-day", "International Women's Day", "Celebrating Women on International Women's Day", "International Women's Day", "Celebrating women in engineering and beyond", [
    "Today we celebrate the women whose talent, leadership and resilience shape our industry, our company and our communities.",
    "{{#if staff}}To the women of AOJ Global: thank you for everything you bring to our team.{{else}}We celebrate the women in your organisation and the impact they make every day.{{/if}}",
  ], "soft"),
  ...festive("engineering-day", "World Engineering Day", "Happy World Engineering Day", "World Engineering Day", "Engineering for sustainable development", [
    "On World Engineering Day, we celebrate the engineers who design, build and maintain the systems that power everyday life.",
    "As an MEP engineering company, AOJ Global is proud of the craft, precision and innovation our work demands. " + BOTH_CLOSE,
  ], "navy"),
  ...festive("company-anniversary", "Company Anniversary", "Celebrating Another Year of AOJ Global", "Another year of AOJ Global", "Thank you for being part of our story", [
    "Today we celebrate another year of AOJ Global Concept Limited.",
    "{{#if staff}}Every milestone we have reached is the result of your commitment. Thank you for being part of our story.{{else}}Thank you for the trust and partnership that have been part of our journey.{{/if}}",
  ]),
  {
    key: "project-completion", name: "Project Completion Appreciation", category: "Project", audience: "EXTERNAL", department: "Customer Relations",
    subject: "Thank You — {{project_name}} Is Complete", preheader: "We appreciate the opportunity to deliver your project.",
    blocks: tpl({ title: "Project completed", subtitle: "{{project_name}}", tone: "navy", heading: "Dear {{first_name}},", sign: SIGN_CR, body: [
      "We are pleased to confirm the completion of **{{project_name}}**.",
      "Thank you for entrusting AOJ Global with this project. It was a privilege to work with you and your team.",
      "Our team remains available for maintenance, support and any future requirements you may have.",
    ] }),
  },
  {
    key: "project-milestone", name: "Project Milestone", category: "Project", audience: "EXTERNAL", department: "Customer Relations",
    subject: "Project Update: {{project_name}}", preheader: "A milestone has been reached on your project.",
    blocks: tpl({ title: "Milestone reached", subtitle: "{{project_name}}", tone: "brand", heading: "Dear {{first_name}},", sign: SIGN_CR, body: [
      "We are pleased to let you know that an important milestone has been reached on **{{project_name}}**.",
      "Thank you for your continued collaboration. Your project lead will share the detailed progress report separately.",
    ] }),
  },
  {
    key: "customer-welcome", name: "New Customer Welcome", category: "Welcome", audience: "EXTERNAL", department: "Customer Relations",
    subject: "Welcome to AOJ Global, {{first_name}}", preheader: "We look forward to working with you.",
    blocks: tpl({ title: "Welcome to AOJ Global", subtitle: "Mechanical · Electrical · Piping", tone: "brand", heading: "Dear {{first_name}},", sign: SIGN_CR, cta: { label: "Learn more about us", url: "{{company_website}}" }, body: [
      "Thank you for choosing AOJ Global Concept Limited. We are delighted to welcome you.",
      "Our team is committed to delivering MEP engineering solutions with speed, quality and cost efficiency — and to being a dependable partner at every stage.",
      "If you have any questions, simply reply to this email and the right person on our team will respond.",
    ] }),
  },
  {
    key: "relationship-anniversary", name: "Business Relationship Anniversary", category: "Anniversary", audience: "EXTERNAL", department: "Customer Relations",
    subject: "{{years_of_service}} year(s) of partnership — thank you", preheader: "Celebrating our relationship.",
    blocks: tpl({ title: "{{years_of_service}} year(s) together", subtitle: "Thank you for your partnership", tone: "navy", heading: "Dear {{first_name}},", sign: SIGN_CR, body: [
      "It has now been {{years_of_service}} year(s) since we began working together.",
      "Thank you for your continued trust in AOJ Global. We value our relationship and look forward to many more years of collaboration.",
    ] }),
  },
  {
    key: "staff-recognition", name: "Staff Recognition", category: "Recognition", audience: "INTERNAL", department: "Human Resources",
    subject: "Congratulations, {{first_name}}!", preheader: "Your work has been recognised.",
    blocks: tpl({ title: "Well done, {{first_name}}!", subtitle: "Employee recognition", tone: "brand", heading: "Dear {{first_name}},", sign: SIGN_MGMT, body: [
      "We are delighted to recognise your outstanding contribution.",
      "[Describe the achievement here.]",
      "Thank you for setting an example of excellence for the whole team.",
    ] }),
  },
  {
    key: "staff-appreciation", name: "Monthly Staff Appreciation", category: "Appreciation", audience: "INTERNAL", department: "Management",
    subject: "Thank you for an outstanding {{current_month}}", preheader: "Appreciation from Management.",
    blocks: tpl({ title: "Thank you, team", subtitle: "Monthly appreciation", tone: "navy", heading: "Dear {{first_name}},", sign: SIGN_MGMT, body: [
      "Thank you for your hard work and commitment this month.",
      "Every project we deliver reflects the professionalism and dedication of our people. We see your effort and we appreciate it.",
    ] }),
  },
  {
    key: "company-announcement", name: "Company Announcement", category: "Announcement", audience: "INTERNAL", department: "Management",
    subject: "Announcement: [Title]", preheader: "An important update from Management.",
    blocks: tpl({ title: "Company announcement", tone: "navy", heading: "Dear {{first_name}},", sign: SIGN_MGMT, body: [
      "[Write the announcement here: what is happening, when, where and what staff need to do.]",
      "If you have any questions, please contact Human Resources.",
    ] }),
  },
];

function festive(key: string, name: string, subject: string, title: string, subtitle: string, body: string[], tone: Tone = "festive"): CatalogTemplate[] {
  return [{
    key, name, category: "Festive", audience: "BOTH", department: "Communications", subject, preheader: subtitle,
    blocks: tpl({ title, subtitle, tone, heading: "Dear {{first_name}},", sign: "Warm regards,\n**{{company_name}}**", body }),
  }];
}

export type CatalogEvent = { key: string; name: string; category: EventCategory; rule: EventRule; month?: number; day?: number; easterOffset?: number; audience: Audience; active: boolean; description?: string; dates?: { year: number; date: string }[] };

export const EVENT_CATALOG: CatalogEvent[] = [
  { key: "new-year", name: "New Year's Day", category: "PUBLIC_HOLIDAY", rule: "FIXED", month: 1, day: 1, audience: "BOTH", active: true },
  { key: "workers-day", name: "Workers' Day", category: "PUBLIC_HOLIDAY", rule: "FIXED", month: 5, day: 1, audience: "BOTH", active: true },
  { key: "democracy-day", name: "Democracy Day", category: "PUBLIC_HOLIDAY", rule: "FIXED", month: 6, day: 12, audience: "BOTH", active: true },
  { key: "independence-day", name: "Independence Day", category: "PUBLIC_HOLIDAY", rule: "FIXED", month: 10, day: 1, audience: "BOTH", active: true },
  { key: "christmas", name: "Christmas Day", category: "PUBLIC_HOLIDAY", rule: "FIXED", month: 12, day: 25, audience: "BOTH", active: true },
  { key: "boxing-day", name: "Boxing Day", category: "PUBLIC_HOLIDAY", rule: "FIXED", month: 12, day: 26, audience: "BOTH", active: true },
  { key: "good-friday", name: "Good Friday", category: "RELIGIOUS", rule: "EASTER", easterOffset: -2, audience: "BOTH", active: true, description: "Public holiday. Date computed from Easter; confirm against the FG announcement." },
  { key: "easter-sunday", name: "Easter Sunday", category: "RELIGIOUS", rule: "EASTER", easterOffset: 0, audience: "BOTH", active: true, description: "Easter greeting day. Confirm before automatic sending." },
  { key: "easter-monday", name: "Easter Monday", category: "RELIGIOUS", rule: "EASTER", easterOffset: 1, audience: "BOTH", active: true },
  // Movable Islamic holidays — provisional astronomical estimates, must be confirmed per year.
  { key: "eid-fitr", name: "Eid al-Fitr", category: "RELIGIOUS", rule: "MOVABLE", audience: "BOTH", active: true, description: "Provisional until the Federal Government announces the official date.", dates: [{ year: 2026, date: "2026-03-20" }, { year: 2027, date: "2027-03-10" }] },
  { key: "eid-adha", name: "Eid al-Adha", category: "RELIGIOUS", rule: "MOVABLE", audience: "BOTH", active: true, description: "Provisional until the Federal Government announces the official date.", dates: [{ year: 2026, date: "2026-05-27" }, { year: 2027, date: "2027-05-17" }] },
  { key: "eid-maulud", name: "Eid al-Maulud", category: "RELIGIOUS", rule: "MOVABLE", audience: "BOTH", active: true, description: "Provisional until the Federal Government announces the official date.", dates: [{ year: 2026, date: "2026-08-26" }, { year: 2027, date: "2027-08-15" }] },
  // International & social observances (optional)
  { key: "valentines", name: "Valentine's Day", category: "INTERNATIONAL", rule: "FIXED", month: 2, day: 14, audience: "INTERNAL", active: false },
  { key: "engineering-day", name: "World Engineering Day", category: "INTERNATIONAL", rule: "FIXED", month: 3, day: 4, audience: "BOTH", active: true },
  { key: "womens-day", name: "International Women's Day", category: "INTERNATIONAL", rule: "FIXED", month: 3, day: 8, audience: "BOTH", active: true },
  { key: "childrens-day", name: "Children's Day", category: "INTERNATIONAL", rule: "FIXED", month: 5, day: 27, audience: "INTERNAL", active: false },
  { key: "environment-day", name: "World Environment Day", category: "INTERNATIONAL", rule: "FIXED", month: 6, day: 5, audience: "BOTH", active: false },
  { key: "youth-skills-day", name: "World Youth Skills Day", category: "INTERNATIONAL", rule: "FIXED", month: 7, day: 15, audience: "INTERNAL", active: false },
  { key: "youth-day", name: "International Youth Day", category: "INTERNATIONAL", rule: "FIXED", month: 8, day: 12, audience: "INTERNAL", active: false },
  { key: "mens-day", name: "International Men's Day", category: "INTERNATIONAL", rule: "FIXED", month: 11, day: 19, audience: "INTERNAL", active: false },
];

export type CatalogAutomation = {
  key: string; name: string; description: string; trigger: TriggerType; weekday?: number; dayOfMonth?: number; sendTime: string; eventKey?: string;
  audience: Audience; categories: ContactCategory[]; templateKey: string; senderIdentity: string; isMarketing: boolean; requiresApproval: boolean; leadDays: number; status: "ACTIVE" | "PAUSED";
};

const CUSTOMER_CATS: ContactCategory[] = ["CUSTOMER", "PARTNER"];
const STAFF_CATS: ContactCategory[] = ["STAFF", "MANAGEMENT"];

export const AUTOMATION_CATALOG: CatalogAutomation[] = [
  { key: "weekly-staff", name: "Happy New Week – Staff", description: "Every Monday: motivation + new week greeting for all active staff.", trigger: "WEEKLY", weekday: 1, sendTime: "08:00", audience: "INTERNAL", categories: STAFF_CATS, templateKey: "new-week-staff", senderIdentity: "communications", isMarketing: false, requiresApproval: false, leadDays: 2, status: "ACTIVE" },
  { key: "weekly-customers", name: "Happy New Week – Customers", description: "Every Monday: light relationship greeting to consenting customers & partners.", trigger: "WEEKLY", weekday: 1, sendTime: "09:00", audience: "EXTERNAL", categories: CUSTOMER_CATS, templateKey: "new-week-customers", senderIdentity: "customers", isMarketing: true, requiresApproval: false, leadDays: 2, status: "PAUSED" },
  { key: "monthly-staff", name: "Happy New Month – Staff", description: "First day of every month.", trigger: "MONTHLY", dayOfMonth: 1, sendTime: "08:00", audience: "INTERNAL", categories: STAFF_CATS, templateKey: "new-month-staff", senderIdentity: "communications", isMarketing: false, requiresApproval: false, leadDays: 3, status: "ACTIVE" },
  { key: "monthly-customers", name: "Happy New Month – Customers", description: "First day of every month to consenting customers.", trigger: "MONTHLY", dayOfMonth: 1, sendTime: "09:00", audience: "EXTERNAL", categories: CUSTOMER_CATS, templateKey: "new-month-customers", senderIdentity: "customers", isMarketing: true, requiresApproval: false, leadDays: 3, status: "PAUSED" },
  { key: "birthday-staff", name: "Staff Birthday Greetings", description: "On each employee's birthday.", trigger: "BIRTHDAY", sendTime: "08:00", audience: "INTERNAL", categories: ["STAFF", "MANAGEMENT", "CONTRACTOR"], templateKey: "birthday-staff", senderIdentity: "hr", isMarketing: false, requiresApproval: false, leadDays: 1, status: "ACTIVE" },
  { key: "birthday-customers", name: "Customer Birthday Greetings", description: "On a customer's birthday, where provided and consented.", trigger: "BIRTHDAY", sendTime: "09:00", audience: "EXTERNAL", categories: ["CUSTOMER", "PARTNER"], templateKey: "birthday-customers", senderIdentity: "customers", isMarketing: true, requiresApproval: false, leadDays: 1, status: "PAUSED" },
  { key: "work-anniversary", name: "Employment Anniversary", description: "On each employee's work anniversary (from date joined).", trigger: "WORK_ANNIVERSARY", sendTime: "08:00", audience: "INTERNAL", categories: ["STAFF", "MANAGEMENT"], templateKey: "work-anniversary", senderIdentity: "hr", isMarketing: false, requiresApproval: false, leadDays: 1, status: "ACTIVE" },
  ...(["christmas", "new-year", "independence-day", "workers-day", "democracy-day", "eid-fitr", "eid-adha", "eid-maulud", "womens-day", "engineering-day"] as const).map(
    (k): CatalogAutomation => ({
      key: `event-${k}`, name: `${EVENT_CATALOG.find((e) => e.key === k)!.name} Greetings`, description: "Festive greeting to staff and consenting customers. Requires management approval.",
      trigger: "CALENDAR_EVENT", eventKey: k, sendTime: "08:00", audience: "BOTH", categories: [...STAFF_CATS, ...CUSTOMER_CATS], templateKey: k, senderIdentity: "communications",
      isMarketing: true, requiresApproval: true, leadDays: 7, status: "ACTIVE",
    })
  ),
  { key: "event-easter", name: "Easter Greetings", description: "Easter Sunday greeting. Requires confirmation and approval.", trigger: "CALENDAR_EVENT", eventKey: "easter-sunday", sendTime: "08:00", audience: "BOTH", categories: [...STAFF_CATS, ...CUSTOMER_CATS], templateKey: "easter", senderIdentity: "communications", isMarketing: true, requiresApproval: true, leadDays: 7, status: "ACTIVE" },
];

export const SEGMENT_CATALOG: { name: string; description: string; audience: Audience; rules: SegmentRules }[] = [
  { name: "All Active Staff", description: "Every active employee and manager", audience: "INTERNAL", rules: { categories: ["STAFF", "MANAGEMENT"] } },
  { name: "Staff in the ICT Department", description: "", audience: "INTERNAL", rules: { departments: ["ICT"] } },
  { name: "Staff with birthdays this month", description: "", audience: "INTERNAL", rules: { birthdayThisMonth: true } },
  { name: "All Customers", description: "Existing and former customers", audience: "EXTERNAL", rules: { categories: ["CUSTOMER", "FORMER_CUSTOMER"] } },
  { name: "Customers in Lagos", description: "", audience: "EXTERNAL", rules: { categories: ["CUSTOMER"], cities: ["Lagos"] } },
  { name: "Customers currently working with AOJ", description: "Active relationship status", audience: "EXTERNAL", rules: { categories: ["CUSTOMER"], relationshipStatus: ["Active"] } },
  { name: "Customers with completed projects", description: "", audience: "EXTERNAL", rules: { categories: ["CUSTOMER", "FORMER_CUSTOMER"], projectStages: ["Completed", "Maintenance"] } },
  { name: "Customers with birthdays this month", description: "", audience: "EXTERNAL", rules: { categories: ["CUSTOMER"], birthdayThisMonth: true } },
  { name: "Business Partners", description: "", audience: "EXTERNAL", rules: { categories: ["PARTNER"] } },
  { name: "Prospective Customers", description: "", audience: "EXTERNAL", rules: { categories: ["PROSPECT"], marketingConsentOnly: true } },
];
