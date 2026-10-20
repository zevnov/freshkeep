import { radius, spacing } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
  return `#${clean}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

export function ConfirmationModal({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmDanger = false,
  onConfirm,
  onCancel,
}: Props) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface }]}
          onPress={() => {
            // swallow tap so it doesn't propagate to backdrop
          }}
        >
          {/* Sticker pill accent */}
          <View
            style={[
              styles.stickerPill,
              { backgroundColor: confirmDanger ? withAlpha(colors.danger, 0.13) : colors.primaryMuted },
            ]}
          >
            <Text
              style={[
                styles.stickerText,
                { color: confirmDanger ? colors.danger : colors.brand },
              ]}
            >
              {confirmDanger ? "action required" : "confirm"}
            </Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

          {message ? (
            <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
          ) : null}

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.btn, styles.cancelBtn, { backgroundColor: colors.faint }]}
              onPress={onCancel}
            >
              <Text style={[styles.btnText, { color: colors.textMuted }]}>{cancelLabel}</Text>
            </Pressable>

            <Pressable
              style={[
                styles.btn,
                styles.confirmBtn,
                { backgroundColor: confirmDanger ? colors.danger : colors.brandBtn },
              ]}
              onPress={onConfirm}
            >
              <Text style={[styles.btnText, { color: "#fff" }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  stickerPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  stickerText: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: spacing.xs,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: "center",
  },
  cancelBtn: {},
  confirmBtn: {},
  btnText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
