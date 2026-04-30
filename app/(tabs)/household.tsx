import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { radius, spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import {
  parseHouseholdMemberRow,
  parseInviteRpcRow,
  parseInviteRow,
  parseProfileIdDisplay,
  type HouseholdRole,
} from "@/lib/supabaseRows";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "@react-navigation/native";
import { Redirect, router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type MemberRow = {
  user_id: string;
  role: HouseholdRole;
  display_name: string | null;
};

type InviteRow = { code: string; expires_at: string };

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
    title: { fontSize: 26, fontWeight: "700", color: colors.text },
    sub: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
    section: {
      marginTop: spacing.md,
      fontSize: 13,
      fontWeight: "700",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs },
    memberName: { fontSize: 16, fontWeight: "600", color: colors.text },
    memberRole: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    hint: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
    codeBox: {
      alignItems: "center",
      paddingVertical: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.primaryMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    codeText: { fontSize: 28, fontWeight: "800", letterSpacing: 4, color: colors.text },
    tapCopy: { marginTop: spacing.xs, fontSize: 13, color: colors.textMuted },
    expires: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
    noCode: { fontSize: 14, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.sm },
    primaryBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: radius.md,
      alignItems: "center",
    },
    primaryBtnText: { color: colors.onPrimary, fontWeight: "700", fontSize: 16 },
    btnDisabled: { opacity: 0.7 },
    secondaryBtn: {
      marginTop: spacing.md,
      paddingVertical: 14,
      borderRadius: radius.md,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    secondaryBtnText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
    joinFootnote: { fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: spacing.xs },
  });
}

export default function HouseholdScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { configured, user, profile } = useAuth();
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const showInitialSpinner = useRef(true);

  const load = useCallback(async (withSpinner: boolean) => {
    if (!user?.id || !profile?.household_id) {
      if (withSpinner) setLoading(false);
      return;
    }
    if (withSpinner) setLoading(true);
    const hid = profile.household_id;

    const [{ data: hh, error: hhErr }, { data: mems, error: memErr }, { data: invs, error: invErr }] =
      await Promise.all([
        supabase.from("households").select("name").eq("id", hid).maybeSingle(),
        supabase.from("household_members").select("user_id, role").eq("household_id", hid),
        supabase.from("household_invites").select("code, expires_at").eq("household_id", hid).maybeSingle(),
      ]);

    if (hhErr) {
      Alert.alert("Could not load household", hhErr.message);
      if (withSpinner) setLoading(false);
      setRefreshing(false);
      return;
    }
    setHouseholdName(hh?.name ?? "Kitchen");

    if (memErr) {
      Alert.alert("Could not load members", memErr.message);
      setMembers([]);
    } else {
      const rows = mems ?? [];
      const parsedMembers: MemberRow[] = [];
      let skippedMembers = 0;
      for (const m of rows) {
        const pr = parseHouseholdMemberRow(m);
        if (!pr.ok) {
          skippedMembers++;
          continue;
        }
        parsedMembers.push({
          user_id: pr.value.user_id,
          role: pr.value.role,
          display_name: null,
        });
      }
      if (skippedMembers > 0) {
        Alert.alert("Members", "Some member rows could not be loaded.");
      }
      const ids = parsedMembers.map((m) => m.user_id);
      let nameById: Record<string, string | null> = {};
      if (ids.length > 0) {
        const { data: profs, error: pErr } = await supabase.from("profiles").select("id, display_name").in("id", ids);
        if (!pErr && profs) {
          for (const p of profs) {
            const pr = parseProfileIdDisplay(p);
            if (pr.ok) nameById[pr.value.id] = pr.value.display_name;
          }
        }
      }
      setMembers(
        parsedMembers.map((m) => ({
          ...m,
          display_name: nameById[m.user_id] ?? null,
        }))
      );
    }

    if (!invErr && invs) {
      const inv = parseInviteRow(invs);
      if (inv.ok && new Date(inv.value.expires_at).getTime() > Date.now()) {
        setInvite(inv.value);
      } else {
        setInvite(null);
      }
    } else {
      setInvite(null);
    }

    if (withSpinner) setLoading(false);
    setRefreshing(false);
  }, [user?.id, profile?.household_id]);

  useFocusEffect(
    useCallback(() => {
      const first = showInitialSpinner.current;
      showInitialSpinner.current = false;
      void load(first);
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load(false);
  }

  async function createInvite() {
    setInviteBusy(true);
    const { data, error } = await supabase.rpc("create_household_invite");
    setInviteBusy(false);
    if (error) {
      Alert.alert("Could not create invite", error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const inv = parseInviteRpcRow(row);
    if (!inv.ok) {
      Alert.alert("Could not create invite", inv.error);
      return;
    }
    setInvite(inv.value);
  }

  async function copyCode() {
    if (!invite?.code) return;
    await Clipboard.setStringAsync(invite.code);
    Alert.alert("Copied", "Invite code copied to the clipboard.");
  }

  if (!configured) {
    return <Redirect href="/setup" />;
  }
  if (!user || !profile) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      <Text style={styles.title}>{householdName ?? "…"}</Text>
      <Text style={styles.sub}>Everyone here shares the Ours list. My items stay private to each person.</Text>

      <Text style={styles.section}>Members</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : (
        <View style={styles.card}>
          {members.map((m) => {
            const isSelf = m.user_id === user.id;
            const label = m.display_name?.trim() || (isSelf ? "You" : "Member");
            return (
              <View key={m.user_id} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>
                    {label}
                    {isSelf ? " (you)" : ""}
                  </Text>
                  <Text style={styles.memberRole}>{m.role === "owner" ? "Owner" : "Member"}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.section}>Invite</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>Create a code and share it with family. It expires in 7 days. Creating a new code replaces the old one.</Text>
        {invite ? (
          <>
            <Pressable style={styles.codeBox} onPress={() => void copyCode()}>
              <Text style={styles.codeText}>{invite.code}</Text>
              <Text style={styles.tapCopy}>Tap to copy</Text>
            </Pressable>
            <Text style={styles.expires}>
              Expires {new Date(invite.expires_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </Text>
          </>
        ) : (
          <Text style={styles.noCode}>No active invite yet.</Text>
        )}
        <Pressable
          style={[styles.primaryBtn, inviteBusy && styles.btnDisabled]}
          onPress={() => void createInvite()}
          disabled={inviteBusy}
        >
          <Text style={styles.primaryBtnText}>{inviteBusy ? "Creating…" : invite ? "New code" : "Create invite code"}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.secondaryBtn} onPress={() => router.push("/join-household")}>
        <Text style={styles.secondaryBtnText}>Join a different household</Text>
      </Pressable>
      <Text style={styles.joinFootnote}>
        Solo kitchen? Finish or discard active items first; you can't join elsewhere until your current list is clear.
      </Text>
    </ScrollView>
  );
}
