import { BucketPicker } from "@/components/add-item/BucketPicker";
import { RemindersSection } from "@/components/add-item/RemindersSection";
import { SpoilDateSection } from "@/components/add-item/SpoilDateSection";
import { StoragePicker } from "@/components/add-item/StoragePicker";
import { useAddItemStyles } from "@/components/add-item/styles";
import { useAuth } from "@/context/AuthContext";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import { MAX_ITEM_NAME_LENGTH, hasVisibleItemName, normalizeItemName } from "@/lib/itemName";
import { calculateExpiry, suggestStorage, type ExpiryResult } from "@/lib/expiryEngine";
import { detectItem } from "@/lib/keywordDetect";
import { spoilOnFromShelf, toLocalDateString } from "@/lib/spoil";
import type { ItemScope, StoragePlace } from "@/types";
import * as Sentry from "@sentry/react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

const MAX_REMIND_DAYS = 365;
const QUANTITY_PATTERN = /^(?:\d+\.?\d*|\.\d+)$/;

export default function AddItemScreen() {
  const { colors } = useTheme();
  const styles = useAddItemStyles();
  const { id, scan_at, scan_name, scan_qty, scan_unit, scan_notes, scan_code } = useLocalSearchParams<{
    id?: string;
    scan_at?: string;
    scan_name?: string;
    scan_qty?: string;
    scan_unit?: string;
    scan_notes?: string;
    scan_code?: string;
  }>();
  const navigation = useNavigation();
  const { profile } = useAuth();
  const { items, createItem, updateItem, loading: itemsLoading } = useItems();

  const existing = useMemo(() => (id ? items.find((i) => i.id === id) : undefined), [id, items]);
  const initialRef = useRef(existing);

  const [name, setName] = useState(existing?.name ?? "");
  const [scope, setScope] = useState<ItemScope>(existing?.scope ?? profile?.default_bucket ?? "ours");
  const [storage, setStorage] = useState<StoragePlace>(existing?.storage ?? profile?.default_storage ?? "fridge");
  const [spoilMode, setSpoilMode] = useState<"expiry" | "shelf">("expiry");
  const [expiryDate, setExpiryDate] = useState(() =>
    existing ? new Date(existing.spoil_on + "T12:00:00") : new Date()
  );
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [shelfDays, setShelfDays] = useState("5");
  const [quantity, setQuantity] = useState(existing?.quantity != null ? String(existing.quantity) : "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [remindMe, setRemindMe] = useState(existing?.remind_me ?? true);
  const [remindDays, setRemindDays] = useState(
    existing?.remind_days_before ? String(existing.remind_days_before) : "0"
  );
  const [opened, setOpened] = useState(false);
  const [expiryResult, setExpiryResult] = useState<ExpiryResult | null>(null);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const appliedScanAtRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existing) {
      initialRef.current = existing;
      setName(existing.name);
      setScope(existing.scope);
      setStorage(existing.storage);
      setExpiryDate(new Date(existing.spoil_on + "T12:00:00"));
      setRemindMe(existing.remind_me);
      setRemindDays(existing.remind_days_before ? String(existing.remind_days_before) : "0");
      setQuantity(existing.quantity != null ? String(existing.quantity) : "");
      setUnit(existing.unit ?? "");
      setNotes(existing.notes ?? "");
    }
  }, [existing]);

  useEffect(() => {
    if (!scan_at || scan_at === appliedScanAtRef.current) return;
    appliedScanAtRef.current = scan_at;

    const scannedName = typeof scan_name === "string" ? scan_name.trim() : "";
    const scannedQty = typeof scan_qty === "string" ? scan_qty.trim() : "";
    const scannedUnit = typeof scan_unit === "string" ? scan_unit.trim() : "";
    const scannedNotes = typeof scan_notes === "string" ? scan_notes.trim() : "";
    const scannedCode = typeof scan_code === "string" ? scan_code.trim() : "";

    if (scannedName) setName(scannedName);
    if (scannedQty && QUANTITY_PATTERN.test(scannedQty)) setQuantity(scannedQty);
    if (scannedUnit) setUnit(scannedUnit);
    if (scannedNotes) setNotes((prev) => (prev.trim() ? `${prev}\n${scannedNotes}` : scannedNotes));
    if (scannedCode) setNotes((prev) => (prev.includes(`Barcode: ${scannedCode}`) ? prev : `${prev}\nBarcode: ${scannedCode}`.trim()));

    router.setParams({
      scan_at: undefined,
      scan_name: undefined,
      scan_qty: undefined,
      scan_unit: undefined,
      scan_notes: undefined,
      scan_code: undefined,
    });
  }, [scan_at, scan_name, scan_qty, scan_unit, scan_notes, scan_code]);

  // Auto-detect when name, storage, or opened changes
  useEffect(() => {
    const detected = detectItem(name);
    if (!detected) {
      setExpiryResult(null);
      return;
    }
    const suggestedStorage = suggestStorage(detected);
    // Only auto-set storage when not editing an existing item
    if (!id) {
      setStorage(suggestedStorage);
    }
    const result = calculateExpiry(name, storage, opened);
    setExpiryResult(result);
    // Only auto-set expiry when not editing an existing item
    if (!id) {
      setExpiryDate(new Date(result.spoilDate + "T12:00:00"));
      const newDays = Math.round(
        (new Date(result.spoilDate + "T12:00:00").getTime() - new Date().setHours(12, 0, 0, 0)) /
          (1000 * 60 * 60 * 24)
      );
      if (newDays > 0) setShelfDays(String(newDays));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, storage, opened]);

  const spoilOnYmd = useMemo(() => {
    if (spoilMode === "expiry") return toLocalDateString(expiryDate);
    const days = Math.max(1, parseInt(shelfDays, 10) || 1);
    return spoilOnFromShelf(toLocalDateString(referenceDate), days);
  }, [spoilMode, expiryDate, referenceDate, shelfDays]);
  const today = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => toLocalDateString(today), [today]);
  const spoilDateWarning = useMemo(() => {
    if (spoilOnYmd >= todayYmd) return null;
    return spoilMode === "expiry"
      ? "Past spoil dates cannot be saved."
      : "This shelf-life calculation lands in the past. Pick a more recent date or a longer shelf life.";
  }, [spoilMode, spoilOnYmd, todayYmd]);

  const onSave = useCallback(async () => {
    const normalizedName = normalizeItemName(name);
    if (!hasVisibleItemName(normalizedName)) {
      Alert.alert("Name required", "Give this item a name.");
      return;
    }
    if (normalizedName.length > MAX_ITEM_NAME_LENGTH) {
      Alert.alert("Name too long", `Keep the item name under ${MAX_ITEM_NAME_LENGTH} characters.`);
      return;
    }
    if (spoilOnYmd < todayYmd) {
      Alert.alert("Spoil date", "Choose today or a future date for the spoil date.");
      return;
    }
    const trimmedQuantity = quantity.trim();
    if (trimmedQuantity && !QUANTITY_PATTERN.test(trimmedQuantity)) {
      Alert.alert("Quantity", "Use a plain number for quantity.");
      return;
    }
    const q = trimmedQuantity ? Number(trimmedQuantity) : null;
    const rd = parseInt(remindDays, 10);
    if (Number.isFinite(rd) && rd > MAX_REMIND_DAYS) {
      Alert.alert("Reminder days", `Choose ${MAX_REMIND_DAYS} days or fewer.`);
      return;
    }
    const remindDaysBefore = Number.isFinite(rd) && rd > 0 ? rd : 0;

    setSaving(true);
    try {
      if (id && existing) {
        const { error } = await updateItem(id, {
          name: normalizedName,
          scope,
          owner_user_id: scope === 'mine' ? profile!.id : null,
          storage,
          spoil_on: spoilOnYmd,
          quantity: q,
          unit: unit.trim() || null,
          notes: notes.trim() || null,
          remind_me: remindMe,
          remind_days_before: remindDaysBefore,
        }, existing.schedule_version);
        if (error) Alert.alert("Could not save", error.message);
        else router.back();
      } else {
        const { error } = await createItem({
          name: normalizedName,
          scope,
          storage,
          spoil_on: spoilOnYmd,
          quantity: q,
          unit: unit.trim() || null,
          notes: notes.trim() || null,
          remind_me: remindMe,
          remind_days_before: remindDaysBefore,
        });
        if (error) Alert.alert("Could not save", error.message);
        else router.back();
      }
    } catch (err) {
      Sentry.captureException(err);
      Alert.alert("Unexpected error", "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [
    name,
    quantity,
    unit,
    notes,
    remindMe,
    remindDays,
    id,
    existing,
    spoilOnYmd,
    todayYmd,
    scope,
    storage,
    createItem,
    updateItem,
  ]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: id ? "Edit item" : "Add item",
      headerRight: () => (
        <Pressable onPress={() => void onSave()} disabled={saving} style={{ paddingHorizontal: 12 }}>
          {saving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>Save</Text>
          )}
        </Pressable>
      ),
    });
  }, [navigation, id, saving, onSave, colors.primary]);

  if (id && !existing) {
    if (itemsLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Couldn’t load that item.</Text>
        <Pressable style={styles.notFoundBtn} onPress={() => router.back()}>
          <Text style={styles.notFoundBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={MAX_ITEM_NAME_LENGTH}
        placeholder="Strawberries"
        placeholderTextColor={colors.textMuted}
      />
      {!id ? (
        <Pressable
          style={styles.scanBtn}
          onPress={() => router.push({ pathname: "/scan-barcode", params: { returnTo: "add-item" } })}
        >
          <Text style={styles.scanBtnText}>Scan barcode to auto-fill</Text>
        </Pressable>
      ) : null}

      {expiryResult?.matchedItem ? (
        <Text style={[styles.muted, { marginTop: 2, marginBottom: 4 }]}>
          ✨ Auto-detected: {expiryResult.matchedItem.category}
        </Text>
      ) : null}

      <BucketPicker scope={scope} onChange={setScope} />
      <StoragePicker storage={storage} onChange={setStorage} />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <View>
          <Text style={[styles.label, { marginBottom: 0 }]}>Opened?</Text>
          <Text style={[styles.hint, { marginTop: 0 }]}>(halves shelf life estimation)</Text>
        </View>
        <Switch
          value={opened}
          onValueChange={setOpened}
          trackColor={{ false: colors.faint, true: colors.brand }}
          thumbColor="#fff"
          accessibilityLabel="Mark item as opened"
        />
      </View>

      <SpoilDateSection
        spoilMode={spoilMode}
        onSpoilModeChange={setSpoilMode}
        expiryDate={expiryDate}
        onExpiryDateChange={setExpiryDate}
        showExpiryPicker={showExpiryPicker}
        onShowExpiryPicker={setShowExpiryPicker}
        referenceDate={referenceDate}
        onReferenceDateChange={setReferenceDate}
        showRefPicker={showRefPicker}
        onShowRefPicker={setShowRefPicker}
        shelfDays={shelfDays}
        onShelfDaysChange={setShelfDays}
        spoilOnYmd={spoilOnYmd}
        minExpiryDate={today}
        spoilDateWarning={spoilDateWarning}
      />
      {expiryResult?.matchedItem && expiryResult.message ? (
        <Text style={[styles.muted, { marginTop: 2 }]}>{expiryResult.message}</Text>
      ) : null}

      <Text style={styles.label}>Quantity (optional)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="1"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Unit (optional)</Text>
      <TextInput
        style={styles.input}
        value={unit}
        onChangeText={setUnit}
        placeholder="lb, each, L"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.input, styles.notes]}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Where in the fridge…"
        placeholderTextColor={colors.textMuted}
      />

      <RemindersSection
        remindMe={remindMe}
        onRemindMeChange={setRemindMe}
        remindDays={remindDays}
        onRemindDaysChange={setRemindDays}
      />
    </ScrollView>
  );
}