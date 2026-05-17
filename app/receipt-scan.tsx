import { ConfirmationModal } from "@/components/ConfirmationModal";
import { EditorialHeading } from "@/components/EditorialHeading";
import { radius, spacing } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { useBulkItemQueue } from "@/hooks/useBulkItemQueue";
import { mergeBulkQueueItems, parseReceiptLines } from "@/lib/bulkScanItems";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ReceiptScanScreen() {
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

  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [showCamera, setShowCamera] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [detecting, setDetecting] = useState(false);

  const hasUnsavedWork = scannedItems.length > 0 || inputText.trim().length > 0;

  const handleSnapReceipt = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setShowCamera(true);
  }, [permission, requestPermission]);

  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    if (photo) {
      setPhotoUri(photo.uri);
    }
    setShowCamera(false);
  }, []);

  const handleAutoDetect = useCallback(() => {
    if (!inputText.trim()) return;
    setDetecting(true);
    setTimeout(() => {
      const newItems = parseReceiptLines(inputText);
      setScannedItems((prev) => mergeBulkQueueItems(prev, newItems));
      setInputText("");
      setDetecting(false);
    }, 300);
  }, [inputText, setScannedItems]);

  const handleSaveAll = useCallback(async () => {
    if (scannedItems.length === 0) return;
    await saveAllWithFeedback(() => router.back());
  }, [scannedItems.length, saveAllWithFeedback]);

  const handleBack = useCallback(() => {
    if (hasUnsavedWork) {
      setShowExitModal(true);
    } else {
      router.back();
    }
  }, [hasUnsavedWork]);

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
              style={[styles.categoryPill, { backgroundColor: categoryColor }]}
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
              style={[
                styles.deleteBtn,
                { backgroundColor: colors.danger + "18" },
              ]}
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

  // ── Full-screen camera view ──
  if (showCamera) {
    return (
      <View style={[styles.screen, { backgroundColor: "#000" }]}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={[styles.cameraOverlay, { paddingTop: insets.top }]}>
          <View style={styles.cameraHeader}>
            <EditorialHeading
              bold="Snap"
              italic="receipt."
              size={24}
              color="#fff"
            />
            <Text
              style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}
            >
              Point at your receipt, then tap capture.
            </Text>
          </View>
          <View style={[styles.cameraControls, { paddingBottom: insets.bottom + 20 }]}>
            <Pressable
              style={styles.overlayBtn}
              onPress={() => setShowCamera(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel photo"
            >
              <Text style={styles.overlayBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.captureBtn}
              onPress={() => void handleTakePhoto()}
              accessibilityRole="button"
              accessibilityLabel="Take receipt photo"
            >
              <View style={styles.captureBtnInner} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── Top nav bar ── */}
      <View
        style={[
          styles.navBar,
          {
            paddingTop: insets.top + spacing.sm,
            borderBottomColor: colors.border,
            backgroundColor: colors.bg,
          },
        ]}
      >
        <EditorialHeading
          bold="Receipt"
          italic="scanner."
          size={22}
          color={colors.text}
        />
        <Pressable
          onPress={handleBack}
          style={[styles.cancelNavBtn, { backgroundColor: colors.faint }]}
          accessibilityRole="button"
          accessibilityLabel="Cancel receipt scanner"
        >
          <Text style={[styles.cancelNavBtnText, { color: colors.textMuted }]}>
            Cancel
          </Text>
        </Pressable>
      </View>

      {/* ── Section 1: Camera snapshot (optional, compact) ── */}
      <View
        style={[styles.photoSection, { borderBottomColor: colors.border }]}
      >
        {photoUri ? (
          <View style={styles.photoPreviewRow}>
            <Image
              source={{ uri: photoUri }}
              style={styles.photoThumb}
              resizeMode="cover"
            />
            <View style={styles.photoMeta}>
              <Text style={[styles.photoLabel, { color: colors.text }]}>
                Receipt photo
              </Text>
              <Text style={[styles.photoSub, { color: colors.textMuted }]}>
                Reference only — type items below
              </Text>
              <Pressable
                onPress={() => void handleSnapReceipt()}
                style={[styles.retakeBtn, { backgroundColor: colors.faint }]}
                accessibilityRole="button"
                accessibilityLabel="Retake receipt photo"
              >
                <Text style={[styles.retakeBtnText, { color: colors.textMuted }]}>
                  Retake
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => void handleSnapReceipt()}
            style={[styles.snapBtn, { backgroundColor: colors.surface }]}
            accessibilityRole="button"
            accessibilityLabel="Take a photo of your receipt for reference"
          >
            <Text style={styles.snapBtnIcon}>📷</Text>
            <View>
              <Text style={[styles.snapBtnText, { color: colors.text }]}>
                Snap receipt
              </Text>
              <Text style={[styles.snapBtnSub, { color: colors.textMuted }]}>
                optional reference photo
              </Text>
            </View>
          </Pressable>
        )}
      </View>

      {/* ── Section 2: Item entry ── */}
      <View
        style={[styles.inputSection, { borderBottomColor: colors.border }]}
      >
        <TextInput
          style={[
            styles.receiptInput,
            {
              backgroundColor: colors.surface,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={inputText}
          onChangeText={setInputText}
          placeholder={
            "Type items from your receipt, one per line:\n\nStrawberries\nWhole milk\nChicken breasts\nCanned tuna"
          }
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Receipt items input"
          accessibilityHint="Enter one item per line"
        />
        <Pressable
          onPress={handleAutoDetect}
          style={[
            styles.detectBtn,
            {
              backgroundColor: inputText.trim()
                ? colors.brandBtn
                : colors.faint,
            },
          ]}
          disabled={detecting || !inputText.trim()}
          accessibilityRole="button"
          accessibilityLabel="Auto-detect items from text"
        >
          {detecting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text
              style={[
                styles.detectBtnText,
                {
                  color: inputText.trim() ? "#fff" : colors.textMuted,
                },
              ]}
            >
              Auto-detect
            </Text>
          )}
        </Pressable>
      </View>

      {/* ── Section 3: Detected items ── */}
      <View style={styles.listSection}>
        <View
          style={[styles.listHeader, { borderBottomColor: colors.border }]}
        >
          <Text style={[styles.listTitle, { color: colors.text }]}>
            {scannedItems.length === 0
              ? "No items yet"
              : `${scannedItems.length} item${scannedItems.length !== 1 ? "s" : ""} detected`}
          </Text>
          <View style={styles.listHeaderActions}>
            {scannedItems.length > 0 && (
              <Pressable
                onPress={() => setShowClearModal(true)}
                style={[styles.clearBtn, { backgroundColor: colors.faint }]}
                accessibilityRole="button"
                accessibilityLabel="Clear all detected items"
              >
                <Text style={[styles.clearBtnText, { color: colors.textMuted }]}>
                  Clear all
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => void handleSaveAll()}
              style={[
                styles.saveBtn,
                {
                  backgroundColor:
                    scannedItems.length > 0 ? colors.brandBtn : colors.faint,
                },
              ]}
              disabled={saving || scannedItems.length === 0}
              accessibilityRole="button"
              accessibilityLabel={saving ? "Saving items" : "Save all items"}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text
                  style={[
                    styles.saveBtnText,
                    {
                      color:
                        scannedItems.length > 0 ? "#fff" : colors.textMuted,
                    },
                  ]}
                >
                  Save all
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <FlatList
          data={scannedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 16 },
          ]}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Type items above and tap Auto-detect.
              </Text>
            </View>
          }
        />
      </View>

      {/* Clear all confirmation */}
      <ConfirmationModal
        visible={showClearModal}
        title="Clear all items?"
        message="This will remove all detected items."
        confirmLabel="Clear all"
        confirmDanger
        onConfirm={clearItems}
        onCancel={() => setShowClearModal(false)}
      />

      {/* Exit confirmation */}
      <ConfirmationModal
        visible={showExitModal}
        title={`Discard ${scannedItems.length} item${scannedItems.length !== 1 ? "s" : ""}?`}
        message={`You have ${scannedItems.length} item${scannedItems.length !== 1 ? "s" : ""} that won't be saved.`}
        confirmLabel="Discard"
        confirmDanger
        onConfirm={() => {
          setShowExitModal(false);
          router.back();
        }}
        onCancel={() => setShowExitModal(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Nav bar
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelNavBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  cancelNavBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Camera overlay
  cameraOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  cameraHeader: {
    marginTop: 20,
  },
  cameraControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
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
  captureBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  captureBtnInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#fff",
  },

  // Photo section
  photoSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  snapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
  },
  snapBtnIcon: { fontSize: 22 },
  snapBtnText: { fontSize: 14, fontWeight: "600" },
  snapBtnSub: { fontSize: 11, marginTop: 2 },

  photoPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
  },
  photoMeta: { flex: 1, gap: 3 },
  photoLabel: { fontSize: 14, fontWeight: "600" },
  photoSub: { fontSize: 11 },
  retakeBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  retakeBtnText: { fontSize: 12, fontWeight: "600" },

  // Input section
  inputSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  receiptInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 110,
    maxHeight: 160,
  },
  detectBtn: {
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  detectBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },

  // List section
  listSection: { flex: 1 },
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
  clearBtnText: { fontSize: 12, fontWeight: "600" },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: radius.pill,
    minWidth: 72,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 14, fontWeight: "700" },
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
  itemMain: { flex: 1, gap: 4 },
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
  itemName: { fontSize: 15, fontWeight: "600", lineHeight: 20 },
  nameInput: {
    fontSize: 15,
    fontWeight: "600",
    borderBottomWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  itemMeta: { fontSize: 11, opacity: 0.7 },
  itemRight: { alignItems: "center", gap: spacing.xs },
  qtyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  qtyText: { fontSize: 12, fontWeight: "700" },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: { fontSize: 12, fontWeight: "700" },
  emptyState: { paddingTop: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});

