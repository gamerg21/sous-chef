import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { normalizeEmail } from "./auth-utils";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          // Normalize email for consistent lookup
          const normalizedEmail = normalizeEmail(credentials.email);

          const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
          });

          if (!user || !user.password) {
            // Don't reveal whether user exists or not (security best practice)
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            console.log("[AUTH] Password validation failed for:", normalizedEmail);
            return null;
          }

          console.log("[AUTH] Credentials validated successfully for:", normalizedEmail);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        } catch (error) {
          console.error("[AUTH] Authorization error:", error);
          // Return null on any error to prevent information leakage
          return null;
        }
      },
    }),
    EmailProvider({
      server: process.env.SMTP_HOST && process.env.SMTP_PORT
        ? {
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD
              ? {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASSWORD,
                }
              : undefined,
          }
        : undefined,
      from: process.env.SMTP_FROM || process.env.EMAIL_FROM || "noreply@example.com",
    }),
  ],
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify-request",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // If url is relative, construct full URL
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      // If url is from same origin, allow it
      try {
        const urlObj = new URL(url);
        if (urlObj.origin === baseUrl) {
          return url;
        }
      } catch {
        // Invalid URL, fall through to default
      }
      // Default to inventory page after sign in
      return `${baseUrl}/inventory`;
    },
    async signIn({ user, account, profile }) {
      try {
        console.log("[AUTH] SignIn callback called", { userId: user?.id, email: user?.email });
        // Auto-create household and preferences for new users on first sign in
        if (user?.id) {
          const { ensureUserHasHousehold } = await import("./household");
          const { getOrCreateUserPreferences } = await import("./preferences");
          
          // Create household if needed (fail silently if user doesn't exist)
          try {
            console.log("[AUTH] Ensuring household for user:", user.id);
            await ensureUserHasHousehold(user.id);
            console.log("[AUTH] Household ensured successfully");
          } catch (error) {
            console.error("[AUTH] Error ensuring household:", error);
            // Continue even if household creation fails - user can still sign in
          }
          
          // Create preferences if needed (fail silently if user doesn't exist)
          try {
            console.log("[AUTH] Ensuring preferences for user:", user.id);
            await getOrCreateUserPreferences(user.id);
            console.log("[AUTH] Preferences ensured successfully");
          } catch (error) {
            console.error("[AUTH] Error ensuring preferences:", error);
            // Continue even if preferences creation fails - user can still sign in
          }
        } else {
          console.warn("[AUTH] SignIn callback: user.id is missing", { user });
        }
        return true;
      } catch (error) {
        console.error("[AUTH] SignIn callback error:", error);
        // Allow sign-in to proceed even if callbacks fail
        return true;
      }
    },
    async jwt({ token, user, account }) {
      // When user signs in, add user id to token
      if (user) {
        token.id = user.id;
        token.email = user.email;
        console.log("[AUTH] JWT callback: user signed in, token updated with id:", user.id);
      }
      return token;
    },
    async session({ session, token }) {
      try {
        console.log("[AUTH] Session callback called (JWT strategy)", { 
          sessionUser: session?.user?.email, 
          tokenId: token?.id,
          tokenEmail: token?.email,
          hasSession: !!session,
          hasToken: !!token
        });
        
        // With JWT strategy, user info comes from token
        if (session.user && token) {
          if (token.id) {
            session.user.id = token.id as string;
            console.log("[AUTH] Session updated with user id from token:", token.id);
          } else if (token.email) {
            // Fallback: look up user by email if id not in token
            try {
              const normalizedEmail = normalizeEmail(token.email as string);
              const dbUser = await prisma.user.findUnique({
                where: { email: normalizedEmail },
                select: { id: true },
              });
              if (dbUser) {
                session.user.id = dbUser.id;
                console.log("[AUTH] Session updated with user id from database lookup:", dbUser.id);
              } else {
                console.warn("[AUTH] Session callback: user not found in database for email:", normalizedEmail);
              }
            } catch (error) {
              console.error("[AUTH] Session callback: error looking up user:", error);
            }
          } else {
            console.warn("[AUTH] Session callback: no user id or email in token", { 
              hasSessionUser: !!session?.user,
              hasToken: !!token,
              tokenKeys: token ? Object.keys(token) : []
            });
          }
        }
        return session;
      } catch (error) {
        console.error("[AUTH] Session callback error:", error);
        // Return session even if there's an error
        return session;
      }
    },
  },
  session: {
    strategy: "jwt", // Use JWT for CredentialsProvider compatibility
  },
  secret: process.env.NEXTAUTH_SECRET,
};

