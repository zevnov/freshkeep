import { ConfirmationModal } from "@/components/ConfirmationModal";
import { EditorialHeading } from "@/components/EditorialHeading";
import { radius, spacing } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { useBulkItemQueue } from "@/hooks/useBulkItemQueue";
import { buildBulkQueueItem } from "@/lib/bulkScanItems";
import { lookupBarcodeProduct } from "@/lib/barcodeLookup";
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

export default function BulkScanScreen() {
  const { colors } = useTheme();
  const {
    items: scannedItems,
    setItems: setScannedItems,
    editingId,
    editingName,
    setEditingName,
    showClearModal,
    setShowClearModal,
    showExitModal,
    setShowExitModal,
    saving,
    clearItems,
    deleteItem,
    startEdit,
    commitEdit,
    expiryLabelFor,
    saveAllWithFeedback,
  } = useBulkItemQueue();

  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const handledRef = useRef<Set<string>>(new Set());

  const onBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      const code = data.trim();
      if (!code || lookingUp || handledRef.current.has(code)) return;

      const existing = scannedItems.find((i) => i.barcode === code);
      if (existing) {
        handledRef.current.add(code);
        setScannedItems((prev) =>
          prev.map((i) =>
            i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
          )
        );
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
      const newItem = buildBulkQueueItem(productName, code);
      setScannedItems((prev) => [newItem, ...prev]);

      setTimeout(() => {
        handledRef.current.delete(code);
      }, 2000);
    },
    [lookingUp, scannedItems, setScannedItems]
  );

  const handleAddManually = useCallback(() => {
    router.push("/add-item");
  }, []);

  const handleDone = useCallback(async () => {
    if (scannedItems.length === 0) {
      router.back();
      return;
    }
    await saveAllWithFeedback(() => router.back());
  }, [scannedItems.length, saveAllWithFeedback]);

  const handleBack = useCallback(() => {
    if (scannedItems.length > 0) {
      setShowExitModal(true);
    } else {
      router.back();
    }
  }, [scannedItems.length, setShowExitModal]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof scannedItems)[number] }) => {
      const isEditing = editingId === item.id;
      const expiryLabel = expiryLabelFor(item);

      const categoryColor = item.category ? colors.primaryMuted : colors.faint;
      const categoryTextColor = item.category ? colors.brand : colors.textMuted;

      return (
        <View style={[styles.itemCard, { backgroundColor: colors.surface }]}>
          <View style={styles.itemMain}>
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

            {isEditing ? (
              <TextInput
                style={[
                  styles.nameInput,
                  { color: colors.text, borderColor: colors.border },
                ]}
                value={editingName}
                onChangeText={setEditingName}
                onBlur={commitEdit}
                onSubmitEditing={commitEdit}
                autoFocus
                returnKeyType="done"
                accessibilityLabel="Edit item name"
              />
            ) : (
              <Pressable
                onPress={() => startEdit(item)}
                accessibilityRole="button"
                accessibilityLabel={`Edit name: ${item.name}`}
              >
                <Text style={[styles.itemName, { color: colors.text }]}>
                  {item.name}
                </Text>
              </Pressable>
            )}

            <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
              {expiryLabel}
            </Text>
          </View>

          <View style={styles.itemRight}>
            <View style={[styles.qtyBadge, { backgroundColor: colors.faint }]}>
              <Text style={[styles.qtyText, { color: colors.text }]}>
                ×{item.quantity}
              </Text>
            </View>

            <Pressable
              onPress={() => deleteItem(item.id)}
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
      startEdit,
      commitEdit,
      deleteItem,
      expiryLabelFor,
      setEditingName,
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

          <View style={styles.frame}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>

          {lookingUp && (
            <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />
          )}

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

      <View style={[styles.listSection, { backgroundColor: colors.bg }]}>
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
                    scannedItems.length > 0 ? colors.brandBtn : colors.faint,
                },
              ]}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={saving ? "Saving items" : "Save all scanned items"}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text
                  style={[
                    styles.doneBtnText,
                    {
                      color: scannedItems.length > 0 ? "#fff" : colors.textMuted,
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

      <ConfirmationModal
        visible={showClearModal}
        title="Clear all items?"
        message="This will remove all scanned items from your list."
        confirmLabel="Clear all"
        confirmDanger
        onConfirm={clearItems}
        onCancel={() => setShowClearModal(false)}
      />

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
