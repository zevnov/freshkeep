const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const appJson = require("./app.json");

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const sentryDsn = (process.env.EXPO_PUBLIC_SENTRY_DSN ?? "").trim();
const authDebugOAuthRedirect = (process.env.EXPO_PUBLIC_AUTH_DEBUG_OAUTH_REDIRECT ?? "").trim() === "true";
const sentryOrg = (process.env.SENTRY_ORG ?? "").trim();
const sentryProject = (process.env.SENTRY_PROJECT ?? "").trim();
const sentryUrl = (process.env.SENTRY_URL ?? "").trim();

const existingPlugins = appJson.expo.plugins ?? [];
const pluginsWithoutSentry = existingPlugins.filter((plugin) => {
  if (typeof plugin === "string") {
    return plugin !== "@sentry/react-native";
  }
  return plugin[0] !== "@sentry/react-native";
});

const sentryPluginConfig = {};
if (sentryOrg) sentryPluginConfig.organization = sentryOrg;
if (sentryProject) sentryPluginConfig.project = sentryProject;
if (sentryUrl) sentryPluginConfig.url = sentryUrl;

const sentryPlugin =
  Object.keys(sentryPluginConfig).length > 0
    ? ["@sentry/react-native", sentryPluginConfig]
    : "@sentry/react-native";

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: [...pluginsWithoutSentry, sentryPlugin],
    extra: {
      ...(appJson.expo.extra ?? {}),
      supabaseUrl,
      supabaseAnonKey,
      sentryDsn,
      authDebugOAuthRedirect,
    },
  },
};
