import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

export type NetworkStatus = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
};

/** Tracks connectivity via NetInfo, refreshed on app foreground in case events were missed while backgrounded. */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({ isConnected: true, isInternetReachable: null });
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const applyState = (state: NetInfoState) => {
      setStatus({
        isConnected: state.isConnected ?? true,
        isInternetReachable: state.isInternetReachable,
      });
    };

    const unsubscribe = NetInfo.addEventListener(applyState);
    void NetInfo.fetch().then(applyState);

    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      if ((prev === "background" || prev === "inactive") && next === "active") {
        void NetInfo.fetch().then(applyState);
      }
      appStateRef.current = next;
    });

    return () => {
      unsubscribe();
      sub.remove();
    };
  }, []);

  return status;
}
