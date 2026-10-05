import type { DbUser } from "../db-types";
import { getSupabaseAdmin } from "./admin";

const USER_COLUMNS = "id,email,password_hash,display_name,created_at";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
};

export async function findUserByEmailViaSupabase(
  email: string
): Promise<DbUser | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select(USER_COLUMNS)
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as UserRow | null) ?? null;
}

export async function findUserByIdViaSupabase(
  id: string
): Promise<DbUser | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select(USER_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as UserRow | null) ?? null;
}

export async function insertUserViaSupabase(input: {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
}): Promise<DbUser> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .insert({
      id: input.id,
      email: input.email.toLowerCase(),
      password_hash: input.passwordHash,
      display_name: input.displayName,
    })
    .select(USER_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("创建用户失败");
  return data as UserRow;
}
