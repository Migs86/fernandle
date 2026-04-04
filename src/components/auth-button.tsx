"use client";

import { signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type AuthButtonProps = {
  user?: {
    name?: string | null;
    image?: string | null;
  } | null;
};

export function AuthButton({ user }: AuthButtonProps) {
  if (user) {
    return (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.image || undefined} />
          <AvatarFallback className="text-xs">
            {(user.name || "?").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium hidden sm:inline">{user.name}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={() => signIn("google")} size="sm">
      Sign in with Google
    </Button>
  );
}
