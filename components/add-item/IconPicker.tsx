import { radius } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { ICON_CHOICES } from "@/lib/foodIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAddItemStyles } from "./styles";

type Props = {
  /** The user's pick; null means "automatic" (derived from the name). */
  icon: string | null;
  suggested: string;
  onChange: (icon: string | null) => void;
};

export function IconPicker({ icon, suggested, onChange }: Props) {
  const styles = useAddItemStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const shown = icon ?? suggested;

  return (
    <>
      <Text style={styles.label}>Icon</Text>
      <Pressable
        style={[local.current, { backgroundColor: colors.faint }]}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`Icon ${shown}. ${open ? "Close" : "Change"} icon`}
      >
        <Text style={local.currentIcon}>{shown}</Text>
        <Text style={[local.currentText, { color: colors.textMuted }]}>
          {icon ? "Custom icon" : "Automatic"} · {open ? "Done" : "Change"}
        </Text>
      </Pressable>
      {open ? (
        <View style={local.grid}>
          <Pressable
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}
            style={[local.cell, local.autoCell, { backgroundColor: icon == null ? colors.brandBtn : colors.faint }]}
            accessibilityRole="button"
            accessibilityLabel="Automatic icon"
          >
            <Text style={[local.autoText, { color: icon == null ? "#fff" : colors.textMuted }]}>Auto</Text>
          </Pressable>
          {ICON_CHOICES.map((choice) => {
            const selected = icon === choice;
            return (
              <Pressable
                key={choice}
                onPress={() => {
                  onChange(choice);
                  setOpen(false);
                }}
                style={[local.cell, { backgroundColor: selected ? colors.brandBtn : colors.faint }]}
                accessibilityRole="button"
                accessibilityLabel={`Icon ${choice}`}
                accessibilityState={{ selected }}
              >
                <Text style={local.cellIcon}>{choice}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

const local = StyleSheet.create({
  current: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  currentIcon: { fontSize: 24 },
  currentText: { fontSize: 13, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  cell: { width: 44, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  cellIcon: { fontSize: 24 },
  autoCell: { width: 60 },
  autoText: { fontSize: 13, fontWeight: "700" },
});
