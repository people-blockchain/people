"use server";

import { signOut } from "@/auth";

export async function signOutPartner() {
  await signOut({ redirectTo: "/" });
}
