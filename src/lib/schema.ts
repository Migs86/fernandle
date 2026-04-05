import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  bigserial,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleId: text("google_id").unique().notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(), // 6-char nanoid
  name: text("name").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  currentWord: text("current_word").notNull(), // NEVER sent to client
  wordIndex: integer("word_index").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const roomMembers = pgTable(
  "room_members",
  {
    roomId: text("room_id")
      .references(() => rooms.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.userId] })]
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: text("room_id")
      .references(() => rooms.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    wordIndex: integer("word_index").notNull(),
    status: text("status", { enum: ["playing", "won", "lost"] })
      .default("playing")
      .notNull(),
    hintAttempts: integer("hint_attempts").default(0).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("games_room_user_word_idx").on(
      table.roomId,
      table.userId,
      table.wordIndex
    ),
  ]
);

export const guesses = pgTable("guesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id")
    .references(() => games.id, { onDelete: "cascade" })
    .notNull(),
  guess: text("guess").notNull(), // 5-letter word
  position: integer("position").notNull(), // 1-6
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const skipVotes = pgTable(
  "skip_votes",
  {
    roomId: text("room_id")
      .references(() => rooms.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    wordIndex: integer("word_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.userId, table.wordIndex] }),
  ]
);

export const playerStats = pgTable("player_stats", {
  userId: uuid("user_id")
    .references(() => users.id)
    .primaryKey(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  gamesWon: integer("games_won").default(0).notNull(),
  currentStreak: integer("current_streak").default(0).notNull(),
  maxStreak: integer("max_streak").default(0).notNull(),
  guessDistribution: jsonb("guess_distribution")
    .$type<number[]>()
    .default([0, 0, 0, 0, 0, 0])
    .notNull(),
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
});

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("push_sub_endpoint_idx").on(table.endpoint)]
);

export const roomEvents = pgTable(
  "room_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    roomId: text("room_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_room_events_room").on(table.roomId, table.id)]
);
