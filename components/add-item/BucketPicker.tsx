import type { ItemScope } from "@/types";
import { Pressable, Text, View } from "react-native";
import { useAddItemStyles } from "./styles";

type Props = {
  scope: ItemScope;
  onChange: (scope: ItemScope) => void;
};

export function BucketPicker({ scope, onChange }: Props) {
  const styles = useAddItemStyles();
  return (
    <>
      <Text style={styles.label}>Bucket</Text>
      <View style={styles.row}>
        {(["ours", "mine"] as const).map((s) => (
          <Pressable key={s} onPress={() => onChange(s)} style={[styles.chip, scope === s && styles.chipOn]}>
            <Text style={[styles.chipText, scope === s && styles.chipTextOn]}>{s === "ours" ? "Ours" : "My"}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}
