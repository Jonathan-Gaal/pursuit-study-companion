/** Fixed V1 safety ceilings. Increasing them requires a deliberate code/config review. */
export const limits = Object.freeze({
  maxFileBytes: 2 * 1024 * 1024,
  maxTasks: 100,
  maxDays: 14,
  maxConcepts: 12,
  maxTextChars: 32_000,
  maxOutputChars: 60_000,
  maxAggregateOutputChars: 500_000,
  maxNodes: 20_000,
  maxDepth: 12,
  maxProviderCalls: 112,
  providerTimeoutMs: 2_000,
  runTimeoutMs: 30_000,
  maxConversationTurns: 3,
  // Paid/network providers are disabled; both budgets must remain zero in V1.
  allowExternalAI: false,
  maxPaidCalls: 0,
  maxPaidTokens: 0,
});
