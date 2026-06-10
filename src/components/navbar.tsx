"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, User, LogOut, Trophy } from "lucide-react";

export function Navbar() {
  const { user, profile, loading, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🍲</span>
          <span className="text-xl font-bold text-warm-green">Potluck</span>
        </Link>

        <nav className="flex items-center gap-3">
          {!loading && (
            <>
              {user ? (
                <>
                  <Button asChild size="sm" className="hidden sm:inline-flex">
                    <Link href="/create">
                      <Plus className="mr-1.5 h-4 w-4" />
                      New Potluck
                    </Link>
                  </Button>
                  <Button asChild size="icon" variant="outline" className="sm:hidden h-9 w-9">
                    <Link href="/create" aria-label="New potluck">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        aria-label="Account menu"
                        className="relative h-9 w-9 rounded-full"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage
                            src={profile?.avatar_url || undefined}
                            alt={profile?.display_name || ""}
                          />
                          <AvatarFallback className="bg-warm-green text-white text-sm">
                            {profile?.display_name?.charAt(0).toUpperCase() ||
                              "U"}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <div className="flex items-center gap-2 p-2">
                        <div className="flex flex-col space-y-0.5">
                          <p className="text-sm font-medium">
                            {profile?.display_name}
                          </p>
                          {profile && profile.total_points > 0 && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Trophy className="h-3 w-3" />
                              {profile.total_points} points
                            </p>
                          )}
                        </div>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/profile" className="cursor-pointer">
                          <User className="mr-2 h-4 w-4" />
                          Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={async () => {
                          try {
                            await signOut();
                          } finally {
                            window.location.href = "/";
                          }
                        }}
                        className="cursor-pointer text-destructive"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/auth/login">Sign In</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href="/auth/login">Get Started</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
