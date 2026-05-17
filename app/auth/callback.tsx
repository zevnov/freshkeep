import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // This route serves as a landing spot for deep links like freshkeep://auth/callback
    // The actual code exchange is being handled by the signInWithGoogle promise in AuthContext.
    // We just need to make sure expo-router doesn't show a 404.
    const timeout = setTimeout(() => {
      router.replace("/");
    }, 1000);
    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
