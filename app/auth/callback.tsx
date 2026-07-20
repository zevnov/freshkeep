import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

const SAFETY_TIMEOUT_MS = 10000;

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // This route serves as a landing spot for deep links like freshkeep://auth/callback
    // The actual code exchange is being handled by the signInWithGoogle promise in AuthContext.
    // We wait for the resulting auth state change instead of guessing with a fixed delay.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        router.replace("/(tabs)");
      }
    });

    const safetyTimeout = setTimeout(() => {
      router.replace("/");
    }, SAFETY_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
