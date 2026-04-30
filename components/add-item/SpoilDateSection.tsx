import { useTheme } from "@/context/ThemeContext";
import { toLocalDateString } from "@/lib/spoil";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useAddItemStyles } from "./styles";

type SpoilMode = "expiry" | "shelf";

type Props = {
  spoilMode: SpoilMode;
  onSpoilModeChange: (mode: SpoilMode) => void;
  expiryDate: Date;
  onExpiryDateChange: (d: Date) => void;
  showExpiryPicker: boolean;
  onShowExpiryPicker: (show: boolean) => void;
  referenceDate: Date;
  onReferenceDateChange: (d: Date) => void;
  showRefPicker: boolean;
  onShowRefPicker: (show: boolean) => void;
  shelfDays: string;
  onShelfDaysChange: (v: string) => void;
  spoilOnYmd: string;
};

export function SpoilDateSection({
  spoilMode,
  onSpoilModeChange,
  expiryDate,
  onExpiryDateChange,
  showExpiryPicker,
  onShowExpiryPicker,
  referenceDate,
  onReferenceDateChange,
  showRefPicker,
  onShowRefPicker,
  shelfDays,
  onShelfDaysChange,
  spoilOnYmd,
}: Props) {
  const styles = useAddItemStyles();
  const { colors, isDark } = useTheme();
  const pickerTheme = isDark ? "dark" : "light";

  return (
    <>
      <Text style={styles.label}>Spoil date</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => onSpoilModeChange("expiry")}
          style={[styles.chip, spoilMode === "expiry" && styles.chipOn]}
        >
          <Text style={[styles.chipText, spoilMode === "expiry" && styles.chipTextOn]}>Expiry date</Text>
        </Pressable>
        <Pressable
          onPress={() => onSpoilModeChange("shelf")}
          style={[styles.chip, spoilMode === "shelf" && styles.chipOn]}
        >
          <Text style={[styles.chipText, spoilMode === "shelf" && styles.chipTextOn]}>Shelf life</Text>
        </Pressable>
      </View>

      {spoilMode === "expiry" ? (
        <>
          <Pressable style={styles.input} onPress={() => onShowExpiryPicker(true)}>
            <Text style={{ color: colors.text, fontSize: 16 }}>{toLocalDateString(expiryDate)}</Text>
          </Pressable>
          {showExpiryPicker ? (
            <>
              <DateTimePicker
                value={expiryDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                themeVariant={pickerTheme}
                onChange={(_, d) => {
                  if (Platform.OS === "android") onShowExpiryPicker(false);
                  if (d) onExpiryDateChange(d);
                }}
              />
              {Platform.OS === "ios" ? (
                <Pressable style={styles.doneIOS} onPress={() => onShowExpiryPicker(false)}>
                  <Text style={styles.doneIOSText}>Done</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.hint}>Bought or opened on</Text>
          <Pressable style={styles.input} onPress={() => onShowRefPicker(true)}>
            <Text style={{ color: colors.text, fontSize: 16 }}>{toLocalDateString(referenceDate)}</Text>
          </Pressable>
          {showRefPicker ? (
            <>
              <DateTimePicker
                value={referenceDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                themeVariant={pickerTheme}
                onChange={(_, d) => {
                  if (Platform.OS === "android") onShowRefPicker(false);
                  if (d) onReferenceDateChange(d);
                }}
              />
              {Platform.OS === "ios" ? (
                <Pressable style={styles.doneIOS} onPress={() => onShowRefPicker(false)}>
                  <Text style={styles.doneIOSText}>Done</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
          <Text style={styles.label}>Shelf life (days)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={shelfDays}
            onChangeText={onShelfDaysChange}
            placeholder="5"
            placeholderTextColor={colors.textMuted}
          />
        </>
      )}

      <Text style={styles.muted}>Use by: {spoilOnYmd}</Text>
    </>
  );
}
