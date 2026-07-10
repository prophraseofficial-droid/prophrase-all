import type { Tone } from "@/lib/tones";

export type RewriteTemplate = {
  id: string;
  title: string;
  category: string;
  tone: Tone;
  body: string;
};

export const rewriteTemplates: RewriteTemplate[] = [
  {
    id: "professional-update",
    title: "Professional update",
    category: "Work",
    tone: "Professional",
    body: "Please review this update and let me know if anything needs to be adjusted.",
  },
  {
    id: "gentle-follow-up",
    title: "Gentle follow-up",
    category: "Work",
    tone: "Human",
    body: "Just following up on this. Please let me know when you get a chance.",
  },
  {
    id: "jira-status",
    title: "Jira status",
    category: "Engineering",
    tone: "Jira Comment",
    body: "Work is in progress. I will update this ticket once the fix is ready for review.",
  },
  {
    id: "client-reply",
    title: "Client reply",
    category: "Support",
    tone: "Email",
    body: "Thanks for sharing the details. I will check this and get back to you shortly.",
  },
];
