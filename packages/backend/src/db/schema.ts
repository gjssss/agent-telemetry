import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const sessionMetrics = sqliteTable(
  'session_metrics',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    sessionId: text('session_id').notNull(),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at').notNull(),
    uploadedAt: text('uploaded_at').notNull(),
    model: text('model').notNull(),
    modelProvider: text('model_provider'),
    reasoningEffort: text('reasoning_effort'),
    cliVersion: text('cli_version'),
    modelContextWindow: integer('model_context_window'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
    reasoningOutputTokens: integer('reasoning_output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    apiCallCount: integer('api_call_count').notNull().default(0),
    conversationTurnCount: integer('conversation_turn_count').notNull().default(0),
    userMessageCount: integer('user_message_count').notNull().default(0),
    toolCallCount: integer('tool_call_count').notNull().default(0),
    inputCost: integer('input_cost').notNull().default(0),
    outputCost: integer('output_cost').notNull().default(0),
    cachedInputCost: integer('cached_input_cost').notNull().default(0),
    reasoningOutputCost: integer('reasoning_output_cost').notNull().default(0),
    totalCost: integer('total_cost').notNull().default(0),
  },
  table => [
    uniqueIndex('session_metrics_user_provider_session_unique').on(table.userId, table.provider, table.sessionId),
  ],
)

export const uploadBatches = sqliteTable('upload_batches', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  receivedCount: integer('received_count').notNull().default(0),
  insertedCount: integer('inserted_count').notNull().default(0),
  updatedCount: integer('updated_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
})

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  metrics: many(sessionMetrics),
  uploadBatches: many(uploadBatches),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const sessionMetricsRelations = relations(sessionMetrics, ({ one }) => ({
  user: one(user, {
    fields: [sessionMetrics.userId],
    references: [user.id],
  }),
}))

export const uploadBatchesRelations = relations(uploadBatches, ({ one }) => ({
  user: one(user, {
    fields: [uploadBatches.userId],
    references: [user.id],
  }),
}))
