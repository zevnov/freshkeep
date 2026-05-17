import { ConfirmationModal } from "@/components/ConfirmationModal";
import { EditorialHeading } from "@/components/EditorialHeading";
import { radius, spacing } from "@/constants/theme";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import { lookupBarcodeProduct } from "@/lib/barcodeLookup";
import { calculateExpiry } from "@/lib/expiryEngine";
import { detectItem } from "@/lib/keywordDetect";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

interface ScannedItem {
  id: string;
  barcode: string | null;
  name: string;
  category: string | null;
  fridgeDays: number | null;
  freezerDays: number | null;
  perishable: boolean;
  quantity: number;
}

let _idCounter = 0;
function genId(): string {
  _idCounter += 1;
  return String(_idCounter);
}

export default function BulkScanScreen() {
  const { colors } = useTheme();
  const { createItem } = useItems();
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showClearModal, setShowClearModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const handledRef = useRef<Set<string>>(new Set());

  const onBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      const code = data.trim();
      if (!code || lookingUp || handledRef.current.has(code)) return;

      // Duplicate detection: increment quantity for same barcode
      const existing = scannedItems.find((i) => i.barcode === code);
      if (existing) {
        handledRef.current.add(code);
        setScannedItems((prev) =>
          prev.map((i) =>
            i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
          )
        );
        // Allow re-scan after brief cooldown
        setTimeout(() => {
          handledRef.current.delete(code);
        }, 2000);
        return;
      }

      handledRef.current.add(code);
      setLookingUp(true);
      const result = await lookupBarcodeProduct(code);
      setLookingUp(false);

      const productName = result.name ?? "Unknown";
      const detected = detectItem(productName);

      const newItem: ScannedItem = {
        id: genId(),
        barcode: code,
        name: detected ? detected.name : productName,
        category: detected ? detected.category : null,
        fridgeDays: detected ? detected.fridgeDays : null,
        freezerDays: detected ? detected.freezerDays : null,
        perishable: detected ? detected.perishable : true,
        quantity: 1,
      };

      setScannedItems((prev) => [newItem, ...prev]);

      // Allow re-scan after cooldown
      setTimeout(() => {
        handledRef.current.delete(code);
      }, 2000);
    },
    [lookingUp, scannedItems]
  );

  const handleAddManually = useCallback(() => {
    router.push("/add-item");
  }, []);

  const handleDelete = useCallback((id: string) => {
    setScannedItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleStartEdit = useCallback((item: ScannedItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  }, []);

  const handleCommitEdit = useCallback(() => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (trimmed) {
      setScannedItems((prev) =>
        prev.map((i) => (i.id === editingId ? { ...i, name: trimmed } : i))
      );
    }
    setEditingId(null);
    setEditingName("");
  }, [editingId, editingName]);

  const handleDone = useCallback(async () => {
    if (scannedItems.length === 0) {
      router.back();
      return;
    }
    setSaving(true);
    for (const item of scannedItems) {
      const storage = item.perishable ? ("fridge" as const) : ("pantry" as const);
      const { spoilDate: spoilOn } = calculateExpiry(item.name, storage, false);
      await createItem({
        scope: "ours",
        name: item.name,
        storage,
        spoil_on: spoilOn,
        quantity: item.quantity,
        unit: null,
        notes: null,
        remind_me: false,
        remind_days_before: 0,
      });
    }
    setSaving(false);
    router.back();
  }, [scannedItems, createItem]);

  const handleBack = useCallback(() => {
    if (scannedItems.length > 0) {
      setShowExitModal(true);
    } else {
      router.back();
    }
  }, [scannedItems.length]);

  const renderItem = useCallback(
    ({ item }: { item: ScannedItem }) => {
      const isEditing = editingId === item.id;
      const storage = item.perishable ? ("fridge" as const) : ("pantry" as const);
      const { message: expiryLabel } = calculateExpiry(item.name, storage, false);

      const categoryColor = item.category
        ? colors.primaryMuted
        : colors.faint;
      const categoryTextColor = item.category ? colors.brand : colors.textMuted;

      return (
        <View style={[styles.itemCard, { backgroundColor: colors.surface }]}>
          <View style={styles.itemMain}>
            {/* Category pill */}
            <View
              style={[
                styles.categoryPill,
                { backgroundColor: categoryColor },
              ]}
            >
              <Text style={[styles.categoryText, { color: categoryTextColor }]}>
                {item.category ?? "unknown"}
              </Text>
            </View>

            {/* Name (tappable to edit) */}
            {isEditing ? (
              <TextInput
                style={[
                  styles.nameInput,
                  { color: colors.text, borderColor: colors.border },
                ]}
                value={editingName}
                onChangeText={setEditingName}
                onBlur={handleCommitEdit}
                onSubmitEditing={handleCommitEdit}
                autoFocus
                returnKeyType="done"
                accessibilityLabel="Edit item name"
              />
            ) : (
              <Pressable
                onPress={() => handleStartEdit(item)}
                accessibilityRole="button"
                accessibilityLabel={`Edit name: ${item.name}`}
              >
                <Text style={[styles.itemName, { color: colors.text }]}>
                  {item.name}
                </Text>
              </Pressable>
            )}

            {/* Expiry / non-perishable info */}
            <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
              {expiryLabel}
            </Text>
          </View>

          <View style={styles.itemRight}>
            {/* Quantity badge */}
            <View
              style={[styles.qtyBadge, { backgroundColor: colors.faint }]}
            >
              <Text style={[styles.qtyText, { color: colors.text }]}>
                ×{item.quantity}
              </Text>
            </View>

            {/* Delete button */}
            <Pressable
              onPress={() => handleDelete(item.id)}
              style={[styles.deleteBtn, { backgroundColor: colors.danger + "18" }]}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name}`}
            >
              <Text style={[styles.deleteBtnText, { color: colors.danger }]}>
                ✕
              </Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [
      editingId,
      editingName,
      colors,
      handleStartEdit,
      handleCommitEdit,
      handleDelete,
    ]
  );

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
        <EditorialHeading
          bold="Camera"
          italic="access."
          size={32}
          color={colors.text}
        />
        <Text
          style={{
            color: colors.textMuted,
            textAlign: "center",
            marginTop: 8,
            marginBottom: 24,
          }}
        >
          Allow camera permission to scan barcodes.
        </Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.brandBtn }]}
          onPress={() => {
            void requestPermission();
          }}
          accessibilityRole="button"
          accessibilityLabel="Allow camera access"
        >
          <Text style={styles.primaryBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable
          style={{ marginTop: 16 }}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={{ color: colors.textMuted, fontWeight: "600" }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      {/* ── Camera viewport (top 40%) ── */}
      <View style={styles.cameraSection}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{
            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
          }}
          onBarcodeScanned={onBarcodeScanned}
        />

        <View style={styles.cameraOverlay}>
          {/* Header */}
          <View style={styles.cameraHeader}>
            <EditorialHeading
              bold="Bulk"
              italic="scan."
              size={24}
              color="#fff"
            />
            <Text
              style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}
            >
              Scan items one by one to build your list.
            </Text>
          </View>

          {/* Corner frame */}
          <View style={styles.frame}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>

          {lookingUp && (
            <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />
          )}

          {/* Camera controls */}
          <View style={styles.cameraControls}>
            <Pressable
              style={styles.overlayBtn}
              onPress={() => setTorchOn((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={torchOn ? "Turn torch off" : "Turn torch on"}
            >
              <Text style={styles.overlayBtnText}>
                {torchOn ? "🔦 Off" : "🔦 On"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.overlayBtn}
              onPress={handleAddManually}
              accessibilityRole="button"
              accessibilityLabel="Add item manually"
            >
              <Text style={styles.overlayBtnText}>+ Manual</Text>
            </Pressable>
            <Pressable
              style={styles.overlayBtn}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Cancel bulk scan"
            >
              <Text style={styles.overlayBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Scanned item list (bottom 60%) ── */}
      <View style={[styles.listSection, { backgroundColor: colors.bg }]}>
        {/* List header */}
        <View style={[styles.listHeader, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.listTitle, { color: colors.text }]}>
              {scannedItems.length === 0
                ? "No items yet"
                : `${scannedItems.length} item${scannedItems.length !== 1 ? "s" : ""} scanned`}
            </Text>
          </View>
          <View style={styles.listHeaderActions}>
            {scannedItems.length > 0 && (
              <Pressable
                onPress={() => setShowClearModal(true)}
                style={[styles.clearBtn, { backgroundColor: colors.faint }]}
                accessibilityRole="button"
                accessibilityLabel="Clear all scanned items"
              >
                <Text style={[styles.clearBtnText, { color: colors.textMuted }]}>
                  Clear all
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => void handleDone()}
              style={[
                styles.doneBtn,
                {
                  backgroundColor:
                    scannedItems.length > 0
                      ? colors.brandBtn
                      : colors.faint,
                },
              ]}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={
                saving ? "Saving items" : "Save all scanned items"
              }
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text
                  style={[
                    styles.doneBtnText,
                    {
                      color:
                        scannedItems.length > 0 ? "#fff" : colors.textMuted,
                    },
                  ]}
                >
                  Done
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <FlatList
          data={scannedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Point the camera at a barcode to add items.
              </Text>
            </View>
          }
        />
      </View>

      {/* Clear all confirmation */}
      <ConfirmationModal
        visible={showClearModal}
        title="Clear all items?"
        message="This will remove all scanned items from your list."
        confirmLabel="Clear all"
        confirmDanger
        onConfirm={() => {
          setScannedItems([]);
          setShowClearModal(false);
        }}
        onCancel={() => setShowClearModal(false)}
      />

      {/* Exit confirmation */}
      <ConfirmationModal
        visible={showExitModal}
        title="Discard scanned items?"
        message={`You have ${scannedItems.length} item${scannedItems.length !== 1 ? "s" : ""} that won't be saved.`}
        confirmLabel="Discard"
        confirmDanger
        onConfirm={() => {
          setShowExitModal(false);
          router.back();
        }}
        onCancel={() => setShowExitModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: radius.md,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  // Camera section
  cameraSection: {
    flex: 2,
    backgroundColor: "#000",
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraHeader: {
    position: "absolute",
    top: 20,
    left: 20,
  },
  frame: {
    width: 240,
    height: 140,
    backgroundColor: "transparent",
    position: "relative",
    marginTop: 20,
  },
  cornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 28,
    height: 28,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#fff",
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: "#fff",
    borderTopRightRadius: 10,
  },
  cornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 28,
    height: 28,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#fff",
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: "#fff",
    borderBottomRightRadius: 10,
  },
  cameraControls: {
    position: "absolute",
    bottom: 16,
    flexDirection: "row",
    gap: 10,
  },
  overlayBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  overlayBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },

  // List section
  listSection: {
    flex: 3,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  listHeaderActions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  doneBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: radius.pill,
    minWidth: 64,
    alignItems: "center",
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },

  // Item cards
  itemCard: {
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  itemMain: {
    flex: 1,
    gap: 4,
  },
  categoryPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  categoryText: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "capitalize",
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  nameInput: {
    fontSize: 15,
    fontWeight: "600",
    borderBottomWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  itemMeta: {
    fontSize: 11,
    opacity: 0.7,
  },
  itemRight: {
    alignItems: "center",
    gap: spacing.xs,
  },
  qtyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: "700",
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyState: {
    paddingTop: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
