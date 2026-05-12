import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";
import { theme } from "../theme";

export function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = "primary",
  icon,
  compact,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger" | "success";
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
}) {
  const bg =
    variant === "primary"
      ? theme.primary
      : variant === "success"
        ? theme.success
        : variant === "danger"
          ? "rgba(239,68,68,0.2)"
          : "transparent";
  const color =
    variant === "ghost" ? theme.textMuted : variant === "danger" ? theme.danger : "#ffffff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.88 : 1 },
        variant === "ghost" && { borderWidth: 1, borderColor: theme.border },
      ]}
    >
      {icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={color} style={{ marginRight: 8 }} /> : null}
      <Text style={[styles.btnLabel, compact && styles.btnLabelCompact, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    marginVertical: 4,
  },
  btnCompact: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginVertical: 2,
  },
  btnLabel: { fontSize: 15, fontWeight: "700" },
  btnLabelCompact: { fontSize: 13 },
});
