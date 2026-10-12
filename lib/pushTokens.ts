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

/** Call before signing out so the next person on this device doesn't get the previous user's pushes. */
export async function unregisterPushToken(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await supabase.from("push_tokens").delete().eq("token", token);
}
