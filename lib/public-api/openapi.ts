const bearerSecurity = [{ bearerAuth: [] }];

export const prophraseOpenApi = {
  openapi: "3.1.0",
  info: {
    title: "ProPhrase API",
    version: "1.0.0",
    description: "Rephrase work messages and prepare outcome-focused messages using the same ProPhrase engine as the web application.",
  },
  servers: [{ url: "https://prophrase.in/api/v1", description: "Production" }],
  paths: {
    "/rephrase": {
      post: {
        summary: "Rephrase a message",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RephraseRequest" } } },
        },
        responses: {
          "200": { description: "Message rephrased", content: { "application/json": { schema: { $ref: "#/components/schemas/RephraseResponse" } } } },
          "400": { $ref: "#/components/responses/Error" },
          "401": { $ref: "#/components/responses/Error" },
          "402": { $ref: "#/components/responses/Error" },
          "429": { $ref: "#/components/responses/Error" },
          "502": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/outcome-assistant": {
      post: {
        summary: "Prepare Safe, Balanced, and Firm alternatives",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/OutcomeRequest" } } },
        },
        responses: {
          "200": { description: "Three message alternatives", content: { "application/json": { schema: { $ref: "#/components/schemas/OutcomeResponse" } } } },
          "400": { $ref: "#/components/responses/Error" },
          "401": { $ref: "#/components/responses/Error" },
          "402": { $ref: "#/components/responses/Error" },
          "429": { $ref: "#/components/responses/Error" },
          "502": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/credits": {
      get: {
        summary: "Get the current credit balance",
        security: bearerSecurity,
        responses: {
          "200": { description: "Credit balance", content: { "application/json": { schema: { type: "object" } } } },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Supabase JWT" },
    },
    responses: {
      Error: {
        description: "API error",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["code", "message"],
        properties: { code: { type: "string" }, error: { type: "string" }, message: { type: "string" } },
      },
      RephraseRequest: {
        type: "object",
        required: ["text", "tone"],
        properties: {
          text: { type: "string", minLength: 3, maxLength: 5000 },
          tone: { type: "string", enum: ["Professional", "Polite", "Shorter", "Short & Crisp", "Human", "Email", "Slack", "Teams", "Jira Comment", "WhatsApp", "Client-safe", "Manager-friendly", "Firmer"] },
          instruction: { type: "string", minLength: 3, maxLength: 240 },
          threadId: { type: "string", format: "uuid" },
        },
      },
      RephraseResponse: {
        type: "object",
        required: ["requestId", "result", "warnings", "threadId"],
        properties: {
          requestId: { type: "string" }, result: { type: "string" }, warnings: { type: "array", items: { type: "object" } },
          threadId: { type: "string", format: "uuid" }, promptVersion: { type: "string" }, repaired: { type: "boolean" },
          usage: { type: "object" }, credits: { type: "object" },
        },
      },
      OutcomeRequest: {
        type: "object",
        required: ["originalText", "recipient", "intent"],
        properties: {
          originalText: { type: "string", minLength: 3, maxLength: 5000 },
          recipient: { type: "string", enum: ["manager", "senior_leader", "client", "customer", "colleague", "direct_report", "recruiter", "vendor", "friend", "family", "other"] },
          customRecipient: { type: "string", maxLength: 80 },
          intent: { type: "string", enum: ["request", "follow_up", "approval", "status_update", "escalation", "disagreement", "rejection", "boundary", "payment_request", "apology", "clarification", "negotiation", "extension_request", "feedback", "criticism_response", "other"] },
          customIntent: { type: "string", maxLength: 120 },
          relationshipLevel: { type: "string", enum: ["new", "formal", "regular", "comfortable", "difficult"] },
          urgency: { type: "string", enum: ["none", "today", "few_days", "urgent", "critical"] },
          desiredResponse: { type: "string", maxLength: 150 },
          channel: { type: "string", enum: ["whatsapp", "email", "slack_teams", "sms", "linkedin", "other"], default: "email" },
          lockedFacts: { type: "array", maxItems: 30, items: { type: "string", maxLength: 120 }, default: [] },
          languageMode: { type: "string", enum: ["standard", "indian_workplace"], default: "standard" },
        },
      },
      OutcomeResponse: {
        type: "object",
        required: ["requestId", "understoodIntent", "variants", "globalWarnings", "missingInformation"],
        properties: {
          requestId: { type: "string" }, understoodIntent: { type: "string" },
          variants: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", properties: { id: { type: "string", enum: ["safe", "balanced", "firm"] }, message: { type: "string" }, readerInterpretation: { type: "string" }, risks: { type: "array", items: { type: "object" } }, factVerification: { type: "array", items: { type: "object" } }, commitmentWarnings: { type: "array", items: { type: "object" } } } } },
          globalWarnings: { type: "array", items: { type: "string" } }, missingInformation: { type: "array", items: { type: "string" } },
          usage: { type: "object" }, credits: { type: "object" }, metadata: { type: "object" },
        },
      },
    },
  },
} as const;
