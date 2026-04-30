import { BucketPicker } from "@/components/add-item/BucketPicker";
import { RemindersSection } from "@/components/add-item/RemindersSection";
import { SpoilDateSection } from "@/components/add-item/SpoilDateSection";
import { StoragePicker } from "@/components/add-item/StoragePicker";
import { useAddItemStyles } from "@/components/add-item/styles";
import { useAuth } from "@/context/AuthContext";
import { useItems } from "@/context/ItemsContext";
import { useTheme } from "@/context/ThemeContext";
import { spoilOnFromShelf, toLocalDateString } from "@/lib/spoil";
import type { ItemScope, StoragePlace } from "@/types";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

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
    if (scannedQty && !Number.isNaN(Number(scannedQty))) setQuantity(scannedQty);
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

  const spoilOnYmd = useMemo(() => {
    if (spoilMode === "expiry") return toLocalDateString(expiryDate);
    const days = Math.max(1, parseInt(shelfDays, 10) || 1);
    return spoilOnFromShelf(toLocalDateString(referenceDate), days);
  }, [spoilMode, expiryDate, referenceDate, shelfDays]);

  const onSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Give this item a name.");
      return;
    }
    const q = quantity.trim() ? Number(quantity) : null;
    if (quantity.trim() && Number.isNaN(q)) {
      Alert.alert("Quantity", "Use a number for quantity.");
      return;
    }
    const rd = parseInt(remindDays, 10);
    const remindDaysBefore = Number.isFinite(rd) && rd > 0 ? rd : 0;

    setSaving(true);
    if (id && existing) {
      const init = initialRef.current;
      let scheduleVersion = existing.schedule_version;
      if (
        init &&
        (init.spoil_on !== spoilOnYmd ||
          init.remind_me !== remindMe ||
          init.remind_days_before !== remindDaysBefore ||
          init.scope !== scope ||
          init.name !== name.trim() ||
          init.storage !== storage)
      ) {
        scheduleVersion = existing.schedule_version + 1;
      }
      const { error } = await updateItem(id, {
        name: name.trim(),
        scope,
        storage,
        spoil_on: spoilOnYmd,
        quantity: q,
        unit: unit.trim() || null,
        notes: notes.trim() || null,
        remind_me: remindMe,
        remind_days_before: remindDaysBefore,
        schedule_version: scheduleVersion,
      });
      setSaving(false);
      if (error) Alert.alert("Could not save", error.message);
      else router.back();
    } else {
      const { error } = await createItem({
        name: name.trim(),
        scope,
        storage,
        spoil_on: spoilOnYmd,
        quantity: q,
        unit: unit.trim() || null,
        notes: notes.trim() || null,
        remind_me: remindMe,
        remind_days_before: remindDaysBefore,
      });
      setSaving(false);
      if (error) Alert.alert("Could not save", error.message);
      else router.back();
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

      <BucketPicker scope={scope} onChange={setScope} />
      <StoragePicker storage={storage} onChange={setStorage} />
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
      />

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
