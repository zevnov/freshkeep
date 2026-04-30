import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { radius, spacing } from "@/constants/theme";
import { lookupBarcodeProduct, type BarcodeLookupResult } from "@/lib/barcodeLookup";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type ScanRouteParams = {
  returnTo?: string;
  itemId?: string;
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#000" },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    title: { fontSize: 18, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
    primaryBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
    },
    primaryBtnText: { color: colors.onPrimary, fontWeight: "700" },
    secondaryBtn: { marginTop: spacing.xs, paddingVertical: 10, paddingHorizontal: spacing.md },
    secondaryBtnText: { color: colors.primary, fontWeight: "600" },
    overlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.35)",
      padding: spacing.lg,
    },
    overlayTitle: { fontSize: 22, fontWeight: "700", color: colors.overlay },
    overlaySub: { fontSize: 14, color: colors.overlayMuted, marginTop: spacing.xs },
    frame: {
      width: 260,
      height: 160,
      borderWidth: 2,
      borderColor: colors.overlay,
      borderRadius: radius.md,
      marginTop: spacing.lg,
      backgroundColor: "transparent",
    },
    controlsRow: {
      marginTop: spacing.lg,
      flexDirection: "row",
      gap: spacing.sm,
    },
    overlayBtn: {
      borderWidth: 1,
      borderColor: colors.overlay,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
    },
    overlayBtnText: { color: colors.overlay, fontWeight: "700" },
    resultCard: {
      width: "100%",
      marginTop: spacing.lg,
      backgroundColor: "rgba(20, 30, 20, 0.92)",
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    resultTitle: { color: colors.overlay, fontSize: 16, fontWeight: "700" },
    resultMeta: { color: colors.overlayMuted, fontSize: 13 },
    resultActions: { marginTop: spacing.xs, gap: spacing.xs },
    resultBtn: {
      borderWidth: 1,
      borderColor: colors.overlay,
      borderRadius: radius.md,
      paddingVertical: 10,
      alignItems: "center",
    },
    resultBtnText: { color: colors.overlay, fontWeight: "700" },
    resultBtnPrimary: { backgroundColor: colors.overlay, borderColor: colors.overlay },
    resultBtnPrimaryText: { color: colors.primary, fontWeight: "800" },
  });
}

export default function ScanBarcodeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { returnTo, itemId } = useLocalSearchParams<ScanRouteParams>();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [handledCode, setHandledCode] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [scanResult, setScanResult] = useState<BarcodeLookupResult | null>(null);

  const destination = useMemo(() => {
    const pathname = returnTo === "add-item" ? "/add-item" : "/add-item";
    return pathname;
  }, [returnTo]);

  const goBackWithResult = useCallback(
    (payload: {
      barcode: string;
      name: string | null;
      quantity: number | null;
      unit: string | null;
      notes: string | null;
    }) => {
      router.replace({
        pathname: destination,
        params: {
          ...(itemId ? { id: itemId } : {}),
          scan_code: payload.barcode,
          scan_name: payload.name ?? "",
          scan_qty: payload.quantity == null ? "" : String(payload.quantity),
          scan_unit: payload.unit ?? "",
          scan_notes: payload.notes ?? "",
          scan_at: String(Date.now()),
        },
      });
    },
    [destination, itemId]
  );

  const onBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      const code = data.trim();
      if (!code || busy || handledCode === code || scanResult) return;
      setHandledCode(code);
      setBusy(true);
      const result = await lookupBarcodeProduct(code);
      setBusy(false);
      setScanResult(result);
    },
    [busy, handledCode, scanResult]
  );

  const retryLookup = useCallback(async () => {
    if (!handledCode || busy) return;
    setBusy(true);
    const result = await lookupBarcodeProduct(handledCode);
    setBusy(false);
    setScanResult(result);
  }, [busy, handledCode]);

  const resetScan = useCallback(() => {
    setBusy(false);
    setScanResult(null);
    setHandledCode(null);
  }, []);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.subtitle}>Allow camera permission to scan barcodes.</Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => {
            void requestPermission();
          }}
        >
          <Text style={styles.primaryBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={onBarcodeScanned}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>Scan a barcode</Text>
        <Text style={styles.overlaySub}>We will auto-fill what we can.</Text>
        <View style={styles.frame} />
        {busy ? <ActivityIndicator color={colors.overlay} style={{ marginTop: spacing.md }} /> : null}

        <View style={styles.controlsRow}>
          <Pressable style={styles.overlayBtn} onPress={() => setTorchOn((v) => !v)}>
            <Text style={styles.overlayBtnText}>{torchOn ? "Flashlight off" : "Flashlight on"}</Text>
          </Pressable>
          <Pressable style={styles.overlayBtn} onPress={() => router.back()}>
            <Text style={styles.overlayBtnText}>Cancel</Text>
          </Pressable>
        </View>

        {scanResult ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{scanResult.name ?? "Product not found"}</Text>
            <Text style={styles.resultMeta}>Barcode: {scanResult.barcode}</Text>
            {scanResult.quantity != null || scanResult.unit ? (
              <Text style={styles.resultMeta}>
                Parsed: {[scanResult.quantity != null ? String(scanResult.quantity) : null, scanResult.unit]
                  .filter(Boolean)
                  .join(" ")}
              </Text>
            ) : null}
            {scanResult.notes ? <Text style={styles.resultMeta}>{scanResult.notes}</Text> : null}

            <View style={styles.resultActions}>
              <Pressable style={[styles.resultBtn, styles.resultBtnPrimary]} onPress={() => goBackWithResult(scanResult)}>
                <Text style={styles.resultBtnPrimaryText}>Use this result</Text>
              </Pressable>
              <Pressable style={styles.resultBtn} onPress={resetScan}>
                <Text style={styles.resultBtnText}>Scan again</Text>
              </Pressable>
              {!scanResult.name ? (
                <Pressable style={styles.resultBtn} onPress={() => void retryLookup()}>
                  <Text style={styles.resultBtnText}>Retry lookup</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
