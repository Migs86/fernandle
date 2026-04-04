import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "./db";
import { users, playerStats } from "./schema";
import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "google") return false;
      const googleId = account.providerAccountId;

      // Upsert user
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.googleId, googleId))
        .limit(1);

      if (existing.length === 0) {
        const [newUser] = await db
          .insert(users)
          .values({
            googleId,
            name: user.name || "Player",
            email: user.email || "",
            avatarUrl: user.image,
          })
          .returning();

        // Initialize stats
        await db.insert(playerStats).values({ userId: newUser.id });
      }

      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        // First sign-in: look up our internal user ID
        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.googleId, account.providerAccountId))
          .limit(1);
        if (dbUser) {
          token.userId = dbUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
