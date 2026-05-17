import { EditorialHeading } from "@/components/EditorialHeading";
import { radius, spacing } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { lookupBarcodeProduct, type BarcodeLookupResult } from "@/lib/barcodeLookup";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type ScanRouteParams = {
  returnTo?: string;
  itemId?: string;
};

export default function ScanBarcodeScreen() {
  const { colors } = useTheme();
  const { itemId } = useLocalSearchParams<ScanRouteParams>();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [handledCode, setHandledCode] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [scanResult, setScanResult] = useState<BarcodeLookupResult | null>(null);

  const destination = useMemo(() => {
    return "/add-item";
  }, []);

  const goBackWithResult = useCallback(
    (payload: {
      barcode: string;
      name: string | null;
      quantity: number | null;
      unit: string | null;
      notes: string | null;
    }) => {
      router.replace({
        pathname: destination as any,
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

  const resetScan = useCallback(() => {
    setBusy(false);
    setScanResult(null);
    setHandledCode(null);
  }, []);

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <EditorialHeading bold="Camera" italic="access." size={32} color={colors.text} />
        <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 8, marginBottom: 24 }}>
          Allow camera permission to scan barcodes.
        </Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.brandBtn }]}
          onPress={() => {
            void requestPermission();
          }}
        >
          <Text style={styles.primaryBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable style={{ marginTop: 16 }} onPress={() => router.back()}>
          <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Cancel</Text>
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
      
      {/* Overlay with Editorial vibe */}
      <View style={styles.overlay}>
        <View style={styles.header}>
            <EditorialHeading bold="Scan" italic="barcode." size={28} color="#fff" />
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 4 }}>
                We'll auto-fill the product info.
            </Text>
        </View>

        <View style={styles.frame}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
        </View>

        {busy && <ActivityIndicator color="#fff" style={{ marginTop: 30 }} />}

        <View style={styles.controlsRow}>
          <Pressable style={styles.overlayBtn} onPress={() => setTorchOn((v) => !v)}>
            <Text style={styles.overlayBtnText}>{torchOn ? "🔦 Off" : "🔦 On"}</Text>
          </Pressable>
          <Pressable style={styles.overlayBtn} onPress={() => router.back()}>
            <Text style={styles.overlayBtnText}>Cancel</Text>
          </Pressable>
        </View>

        {scanResult ? (
          <View style={[styles.resultCard, { backgroundColor: colors.surface }]}>
             {/* Sticker pill */}
            <View
            style={[
                styles.stickerPill,
                {
                backgroundColor: colors.bandBg.fresh,
                transform: [{ rotate: "-2deg" }],
                },
            ]}
            >
            <Text style={[styles.stickerText, { color: colors.bandText.fresh }]}>
                Product found! ✨
            </Text>
            </View>

            <Text style={[styles.resultTitle, { color: colors.text }]}>{scanResult.name ?? "Product not found"}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Barcode: {scanResult.barcode}</Text>
            
            <View style={styles.resultActions}>
              <Pressable style={[styles.resultBtn, { backgroundColor: colors.brandBtn }]} onPress={() => goBackWithResult(scanResult)}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Use this product</Text>
              </Pressable>
              <Pressable style={[styles.resultBtn, { backgroundColor: colors.faint }]} onPress={resetScan}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>Scan again</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  header: {
     position: 'absolute',
     top: 60,
     left: 24,
  },
  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: radius.md,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: spacing.lg,
  },
  frame: {
    width: 280,
    height: 180,
    backgroundColor: "transparent",
    position: 'relative',
    marginTop: 40,
  },
  cornerTL: { position: 'absolute', top: 0, left: 0, width: 30, height: 30, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#fff', borderTopLeftRadius: 12 },
  cornerTR: { position: 'absolute', top: 0, right: 0, width: 30, height: 30, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#fff', borderTopRightRadius: 12 },
  cornerBL: { position: 'absolute', bottom: 0, left: 0, width: 30, height: 30, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#fff', borderBottomLeftRadius: 12 },
  cornerBR: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#fff', borderBottomRightRadius: 12 },
  controlsRow: {
    marginTop: 40,
    flexDirection: "row",
    gap: 12,
  },
  overlayBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  overlayBtnText: { color: "#fff", fontWeight: "600" },
  resultCard: {
    width: "100%",
    position: 'absolute',
    bottom: 40,
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  stickerPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: 12,
  },
  stickerText: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  resultTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  resultActions: { marginTop: 20, gap: 10 },
  resultBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
});
