/**
 * M03-1: a partner only needs enough of an invitee/inviter email to recognize who they are,
 * not the full address. `"alice@gmail.com"` -> `"a***@gmail.com"`.
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return null;
  return `${email[0]}***${email.slice(at)}`;
}
