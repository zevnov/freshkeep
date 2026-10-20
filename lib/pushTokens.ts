import { getExpoPushTokenAsync } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import { Platform } from "react-native";

/** EAS project id from app config; remote pushes need one (run `eas init` to create it). */
function easProjectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromExtra ?? Constants.easConfig?.projectId ?? undefined;
}

let registeredToken: string | null = null;

/**
 * Stores this device's Expo push token for the signed-in user so the server can send
 * household and recall pushes. Silent no-op without notification permission.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  const token = await getExpoPushTokenAsync(easProjectId());
  if (!token) return;
  const { error } = await supabase.rpc("register_push_token", { device_token: token, device_platform: Platform.OS });
  if (error) throw new Error(error.message);
  registeredToken = token;
}

export function hasRegisteredPushToken(): boolean {
  return registeredToken != null;
}

/**
 * Call before signing out so the next person on this device doesn't get the previous user's
 * pushes. Throws if the delete fails (e.g. offline); the token is kept so a retry can try again.
 * If sign-out goes ahead anyway, the next account to sign in on this device takes the token over.
 */
export async function unregisterPushToken(): Promise<void> {
  if (!registeredToken) return;
  const { error } = await supabase.from("push_tokens").delete().eq("token", registeredToken);
  if (error) throw new Error(`Could not unregister push token: ${error.message}`);
  registeredToken = null;
}
