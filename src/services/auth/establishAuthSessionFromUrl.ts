import { getSupabaseClient } from "@/lib/supabaseClient";
import { extractAuthParams } from "@/services/auth/authUrlParams";

/**
 * @description Établit la session Supabase à partir des jetons présents dans l'URL.
 * @param rawUrl - URL contenant code ou access_token / refresh_token.
 * @returns true si une session a été créée ou mise à jour.
 */
export async function establishAuthSessionFromUrl(
  rawUrl: string,
): Promise<boolean> {
  const params = extractAuthParams(rawUrl);
  const code = params.get("code");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!code && !(accessToken && refreshToken)) {
    return false;
  }

  const supabase = getSupabaseClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw new Error(error.message);
    }
    return true;
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken!,
    refresh_token: refreshToken!,
  });
  if (error) {
    throw new Error(error.message);
  }
  return true;
}
