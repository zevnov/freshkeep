import type { StoragePlace } from "@/types";
import { Pressable, Text, View } from "react-native";
import { useAddItemStyles } from "./styles";

export const STORAGE_OPTIONS: StoragePlace[] = ["fridge", "freezer", "pantry", "counter"];

type Props = {
  storage: StoragePlace;
  onChange: (storage: StoragePlace) => void;
};

export function StoragePicker({ storage, onChange }: Props) {
  const styles = useAddItemStyles();
  return (
    <>
      <Text style={styles.label}>Storage</Text>
      <View style={styles.wrap}>
        {STORAGE_OPTIONS.map((s) => (
          <Pressable key={s} onPress={() => onChange(s)} style={[styles.chip, storage === s && styles.chipOn]}>
            <Text style={[styles.chipText, storage === s && styles.chipTextOn]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}
