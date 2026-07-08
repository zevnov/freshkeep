import Constants from "expo-constants";

export function getAppName(fallback = "Freshkeep"): string {
  return Constants.expoConfig?.name?.trim() || fallback;
}
