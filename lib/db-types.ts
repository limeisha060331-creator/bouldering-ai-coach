export type DbUser = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
};
