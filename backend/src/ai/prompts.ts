/**
 * Centralized prompt templates.
 *
 * Each function returns a (system, user) pair so we can swap providers /
 * models without rewriting feature code. Keeping prompts in one file also
 * makes it easy to version + evaluate them later.
 */

export const PROMPTS = {
  classify(text: string, categories: string[]) {
    return {
      system:
        'You are a precise lead-classification engine. Given a short lead description, return JSON {"category":"<one of provided>","confidence":0..1,"reason":"short"}.',
      user: `Categories: ${categories.join(', ')}\n\nLead:\n${text}`,
    };
  },

  sentiment(text: string) {
    return {
      system:
        'Classify the sentiment of the text. Return JSON {"sentiment":"positive|neutral|negative","score":-1..1,"reason":"short"}.',
      user: text,
    };
  },

  summarize(text: string, maxWords: number) {
    return {
      system: `Summarize the user input in at most ${maxWords} words. Return JSON {"summary":"..."}.`,
      user: text,
    };
  },

  generateEmail(params: {
    tone: string;
    goal: string;
    recipientName?: string;
    recipientCompany?: string;
    context?: unknown;
  }) {
    return {
      system:
        'You write short, sincere B2B outbound emails. Always return JSON {"subject":"...","bodyHtml":"<p>...</p>","bodyText":"..."}.',
      user: [
        `Tone: ${params.tone}`,
        `Goal: ${params.goal}`,
        params.recipientName ? `Recipient name: ${params.recipientName}` : '',
        params.recipientCompany ? `Recipient company: ${params.recipientCompany}` : '',
        params.context ? `Context: ${JSON.stringify(params.context).slice(0, 1500)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  },
} as const;
