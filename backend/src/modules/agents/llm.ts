import Anthropic from '@anthropic-ai/sdk';

/** Модель агентов; переопределяется AGENT_MODEL. Нужна поддержка изображений. */
export const agentModel = () => process.env.AGENT_MODEL?.trim() || 'claude-sonnet-5-5';

let client: Anthropic | null = null;

export const hasLlm = () => !!process.env.ANTHROPIC_API_KEY?.trim();

/** Клиент создаётся лениво: без ключа остальной бэкенд не должен падать на импорте. */
export function llm(): Anthropic {
  if (!hasLlm()) throw new Error('ANTHROPIC_API_KEY не задан');
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });
  return client;
}
