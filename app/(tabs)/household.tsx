import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import * as Sentry from "@sentry/react-native";
import { radius, spacing } from "@/constants/theme";
import {
  canRemoveMember,
  canRenameHousehold,
  leaveHousehold,
  removeMember,
  renameHousehold,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  roleChoices,
  setMemberRole,
  sortMembers,
} from "@/lib/householdAdmin";
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
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type MemberRow = {
  user_id: string;
  role: HouseholdRole;
  display_name: string | null;
};

type InviteRow = { code: string; expires_at: string };

function showMessage(title: string, message: string) {
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert(title, message);
}

function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

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
    titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    renameLink: { fontSize: 14, fontWeight: "600", color: colors.primary },
    renameInput: {
      flex: 1,
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      borderBottomWidth: 2,
      borderBottomColor: colors.primary,
      paddingVertical: 4,
    },
    manageLink: { fontSize: 13, fontWeight: "600", color: colors.primary },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingBottom: spacing.sm },
    actionChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.md,
      backgroundColor: colors.primaryMuted,
    },
    actionChipText: { fontSize: 13, fontWeight: "600", color: colors.text },
    dangerChipText: { fontSize: 13, fontWeight: "600", color: colors.danger },
    memberDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    joinFootnote: { fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: spacing.xs },
  });
}

export default function HouseholdScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { configured, user, profile, refreshProfile } = useAuth();
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const showInitialSpinner = useRef(true);
  const focusActiveRef = useRef(false);

  const load = useCallback(async (withSpinner: boolean) => {
    if (!user?.id || !profile?.household_id) {
      if (withSpinner) setLoading(false);
      return;
    }
    if (withSpinner) setLoading(true);
    const hid = profile.household_id;

    try {
      const [{ data: hh, error: hhErr }, { data: mems, error: memErr }, { data: invs, error: invErr }] =
        await Promise.all([
          supabase.from("households").select("name").eq("id", hid).maybeSingle(),
          supabase.from("household_members").select("user_id, role").eq("household_id", hid),
          supabase
            .from("household_invites")
            .select("code, expires_at")
            .eq("household_id", hid)
            .is("revoked_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (!focusActiveRef.current) return;

      if (hhErr) {
        if (Platform.OS === "web") window.alert(hhErr.message);
        else Alert.alert("Could not load household", hhErr.message);
        return;
      }
      setHouseholdName(hh?.name ?? "Kitchen");

      if (memErr) {
        if (Platform.OS === "web") window.alert(memErr.message);
        else Alert.alert("Could not load members", memErr.message);
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
          const msg = "Some member rows could not be loaded.";
          if (Platform.OS === "web") window.alert(msg);
          else Alert.alert("Members", msg);
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
    } catch (err) {
      Sentry.captureException(err);
    } finally {
      if (focusActiveRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user?.id, profile?.household_id]);

  useFocusEffect(
    useCallback(() => {
      focusActiveRef.current = true;
      const first = showInitialSpinner.current;
      showInitialSpinner.current = false;
      load(first).catch((err) => Sentry.captureException(err));
      return () => {
        focusActiveRef.current = false;
      };
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load(false);
    } catch (err) {
      Sentry.captureException(err);
      setRefreshing(false);
    }
  }

  async function createInvite() {
    setInviteBusy(true);
    const { data, error } = await supabase.rpc("create_household_invite");
    setInviteBusy(false);
    if (error) {
      if (Platform.OS === "web") window.alert(error.message);
      else Alert.alert("Could not create invite", error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const inv = parseInviteRpcRow(row);
    if (!inv.ok) {
      if (Platform.OS === "web") window.alert(inv.error);
      else Alert.alert("Could not create invite", inv.error);
      return;
    }
    setInvite(inv.value);
  }

  async function shareCode() {
    if (!invite?.code) return;
    try {
      await Share.share({
        message: `Join our Freshkeep kitchen "${householdName ?? "Kitchen"}": open Freshkeep → Settings → Join with invite code, and enter ${invite.code}`,
      });
    } catch (err) {
      Sentry.captureException(err);
    }
  }

  /** `reload: false` when the action moves you to another household: the profile refresh reloads this screen. */
  async function runAction(
    action: () => Promise<{ error: string | null }>,
    after?: () => Promise<void> | void,
    { reload = true }: { reload?: boolean } = {}
  ) {
    setActionBusy(true);
    try {
      const { error } = await action();
      if (error) {
        showMessage("Couldn't do that", error);
        return;
      }
      setExpandedMember(null);
      await after?.();
      if (reload) await load(false);
    } catch (err) {
      Sentry.captureException(err);
      showMessage("Couldn't do that", "Something went wrong. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }

  async function saveName() {
    const next = nameDraft.trim();
    if (!next || next === householdName) {
      setRenaming(false);
      return;
    }
    await runAction(() => renameHousehold(next), () => {
      setHouseholdName(next);
      setRenaming(false);
    });
  }

  async function copyCode() {
    if (!invite?.code) return;
    await Clipboard.setStringAsync(invite.code);
    const msg = "Invite code copied to the clipboard.";
    if (Platform.OS === "web") window.alert(msg);
    else Alert.alert("Copied", msg);
  }

  if (!configured) {
    return <Redirect href="/setup" />;
  }
  if (!user || !profile) {
    return <Redirect href="/(auth)/login" />;
  }

  const myRole = members.find((m) => m.user_id === user.id)?.role ?? null;
  const orderedMembers = sortMembers(members);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      {renaming ? (
        <View style={styles.titleRow}>
          <TextInput
            style={styles.renameInput}
            value={nameDraft}
            onChangeText={setNameDraft}
            maxLength={60}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void saveName()}
            accessibilityLabel="Household name"
          />
          <Pressable onPress={() => void saveName()} disabled={actionBusy} accessibilityRole="button">
            <Text style={styles.renameLink}>Save</Text>
          </Pressable>
          <Pressable onPress={() => setRenaming(false)} accessibilityRole="button">
            <Text style={[styles.renameLink, { color: colors.textMuted }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.titleRow}>
          <Text style={[styles.title, { flexShrink: 1 }]}>{householdName ?? "…"}</Text>
          {canRenameHousehold(myRole) && householdName ? (
            <Pressable
              onPress={() => {
                setNameDraft(householdName);
                setRenaming(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Rename household"
            >
              <Text style={styles.renameLink}>Rename</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <Text style={styles.sub}>Everyone here shares the Ours list. My items stay private to each person.</Text>

      <Text style={styles.section}>Members</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : (
        <View style={styles.card}>
          {orderedMembers.map((m, index) => {
            const isSelf = m.user_id === user.id;
            const label = m.display_name?.trim() || (isSelf ? "You" : "Member");
            const choices = roleChoices(myRole, m.role, isSelf);
            const removable = canRemoveMember(myRole, m.role, isSelf);
            const manageable = choices.length > 0 || removable;
            const expanded = expandedMember === m.user_id;
            return (
              <View key={m.user_id} style={index > 0 ? styles.memberDivider : undefined}>
                <View style={styles.memberRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>
                      {label}
                      {isSelf ? " (you)" : ""}
                    </Text>
                    <Text style={styles.memberRole}>
                      {ROLE_LABEL[m.role]} · {ROLE_DESCRIPTION[m.role]}
                    </Text>
                  </View>
                  {manageable ? (
                    <Pressable
                      onPress={() => setExpandedMember(expanded ? null : m.user_id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`${expanded ? "Close" : "Manage"} ${label}`}
                    >
                      <Text style={styles.manageLink}>{expanded ? "Done" : "Manage"}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {expanded ? (
                  <View style={styles.actionRow}>
                    {choices.map((role) => (
                      <Pressable
                        key={role}
                        style={styles.actionChip}
                        disabled={actionBusy}
                        accessibilityRole="button"
                        onPress={() => {
                          if (role === "owner") {
                            confirmAction(
                              `Make ${label} the owner?`,
                              "You'll become an admin and they'll control roles from now on.",
                              "Make owner",
                              () => void runAction(() => setMemberRole(m.user_id, role))
                            );
                          } else {
                            void runAction(() => setMemberRole(m.user_id, role));
                          }
                        }}
                      >
                        <Text style={styles.actionChipText}>Make {ROLE_LABEL[role].toLowerCase()}</Text>
                      </Pressable>
                    ))}
                    {removable ? (
                      <Pressable
                        style={styles.actionChip}
                        disabled={actionBusy}
                        accessibilityRole="button"
                        onPress={() =>
                          confirmAction(
                            `Remove ${label}?`,
                            "They'll move to a kitchen of their own and take their My items with them. Shared items stay here.",
                            "Remove",
                            () => void runAction(() => removeMember(m.user_id))
                          )
                        }
                      >
                        <Text style={styles.dangerChipText}>Remove from household</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
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
            <Pressable onPress={() => void shareCode()} accessibilityRole="button" accessibilityLabel="Share invite code">
              <Text style={[styles.renameLink, { textAlign: "center" }]}>Share invite…</Text>
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

      {myRole && myRole !== "owner" && members.length > 1 ? (
        <Pressable
          style={styles.secondaryBtn}
          disabled={actionBusy}
          onPress={() =>
            confirmAction(
              "Leave this household?",
              "You'll get a kitchen of your own and take your My items with you. Shared items stay here.",
              "Leave",
              () => void runAction(leaveHousehold, refreshProfile, { reload: false })
            )
          }
        >
          <Text style={[styles.secondaryBtnText, { color: colors.danger }]}>Leave household</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.secondaryBtn} onPress={() => router.push("/join-household")}>
        <Text style={styles.secondaryBtnText}>Join a different household</Text>
      </Pressable>
      <Text style={styles.joinFootnote}>
        Solo kitchen? Finish or discard active items first; you can&apos;t join elsewhere until your current list is clear.
      </Text>
    </ScrollView>
  );
}
